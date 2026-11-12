/* RetoucheProAI v7.4–v7.6 — RVV : restauration des visages EN VIDÉO, cohérente d'une image à l'autre (F14, essai).
   Méthode choisie sur mesures (tests/visage_ia/banc_video.py, 4 portraits × 24 images, vérité connue) :
     « H3 » — le visage est suivi image par image (YuNet), ses repères sont lissés dans le temps (régression locale d'ordre 2 sur
     7 images : suit le mouvement, retire la tremblote) ; une image sur K est restaurée par GFPGAN après fusion avec ses voisines
     alignées (moins de bruit et de blocs à l'entrée) ; chaque image exportée garde SES basses fréquences (lumière, couleurs, réglages
     de l'export) et reçoit les hautes fréquences des deux images clés qui l'encadrent, fondues selon la position.
   Mesuré (LPIPS ↓ / PSNR ↑ / scintillement ↓ ; entrée 0,319 / 24,30 / 9,51) : image par image 0,127 / 25,72 / 8,85 (24 calculs) ;
     H3 σ 24 : 0,134 / 25,61 / 8,00 (9 calculs, 2,7× moins) ; clés seules sans l'avenir (au fil de l'export) : 0,153 / 24,84 / 9,27 → écarté.
   Limites : visage le plus grand seulement ; pas d'expression simulée dans le banc ; mêmes réserves de licence que l'outil photo (F13). */
