/* RetoucheProAI v8.5 — FFI : « Fidèle », conversion de format SANS GÉNÉRATION (calcul pur, sans écran ; testé dans Node).
   Seuls les pixels réellement filmés sont utilisés. Aucun décor, aucun arrière-plan, aucune partie de scène n'est inventé.

   Méthode retenue : déformation ALIGNÉE SUR L'AXE avec protection (famille « axis-aligned deformation », Panozzo et al. 2012).
   L'image est découpée en colonnes (ou en lignes pour horizontal → vertical). Chaque colonne reçoit un facteur d'étirement s ≥ 1 :
     • colonnes protégées (visages, personnes, animaux, avec une marge) : s = 1 exactement → copiées pixel pour pixel ;
     • autres colonnes : s choisi pour coûter le moins possible : une zone unie (ciel, mur) s'étire sans que l'œil le voie,
       une zone détaillée ou qui bouge beaucoup est ménagée ;
     • les facteurs varient en douceur d'une colonne à l'autre (pas de cassure visible) ;
     • un seul jeu de facteurs par scène (aucune ondulation d'une image à l'autre : stabilité temporelle parfaite).
   Les lignes droites restent droites, les verticales restent verticales, rien n'est retiré : 100 % du champ filmé est gardé.

   Contrainte fondamentale (jamais cachée) : passer de 9:16 à 16:9 demande 3,16 fois plus de largeur. On ne peut PAS avoir à la fois
   toute l'image, aucune déformation, un remplissage complet et aucun contenu ajouté. La variante par défaut (« fidèle ») ne s'autorise
   qu'un étirement sous le seuil de perception, sur le fond seulement ; ce qui reste est laissé en bandes (aucun pixel inventé).
   Les autres variantes (remplissage accru ou total, étirement uniforme, recadrage) ne s'appliquent que si la personne les choisit,
   avec leurs mesures affichées. */
