/* RetoucheProAI v6.8 — VISAGE : repérage du visage sur l’appareil (YuNet, OpenCV Zoo, licence MIT, 233 Ko, livré avec l’app),
   proposition des zones où un filtre AR a probablement ajouté quelque chose, et suivi lissé d’un visage dans une vidéo.
   Ce module REPÈRE un visage (boîte + 5 repères) ; il ne reconnaît et n’identifie personne.
   Limites assumées : les zones proposées sont des hypothèses mesurées (couleur très différente de la peau, des cheveux et du fond),
   jamais appliquées sans validation ; une barbe, de vraies lunettes ou un bonnet peuvent être proposés à tort.
   Les déformations du visage et le maquillage virtuel ne sont PAS détectés (aucune mesure fiable sans image de référence). */
var VISAGE = (() => {
  const MODELE = "modeles/yunet.onnx", SHA = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4", N = 640;
  let sess = null, chargement = null;
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const conf = (x, lo, hi) => +clamp((x - lo) / (hi - lo), 0, 1).toFixed(2);

  /* ---------- modèle ---------- */
  function script(src) { return new Promise((ok, ko) => { if (window.ort) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => ko(new Error("moteur introuvable")); document.head.appendChild(s) }) }
  async function charger() {
    if (sess) return sess;
    if (!chargement) chargement = (async () => {
      const b = new Uint8Array(await (await fetch(MODELE)).arrayBuffer());
      const h = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b)), x => x.toString(16).padStart(2, "0")).join("");
      if (h !== SHA) throw new Error("fichier du modèle de visage modifié ou incomplet");
      await script("ort/ort.wasm.min.js");
      ort.env.wasm.wasmPaths = new URL("ort/", location.href).href;
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      sess = await ort.InferenceSession.create(b, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
      return sess;
    })().catch(e => { chargement = null; throw e });
    return chargement;
  }
  async function liberer() { const s = sess; sess = null; chargement = null; try { if (s && s.release) await s.release() } catch (e) {} }

  /* sorties du réseau → visages (boîte, 5 repères : œil gauche image, œil droit image, nez, coins de bouche) */
  function decoder(o, echelle, seuil) {
    const F = [];
    for (const s of [8, 16, 32]) {
      const cols = N / s, cls = o["cls_" + s].data, obj = o["obj_" + s].data, bb = o["bbox_" + s].data, kp = o["kps_" + s].data;
      for (let i = 0; i < cls.length; i++) {
        const sc = Math.sqrt(clamp(cls[i], 0, 1) * clamp(obj[i], 0, 1)); if (sc < seuil) continue;
        const c = i % cols, r = (i - c) / cols, cx = (c + bb[i * 4]) * s, cy = (r + bb[i * 4 + 1]) * s, w = Math.exp(bb[i * 4 + 2]) * s, h = Math.exp(bb[i * 4 + 3]) * s, pts = [];
        for (let k = 0; k < 5; k++) pts.push((kp[i * 10 + 2 * k] + c) * s / echelle, (kp[i * 10 + 2 * k + 1] + r) * s / echelle);
        F.push({ x: (cx - w / 2) / echelle, y: (cy - h / 2) / echelle, w: w / echelle, h: h / echelle, pts, score: +sc.toFixed(3) });
      }
    }
    return nms(F, .3);
  }
  function iou(a, b) { const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h), i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0); return i / (a.w * a.h + b.w * b.h - i || 1) }
  function nms(F, t) { F.sort((a, b) => b.score - a.score); const K = []; for (const f of F) if (!K.some(k => iou(k, f) > t)) K.push(f); return K }

  /* src : image, canvas ou vidéo ; renvoie les visages en coordonnées de la source */
  async function detecter(src, w, h, seuil) {
    const s = await charger(), e = N / Math.max(w, h), c = document.createElement("canvas"); c.width = c.height = N;
    const x = c.getContext("2d", { willReadFrequently: true }); x.fillStyle = "#000"; x.fillRect(0, 0, N, N); x.imageSmoothingQuality = "high";
    x.drawImage(src, 0, 0, w, h, 0, 0, Math.round(w * e), Math.round(h * e));
    const d = x.getImageData(0, 0, N, N).data, t = new Float32Array(3 * N * N), P = N * N;
    for (let i = 0, j = 0; j < P; i += 4, j++) { t[j] = d[i + 2]; t[P + j] = d[i + 1]; t[2 * P + j] = d[i] }   /* BGR, 0–255 */
    const o = await s.run({ input: new ort.Tensor("float32", t, [1, 3, N, N]) });
    return decoder(o, e, seuil == null ? .6 : seuil);
  }

  /* ---------- repère du visage : origine entre les yeux, unité = distance entre les yeux ---------- */
  function repere(f) {
    const p = f.pts, ox = (p[0] + p[2]) / 2, oy = (p[1] + p[3]) / 2, dx = p[2] - p[0], dy = p[3] - p[1], d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d; let vx = -uy, vy = ux;
    const bx = (p[6] + p[8]) / 2 - ox, by = (p[7] + p[9]) / 2 - oy; if (bx * vx + by * vy < 0) { vx = -vx; vy = -vy }   /* v pointe vers la bouche */
    return { ox, oy, d, ux, uy, vx, vy, nez: [((p[4] - ox) * ux + (p[5] - oy) * uy) / d, ((p[4] - ox) * vx + (p[5] - oy) * vy) / d], bouche: [(bx * ux + by * uy) / d, (bx * vx + by * vy) / d] };
  }
  const versImage = (R, a, b) => [R.ox + (a * R.ux + b * R.vx) * R.d, R.oy + (a * R.uy + b * R.vy) * R.d];

  /* zones (ellipses dans le repère du visage) : [nom, centre a, centre b, rayon a, rayon b, type] */
  function zones(f) {
    const R = repere(f), n = R.nez, m = R.bouche;
    return { R, liste: [
      { nom: "nez / museau", a: n[0], b: n[1], ra: .42, rb: .36, type: "peau", lo: .4, hi: .75, max: .95 },
      { nom: "lunettes / masque sur les yeux", a: 0, b: 0, ra: 1.25, rb: .42, type: "peau", lo: .45, hi: .75, max: .8 },
      { nom: "joue gauche (moustaches, autocollant)", a: -.72, b: .8, ra: .3, rb: .25, type: "peau", lo: .45, hi: .75, max: .7 },
      { nom: "joue droite (moustaches, autocollant)", a: .72, b: .8, ra: .3, rb: .25, type: "peau", lo: .45, hi: .75, max: .7 },
      { nom: "bouche / langue", a: m[0], b: m[1] + .5, ra: .42, rb: .42, type: "peau", lo: .35, hi: .7, max: .8 },
      { nom: "oreille ou accessoire en haut à gauche", a: -.95, b: -1.8, ra: .55, rb: .55, type: "tete", cote: -1, lo: .35, hi: .7, max: .8 },
      { nom: "oreille ou accessoire en haut à droite", a: .95, b: -1.8, ra: .55, rb: .55, type: "tete", cote: 1, lo: .35, hi: .7, max: .8 },
      { nom: "couronne / chapeau", a: 0, b: -2.05, ra: .7, rb: .4, type: "tete", cote: 0, lo: .45, hi: .8, max: .7 }
    ] };
  }

  /* couleur médiane (Y, Cb, Cr) de petites pastilles */
  function mediane(d, w, h, R, pastilles, r) {
    const Y = [], B = [], C = [];
    for (const [a, b] of pastilles) {
      const [cx, cy] = versImage(R, a, b), rr = Math.max(1, r * R.d);
      for (let y = Math.round(cy - rr); y <= cy + rr; y += Math.max(1, rr / 6 | 0)) for (let x = Math.round(cx - rr); x <= cx + rr; x += Math.max(1, rr / 6 | 0)) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue; const i = (y * w + x) * 4, q = ycc(d[i], d[i + 1], d[i + 2]); Y.push(q[0]); B.push(q[1]); C.push(q[2]);
      }
    }
    if (Y.length < 8) return null; const md = a => { a.sort((p, q) => p - q); return a[a.length >> 1] }; return [md(Y), md(B), md(C)];
  }
  const ycc = (r, g, b) => [.299 * r + .587 * g + .114 * b, 128 - .169 * r - .331 * g + .5 * b, 128 + .5 * r - .419 * g - .081 * b];
  /* distance de couleur : la teinte compte plus que la luminosité (ombres naturelles) */
  const dist = (q, ref) => Math.hypot(q[1] - ref[1], q[2] - ref[2]) * 1.6 + Math.abs(q[0] - ref[0]) * .45;

  /* pour chaque zone : part de pixels « étrangers » (ni peau, ni cheveux, ni fond) → confiance + masque proposé */
  function analyser(d, w, h, f, seuilCouleur) {
    const Z = zones(f), R = Z.R, T = seuilCouleur || 42, out = [];
    const peau = mediane(d, w, h, R, [[-.55, .5], [.55, .5], [0, .32]], .13);
    const cheveux = mediane(d, w, h, R, [[0, -1.35], [-.35, -1.3], [.35, -1.3]], .12);
    const fond = { "-1": mediane(d, w, h, R, [[-2.5, -1.8], [-2.5, -1.2]], .15), "1": mediane(d, w, h, R, [[2.5, -1.8], [2.5, -1.2]], .15) };
    if (!peau) return { visage: f, zones: [], peau: null };
    for (const z of Z.liste) {
      const [cx, cy] = versImage(R, z.a, z.b), ra = z.ra * R.d, rb = z.rb * R.d, rm = Math.max(ra, rb);
      const x0 = Math.max(0, Math.floor(cx - rm)), y0 = Math.max(0, Math.floor(cy - rm)), x1 = Math.min(w - 1, Math.ceil(cx + rm)), y1 = Math.min(h - 1, Math.ceil(cy + rm));
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1; if (bw < 4 || bh < 4) continue;
      const refs = z.type === "peau" ? [peau] : [peau, cheveux, ...(z.cote ? [fond[z.cote]] : [fond[-1], fond[1]])].filter(Boolean);
      if (z.type === "tete" && refs.length < 3) continue;           /* cheveux ou fond illisibles (bord de l’image) : pas d’hypothèse */
      const sel = new Uint8Array(bw * bh); let tot = 0, etr = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x - cx, py = y - cy, a = (px * R.ux + py * R.uy) / ra, b = (px * R.vx + py * R.vy) / rb; if (a * a + b * b > 1) continue;
        tot++; const i = (y * w + x) * 4, q = ycc(d[i], d[i + 1], d[i + 2]);
        if (refs.every(r => dist(q, r) > T)) { etr++; sel[(y - y0) * bw + (x - x0)] = 1 }
      }
      const part = tot ? etr / tot : 0, hors = tot < Math.PI * ra * rb * .6;   /* zone en grande partie hors image */
      out.push({ nom: z.nom, type: z.type, part: +part.toFixed(3), confiance: hors ? 0 : Math.min(z.max, conf(part, z.lo, z.hi)), masque: { x: x0, y: y0, w: bw, h: bh, sel: dilater(sel, bw, bh, Math.max(1, Math.round(R.d * .05))) } });
    }
    /* deux oreilles : une seule ne suffit pas à être sûr, deux semblables renforcent l’hypothèse */
    const g = out.find(z => /haut à gauche/.test(z.nom)), dr = out.find(z => /haut à droite/.test(z.nom));
    if (g && dr && Math.min(g.confiance, dr.confiance) < .3) { g.confiance = Math.min(g.confiance, .45); dr.confiance = Math.min(dr.confiance, .45) }
    return { visage: f, peau, zones: out.sort((a, b) => b.confiance - a.confiance) };
  }
  function dilater(m, w, h, r) {
    const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !v; k++) v = m[y * w + k]; t[y * w + x] = v }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !v; k++) v = t[k * w + x]; o[y * w + x] = v }
    return o;
  }

  /* ---------- suivi vidéo : une piste = un visage par image (ou null) ---------- */
  const centre = f => [f.x + f.w / 2, f.y + f.h / 2];
  /* coupe la piste aux sauts (changement de plan) et aux longues disparitions ; comble les trous courts ; lisse sans retard */
  function lisserPiste(P, opts) {
    const o = opts || {}, trou = o.trouMax == null ? 5 : o.trouMax, a = o.force == null ? .55 : o.force, n = P.length, out = new Array(n).fill(null), segs = [];
    let cur = null, dernier = -1;
    for (let i = 0; i < n; i++) {
      const f = P[i]; if (!f) continue;
      let neuf = !cur || i - dernier - 1 > trou;
      if (!neuf) { const p = P[dernier], c0 = centre(p), c1 = centre(f); if (Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) > .6 * Math.max(p.w, p.h) * (i - dernier) || f.w / p.w > 1.6 || p.w / f.w > 1.6) neuf = true }
      if (neuf) { cur = { debut: i, fin: i }; segs.push(cur) } else cur.fin = i; dernier = i;
    }
    const vec = f => [f.x, f.y, f.w, f.h, ...f.pts], dev = v => ({ x: v[0], y: v[1], w: v[2], h: v[3], pts: v.slice(4) });
    for (const s of segs) {
      const V = []; let p = -1;
      for (let i = s.debut; i <= s.fin; i++) {
        if (P[i]) { if (p >= 0 && i - p > 1) { const A = vec(P[p]), B = vec(P[i]); for (let k = p + 1; k < i; k++) { const t = (k - p) / (i - p); V[k - s.debut] = A.map((x, j) => x + (B[j] - x) * t) } } V[i - s.debut] = vec(P[i]); p = i }
      }
      const L = V.length, F = new Array(L), B = new Array(L); F[0] = V[0]; B[L - 1] = V[L - 1];
      for (let i = 1; i < L; i++) F[i] = V[i].map((x, j) => a * F[i - 1][j] + (1 - a) * x);
      for (let i = L - 2; i >= 0; i--) B[i] = V[i].map((x, j) => a * B[i + 1][j] + (1 - a) * x);
      for (let i = 0; i < L; i++) out[s.debut + i] = { ...dev(F[i].map((x, j) => (x + B[i][j]) / 2)), score: P[s.debut + i] ? P[s.debut + i].score : 0, interpole: !P[s.debut + i] };
    }
    return { piste: out, segments: segs };
  }
  /* tremblement : accélération moyenne du centre, rapportée à la taille du visage (0 = parfaitement régulier) */
  function tremblement(P) {
    let s = 0, c = 0; for (let i = 1; i < P.length - 1; i++) { const a = P[i - 1], b = P[i], d = P[i + 1]; if (!a || !b || !d) continue; const A = centre(a), B = centre(b), D = centre(d); s += Math.hypot(A[0] - 2 * B[0] + D[0], A[1] - 2 * B[1] + D[1]) / (b.w || 1); c++ }
    return c ? +(s / c).toFixed(4) : 0;
  }
  /* reporte un masque validé sur l’image A vers l’image B en suivant le visage (déplacement, taille, rotation) */
  function propager(m, fA, fB, w, h) {
    const A = repere(fA), B = repere(fB), k = B.d / A.d, coins = [[m.x, m.y], [m.x + m.w, m.y], [m.x, m.y + m.h], [m.x + m.w, m.y + m.h]].map(([x, y]) => {
      const a = ((x - A.ox) * A.ux + (y - A.oy) * A.uy) / A.d, b = ((x - A.ox) * A.vx + (y - A.oy) * A.vy) / A.d; return versImage(B, a, b) });
    const x0 = Math.max(0, Math.floor(Math.min(...coins.map(c => c[0])))), y0 = Math.max(0, Math.floor(Math.min(...coins.map(c => c[1])))), x1 = Math.min(w - 1, Math.ceil(Math.max(...coins.map(c => c[0])))), y1 = Math.min(h - 1, Math.ceil(Math.max(...coins.map(c => c[1]))));
    const bw = Math.max(0, x1 - x0 + 1), bh = Math.max(0, y1 - y0 + 1), sel = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const a = ((x + x0 - B.ox) * B.ux + (y + y0 - B.oy) * B.uy) / B.d, b = ((x + x0 - B.ox) * B.vx + (y + y0 - B.oy) * B.vy) / B.d, [sx, sy] = versImage(A, a, b), ix = Math.round(sx - m.x), iy = Math.round(sy - m.y);
      if (ix >= 0 && iy >= 0 && ix < m.w && iy < m.h && m.sel[iy * m.w + ix]) sel[y * bw + x] = 1;
    }
    return { x: x0, y: y0, w: bw, h: bh, sel, echelle: +k.toFixed(3) };
  }

  /* détection + analyse sur une image complète (canvas/image) */
  async function proposer(src, w, h) {
    const F = await detecter(src, w, h); if (!F.length) return { visages: 0, propositions: [] };
    const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(src, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, P = [];
    for (const f of F.slice(0, 4)) { if (Math.min(f.w, f.h) < 40) continue; P.push(analyser(d, w, h, f)) }
    return { visages: F.length, propositions: P };
  }

  return { MODELE, SHA, LICENCE: "MIT (OpenCV Zoo, YuNet 2023mar)", charger, liberer, detecter, decoder, nms, repere, zones, analyser, proposer, lisserPiste, tremblement, propager, dilater };
})();
if (typeof module !== "undefined" && module.exports) module.exports = VISAGE;