var RVV = (() => {
  const N = 512, Q = N * N, FORCE = .8, SIGMA_R = 24;   /* flou boîte ×3 de rayon 24 ≈ gaussienne σ 24 (mesure retenue) */
  const T = [192.98138, 239.94708, 318.90277, 240.1936, 256.63416, 314.01935, 201.26117, 371.41043, 313.08905, 371.15118];
  let S = null;   /* séance : { n, W, H, K, M: [similitudes | null], cles: Map(i → Int8Array hautes fréquences), seg: [id segment] } */
  const toile = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c };
  /* bord fondu (même gabarit que restauration-visage.js) */
  const ALPHA = (() => { const a = new Float32Array(Q); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x - 256) / 236, dy = (y - 286) / 250, r = Math.sqrt(dx * dx + dy * dy), m = Math.min(x, y, N - 1 - x, N - 1 - y);
    a[y * N + x] = Math.min(1, Math.max(0, (1.12 - r) / .22)) * Math.min(1, m / 24) } return a })();
  /* flou boîte ×3 sur un plan N×N (sommes glissantes : coût indépendant du rayon) */
  function flou(src, r) {
    let a = src, b = new Float32Array(Q), k = 2 * r + 1, out = new Float32Array(Q); a = Float32Array.from(src);
    for (let p = 0; p < 3; p++) {
      for (let y = 0; y < N; y++) { const o = y * N; let s = 0; for (let x = -r; x <= r; x++) s += a[o + Math.min(N - 1, Math.max(0, x))]; for (let x = 0; x < N; x++) { b[o + x] = s / k; s += a[o + Math.min(N - 1, x + r + 1)] - a[o + Math.max(0, x - r)] } }
      for (let x = 0; x < N; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[Math.min(N - 1, Math.max(0, y)) * N + x]; for (let y = 0; y < N; y++) { out[y * N + x] = s / k; s += b[Math.min(N - 1, y + r + 1) * N + x] - b[Math.max(0, y - r) * N + x] } }
      const t = a; a = out; out = t;
    }
    return a;
  }
  const POIDSV = Float32Array.from(ALPHA, v => v > .5 ? 1 : 0);
  const grisA = d => { const g = new Float32Array(Q); for (let j = 0, i = 0; j < Q; j++, i += 4) g[j] = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; return g };
  /* composition de deux similitudes [a, b, tx, ty] : (A ∘ B)(x) = A(B(x)) */
  const composer = (A, B) => [A[0] * B[0] - A[1] * B[1], A[0] * B[1] + A[1] * B[0], A[0] * B[2] - A[1] * B[3] + A[2], A[1] * B[2] + A[0] * B[3] + A[3]];
  const plans = d => { const P = [new Float32Array(Q), new Float32Array(Q), new Float32Array(Q)]; for (let j = 0, i = 0; j < Q; j++, i += 4) { P[0][j] = d[i]; P[1][j] = d[i + 1]; P[2][j] = d[i + 2] } return P };
  function aligner(src, M) {   /* visage aligné 512×512 (RGBA) d'une image, M : similitude image → gabarit */
    const c = toile(N, N), x = c.getContext("2d", { willReadFrequently: true }); x.imageSmoothingQuality = "high";
    x.setTransform(M[0], M[1], -M[1], M[0], M[2], M[3]); x.drawImage(src, 0, 0); return x.getImageData(0, 0, N, N).data;
  }
  /* repères lissés : régression locale d'ordre 2 sur 7 images, à l'intérieur d'un segment continu de visage */
  function lisser(P) {
    const out = P.map(p => p && p.slice());
    for (let t = 0; t < P.length; t++) {
      if (!P[t]) continue; const xs = [];
      for (let s = t - 3; s <= t + 3; s++) if (s >= 0 && s < P.length && P[s]) xs.push(s);
      if (xs.length < 4) continue;
      /* moindres carrés 3×3 (1, x, x²) résolus une fois, appliqués aux 10 coordonnées */
      let A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (const s of xs) { const x = s - t, v = [1, x, x * x]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i][j] += v[i] * v[j] }
      const inv = inv3(A); if (!inv) continue;
      for (let c = 0; c < 10; c++) { let b = [0, 0, 0]; for (const s of xs) { const x = s - t; b[0] += P[s][c]; b[1] += x * P[s][c]; b[2] += x * x * P[s][c] } out[t][c] = inv[0][0] * b[0] + inv[0][1] * b[1] + inv[0][2] * b[2] }
    }
    return out;
  }
  function inv3(m) {
    const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2], A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-9) return null; const k = 1 / det;
    return [[A * k, -(b * i - c * h) * k, (b * f - c * e) * k], [B * k, (a * i - c * g) * k, -(a * f - c * d) * k], [C * k, -(a * h - b * g) * k, (a * e - b * d) * k]];
  }
  /* écart d'apparence entre deux visages alignés (miniatures 64×64) → poids de fusion */
  function mini(d) { const m = new Float32Array(64 * 64 * 3); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) for (let c = 0; c < 3; c++) { let s = 0; for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) s += d[((y * 8 + v) * N + x * 8 + u) * 4 + c]; m[(y * 64 + x) * 3 + c] = s / 64 } return m }
  const poids = (a, b, soi) => { let e = 0; for (let i = 0; i < a.length; i++) e += Math.abs(a[i] - b[i]); e /= a.length; return Math.exp(-((e / 6) ** 2)) * (soi ? 1 : .8) };

  /* 1) préparation : 2 lectures de la vidéo. ouvrir() → lecteur { need(i) → image, close() } ; n images ; W×H taille source.
        Renvoie un résumé honnête. opt : { K, onProgress(texte, fraction), signal } */
  async function preparer(ouvrir, n, W, H, opt) {
    opt = opt || {}; const P = opt.onProgress || (() => {}), K = opt.K || (n <= 330 ? 3 : 6), t0 = performance.now(); S = null;
    const stop = () => { if (opt.signal && opt.signal.aborted) throw new DOMException("annulé", "AbortError") };
    /* a. repérage du visage le plus grand sur chaque image */
    let r = await ouvrir(); const brut = new Array(n).fill(null);
    try { for (let i = 0; i < n; i++) { stop(); const im = await r.need(i); const F = await VISAGE.detecter(im, W, H, .55);
        if (F.length) { const f = F.reduce((a, b) => a.w * a.h > b.w * b.h ? a : b); if (Math.hypot(f.pts[2] - f.pts[0], f.pts[3] - f.pts[1]) >= RVIS.R.oeilMin) brut[i] = Array.from(f.pts) }
        if (i % 10 === 0) { P("Visages : repérage " + (i + 1) + " / " + n + "…", .1 * i / n); await new Promise(z => setTimeout(z, 0)) } } }
    finally { try { r.close() } catch (e) {} }
    /* trous d'une ou deux images comblés par la position voisine ; segments continus */
    for (let i = 1; i < n - 1; i++) if (!brut[i] && brut[i - 1]) { const j = brut[i + 1] ? i + 1 : (i + 2 < n && brut[i + 2] ? i + 2 : -1); if (j > 0) brut[i] = brut[i - 1].map((v, c) => v + (brut[j][c] - v) / (j - i + 1)) }
    const pts = lisser(brut), M = pts.map(p => p ? RVIS.similitude(p, T) : null), seg = new Array(n).fill(-1); let sid = -1;
    for (let i = 0; i < n; i++) if (M[i]) { if (i === 0 || !M[i - 1]) sid++; seg[i] = sid }
    /* b. images clés : une sur K dans chaque segment, plus la dernière de chaque segment */
    const cles = new Set(); for (let i = 0; i < n; i++) if (M[i]) { const deb = seg.indexOf(seg[i]); if ((i - deb) % K === 0 || i === n - 1 || seg[i + 1] !== seg[i]) cles.add(i) }
    if (!cles.size) { S = { n, W, H, K, M, seg, cles: new Map(), visages: 0 }; return resume(t0) }
    const sess = await RVIS.charger(f => P("Téléchargement du modèle de visage (86 Mo, une seule fois)…", .1 + .05 * f));
    /* c. deuxième lecture : visages alignés gardés sur une fenêtre de 5 images ; fusion puis GFPGAN pour chaque clé */
    const fen = new Map(), mins = new Map(), out = new Map(), net = [], bas = new Array(n).fill(null); let fait = 0; r = await ouvrir();
    const RC = window.RECALAGE ? RECALAGE.creer(N, POIDSV) : null; let segRef = -1, pyrRef = null, recales = 0;
    /* v7.5 : correction des basses fréquences par la fusion des voisines (mesuré : scintillement 5,11 → 4,89 sur la vidéo de test).
       Δ = flou(moyenne pondérée des voisines − image), en 64×64, gardé pour chaque image et ajouté à l'export. */
    const delta = t => {
      const m0 = mins.get(t), acc = new Float32Array(m0.length); let ws = 0;
      for (let s = t - 2; s <= t + 2; s++) { if (!mins.has(s) || seg[s] !== seg[t]) continue; const w = poids(m0, mins.get(s), s === t), ms = mins.get(s); ws += w; for (let j = 0; j < acc.length; j++) acc[j] += w * ms[j] }
      const o = new Int8Array(m0.length), a = new Float32Array(4096), b = new Float32Array(4096);
      for (let c = 0; c < 3; c++) { for (let j = 0; j < 4096; j++) a[j] = acc[3 * j + c] / ws - m0[3 * j + c];
        for (let pss = 0; pss < 3; pss++) {   /* flou boîte rayon 3 ×3 en 64×64 ≈ σ 24 en 512 */
          for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { let q = 0; for (let u = -3; u <= 3; u++) q += a[y * 64 + Math.min(63, Math.max(0, x + u))]; b[y * 64 + x] = q / 7 }
          for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { let q = 0; for (let u = -3; u <= 3; u++) q += b[Math.min(63, Math.max(0, y + u)) * 64 + x]; a[y * 64 + x] = q / 7 } }
        for (let j = 0; j < 4096; j++) o[3 * j + c] = Math.max(-127, Math.min(127, Math.round(4 * a[j]))) }
      bas[t] = o;
    };
    const finir = async t => { if (t < 0 || t >= n || !M[t] || !mins.has(t)) return; delta(t); if (cles.has(t)) await traiter(t) };
    const traiter = async k => {
      const d = fen.get(k); let fu = new Float32Array(Q * 3), ws = 0;
      for (let s = k - 2; s <= k + 2; s++) { if (!fen.has(s) || seg[s] !== seg[k]) continue; const w = poids(mins.get(k), mins.get(s), s === k), ds = fen.get(s); ws += w; for (let j = 0, i = 0; j < Q; j++, i += 4) { fu[3 * j] += w * ds[i]; fu[3 * j + 1] += w * ds[i + 1]; fu[3 * j + 2] += w * ds[i + 2] } }
      for (let j = 0; j < 3 * Q; j++) fu[j] /= ws;
      /* visage déjà net : on n'invente rien (même seuil que l'outil photo, ramené à la taille réelle du visage) */
      let s2 = 0, nn = 0; const g = j => .299 * fu[3 * j] + .587 * fu[3 * j + 1] + .114 * fu[3 * j + 2];
      for (let y = 200; y < 400; y += 2) for (let x = 160; x < 352; x += 2) { const j = y * N + x, l = 4 * g(j) - g(j - 1) - g(j + 1) - g(j - N) - g(j + N); s2 += l * l; nn++ }
      const nette = Math.sqrt(s2 / nn) * Math.hypot(M[k][0], M[k][1]); net.push(+nette.toFixed(1));
      if (nette >= RVIS.R.netMin) return;
      const x = new Float32Array(3 * Q); for (let j = 0; j < Q; j++) { x[j] = fu[3 * j] / 127.5 - 1; x[Q + j] = fu[3 * j + 1] / 127.5 - 1; x[2 * Q + j] = fu[3 * j + 2] / 127.5 - 1 }
      const y = (await sess.run({ entree: new ort.Tensor("float32", x, [1, 3, N, N]) })).sortie.data;
      /* couleurs recalées au centre du visage, dosage FORCE, puis seules les hautes fréquences sont gardées (Int8, pas de 2) */
      const mo = [0, 0, 0], ms = [0, 0, 0]; let nc = 0; const R = [new Float32Array(Q), new Float32Array(Q), new Float32Array(Q)];
      for (let j = 0; j < Q; j++) for (let c = 0; c < 3; c++) { R[c][j] = (Math.max(-1, Math.min(1, y[c * Q + j])) + 1) * 127.5; if (ALPHA[j] > .9) { if (c === 0) nc++; mo[c] += fu[3 * j + c]; ms[c] += R[c][j] } }
      const hf = new Int8Array(3 * Q);
      for (let c = 0; c < 3; c++) { const dc = (mo[c] - ms[c]) / Math.max(1, nc), v = R[c]; for (let j = 0; j < Q; j++) v[j] = FORCE * (v[j] + dc) + (1 - FORCE) * fu[3 * j + c];
        const lp = flou(v, SIGMA_R); for (let j = 0; j < Q; j++) hf[c * Q + j] = Math.max(-127, Math.min(127, Math.round((v[j] - lp[j]) / 2))) }
      out.set(k, hf); fait++; P("Visages : restauration de l’image clé " + fait + " / " + cles.size + "…", .15 + .85 * fait / cles.size);
    };
    try {
      for (let i = 0; i < n; i++) {
        stop(); if (M[i]) { const im = await r.need(i); let d = aligner(im, M[i]);
          /* v7.6 : recalage fin sur la première image du segment (YuNet seul se trompe de plusieurs degrés) : fusion, clés et report
             partagent alors exactement le même repère. Mesuré (banc, 4 portraits) : LPIPS 0,134 → 0,127, scintillement 8,0 → 6,6. */
          if (RC) { const g = RC.pyramide(grisA(d)); if (seg[i] !== segRef) { segRef = seg[i]; pyrRef = g }
            else { const D = RC.recaler(pyrRef, g); if (D) { M[i] = composer(RVIS.inverse([D[0], D[3], D[2], D[5]]), M[i]); d = aligner(im, M[i]); recales++ } } }
          fen.set(i, d); mins.set(i, mini(d)) }
        await finir(i - 2);
        for (const z of [...fen.keys()]) if (z < i - 4) { fen.delete(z); mins.delete(z) }
      }
      await finir(n - 2); await finir(n - 1);
    } finally { try { r.close() } catch (e) {} }
    S = { n, W, H, K, M, seg, cles: out, bas, nettetes: net, recales, visages: M.filter(Boolean).length };
    return resume(t0);
  }
  function resume(t0) {
    const r = { images: S.n, avec_visage: S.visages || 0, cles: S.cles.size, K: S.K, recales: S.recales || 0, ms: Math.round(performance.now() - t0) };
    r.texte = !r.avec_visage ? "Aucun visage suivi dans la vidéo : rien n’est modifié."
      : !r.cles ? "Visages déjà nets (ou trop petits) : laissés tels quels."
      : "Visages restaurés : " + r.cles + " images clés, reportées sur " + r.avec_visage + " images (détails reconstruits par l’IA, plausibles et non retrouvés).";
    return r;
  }
  /* 2) à l'export : compose le visage restauré sur l'image exportée i (canvas de sortie, n'importe quelle taille) → canvas 2D */
  let oc = null, fc = null;
  function appliquer(sortie, i) {
    if (!S || !S.cles.size || !S.M[i]) return sortie;
    const ks = [...S.cles.keys()].filter(k => S.seg[k] === S.seg[i]); if (!ks.length) return sortie;
    let k0 = -1, k1 = -1; for (const k of ks) { if (k <= i && k > k0) k0 = k; if (k >= i && (k1 < 0 || k < k1)) k1 = k }
    if (k0 < 0) k0 = k1; if (k1 < 0) k1 = k0; const u = k1 === k0 ? 0 : (i - k0) / (k1 - k0), A = S.cles.get(k0), B = S.cles.get(k1);
    const w = sortie.width, h = sortie.height, sx = w / S.W;
    if (!oc || oc.width !== w || oc.height !== h) { oc = toile(w, h); fc = toile(N, N) }
    const ox = oc.getContext("2d", { willReadFrequently: true }); ox.setTransform(1, 0, 0, 1, 0, 0); ox.drawImage(sortie, 0, 0);
    const m = S.M[i], Mo = [m[0] / sx, m[1] / sx, m[2], m[3]], d = aligner(oc, Mo), P = plans(d), img = new ImageData(N, N), q = img.data;
    const D = S.bas && S.bas[i];
    for (let c = 0; c < 3; c++) { const lp = flou(P[c], SIGMA_R);
      if (D) for (let y = 0; y < N; y++) { const v = Math.min(63, Math.max(0, (y + .5) / 8 - .5)), y0 = Math.floor(v), y1 = Math.min(63, y0 + 1), fy = v - y0;
        for (let x = 0; x < N; x++) { const w0 = Math.min(63, Math.max(0, (x + .5) / 8 - .5)), x0 = Math.floor(w0), x1 = Math.min(63, x0 + 1), fx = w0 - x0;
          lp[y * N + x] += .25 * ((1 - fy) * ((1 - fx) * D[(y0 * 64 + x0) * 3 + c] + fx * D[(y0 * 64 + x1) * 3 + c]) + fy * ((1 - fx) * D[(y1 * 64 + x0) * 3 + c] + fx * D[(y1 * 64 + x1) * 3 + c])) } }
      for (let j = 0; j < Q; j++) q[4 * j + c] = lp[j] + 2 * ((1 - u) * A[c * Q + j] + u * B[c * Q + j]) }
    for (let j = 0; j < Q; j++) q[4 * j + 3] = Math.round(255 * ALPHA[j]);
    fc.getContext("2d").putImageData(img, 0, 0);
    const d0 = m[0] / sx, d1 = m[1] / sx, dd = d0 * d0 + d1 * d1, ia = d0 / dd, ib = -d1 / dd;
    ox.save(); ox.imageSmoothingQuality = "high"; ox.setTransform(ia, ib, -ib, ia, -(ia * m[2] - ib * m[3]), -(ib * m[2] + ia * m[3])); ox.drawImage(fc, 0, 0); ox.restore();
    return oc;
  }
  function vider() { S = null; oc = fc = null }
  return { preparer, appliquer, vider, etat: () => S && { images: S.n, cles: S.cles.size, K: S.K, visages: S.visages, nettetes: S.nettetes }, _lisser: lisser, _flou: flou };
})();