var FFI = (() => {
  const borne = (x, a, b) => x < a ? a : x > b ? b : x;
  /* seuils de perception (étirement horizontal local) : sous ~10 % un fond peu détaillé étiré ne se remarque pas ;
     les visages et les corps ne sont JAMAIS étirés par le réglage automatique */
  const SEUILS = { perception: 1.10, visible: 1.35, protege: 1, lissage: .02 };
  const VARIANTES = {
    fidele:    { nom: "Fidèle", court: "aucun visage ni corps touché, fond étiré sous le seuil de perception", fond: SEUILS.perception, auto: true },
    exact:     { nom: "Proportions exactes", court: "aucun étirement, bandes sur les côtés", fond: 1 },
    accru:     { nom: "Remplissage accru", court: "fond étiré jusqu’à 35 % (visible sur les détails)", fond: SEUILS.visible },
    total:     { nom: "Remplissage total", court: "fond étiré autant qu’il faut (déformation forte)", fond: Infinity },
    uniforme:  { nom: "Étirement uniforme", court: "toute l’image étirée, visages compris" },
    recadrage: { nom: "Recadrage", court: "remplit l’écran en coupant le haut et le bas" },
  };
  const ORDRE = ["fidele", "exact", "accru", "total", "uniforme", "recadrage"];
  const PROTEGES = { visage: .35, personne: .12, animal: .15 };   /* classe → marge (part de la largeur de la boîte, de chaque côté) */
  const APPUYES = { vehicule: .9, objet: .5, interet: .35 };      /* classes ménagées sans être figées */

  const centile = (a, q) => { const b = Array.from(a).sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * (b.length - 1)))] : 0 };

  /* bornes entières des colonnes dans la source (longueur L le long de l'axe, n colonnes) : B[0] = 0 … B[n] = L */
  function bornes(L, n) { const B = new Int32Array(n + 1); for (let i = 0; i <= n; i++) B[i] = Math.round(i * L / n); return B }
  const largeurs = B => { const c = new Float64Array(B.length - 1); for (let i = 0; i < c.length; i++) c[i] = B[i + 1] - B[i]; return c };

  /* importance de chaque colonne. P : { n, energie : Float32Array(n) (détails moyens, niveaux de gris), mouvement : Float32Array(n),
     boites : [{ a, b (0…1 le long de l'axe), classe }] }. Renvoie { imp, prot, sujets } */
  function importance(P) {
    const n = P.n, imp = new Float32Array(n), prot = new Uint8Array(n), e = P.energie || new Float32Array(n), m = P.mouvement || new Float32Array(n);
    /* normalisation avec un plancher absolu : une image unie ne voit pas son bruit grossi en « détails » */
    const ne = Math.max(6, centile(e, .85)), nm = Math.max(3, centile(m, .85));
    for (let i = 0; i < n; i++) imp[i] = .12 + .6 * Math.min(1.5, e[i] / ne) + .5 * Math.min(1.5, m[i] / nm);
    let sujets = 0;
    for (const b of P.boites || []) { const lg = Math.max(1e-6, b.b - b.a);
      if (PROTEGES[b.classe] != null) { const mg = PROTEGES[b.classe] * lg, i0 = Math.max(0, Math.floor((b.a - mg) * n) - 1), i1 = Math.min(n - 1, Math.ceil((b.b + mg) * n));
        for (let i = i0; i <= i1; i++) prot[i] = 1; sujets++ }
      else if (APPUYES[b.classe] != null) { const i0 = Math.max(0, Math.floor(b.a * n)), i1 = Math.min(n - 1, Math.ceil(b.b * n) - 1); for (let i = i0; i <= i1; i++) imp[i] += APPUYES[b.classe] } }
    return { imp, prot, sujets };
  }

  /* résolution : minimiser  Σ imp_i (s_i − 1)²  +  μ Σ (s_{i+1} − s_i)²   avec   Σ c_i s_i = T,  1 ≤ s_i ≤ u_i
     (u = 1 sur les colonnes protégées, u = plafond du fond ailleurs). Convexe : bissection sur le multiplicateur λ, et pour chaque λ
     descente par coordonnées projetée (Gauss-Seidel), départ à chaud. Si même au plafond la longueur T n'est pas atteinte : s = u
     (remplissage partiel, le reste en bandes). */
  function resoudre(imp, prot, c, T, uFond, mu) {
    const n = imp.length, u = new Float64Array(n), s = new Float64Array(n).fill(1); let L0 = 0, Lmax = 0;
    const cm = c.reduce((a, b) => a + b, 0) / n, cap = isFinite(uFond) ? uFond : 1e3; mu = mu == null ? 2.5 : mu;
    const pente = Math.max(SEUILS.lissage * 50 / n, (Math.min(cap, 4) - 1) / (.08 * n));
    /* rampe : près d'une zone protégée, le plafond monte progressivement (≤ SEUILS.lissage par colonne) : jamais de cassure au bord d'un sujet */
    const dist = new Float64Array(n).fill(1e9); for (let i = 0, d = 1e9; i < n; i++) { d = prot[i] ? 0 : d + 1; dist[i] = d } for (let i = n - 1, d = 1e9; i >= 0; i--) { d = prot[i] ? 0 : d + 1; dist[i] = Math.min(dist[i], d) }
    for (let i = 0; i < n; i++) { u[i] = prot[i] ? SEUILS.protege : Math.max(1, Math.min(cap, 1 + pente * dist[i])); L0 += c[i]; Lmax += c[i] * u[i] }
    if (T <= L0 + 1e-9 || cap <= 1) return { s, longueur: L0, plein: T <= L0 + 1e-9, iterations: 0 };
    if (Lmax <= T + 1e-9) { for (let i = 0; i < n; i++) s[i] = u[i]; return { s, longueur: Lmax, plein: Lmax >= T - 1e-6, iterations: 0 } }
    const gs = lam => { for (let it = 0; it < 400; it++) { let d = 0;
        for (let i = 0; i < n; i++) { if (u[i] <= 1) { s[i] = 1; continue } const w = imp[i]; let num = 2 * w + lam * c[i] / cm, den = 2 * w;
          if (i > 0) { num += 2 * mu * s[i - 1]; den += 2 * mu } if (i < n - 1) { num += 2 * mu * s[i + 1]; den += 2 * mu }
          const v = borne(num / den, 1, u[i]); d = Math.max(d, Math.abs(v - s[i])); s[i] = v }
        if (d < 1e-7) return it } return 400 };
    const long = () => { let t = 0; for (let i = 0; i < n; i++) t += c[i] * s[i]; return t };
    let lo = 0, hi = 1, its = 0; gs(hi); while (long() < T && hi < 1e9) { hi *= 2; its += gs(hi) }
    for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; its += gs(mid); if (long() < T) lo = mid; else hi = mid; if (hi - lo < 1e-9 * hi) break }
    gs(hi); /* petit écart final (< 1e-6 relatif) réparti sur les colonnes libres pour tomber exactement sur T */
    let L = long(), libre = 0; for (let i = 0; i < n; i++) if (s[i] < u[i] - 1e-9 && u[i] > 1) libre += c[i];
    if (libre > 0) { const d = (T - L) / libre; for (let i = 0; i < n; i++) if (s[i] < u[i] - 1e-9 && u[i] > 1) s[i] = borne(s[i] + d, 1, u[i]) }
    return { s, longueur: long(), plein: true, iterations: its };
  }

  /* carte vers la sortie : bornes ENTIÈRES des colonnes dans la sortie. o : décalage, k : échelle (1 = un pixel filmé = un pixel du fichier).
     Arrondir le cumul réel garantit qu'une colonne à s = 1 (largeur entière c) garde exactement c pixels quand k = 1 : copie pixel pour pixel. */
  function carte(B, s, k, o) { const n = s.length, D = new Int32Array(n + 1); let x = o; D[0] = Math.round(x);
    for (let i = 0; i < n; i++) { x += k * (B[i + 1] - B[i]) * s[i]; D[i + 1] = Math.round(x) } return D }

  /* étirement maximal subi par ce qui se trouve entre a et b (0…1 le long de l'axe de la source) */
  function etirementSous(B, s, a, b) { const L = B[B.length - 1], xa = a * L, xb = b * L; let m = 0;
    for (let i = 0; i < s.length; i++) if (B[i + 1] > xa && B[i] < xb) m = Math.max(m, s[i]); return m || 1 }

  /* mesures d'un jeu d'étirements (aucun arrondi en « note » : chaque chiffre est une mesure) */
  function mesurer(s, c, imp, prot, T) {
    let L = 0, Ls = 0, aire = 0, num = 0, den = 0, max = 1, maxP = 1, saut = 0, nP = 0;
    for (let i = 0; i < s.length; i++) { L += c[i]; Ls += c[i] * s[i]; if (s[i] > 1.01) aire += c[i]; num += c[i] * imp[i] * Math.abs(Math.log(s[i])); den += c[i] * imp[i];
      max = Math.max(max, s[i]); if (prot[i]) { nP++; maxP = Math.max(maxP, s[i]) } if (i) saut = Math.max(saut, Math.abs(s[i] - s[i - 1])) }
    return { conservation: 1, remplissage: Math.min(1, Ls / T), gain: Ls / L - 1, etirementMax: max, etirementProtege: nP ? maxP : null, partEtiree: aire / L,
      deformationPonderee: den ? num / den : 0, saut, visible: max > SEUILS.perception + 1e-6 || (nP > 0 && maxP > SEUILS.protege + 1e-6) };
  }

  /* toutes les variantes pour une scène. P : profil (importance) ; L : longueur de la source le long de l'axe (px) ; Lp : longueur perpendiculaire ;
     T : longueur voulue de l'image dans la sortie, en pixels de la source (= Lp × format voulu) ; n : nombre de colonnes */
  function variantes(P, L, Lp, T, opts) {
    opts = opts || {}; const n = P.n, B = bornes(L, n), c = largeurs(B), I = importance(P), out = {};
    for (const id of ["fidele", "exact", "accru", "total"]) { const V = VARIANTES[id], r = resoudre(I.imp, I.prot, c, T, V.fond, opts.mu);
      out[id] = { id, nom: V.nom, s: Float32Array.from(r.s), B, mesures: mesurer(r.s, c, I.imp, I.prot, T), plein: r.plein } }
    { const f = Math.max(1, T / L), s = new Float32Array(n).fill(f), sProt = Uint8Array.from(I.prot);
      out.uniforme = { id: "uniforme", nom: VARIANTES.uniforme.nom, s, B, mesures: mesurer(s, c, I.imp, sProt, T), plein: true } }
    { const f = Math.max(1, T / L), garde = 1 / f;   /* recadrage : mise à l'échelle uniforme f, on garde 1/f de la dimension perpendiculaire */
      out.recadrage = { id: "recadrage", nom: VARIANTES.recadrage.nom, s: new Float32Array(n).fill(f), B, f, garde,
        mesures: { conservation: garde, remplissage: 1, gain: f - 1, etirementMax: 1, etirementProtege: 1, partEtiree: 0, deformationPonderee: 0, saut: 0, visible: garde < .999, perte: 1 - garde, agrandissement: f } } }
    return { variantes: out, importance: I, B, c, T };
  }

  /* choix automatique : TOUJOURS la variante fidèle (sous le seuil de perception, sujets intacts). Les autres ne sont jamais activées
     sans que la personne les choisisse. Si la fidèle n'apporte rien (sujets partout, détails partout), on le dit. */
  function choisir(V) { const f = V.fidele.mesures; return { id: "fidele", rien: f.gain < .005, raison: f.gain < .005 ? "aucune zone ne peut être étirée sans que ça se voie (sujets ou détails sur toute la largeur) : proportions exactes" : "étirement de " + Math.round(f.gain * 1000) / 10 + " % en moyenne, uniquement sur le fond peu détaillé" } }

  const pc = v => (Math.round(v * 1000) / 10).toString().replace(".", ",") + " %";
  /* phrase honnête pour une variante */
  function decrire(v) { const m = v.mesures;
    if (v.id === "recadrage") return "Remplit tout l’écran mais coupe " + pc(m.perte) + " de l’image (haut et bas) et l’agrandit " + m.agrandissement.toFixed(2).replace(".", ",") + " fois (détails estimés, pas récupérés).";
    const t = [pc(m.conservation) + " de l’image gardée", "écran rempli à " + pc(m.remplissage)];
    if (m.etirementMax <= 1.0005) t.push("aucun étirement"); else t.push("étirement max " + pc(m.etirementMax - 1) + " sur " + pc(m.partEtiree) + " de l’image");
    if (m.etirementProtege != null) t.push(m.etirementProtege <= 1.0005 ? "visages et corps intacts" : "visages et corps étirés de " + pc(m.etirementProtege - 1));
    if (m.visible) t.push("déformation visible"); return t.join(" · ") }

  const api = { SEUILS, VARIANTES, ORDRE, PROTEGES, bornes, largeurs, importance, resoudre, carte, etirementSous, mesurer, variantes, choisir, decrire, centile };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  return api;
})();
