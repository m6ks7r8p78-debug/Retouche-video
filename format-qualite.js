/* RetoucheProAI v8.0 — FMQ : CONTRÔLE QUALITÉ de « Changer de format » (calcul pur, sans écran ; testé dans Node).
   Indépendant du moteur : il ne regarde que le RÉSULTAT (images de sortie réduites) et la place de l'image d'origine dedans.
   Il MESURE ; chaque mesure a une unité et un seuil, et c'est la mesure qui est montrée, jamais une « note » fabriquée.
   Ce qu'il sait mesurer :
     raccord      — saut de couleur à la jonction image / côté ajouté, rapporté aux variations normales de l'image à cet endroit ;
     lumiere      — écart de luminosité entre le côté ajouté et l'image juste à côté (0…1) ;
     scintillement— variation d'une image à la suivante dans le côté ajouté, rapportée à celle de l'image d'origine ;
     nettete      — détails du côté ajouté rapportés à ceux de l'image (1 = aussi net ; un prolongement flou est proche de 0) ;
     repetition   — motif qui se répète dans le côté ajouté (autocorrélation, 0…1) ;
     sujets       — part des sujets suivis qui reste dans le cadre, visages coupés ;
     fluidite     — vitesse et à-coups du cadre quand il suit un sujet.
   Ce qu'il ne sait PAS mesurer (et ne prétend pas mesurer) : la vraisemblance du contenu inventé (un objet absurde mais net et stable
   passe ces contrôles). Seul garde-fou automatique sur ce point : un visage apparu dans une zone inventée (détecteur de visages, côté appli). */
