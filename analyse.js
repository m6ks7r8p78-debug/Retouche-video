/* RetoucheProAI v6.7 — ANALYSE : diagnostic de la source, détection prudente de filtres, cibles de sortie honnêtes,
   plan de tuiles, contrôle du scintillement, profil d'export pour X.
   Fonctions pures (aucun réseau, aucun DOM) : mêmes calculs sur iPhone et dans les tests (Node).
   Limite assumée : sans modèle de segmentation, les accessoires AR, autocollants et déformations ne sont PAS détectés
   automatiquement ; ils sont signalés comme « à traiter à la main » (outil Effacer). */
var ANALYSE = (() => {
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const conf = (x, lo, hi) => +clamp((x - lo) / (hi - lo), 0, 1).toFixed(2);
  const pair = n => Math.max(2, Math.round(n / 2) * 2);

  /* ---------- mesures sur une image RGBA (réduite : 128 à 512 px de large suffisent) ---------- */
  function mesurer(d, w, h) {
    const n = w * h, Y = new Float32Array(n), hist = new Uint32Array(256);
    let sr = 0, sg = 0, sb = 0, sat = 0, ns = 0;
    for (let i = 0, j = 0; j < n; i += 4, j++) {
      const r = d[i], g = d[i + 1], b = d[i + 2], y = .299 * r + .587 * g + .114 * b;
      Y[j] = y / 255; hist[Math.min(255, Math.round(y))]++; sr += r; sg += g; sb += b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx > 25) { sat += (mx - mn) / mx; ns++ }
    }
    const pct = p => { let c = 0, t = p * n; for (let k = 0; k < 256; k++) { c += hist[k]; if (c >= t) return k / 255 } return 1 };
    const p1 = pct(.01), p5 = pct(.05), p50 = pct(.5), p95 = pct(.95), p99 = pct(.99);
    let cb = 0, cw = 0; for (let k = 0; k < 4; k++) cb += hist[k]; for (let k = 252; k < 256; k++) cw += hist[k];
    /* dominante : écart « monde gris » ET écart dans les 5 % les plus clairs (souvent proches du blanc) */
    const m = (sr + sg + sb) / 3 || 1, gw = [sr / m - 1, sg / m - 1, sb / m - 1].map(x => x / 1);
    const seuil = p95; let hr = 0, hg = 0, hb = 0, hn = 0;
    for (let i = 0, j = 0; j < n; i += 4, j++) if (Y[j] >= seuil) { hr += d[i]; hg += d[i + 1]; hb += d[i + 2]; hn++ }
    const hm = (hr + hg + hb) / 3 || 1, hl = [hr / hm - 1, hg / hm - 1, hb / hm - 1];
    const gwN = gw.map(x => x / n * n), amp = a => Math.max(...a) - Math.min(...a);
    const iMax = a => a.indexOf(Math.max(...a)), iMin = a => a.indexOf(Math.min(...a));
    const accord = iMax(gwN) === iMax(hl) || iMin(gwN) === iMin(hl);
    const dominante = accord ? Math.min(amp(gwN), amp(hl) * 2) : 0;
    /* gradients, laplacien, bruit (Immerkær 1996), effet de blocs 8×8 */
    let lap = 0, bruit = 0, bh = 0, nh = 0, ih = 0, mh = 0, bv = 0, nv = 0, iv = 0, mv = 0; const G = new Float32Array(n);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const k = y * w + x, c = Y[k], l = Y[k - 1], r = Y[k + 1], u = Y[k - w], dn = Y[k + w];
      lap += Math.abs(4 * c - l - r - u - dn);
      bruit += Math.abs(Y[k - w - 1] - 2 * u + Y[k - w + 1] - 2 * l + 4 * c - 2 * r + Y[k + w - 1] - 2 * dn + Y[k + w + 1]);
      G[k] = Math.abs(r - c) + Math.abs(dn - c);
      const dx = Math.abs(r - c); if ((x & 7) === 7) { bh += dx; nh++ } else { ih += dx; mh++ }
      const dy = Math.abs(dn - c); if ((y & 7) === 7) { bv += dy; nv++ } else { iv += dy; mv++ }
    }
    const ni = (w - 2) * (h - 2) || 1; lap /= ni; bruit = Math.sqrt(Math.PI / 2) * bruit / (6 * ni);
    const gs = Array.from(G).sort((a, b) => a - b), gq = q => gs[Math.min(n - 1, Math.floor(q * n))];
    const gMed = gq(.5), g95 = gq(.95);
    /* vignettage : luminance des 4 coins / centre */
    const zone = (x0, y0, x1, y1) => { let s = 0, c = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += Y[y * w + x]; c++ } return s / (c || 1) };
    const qw = w >> 2, qh = h >> 2, centre = zone(qw, qh, w - qw, h - qh);
    /* le coin le PLUS CLAIR doit lui-même être sombre : un seul coin sombre (ombre, objet) n’est pas un vignettage */
    const coins = Math.max(zone(0, 0, qw >> 1, qh >> 1), zone(w - (qw >> 1), 0, w, qh >> 1), zone(0, h - (qh >> 1), qw >> 1, h), zone(w - (qw >> 1), h - (qh >> 1), w, h));
    const contraste = p95 - p5;
    return {
      w, h, moyenne: +(m / 255).toFixed(3), p1, p5, p50, p95, p99, contraste: +contraste.toFixed(3),
      ecretageNoir: +(cb / n).toFixed(4), ecretageBlanc: +(cw / n).toFixed(4),
      saturation: +(ns ? sat / ns : 0).toFixed(3), dominante: +dominante.toFixed(3),
      canalFort: ["rouge", "vert", "bleu"][iMax(gwN)], canalFaible: ["rouge", "vert", "bleu"][iMin(gwN)],
      nettete: +(lap / (contraste + .05)).toFixed(4), bruit: +bruit.toFixed(4),
      /* grille 8×8 visible dans les DEUX sens (un motif aligné dans un seul sens n’est pas de la compression) */
      blocs: +Math.min((bh / (nh || 1)) / ((ih / (mh || 1)) + 1e-4), (bv / (nv || 1)) / ((iv / (mv || 1)) + 1e-4)).toFixed(2),
      texture: +gMed.toFixed(4), contours: +g95.toFixed(4), lissage: +(g95 / (gMed + .002)).toFixed(1),
      vignette: +(coins / (centre + .01)).toFixed(2)
    };
  }

  /* ---------- détections : catégorie, confiance 0–1, zone, réversibilité, explication simple ---------- */
  function detecter(m) {
    const D = [], add = (categorie, confiance, reversible, explication, strategie) => { if (confiance >= .15) D.push({ categorie, confiance, zone: "image entière", reversible, explication, strategie }) };
    add("dominante de couleur", conf(m.dominante, .08, .35), "en partie",
      "Les couleurs tirent vers le " + m.canalFort + " (peu de " + m.canalFaible + "), comme avec un filtre chaud/froid. Peut aussi venir de l’éclairage réel de la scène.", "inversion colorimétrique prudente");
    if (m.saturation < .04) add("noir et blanc / désaturé", conf(.04 - m.saturation, 0, .03), "non",
      "Presque aucune couleur. Les couleurs d’origine sont perdues : elles ne peuvent être que réinventées par IA (colorisation), pas retrouvées.", "reconstruction générative (signalée)");
    else add("couleurs très saturées", conf(m.saturation, .55, .8), "en partie", "Couleurs plus vives que dans une prise de vue normale.", "inversion colorimétrique prudente");
    add("voile / noirs relevés (effet rétro)", Math.min(conf(m.p1, .07, .2), conf(.98 - m.p99, .0, .12) + .5), "oui",
      "Les zones sombres ne descendent pas jusqu’au noir : typique d’un filtre « fade ». Corrigeable en retendant les niveaux.", "inversion colorimétrique prudente");
    add("hautes lumières écrêtées", conf(m.ecretageBlanc, .03, .2), "non", "Une partie de l’image est blanche pure : ces détails sont détruits et ne peuvent pas être retrouvés.", "aucune inversion fidèle");
    add("ombres bouchées", conf(m.ecretageNoir, .08, .35), "non", "Une partie de l’image est noire pure : ces détails sont détruits.", "aucune inversion fidèle");
    add("vignettage", conf(.8 - m.vignette, 0, .35), "oui", "Les coins sont nettement plus sombres que le centre.", "correction locale douce");
    add("lissage (possible filtre beauté)", Math.min(conf(m.lissage, 18, 45), conf(.02 - m.texture, 0, .015)), "non",
      "Les contours sont nets mais les surfaces n’ont presque plus de grain. La texture d’origine est perdue : elle peut seulement être recréée de façon plausible.", "restauration de texture (mode Reconstruction IA)");
    return D.sort((a, b) => b.confiance - a.confiance);
  }

  /* état technique de la source : ce que la restauration devra traiter */
  function etat(m) {
    return {
      compression: conf(m.blocs, 1.25, 2.2), flou: conf(.16 - m.nettete, 0, .1), bruit: conf(m.bruit, .012, .05),
      sousExpose: conf(.3 - m.p50, 0, .2), contrasteFaible: conf(.45 - m.contraste, 0, .3)
    };
  }

  const NON_DETECTE = ["accessoires AR (oreilles, museau, lunettes, couronnes…)", "autocollants et textes ajoutés", "déformations du visage (yeux, nez, mâchoire)", "maquillage virtuel"];

  /* plan de traitement ordonné ; mode « fidelite » n’applique que le réversible, « reconstruction » accepte le génératif (étiqueté) */
  function plan(m, mode) {
    const det = detecter(m), e = etat(m), etapes = [], rec = mode === "reconstruction";
    const sur = det.filter(x => x.confiance >= .5), doute = det.filter(x => x.confiance < .5);
    if (e.compression >= .3) etapes.push({ etape: "anti-blocs", pourquoi: "compression visible", genere: false });
    if (e.bruit >= .3) etapes.push({ etape: "réduction du bruit", pourquoi: "bruit mesuré", genere: false });
    for (const x of sur) {
      if (x.reversible === "non" && !rec) continue;
      etapes.push({ etape: x.strategie, pourquoi: x.categorie, genere: x.reversible === "non" });
    }
    if (e.flou >= .3) etapes.push({ etape: rec ? "netteté + reconstruction des détails (IA)" : "netteté prudente", pourquoi: "image floue", genere: rec });
    etapes.push({ etape: "super-résolution par tuiles", pourquoi: "agrandissement", genere: true });
    return {
      mode: rec ? "reconstruction" : "fidelite", detections: det, etat: e, etapes,
      aConfirmer: doute.map(x => x.categorie),
      ignoresEnFidelite: rec ? [] : sur.filter(x => x.reversible === "non").map(x => x.categorie),
      nonDetecteAutomatiquement: NON_DETECTE
    };
  }

  /* ---------- cibles de sortie : ratio conservé, dimensions paires, étiquette honnête ---------- */
  function etiquette(f) {
    if (f <= 1.001) return "résolution d’origine (non agrandie)";
    if (f <= 2) return "restaurée et agrandie";
    if (f <= 4) return "agrandie par IA (détails en partie reconstruits)";
    return "reconstruite par IA (la plupart des détails fins sont générés, pas retrouvés)";
  }
  function cibles(w, h, opts) {
    const o = opts || {}, court = Math.min(w, h), out = [];
    for (const [nom, c] of [["HD 720p", 720], ["Full HD 1080p", 1080], ["4K UHD 2160p", 2160]]) {
      const f = c / court; if (f <= 1.001) { out.push({ nom, deja: true, facteur: 1, largeur: w, hauteur: h, etiquette: "déjà atteinte par la source" }); continue }
      const W = pair(w * f), H = pair(h * f), mpx = W * H / 1e6;
      const lourd = o.video && (mpx > 4 || f > 4);
      out.push({
        nom, deja: false, facteur: +f.toFixed(2), largeur: W, hauteur: H, etiquette: etiquette(f),
        nomExport: (c === 2160 ? "4K" : c + "p") + (f > 2 ? " reconstruite par IA" : " restaurée"),
        avertissement: f > 4 ? "Source très petite : le fichier aura bien cette taille, mais les détails ajoutés sont inventés de façon plausible." : null,
        conseil: lourd ? "Vidéo : traiter d’abord un extrait, puis par segments (reprise possible) ou avec le moteur distant facultatif." : null
      });
    }
    return out;
  }
  /* cible recommandée en automatique : jamais plus de ×4 sans demande explicite (au-delà, surtout de l’invention) */
  function cibleAuto(w, h, opts) {
    const t = cibles(w, h, opts).filter(x => !x.deja), c = t.filter(x => x.facteur <= 4); return c.length ? c[c.length - 1] : (t[0] || null);
  }

  /* ---------- tuiles avec recouvrement, taille fixée par un budget mémoire ---------- */
  function tuiles(w, h, echelle, budgetMo, recouvrement) {
    const B = (budgetMo || 64) * 1048576, R = recouvrement == null ? 16 : recouvrement;
    /* ≈ 24 octets par pixel de sortie (tenseur flottant entrée + sortie + tampon RGBA) */
    let t = Math.floor(Math.sqrt(B / 24) / echelle / 16) * 16; t = clamp(t, 64, 512);
    const pas = t - 2 * R, L = [];
    const axe = n => { const a = []; if (n <= t) return [[0, n]]; for (let p = 0; ; p += pas) { if (p + t >= n) { a.push([n - t, t]); break } a.push([p, t]) } return a };
    for (const [y, th] of axe(h)) for (const [x, tw] of axe(w)) L.push({ x, y, w: tw, h: th });
    return { cote: t, recouvrement: R, nombre: L.length, memoireMo: +((t * echelle) ** 2 * 24 / 1048576).toFixed(1), liste: L };
  }

  /* ---------- contrôle temporel : scintillement d’une suite de luminances moyennes (0–1), coupes exclues ---------- */
  function scintillement(l) {
    const n = l.length; if (n < 3) return { score: 0, coupes: [], verdict: "trop court pour mesurer" };
    const coupes = []; for (let i = 1; i < n; i++) if (Math.abs(l[i] - l[i - 1]) > .12) coupes.push(i);
    const C = new Set(coupes); let s = 0, c = 0;
    for (let i = 1; i < n - 1; i++) { if (C.has(i) || C.has(i + 1)) continue; s += Math.abs(l[i - 1] - 2 * l[i] + l[i + 1]); c++ }
    const score = c ? s / c : 0;
    return { score: +score.toFixed(4), coupes, verdict: score < .004 ? "stable" : score < .012 ? "léger scintillement" : "scintillement visible" };
  }
  /* gains de correction lissés dans le temps, réinitialisés à chaque coupe (évite qu’une correction image par image scintille) */
  function lisserGains(g, coupes, force) {
    const a = force == null ? .8 : force, C = new Set(coupes || []), o = new Array(g.length); let m = g[0];
    for (let i = 0; i < g.length; i++) { m = C.has(i) || i === 0 ? g[i] : a * m + (1 - a) * g[i]; o[i] = m }
    for (let i = g.length - 2; i >= 0; i--) if (!C.has(i + 1)) o[i] = (o[i] + (a * o[i + 1] + (1 - a) * o[i])) / 2;
    return o;
  }

  /* ---------- export « Préparer pour X » : valeurs de docs.x.com (bonnes pratiques média), relevées le 11/11/2026 ----------
     H.264 High, AAC-LC, YUV 4:2:0, ≤ 60 i/s, ratio entre 1:3 et 3:1, ≥ 5 Mb/s vidéo et ≥ 128 kb/s audio recommandés.
     X recompresse toujours : ce profil évite seulement un refus ou une double dégradation inutile. */
  function profilX(w, h, fps, duree, premium) {
    const A = [], max = premium ? 1080 : 720, court = Math.min(w, h), f = Math.min(1, max / court);
    let W = pair(w * f), H = pair(h * f); const r = W / H;
    if (r > 3 || r < 1 / 3) A.push("Format trop allongé pour X (accepté : entre 1:3 et 3:1) : recadrage nécessaire.");
    if (f < 1) A.push("Réduit à " + max + "p : au-delà, X réduit lui-même l’image" + (premium ? "." : " (1080p réservé aux comptes Premium)."));
    const F = Math.min(60, fps || 30); if (fps > 60) A.push("Cadence ramenée à 60 i/s (maximum accepté).");
    const limite = premium ? 125 * 60 : 20 * 60; if (duree > limite) A.push("Durée supérieure à la limite documentée (" + limite / 60 + " min).");
    if (duree < .5) A.push("Durée inférieure au minimum (0,5 s).");
    const debit = Math.max(5e6, Math.round(W * H * F * .1 / 1e5) * 1e5);
    return {
      largeur: W, hauteur: H, fps: F, codecVideo: "avc1.640028", profil: "H.264 High", pixel: "yuv420p", conteneur: "mp4",
      debitVideo: Math.min(debit, 25e6), codecAudio: "mp4a.40.2", debitAudio: 128000, canaux: 2, avertissements: A,
      note: "X recompresse toutes les vidéos : ce profil ne l’empêche pas."
    };
  }

  /* texte court pour l’interface */
  function resume(p) {
    const L = [];
    for (const x of p.detections) L.push((x.confiance >= .5 ? "● " : "○ ") + x.categorie + " — confiance " + Math.round(x.confiance * 100) + " %" + (x.reversible === "non" ? " (irréversible)" : ""));
    if (!L.length) L.push("Aucun filtre de couleur ou de lumière évident.");
    return L;
  }

  return { mesurer, detecter, etat, plan, cibles, cibleAuto, etiquette, tuiles, scintillement, lisserGains, profilX, resume, NON_DETECTE };
})();
if (typeof module !== "undefined" && module.exports) module.exports = ANALYSE;
