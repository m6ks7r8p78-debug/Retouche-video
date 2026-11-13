/* RetoucheProAI v8.0 — FMD : le DIRECTEUR de « Changer de format » (calcul pur, sans écran ; testé dans Node).
   Pour chaque scène, il compare toutes les façons de passer du format d'origine au format voulu et garde la moins coûteuse :
     • recadrage (avec suivi du sujet)  — rien n'est inventé, mais une partie de l'image est perdue ;
     • extension                         — toute l'image est gardée, les côtés manquants sont reconstruits ;
     • hybride                           — un peu des deux (un zoom partiel réduit ce qu'il faut inventer) ;
     • ambiance                          — les côtés sont remplis par un prolongement flou de l'image (rien de faux, rien de net).
   Le « zoom » z va de 0 (toute l'image, extension maximale) à 1 (recadrage pur). Un coût est calculé pour chaque z et chaque type de fond :
     coût = sujets perdus + image perdue (pondérée par les détails qu'elle contient) + part inventée × risque du fond + agrandissement.
   Les trois modes changent seulement les poids. Tous les chiffres qui ont mené au choix sont renvoyés (« raisons », « candidats ») :
   l'interface les montre tels quels, rien n'est arrondi en « score de qualité ». */
var FMD = (() => {
  const borne = (x, a, b) => x < a ? a : x > b ? b : x;
  /* portée de confiance d'un générateur : profondeur d'extension (en part du petit côté visible) au-delà de laquelle son résultat se dégrade
     (mesuré : tests/format/banc_generateurs.py — MI-GAN déraille au-delà de ~0,2 ; LaMa reste cohérent jusqu'à ~0,4) */
  const PORTEE = { migan: .2, lama: .4, aucun: 0 };
  const MODES = {
    auto:     { sujets: 3, image: 1, invente: 1, risque: 1, portee: 1, generatif: true },
    fidelite: { sujets: 4, image: 2.6, invente: .55, risque: 1, portee: 1, generatif: false },
    max:      { sujets: 3, image: 1.25, invente: .8, risque: .6, portee: 1.5, generatif: true },
  };
  const FORMATS = { "16:9": [16, 9], "9:16": [9, 16], "1:1": [1, 1], "4:3": [4, 3], "3:4": [3, 4], "4:5": [4, 5], "21:9": [21, 9], "3:2": [3, 2], "2:3": [2, 3] };
  /* « laisser l'IA choisir » : le format d'écran le plus courant pour l'orientation opposée ou plus moderne */
  function formatAuto(w, h) { const r = w / h; return r < .9 ? "16:9" : r < 1.6 ? "16:9" : "9:16" }

  /* géométrie : As = format d'origine, At = format voulu. Renvoie l'axe étendu, et pour un zoom z : part visible de la source le long de
     l'axe recadré (vis), part de la sortie couverte par la source le long de l'axe étendu (couv) */
  function geometrie(As, At) { const large = At > As, r = large ? As / At : At / As; return { axeExt: large ? "x" : "y", axeRec: large ? "y" : "x", r, identique: r > .985,
    vis: z => Math.pow(r, z), couv: z => Math.pow(r, 1 - z) } }

  /* ---------- trajectoire du cadre le long de l'axe recadré ----------
     pistes (FMA.suivre), n images, vis = taille de la fenêtre (part de l'image). Renvoie { pos : Float32Array(n) (début de fenêtre, 0…1−vis), perte, coupes } */
  function trajectoire(pistes, n, axe, vis, cadence, suivi, liss) {
    const pos = new Float32Array(n), lo = new Float32Array(n), hi = new Float32Array(n), a = axe === "x" ? "x" : "y", t = axe === "x" ? "w" : "h";
    const P = (pistes || []).filter(p => p.poids > 0), pmax = P.reduce((m, p) => Math.max(m, p.poids), 0), centre = (1 - vis) / 2;
    if (vis >= .999 || !P.length) { pos.fill(Math.max(0, centre)); return { pos, perte: 0, coupes: 0, bouge: 0 } }
    /* intervalle admissible du début de fenêtre à chaque image : contenir les sujets principaux, le plus important d'abord */
    let prec = centre;
    for (let j = 0; j < n; j++) {
      const pr = P.filter(p => p.present[j]).sort((p, q) => q.poids - p.poids); let A = 0, B = 1 - vis, ok = false;
      for (const p of pr) { if (p.poids < .3 * pmax && ok) break; const marge = Math.min(.04, Math.max(0, (vis - p[t][j]) / 2)), b0 = p[a][j] - marge, b1 = p[a][j] + p[t][j] + marge;
        if (b1 - b0 > vis) { if (!ok) { const c = borne((b0 + b1) / 2 - vis / 2 - (a === "y" ? (b1 - b0 - vis) * .3 : 0), 0, 1 - vis); A = B = c; ok = true } break }   /* trop grand : centré (un peu vers le haut : la tête) */
        const na = Math.max(A, b1 - vis), nb = Math.min(B, b0); if (na <= nb) { A = na; B = nb; ok = true } else if (!ok) { A = B = borne((b0 + b1) / 2 - vis / 2, 0, 1 - vis); ok = true } else break }
      if (!ok) { A = 0; B = 1 - vis }
      lo[j] = borne(A, 0, 1 - vis); hi[j] = borne(B, 0, 1 - vis);
      /* cadreur calme : on ne bouge que si le sujet sort de la fenêtre ; sans sujet, retour lent vers la dernière position utile */
      prec = suivi === false ? centre : borne(prec, lo[j], hi[j]); pos[j] = prec;
    }
    if (suivi !== false) { /* aller-retour pour anticiper (le cadre part avant que le sujet n'arrive au bord), puis lissage sans retard */
      let q = pos[n - 1]; for (let j = n - 1; j >= 0; j--) { q = borne(q, lo[j], hi[j]); pos[j] = (pos[j] + q) / 2 }
      const s = Math.max(1, cadence * .45 * (liss || 1)), tmp = new Float32Array(n);
      for (let tour = 0; tour < 3; tour++) { lisser(pos, tmp, s); for (let j = 0; j < n; j++) pos[j] = tour < 2 ? borne(tmp[j], Math.min(lo[j], tmp[j] + .25 * (lo[j] - tmp[j])), Math.max(hi[j], tmp[j] + .25 * (hi[j] - tmp[j]))) : tmp[j] }
      for (let j = 0; j < n; j++) pos[j] = borne(pos[j], 0, 1 - vis);
    }
    /* perte réelle le long de cette trajectoire */
    let perte = 0, tot = 0, coupes = 0, bouge = 0;
    for (let j = 0; j < n; j++) { for (const p of P) if (p.present[j]) { const dedans = Math.max(0, Math.min(p[a][j] + p[t][j], pos[j] + vis) - Math.max(p[a][j], pos[j])) / Math.max(1e-6, p[t][j]), w = p.poids * (p.classe === "visage" ? 2 : 1);
        perte += w * (1 - borne(dedans, 0, 1)); tot += w; if (p.classe === "visage" && dedans < .8) coupes++ }
      if (j) bouge = Math.max(bouge, Math.abs(pos[j] - pos[j - 1]) * cadence) }
    return { pos, perte: tot ? perte / tot : 0, coupes, bouge };
  }
  function lisser(v, out, sigma) { /* gaussienne approchée : 3 moyennes glissantes, bords prolongés */
    const n = v.length, r = Math.max(1, Math.round(sigma * .88)), a = Float32Array.from(v), b = new Float32Array(n);
    for (let p = 0; p < 3; p++) { const s = p % 2 ? b : a, d = p % 2 ? a : b; let acc = 0; for (let k = -r; k <= r; k++) acc += s[borne(k, 0, n - 1)];
      for (let j = 0; j < n; j++) { d[j] = acc / (2 * r + 1); acc += s[borne(j + r + 1, 0, n - 1)] - s[borne(j - r, 0, n - 1)] } }
    out.set(b); return out;
  }

  /* part des détails de la scène qui sort du cadre (carte de relief gw×gh, fenêtre moyenne) : couper du ciel coûte moins que couper un décor */
  function detailsPerdus(carte, gw, gh, axe, debut, vis) {
    if (!carte) return 1 - vis; let dedans = 0, tot = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const v = carte[y * gw + x] + .02, c = ((axe === "x" ? x : y) + .5) / (axe === "x" ? gw : gh); tot += v; if (c >= debut && c <= debut + vis) dedans += v }
    return tot ? 1 - dedans / tot : 1 - vis;
  }

  /* ---------- décision pour une scène ----------
     scene : { n, cadence, pistes, classe (fixe | panoramique | complexe), touche {g,d,h,b}, bord: {relief{g,d,h,b}, activite{g,d,h,b}}, carteRelief, gw, gh, reel {g,d,h,b} (part de l'extension
               que le mouvement de caméra permet de retrouver, 0…1) }
     R (réglages) : { mode, fidelite 0…1 (0,5 = neutre), liberte 0…1, intensite 0…1, suivi, fond: auto | ambiance | genere | noir, generateur: migan | lama | aucun, methode (choix manuel) } */
  function deciderScene(scene, As, At, R) {
    const G = geometrie(As, At), mode = MODES[R.mode] || MODES.auto, raisons = [];
    if (G.identique) return { methode: "identique", z: 0, fond: "aucun", vis: 1, couv: 1, axeExt: G.axeExt, axeRec: G.axeRec, pos: new Float32Array(scene.n).fill(0), portee: 0, raisons: ["La vidéo est déjà à ce format."], candidats: [], cout: 0 };
    const pF = 1 + 2 * ((R.fidelite == null ? .5 : R.fidelite) - .5), pL = 1 + 1.2 * ((R.liberte == null ? .5 : R.liberte) - .5), pI = (R.intensite == null ? .5 : R.intensite) * 2;
    const cotes = G.axeExt === "x" ? ["g", "d"] : ["h", "b"], moy = o => o ? (o[cotes[0]] + o[cotes[1]]) / 2 : 0, pire = o => o ? Math.max(o[cotes[0]], o[cotes[1]]) : 0;
    const relief = moy(scene.bord && scene.bord.relief), activite = moy(scene.bord && scene.bord.activite), touche = pire(scene.touche), reel = moy(scene.reel);
    const gen = R.generateur && R.generateur !== "aucun" ? R.generateur : null, genOK = !!gen && mode.generatif && R.fond !== "ambiance" && R.fond !== "noir" && scene.classe !== "complexe";
    /* risque d'une extension générée (0 = sans risque … 1+ = presque sûrement fausse) : bord détaillé, bord animé (l'extension reste figée), sujet coupé par le bord */
    const reelOK = scene.classe !== "complexe" && reel > .03 && R.fond !== "noir" && R.fond !== "ambiance";
    const risque = borne((.18 + 2.2 * relief + 3 * activite + 1.4 * touche) * mode.risque / pL, .05, 1.6);
    const portee = (PORTEE[gen] || 0) * mode.portee * pI, Aperp = G.axeExt === "x" ? At : 1 / At;   /* profondeur d'extension = part inventée d'un côté × (long côté / petit côté de la sortie) */
    /* on sait où est le sujet (piste nette et durable) → ce qui est hors cadre mais hors sujet compte moins ; simple « zone d'intérêt » : confiance moindre */
    const Pp = (scene.pistes || []), conf = Pp.length ? borne(Pp[0].poids * (Pp[0].classe === "interet" ? .5 : 1.25), 0, 1) : 0;
    /* un liseré flou ne gêne guère ; une sortie aux deux tiers floue est un mauvais résultat : coût croissant avec la part floue x de la sortie */
    const flou = x => x * (.45 + .55 * x);
    const cands = [];
    for (let k = 0; k <= 8; k++) {
      const z = k / 8, vis = G.vis(z), couv = G.couv(z), tr = trajectoire(scene.pistes, scene.n, G.axeRec, vis, scene.cadence, R.suivi, R.lissage); let moyPos = 0; for (const p of tr.pos) moyPos += p; moyPos /= scene.n || 1;
      const cImage = (detailsPerdus(scene.carteRelief, scene.gw, scene.gh, G.axeRec, moyPos, vis) * .6 + (1 - vis) * .4) * (1 - .6 * conf), cAgr = .12 * (Math.pow(G.r, -z) - 1) / (1 / G.r - 1);
      const invente = 1 - couv, prof = invente / 2 * Aperp / Math.max(1e-6, G.axeExt === "x" ? 1 : 1);   /* profondeur d'un côté, en part du petit côté visible */
      const base = mode.sujets * tr.perte + mode.image * pF * cImage + cAgr;
      const fonds = z === 1 ? ["aucun"] : R.fond === "noir" ? ["noir"] : R.fond === "ambiance" ? ["ambiance"] : [...(genOK && R.fond !== "reel" ? ["genere"] : []), ...(reelOK ? ["reel"] : []), "ambiance"];
      for (const fond of fonds) {
        let cFond = 0, part = 0;
        if (fond === "genere") { /* le réel retrouvé par le mouvement de caméra ne coûte rien ; au-delà de la portée du générateur, fondu vers l'ambiance */
          part = prof > 0 ? borne(Math.max(portee, reel * prof) / prof, 0, 1) : 1; cFond = invente * part * risque * (1 - reel) + flou(invente * (1 - part)) }
        else if (fond === "reel") { part = reel; cFond = invente * reel * borne(.05 + 1.5 * activite, .05, .5) + flou(invente * (1 - reel)) }   /* décor réellement filmé : presque sans risque ; le reste en flou */
        else if (fond === "ambiance") cFond = flou(invente); else if (fond === "noir") cFond = invente * .95;
        cands.push({ z, fond, vis, couv, cout: base + mode.invente * cFond, sujets: tr.perte, image: cImage, invente, part, coupes: tr.coupes, tr });
      }
    }
    let choix = cands.reduce((m, c) => c.cout < m.cout - 1e-9 ? c : m, cands[0]);
    /* choix manuel de la méthode pour cette scène */
    if (R.methode && R.methode !== "auto") { const f = { recadrage: c => c.z === 1, extension: c => c.z === 0 && c.fond === "genere", decor: c => c.z === 0 && c.fond === "reel", ambiance: c => c.z === 0 && c.fond === "ambiance", bandes: c => c.z === 0, hybride: c => c.z > 0 && c.z < 1 }[R.methode];
      const L = f ? cands.filter(f) : []; if (L.length) { choix = L.reduce((m, c) => c.cout < m.cout ? c : m, L[0]); raisons.push("Méthode choisie à la main.") } else if (R.methode === "extension") raisons.push("Extension générée impossible ici (" + (scene.classe === "complexe" ? "caméra trop mobile" : !gen ? "aucun modèle de reconstruction" : "mode Fidélité") + ") : meilleure autre méthode gardée.") }
    const fond = R.methode === "bandes" ? "noir" : choix.fond, methode = choix.z === 1 ? "recadrage" : fond === "noir" ? "bandes" : choix.z === 0 ? (fond === "genere" ? "extension" : fond === "reel" ? "decor" : "ambiance") : "hybride";
    /* raisons lisibles, avec les mesures */
    const pc = x => Math.round(x * 100) + " %";
    if (methode === "recadrage") raisons.push("Recadrage : " + pc(1 - choix.vis) + " de l’image hors cadre, sujets conservés à " + pc(1 - choix.sujets) + ".");
    else { raisons.push((methode === "hybride" ? "Hybride : zoom partiel (" + pc(1 - choix.vis) + " de l’image hors cadre), " : "Toute l’image est gardée, ") + pc(choix.invente) + " de la sortie à compléter.");
      if (fond === "genere") raisons.push("Fond reconstruit" + (reel > .05 ? " (" + pc(reel) + " retrouvé dans les autres images grâce au mouvement de la caméra)" : "") + (choix.part < .98 ? ", fondu vers un prolongement flou au-delà de la portée du modèle (" + pc(choix.part) + " généré)" : "") + ". Risque estimé " + risque.toFixed(2) + " (détails du bord " + relief.toFixed(2) + ", mouvement au bord " + activite.toFixed(2) + ", sujet coupé " + pc(touche) + ").");
      else if (fond === "reel") raisons.push("Décor retrouvé dans les autres images grâce au mouvement de la caméra (" + pc(reel) + " de ce qui manque) : ce sont de vrais pixels, rien n’est inventé. Le reste est un prolongement flou.");
      else if (fond === "ambiance") raisons.push(scene.classe === "complexe" ? "Caméra très mobile : un fond généré ne tiendrait pas d’une image à l’autre → prolongement flou de l’image." : !mode.generatif ? "Mode Fidélité : rien n’est inventé → prolongement flou de l’image." : !gen ? "Pas de modèle de reconstruction disponible → prolongement flou de l’image." : "Bord trop risqué pour une reconstruction nette (risque " + risque.toFixed(2) + ") → prolongement flou de l’image.") }
    if (choix.coupes) raisons.push("Attention : un visage est en partie hors cadre sur " + choix.coupes + " image(s).");
    return { methode, z: choix.z, fond, vis: choix.vis, couv: choix.couv, axeExt: G.axeExt, axeRec: G.axeRec, pos: choix.tr.pos, bouge: choix.tr.bouge, portee, part: choix.part, risque, generateur: fond === "genere" ? gen : null, plaque: fond === "genere" || fond === "reel",
      mesures: { sujets_perdus: choix.sujets, image_perdue: 1 - choix.vis, details_perdus: choix.image, part_inventee: choix.invente, relief_bord: relief, activite_bord: activite, sujet_coupe: touche, reel }, raisons, cout: choix.cout,
      candidats: cands.map(c => ({ z: c.z, fond: c.fond, cout: +c.cout.toFixed(4), sujets: +c.sujets.toFixed(3), image: +c.image.toFixed(3), invente: +c.invente.toFixed(3) })) };
  }

  /* taille de sortie : jamais plus de pixels que la source n'en apporte (pas d'agrandissement artificiel), dimensions paires, plafond selon l'appareil.
     choix : "auto" ou petit côté voulu (720, 1080, 1440, 2160). k moyen = pixels de sortie par pixel de source. */
  function tailleSortie(sw, sh, At, plans, choix, plafond) {
    const pair = x => Math.max(2, Math.round(x / 2) * 2); let petit;
    if (choix && choix !== "auto") petit = +choix;
    else { /* pour chaque scène, la sortie qui garde chaque pixel visible de la source : on prend la plus grande demande, bornée */
      let besoin = 0; for (const p of plans) { const visW = p.axeRec === "x" ? sw * p.vis : sw, visH = p.axeRec === "y" ? sh * p.vis : sh, W = p.axeExt === "x" ? visW / p.couv : visW, H = p.axeExt === "y" ? visH / p.couv : visH; besoin = Math.max(besoin, Math.min(W, H)) }
      petit = borne(besoin || Math.min(sw, sh), 360, 2160); for (const s of [2160, 1440, 1080, 720, 480, 360]) if (Math.abs(petit - s) / s < .07) petit = s }
    let W = At >= 1 ? petit * At : petit, H = At >= 1 ? petit : petit / At; const lim = plafond || 3840, m = Math.max(W, H); if (m > lim) { W *= lim / m; H *= lim / m }
    return { W: pair(W), H: pair(H) };
  }

  /* décision complète : une par scène. analyse : { source {w, h}, cadence, scenes[] } ; cible : { rw, rh } ; reglages globaux + par scène (reglages.scenes[i]) */
  function decider(analyse, cible, reglages) {
    const As = analyse.source.w / analyse.source.h, At = cible.rw / cible.rh, R = reglages || {};
    const plans = analyse.scenes.map((s, i) => deciderScene(s, As, At, { ...R, ...((R.scenes && R.scenes[i]) || {}) }));
    return { As, At, plans, taille: tailleSortie(analyse.source.w, analyse.source.h, At, plans, R.resolution, R.plafond) };
  }

  const api = { PORTEE, MODES, FORMATS, formatAuto, geometrie, trajectoire, lisser, detailsPerdus, deciderScene, tailleSortie, decider };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  return api;
})();