var FMQ = (() => {
  const borne = (x, a, b) => x < a ? a : x > b ? b : x;
  const SEUILS = { raccord: 2.6, lumiere: .075, scintillement: 1.6, repetition: .72, sujets: .9, acoup: 2.2, nettete_flou: .3 };
  const lum = (d, i) => .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
  function luminance(rgba, n) { const g = new Float32Array(n); for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = lum(rgba, j); return g }

  /* zone : rectangle de l'image d'origine dans la sortie réduite {x0, y0, x1, y1} (pixels, bornes exclues à droite/en bas) ; axe : "x" (côtés ajoutés
     à gauche/droite) ou "y" (en haut/en bas). g : luminance de la sortie (w×h) ; gp : luminance de l'image précédente (ou null). */
  function mesurer(g, gp, w, h, zone, axe) {
    const X = axe === "x", L = X ? w : h, T = X ? h : w, a0 = Math.round(X ? zone.x0 : zone.y0), a1 = Math.round(X ? zone.x1 : zone.y1), t0 = Math.max(0, Math.round(X ? zone.y0 : zone.x0)), t1 = Math.min(T, Math.round(X ? zone.y1 : zone.x1));
    const at = (a, t) => X ? g[t * w + a] : g[a * w + t], atp = (a, t) => X ? gp[t * w + a] : gp[a * w + t], R = { cotes: 0 };
    let saut = 0, norme = 0, ns = 0, dl = 0, nl = 0, sx = 0, nsx = 0, si = 0, nsi = 0, lapE = 0, nE = 0, lapI = 0, nI = 0, rep = 0;
    for (const cote of [0, 1]) {   /* 0 : côté bas (gauche / haut) ; 1 : côté haut (droite / bas) */
      const larg = cote === 0 ? a0 : L - a1; if (larg < 4 || a1 - a0 < 12) continue; R.cotes++;
      const jn = cote === 0 ? a0 : a1 - 1, s = cote === 0 ? -1 : 1;   /* jn : dernier pixel de l'image ; s : sens vers l'extérieur (… jn−s·k dans l'image, jn+s·k dehors) */
      let me = 0, mi = 0, c = 0; const ds = new Float32Array(t1 - t0), dn = new Float32Array(t1 - t0);
      for (let t = t0; t < t1; t++) {
        const e1 = (at(jn + s * 2, t) + at(jn + s * 3, t)) / 2, i1 = (at(jn - s * 2, t) + at(jn - s * 3, t)) / 2, i2 = (at(jn - s * 7, t) + at(jn - s * 8, t)) / 2;
        ds[t - t0] = e1 - i1; dn[t - t0] = i1 - i2;
        for (let k = 1; k <= Math.min(6, larg - 1); k++) { me += at(jn + s * k, t); mi += at(jn - s * k, t); c++ }
      }
      /* saut COHÉRENT le long du raccord : moyenne glissante sur 9 lignes (le relief fin s'annule, une marche ou un décor décalé reste) */
      for (let t = 4; t + 4 < ds.length; t++) { let a = 0, b = 0; for (let k = -4; k <= 4; k++) { a += ds[t + k]; b += dn[t + k] } saut += Math.abs(a) / 9; norme += Math.abs(b) / 9; ns++ }
      if (c) { dl += Math.abs(me - mi) / c / 255; nl++ }
      /* côté ajouté : netteté (laplacien), scintillement, répétition */
      const b0 = cote === 0 ? 1 : a1 + 1, b1 = cote === 0 ? a0 - 1 : L - 1;
      for (let t = Math.max(1, t0); t < Math.min(T - 1, t1); t++) for (let a = b0; a < b1; a++) { lapE += Math.abs(4 * at(a, t) - at(a - 1, t) - at(a + 1, t) - at(a, t - 1) - at(a, t + 1)); nE++; if (gp) { sx += Math.abs(at(a, t) - atp(a, t)); nsx++ } }
      if (b1 - b0 >= 16) { /* autocorrélation le long de l'axe, sur le relief (dérivée) : un motif recopié donne un pic franc à un décalage non nul */
        let best = 0; const n = b1 - b0, lmax = Math.min(n >> 1, 48);
        for (let lag = 6; lag <= lmax; lag++) { let sab = 0, saa = 0, sbb = 0; for (let t = Math.max(1, t0); t < Math.min(T - 1, t1); t += 2) for (let a = b0 + 1; a + lag < b1; a++) { const u = at(a, t) - at(a - 1, t), v = at(a + lag, t) - at(a + lag - 1, t); sab += u * v; saa += u * u; sbb += v * v }
          if (saa > 50 && sbb > 50) best = Math.max(best, sab / Math.sqrt(saa * sbb)) }
        rep = Math.max(rep, best) }
    }
    for (let t = Math.max(1, t0); t < Math.min(T - 1, t1); t++) for (let a = a0 + 1; a < a1 - 1; a++) { lapI += Math.abs(4 * at(a, t) - at(a - 1, t) - at(a + 1, t) - at(a, t - 1) - at(a, t + 1)); nI++; if (gp) { si += Math.abs(at(a, t) - atp(a, t)); nsi++ } }
    R.raccord = ns ? (saut / ns) / (norme / ns + 1.5) : 0; R.lumiere = nl ? dl / nl : 0; R.nettete = nE && nI ? (lapE / nE) / (lapI / nI + .3) : 0; R.repetition = rep;
    R.scintillement = gp && nsx && nsi ? (sx / nsx) / (si / nsi + .6) : null; R.mouvement_ext = gp && nsx ? sx / nsx : null;
    return R;
  }
  const centile = (v, p) => { if (!v.length) return 0; const s = Float64Array.from(v).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))] };

  /* à-coups du cadre : pos = position du cadre par image (part de l'image), cadence en images/s.
     vitesse en « largeurs de cadre par seconde », à-coup = plus forte variation de vitesse en 1/10 s, rapportée à la vitesse typique */
  function fluidite(pos, cadence, vis) {
    const n = pos ? pos.length : 0; if (n < 3) return { vitesse_max: 0, acoup: 0 }; let vmax = 0, amax = 0; const k = Math.max(1, Math.round(cadence / 10)), v = [];
    for (let j = 1; j < n; j++) { const s = (pos[j] - pos[j - 1]) * cadence / Math.max(.05, vis); v.push(s); vmax = Math.max(vmax, Math.abs(s)) }
    for (let j = k; j < v.length; j++) amax = Math.max(amax, Math.abs(v[j] - v[j - k]));
    return { vitesse_max: vmax, acoup: amax };
  }

  /* bilan d'une scène. mesures : résultats de mesurer() sur des images successives ; plan : décision du Directeur.
     Renvoie { valeurs, controles: [{ code, nom, valeur, seuil, ok, texte }], ok, action } — action = correction proposée au moteur :
       "lumiere"  : activer / renforcer le suivi de lumière du décor ;
       "plume"    : élargir le fondu du raccord ;
       "ambiance" : abandonner le décor reconstruit pour le prolongement flou (retour à une transformation plus fidèle) ;
       "adoucir"  : lisser davantage le suivi du sujet. */
  function bilan(mesures, plan, cadence, S) {
    S = { ...SEUILS, ...(S || {}) }; const col = k => mesures.map(m => m[k]).filter(v => v != null && isFinite(v)), V = {}, C = [];
    const ext = plan.z < 1 && plan.methode !== "identique" && mesures.length && mesures[0].cotes > 0, net = plan.fond === "genere" || plan.fond === "reel";
    if (ext) { V.raccord = centile(col("raccord"), .9); V.lumiere = centile(col("lumiere"), .9); V.scintillement = centile(col("scintillement"), .9); V.nettete = centile(col("nettete"), .5); V.repetition = centile(col("repetition"), .5);
      if (net) C.push({ code: "raccord", nom: "Raccord avec l’image", valeur: V.raccord, seuil: S.raccord, ok: V.raccord <= S.raccord, texte: "saut au raccord = " + V.raccord.toFixed(2) + " × les variations normales de l’image (limite " + S.raccord + ")" });
      if (net) C.push({ code: "lumiere", nom: "Continuité de la lumière", valeur: V.lumiere, seuil: S.lumiere, ok: V.lumiere <= S.lumiere, texte: "écart de luminosité au raccord = " + (V.lumiere * 100).toFixed(1) + " % (limite " + S.lumiere * 100 + " %)" });
      if (plan.fond !== "noir" && col("scintillement").length) C.push({ code: "scintillement", nom: "Stabilité dans le temps", valeur: V.scintillement, seuil: S.scintillement, ok: V.scintillement <= S.scintillement, texte: "le côté ajouté varie " + V.scintillement.toFixed(2) + " × autant que l’image d’une image à l’autre (limite " + S.scintillement + ")" });
      if (plan.fond === "genere") C.push({ code: "repetition", nom: "Motifs répétés", valeur: V.repetition, seuil: S.repetition, ok: V.repetition <= S.repetition, texte: "ressemblance d’un motif avec lui-même = " + V.repetition.toFixed(2) + " (limite " + S.repetition + ")" });
      if (net) C.push({ code: "nettete", nom: "Netteté du côté ajouté", valeur: V.nettete, seuil: S.nettete_flou, ok: true, info: true, texte: "détails du côté ajouté = " + Math.round(V.nettete * 100) + " % de ceux de l’image" + (V.nettete < S.nettete_flou ? " (visiblement plus doux que l’image)" : "") }) }
    const sj = plan.mesures ? 1 - plan.mesures.sujets_perdus : 1; V.sujets = sj;
    if (plan.z > 0 && plan.methode !== "identique") { C.push({ code: "sujets", nom: "Sujets conservés", valeur: sj, seuil: S.sujets, ok: sj >= S.sujets, texte: Math.round(sj * 100) + " % des sujets suivis restent dans le cadre (minimum " + S.sujets * 100 + " %)" });
      const f = fluidite(plan.pos, cadence, plan.vis); V.vitesse_cadre = f.vitesse_max; V.acoup = f.acoup;
      if (f.vitesse_max > .01) C.push({ code: "fluidite", nom: "Fluidité du cadrage", valeur: f.acoup, seuil: S.acoup, ok: f.acoup <= S.acoup, texte: "à-coup maximal du cadre = " + f.acoup.toFixed(2) + " cadre/s en 1/10 s (limite " + S.acoup + ") ; vitesse maximale " + f.vitesse_max.toFixed(2) + " cadre/s" }) }
    const ko = C.filter(c => !c.ok).map(c => c.code); let action = null;
    if (ko.includes("scintillement") || ko.includes("repetition")) action = "ambiance"; else if (ko.includes("lumiere")) action = "lumiere"; else if (ko.includes("raccord")) action = "plume"; else if (ko.includes("fluidite")) action = "adoucir";
    return { valeurs: V, controles: C, ok: !ko.length, action };
  }

  /* fidélité de l'image d'origine dans la sortie : PSNR (dB) entre deux images RGBA de même taille sur un rectangle {x0,y0,x1,y1} */
  function psnr(a, b, w, zone) { let s = 0, n = 0; for (let y = Math.max(0, zone.y0 | 0); y < zone.y1; y++) for (let x = Math.max(0, zone.x0 | 0); x < zone.x1; x++) { const i = (y * w + x) * 4; for (let c = 0; c < 3; c++) { const d = a[i + c] - b[i + c]; s += d * d; n++ } } return n ? (s ? 10 * Math.log10(255 * 255 * n / s) : 99) : 0 }

  /* contrôle technique du fichier produit : attendu { w, h, duree, images, son } ; lu { w, h, duree, son } (relu par le navigateur) */
  function fichier(att, lu) {
    const C = [], ok = (c, n, v, t) => C.push({ code: c, nom: n, ok: v, texte: t });
    ok("taille", "Dimensions", lu.w === att.w && lu.h === att.h, lu.w + "×" + lu.h + " (attendu " + att.w + "×" + att.h + ")");
    ok("duree", "Durée", Math.abs(lu.duree - att.duree) <= Math.max(.12, 2.5 / (att.cadence || 30)), lu.duree.toFixed(2) + " s (original " + att.duree.toFixed(2) + " s)");
    if (att.son != null) ok("son", "Son", !!lu.son === !!att.son || lu.son == null, att.son ? (lu.son === false ? "absent du fichier produit" : "conservé") : "la vidéo d’origine n’a pas de son");
    return { controles: C, ok: C.every(c => c.ok) };
  }

  const api = { SEUILS, luminance, mesurer, centile, fluidite, bilan, psnr, fichier };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  return api;
})();
