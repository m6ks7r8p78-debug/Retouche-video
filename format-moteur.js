/* RetoucheProAI v8.0 — FMM : le MOTEUR de « Changer de format » (calcul pur, sans écran ; testé dans Node).
   Il fabrique, pour chaque scène, ce qui manque autour de l'image quand on change de format, SANS jamais retoucher l'image d'origine :
     1. le « décor retrouvé » : en suivant le mouvement de la caméra, on recolle les images de la scène les unes à côté des autres
        (mosaïque). Ce qu'une image ne montre pas, une autre l'a souvent filmé : ces pixels-là sont VRAIS ;
     2. le « décor reconstruit » : ce que la caméra n'a jamais filmé est prolongé par un modèle (MI-GAN), une seule fois par scène,
        et seulement jusqu'à la profondeur où le modèle reste crédible (mesurée : tests/format/banc_generateurs.py) ;
     3. au-delà : fondu vers le prolongement flou de l'image (rien de net n'est inventé).
   Le décor (« plaque ») est fixe dans la scène et suit le mouvement de la caméra : il ne peut donc pas scintiller d'une image à l'autre.
   Conventions : matrices 2×3 [a, b, c, d, e, f] : x' = a·x + b·y + c ; y' = d·x + e·y + f (comme FMA). Les coordonnées « source » sont en
   pixels de la vidéo (zone utile, bandes noires retirées), coin haut-gauche = (0, 0), centre du premier pixel = (0,5 ; 0,5). */
var FMM = (() => {
  const borne = (x, a, b) => x < a ? a : x > b ? b : x;
  const mul = (A, B) => [A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2], A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5]];
  const inv = M => { const d = M[0] * M[4] - M[1] * M[3], a = M[4] / d, b = -M[1] / d, c = -M[3] / d, e = M[0] / d; return [a, b, -(a * M[2] + b * M[5]), c, e, -(c * M[2] + e * M[5])] };
  const app = (M, x, y) => [M[0] * x + M[1] * y + M[2], M[3] * x + M[4] * y + M[5]];
  const ech = (kx, ky, tx, ty) => [kx, 0, tx || 0, 0, ky, ty || 0];
  /* pour ctx.setTransform(...versCanvas(M)) */
  const versCanvas = M => [M[0], M[3], M[1], M[4], M[2], M[5]];

  /* matrice de caméra mesurée sur les images d'analyse (aw×ah, pixel entier = centre) → même matrice en pixels source */
  function matSource(M, aw, ah, sw, sh) { const sx = sw / aw, sy = sh / ah, T = [1 / sx, 0, -.5, 0, 1 / sy, -.5], Ti = [sx, 0, .5 * sx, 0, sy, .5 * sy]; return mul(Ti, mul(M, T)) }

  /* où poser l'image n° j de la scène dans la sortie W×H : o = k·p + (ox, oy) */
  function cadre(plan, j, sw, sh, W, H) {
    if (plan.methode === "identique") return { k: W / sw, ox: 0, oy: 0, lw: W, lh: H };
    const pos = plan.pos ? plan.pos[Math.min(j, plan.pos.length - 1)] : 0;
    if (plan.axeExt === "x") { const k = H / (plan.vis * sh); return { k, ox: (W - sw * k) / 2, oy: -pos * sh * k, lw: sw * k, lh: sh * k } }
    const k = W / (plan.vis * sw); return { k, ox: -pos * sw * k, oy: (H - sh * k) / 2, lw: sw * k, lh: sh * k };
  }
  /* part de la sortie qui n'est pas couverte par l'image (à compléter) */
  function manque(plan) { return plan.methode === "identique" || plan.z === 1 ? 0 : 1 - plan.couv }

  /* ================= 1. mosaïque basse définition (pendant l'analyse) =================
     echs : [{ rgba (aw×ah×4), M (image → image de référence, pixels d'analyse) }]. Pour chaque point du décor, on garde la valeur MÉDIANE
     (en luminosité) de toutes les images qui l'ont vu : ce qui passe devant (personnes, voitures) disparaît, le décor reste.
     Renvoie { x0, y0, w, h, rgb, n } : n = nombre d'images qui ont vu ce point (0 = jamais filmé). */
  function mosaique(echs, aw, ah, marge) {
    marge = marge == null ? 1.6 : marge; let x0 = 0, y0 = 0, x1 = aw, y1 = ah;
    for (const e of echs) for (const [x, y] of [[0, 0], [aw - 1, 0], [0, ah - 1], [aw - 1, ah - 1]]) { const [X, Y] = app(e.M, x, y); x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X + 1); y1 = Math.max(y1, Y + 1) }
    x0 = Math.floor(Math.max(x0, -marge * aw)); y0 = Math.floor(Math.max(y0, -marge * ah)); x1 = Math.ceil(Math.min(x1, (1 + marge) * aw)); y1 = Math.ceil(Math.min(y1, (1 + marge) * ah));
    const w = x1 - x0, h = y1 - y0, S = Math.min(echs.length, 64), pas = echs.length / S, vals = new Uint8Array(w * h * S * 3), cnt = new Uint8Array(w * h);
    for (let s = 0; s < S; s++) { const e = echs[Math.min(echs.length - 1, Math.floor(s * pas + pas / 2))], Mi = inv(e.M), d = e.rgba;
      for (let Y = 0; Y < h; Y++) { let fx = Mi[0] * x0 + Mi[1] * (Y + y0) + Mi[2], fy = Mi[3] * x0 + Mi[4] * (Y + y0) + Mi[5];
        for (let X = 0; X < w; X++, fx += Mi[0], fy += Mi[3]) { if (fx < 0 || fy < 0 || fx > aw - 1 || fy > ah - 1) continue;
          const ix = Math.min(aw - 2, fx | 0), iy = Math.min(ah - 2, fy | 0), ax = fx - ix, ay = fy - iy, j = (iy * aw + ix) * 4, p = Y * w + X, o = (p * S + cnt[p]++) * 3;
          for (let c = 0; c < 3; c++) vals[o + c] = (d[j + c] * (1 - ax) + d[j + 4 + c] * ax) * (1 - ay) + (d[j + aw * 4 + c] * (1 - ax) + d[j + aw * 4 + 4 + c] * ax) * ay + .5 } } }
    const rgb = new Uint8Array(w * h * 3), lum = new Float32Array(S), idx = new Uint8Array(S);
    for (let p = 0; p < w * h; p++) { const n = cnt[p]; if (!n) continue; const b = p * S * 3;
      for (let i = 0; i < n; i++) { lum[i] = .299 * vals[b + i * 3] + .587 * vals[b + i * 3 + 1] + .114 * vals[b + i * 3 + 2]; idx[i] = i }
      for (let i = 1; i < n; i++) { const v = idx[i]; let k = i - 1; while (k >= 0 && lum[idx[k]] > lum[v]) { idx[k + 1] = idx[k]; k-- } idx[k + 1] = v }
      /* moyenne des 3 valeurs centrales (moins de grain qu'une seule) */
      const a = Math.max(0, (n >> 1) - 1), z = Math.min(n - 1, (n >> 1) + 1); let r = 0, g = 0, bl = 0; for (let i = a; i <= z; i++) { const o = b + idx[i] * 3; r += vals[o]; g += vals[o + 1]; bl += vals[o + 2] } const m = z - a + 1;
      rgb[p * 3] = r / m + .5; rgb[p * 3 + 1] = g / m + .5; rgb[p * 3 + 2] = bl / m + .5 }
    return { x0, y0, w, h, rgb, n: cnt };
  }
  /* part de ce qu'il faut compléter (au format voulu, sans zoom) que la mosaïque a réellement filmé, par côté {g, d, h, b} (0…1) */
  function reelDisponible(mos, Ms, aw, ah, As, At) {
    const large = At > As, prof = large ? aw * (At / As - 1) / 2 : ah * (As / At - 1) / 2, out = { g: 0, d: 0, h: 0, b: 0 }; if (prof < .5 || !Ms.length) return out;
    const vu = (M, x, y) => { const [X, Y] = app(M, x, y), ix = Math.round(X - mos.x0), iy = Math.round(Y - mos.y0); return ix >= 0 && iy >= 0 && ix < mos.w && iy < mos.h && mos.n[iy * mos.w + ix] > 0 ? 1 : 0 };
    const pas = Math.max(1, Math.floor(Ms.length / 24)); let nb = 0;
    for (let s = 0; s < Ms.length; s += pas) { nb++; let a = 0, b = 0, n = 0;
      for (let i = 0; i < 6; i++) for (let k = 0; k < 10; k++) { const t = (k + .5) / 10, e = (i + .5) / 6 * prof; n++;
        if (large) { a += vu(Ms[s], -e, t * (ah - 1)); b += vu(Ms[s], aw - 1 + e, t * (ah - 1)) } else { a += vu(Ms[s], t * (aw - 1), -e); b += vu(Ms[s], t * (aw - 1), ah - 1 + e) } }
      if (large) { out.g += a / n; out.d += b / n } else { out.h += a / n; out.b += b / n } }
    for (const k in out) out[k] /= nb; return out;
  }

  /* ================= 2. plaque (décor de la scène à la définition voulue) =================
     Ms : matrices source (image j → référence) des images de la scène ; plan : décision du Directeur ; sortie W×H.
     La plaque est exprimée dans le repère de l'image de référence, à l'échelle k de la sortie. */
  function plaqueCreer(Ms, plan, sw, sh, W, H, maxPx) {
    const n = Ms.length, pas = Math.max(1, Math.floor(n / 40)); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, k = 0;
    const coins = j => { const c = cadre(plan, j, sw, sh, W, H); k = c.k; return [[0, 0], [W, 0], [0, H], [W, H]].map(([ox, oy]) => { const [X, Y] = app(Ms[j], (ox - c.ox) / c.k, (oy - c.oy) / c.k); return [X * c.k, Y * c.k] }) };
    const idx = []; for (let j = 0; j < n; j += pas) idx.push(j); if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
    for (const j of idx) for (const [X, Y] of coins(j)) { x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y) }
    /* plafond de taille (mémoire) : on rogne autour de l'image de référence */
    const ref = coins(n >> 1), rx0 = Math.min(...ref.map(p => p[0])), ry0 = Math.min(...ref.map(p => p[1])), rx1 = Math.max(...ref.map(p => p[0])), ry1 = Math.max(...ref.map(p => p[1]));
    maxPx = maxPx || 2.6 * W * H; let w = x1 - x0, h = y1 - y0;
    if (w * h > maxPx) { const f = Math.sqrt(maxPx / (w * h)), cw = Math.max(rx1 - rx0, w * f), chh = Math.max(ry1 - ry0, h * f), cx = borne((rx0 + rx1) / 2, x0 + cw / 2, x1 - cw / 2), cy = borne((ry0 + ry1) / 2, y0 + chh / 2, y1 - chh / 2);
      x0 = cx - cw / 2; x1 = cx + cw / 2; y0 = cy - chh / 2; y1 = cy + chh / 2 }
    x0 = Math.floor(x0); y0 = Math.floor(y0); w = Math.max(2, Math.ceil(x1) - x0); h = Math.max(2, Math.ceil(y1) - y0);
    return { k, x0, y0, w, h, somme: new Float32Array(w * h * 3), poids: new Float32Array(w * h), ref: null, vues: 0 };
  }
  /* image j (pixels source) → plaque */
  function versPlaque(P, Msrc) { return mul(ech(P.k, P.k, -P.x0, -P.y0), Msrc) }
  /* plaque → sortie pour l'image j */
  function versSortie(P, Msrc, c) { return mul(ech(c.k, c.k, c.ox, c.oy), mul(inv(Msrc), ech(1 / P.k, 1 / P.k, P.x0 / P.k, P.y0 / P.k))) }
  /* référence robuste : la mosaïque basse définition agrandie à la taille de la plaque (une fois par plaque) */
  function plaqueReference(P, mos, aw, ah, sw, sh) {
    const w = P.w, h = P.h, R = new Uint8Array(w * h * 3), V = new Uint8Array(w * h), sx = aw / sw / P.k, sy = ah / sh / P.k;
    for (let y = 0; y < h; y++) { const fy = (y + .5 + P.y0) * sy - .5 - mos.y0, iy = Math.floor(fy), ay = fy - iy; if (iy < 0 || iy >= mos.h - 1) continue;
      for (let x = 0; x < w; x++) { const fx = (x + .5 + P.x0) * sx - .5 - mos.x0, ix = Math.floor(fx); if (ix < 0 || ix >= mos.w - 1) continue; const ax = fx - ix, j = iy * mos.w + ix;
        if (!mos.n[j] || !mos.n[j + 1] || !mos.n[j + mos.w] || !mos.n[j + mos.w + 1]) continue; const o = (y * w + x) * 3; V[y * w + x] = 1;
        for (let c = 0; c < 3; c++) R[o + c] = (mos.rgb[j * 3 + c] * (1 - ax) + mos.rgb[j * 3 + 3 + c] * ax) * (1 - ay) + (mos.rgb[(j + mos.w) * 3 + c] * (1 - ax) + mos.rgb[(j + mos.w) * 3 + 3 + c] * ax) * ay } }
    P.ref = R; P.refV = V; return P;
  }
  /* ajoute une image déjà posée dans le repère de la plaque (rgba w×h, alpha = 255 là où l'image existe ; B = versPlaque de cette image).
     Poids : faible au bord de l'image (vignettage, raccords), très faible si le pixel s'écarte du décor médian (quelque chose passait devant). */
  function plaqueAccumuler(P, rgba, B, sw, sh) {
    const w = P.w, h = P.h, Bi = inv(B), S = P.somme, Wt = P.poids, R = P.ref, RV = P.refV, K = 1 / (2 * 22 * 22);
    for (let y = 0; y < h; y++) { let u = (Bi[0] * .5 + Bi[1] * (y + .5) + Bi[2]) / sw, v = (Bi[3] * .5 + Bi[4] * (y + .5) + Bi[5]) / sh; const du = Bi[0] / sw, dv = Bi[3] / sh;
      for (let x = 0; x < w; x++, u += du, v += dv) { const p = y * w + x, i = p * 4; if (rgba[i + 3] < 250) continue;
        const t = Math.min(u, 1 - u, v, 1 - v); let wt = t <= 0 ? .02 : t < .05 ? .1 + 18 * t : 1;
        if (R && RV[p]) { const o = p * 3, d = Math.max(Math.abs(rgba[i] - R[o]), Math.abs(rgba[i + 1] - R[o + 1]), Math.abs(rgba[i + 2] - R[o + 2])); wt *= Math.exp(-d * d * K) + 1e-4 }
        S[p * 3] += wt * rgba[i]; S[p * 3 + 1] += wt * rgba[i + 1]; S[p * 3 + 2] += wt * rgba[i + 2]; Wt[p] += wt } }
    P.vues++; return P;
  }
  /* fin : image RGBA (alpha 255 = pixel réellement filmé) */
  function plaqueFinir(P) {
    const n = P.w * P.h, o = new Uint8ClampedArray(n * 4), V = new Uint8Array(n);
    for (let p = 0; p < n; p++) { const wt = P.poids[p]; if (wt < 1e-6) continue; o[p * 4] = P.somme[p * 3] / wt; o[p * 4 + 1] = P.somme[p * 3 + 1] / wt; o[p * 4 + 2] = P.somme[p * 3 + 2] / wt; o[p * 4 + 3] = 255; V[p] = 1 }
    P.somme = P.poids = P.ref = P.refV = null; return { rgba: o, valide: V, w: P.w, h: P.h };
  }

  /* ================= 3. ce qu'il reste à inventer =================
     carte réduite (pas d'échantillonnage q) des points de la plaque qu'au moins une image de la scène montre HORS de l'image d'origine */
  function besoin(P, Ms, plan, sw, sh, W, H, q) {
    const w = Math.ceil(P.w / q), h = Math.ceil(P.h / q), B = new Uint8Array(w * h), n = Ms.length, pas = Math.max(1, Math.floor(n / 32));
    for (let j = 0; j < n; j += pas) { const c = cadre(plan, j, sw, sh, W, H), A = versSortie(P, Ms[j], c), x0 = c.ox + .5, y0 = c.oy + .5, x1 = c.ox + c.lw - .5, y1 = c.oy + c.lh - .5;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const X = (x + .5) * q, Y = (y + .5) * q, ox = A[0] * X + A[1] * Y + A[2], oy = A[3] * X + A[4] * Y + A[5];
        if (ox < 0 || oy < 0 || ox >= W || oy >= H || (ox > x0 && ox < x1 && oy > y0 && oy < y1)) continue; B[y * w + x] = 1 } }
    return { w, h, q, carte: B };
  }
  /* distance (en pixels de la carte) au plus proche pixel où masque = 1 ; balayage aller-retour (3-4) */
  function distance(masque, w, h) {
    const D = new Float32Array(w * h), G = 1e6; for (let i = 0; i < w * h; i++) D[i] = masque[i] ? 0 : G;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; let d = D[i]; if (!d) continue;
      if (x) d = Math.min(d, D[i - 1] + 1); if (y) { d = Math.min(d, D[i - w] + 1); if (x) d = Math.min(d, D[i - w - 1] + 1.414); if (x < w - 1) d = Math.min(d, D[i - w + 1] + 1.414) } D[i] = d }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; let d = D[i]; if (!d) continue;
      if (x < w - 1) d = Math.min(d, D[i + 1] + 1); if (y < h - 1) { d = Math.min(d, D[i + w] + 1); if (x < w - 1) d = Math.min(d, D[i + w + 1] + 1.414); if (x) d = Math.min(d, D[i + w - 1] + 1.414) } D[i] = d }
    return D;
  }
  /* réduction d'une image RGBA par moyenne de blocs (facteur réel f ≥ 1) ; les pixels d'alpha nul ne comptent pas */
  function reduire(rgba, w, h, W2, H2) {
    const o = new Uint8ClampedArray(W2 * H2 * 4), fx = w / W2, fy = h / H2;
    for (let Y = 0; Y < H2; Y++) { const ya = Math.floor(Y * fy), yb = Math.max(ya + 1, Math.floor((Y + 1) * fy));
      for (let X = 0; X < W2; X++) { const xa = Math.floor(X * fx), xb = Math.max(xa + 1, Math.floor((X + 1) * fx)); let r = 0, g = 0, b = 0, n = 0, t = 0;
        for (let y = ya; y < yb && y < h; y++) for (let x = xa; x < xb && x < w; x++) { const i = (y * w + x) * 4; t++; if (rgba[i + 3] > 250) { r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++ } }
        const i = (Y * W2 + X) * 4; if (n && n >= t * .75) { o[i] = r / n; o[i + 1] = g / n; o[i + 2] = b / n; o[i + 3] = 255 } } }
    return o;
  }

  /* prépare la reconstruction : plaque réduite (le côté perpendiculaire à l'extension de la SORTIE fait « cote » pixels, la taille de travail
     du modèle), trous autorisés (à compléter ET à moins de « portee » du réel), fenêtres carrées à soumettre au modèle.
     portee : en part du petit côté de la sortie (FMD.PORTEE × réglages). */
  function genPreparer(fin, bes, P, plan, W, H, portee, cote) {
    cote = cote || 512; const perp = plan.axeExt === "x" ? H : W, e = cote / perp, w = Math.max(8, Math.round(fin.w * e)), h = Math.max(8, Math.round(fin.h * e));
    const rgba = reduire(fin.rgba, fin.w, fin.h, w, h), valide = new Uint8Array(w * h), aFaire = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) valide[i] = rgba[i * 4 + 3] ? 1 : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const bx = Math.min(bes.w - 1, Math.floor((x + .5) / e / bes.q)), by = Math.min(bes.h - 1, Math.floor((y + .5) / e / bes.q)); if (bes.carte[by * bes.w + bx] && !valide[y * w + x]) aFaire[y * w + x] = 1 }
    const D = distance(valide, w, h), lim = portee * cote, trou = new Uint8Array(w * h); let nb = 0, tot = 0;
    for (let i = 0; i < w * h; i++) if (aFaire[i]) { tot++; if (D[i] <= lim) { trou[i] = 1; nb++ } }
    /* fenêtres : boîte des trous de chaque côté du réel, pavée de carrés « cote » collés au trou (le reste du carré = contexte réel) */
    let cx = 0, cy = 0, nv = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (valide[y * w + x]) { cx += x; cy += y; nv++ } cx = nv ? cx / nv : w / 2; cy = nv ? cy / nv : h / 2;
    const fen = [], ax = plan.axeExt === "x", L = ax ? w : h, T = ax ? h : w, cw = Math.min(cote, w), chh = Math.min(cote, h);
    for (const cote2 of [0, 1]) { let a0 = 1e9, a1 = -1, t0 = 1e9, t1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (trou[y * w + x]) { const a = ax ? x : y, t = ax ? y : x, c = ax ? cx : cy; if ((a < c) !== (cote2 === 0)) continue; a0 = Math.min(a0, a); a1 = Math.max(a1, a); t0 = Math.min(t0, t); t1 = Math.max(t1, t) }
      if (a1 < 0) continue; const la = ax ? cw : chh, lt = ax ? chh : cw, da = borne(cote2 === 0 ? a0 : a1 + 1 - la, 0, Math.max(0, L - la));
      for (let t = t0; ; t += lt - Math.min(96, lt >> 2)) { const dt = borne(t, 0, Math.max(0, T - lt)); fen.push(ax ? { x: da, y: dt, w: cw, h: chh } : { x: dt, y: da, w: cw, h: chh }); if (dt + lt > t1 || dt >= T - lt) break } }
    return { w, h, e, rgba, valide, trou, D, lim, fenetres: fen, aFaire: tot, couverts: nb, invente: new Uint8Array(w * h) };
  }
  /* chaque trou reçoit la couleur (adoucie) du pixel réel le plus proche. Mesuré (banc_generateurs.py) : sans cela, le modèle laisse un
     liseré sombre au raccord (il mélange le noir du trou au bord) — LPIPS 0,32 → 0,25 à profondeur 0,2. Modifie rgba sur place. */
  function preRemplir(rgba, trou, w, h) {
    const n = w * h, D = new Float32Array(n), S = new Int32Array(n), G = 1e6; let vide = true; for (let i = 0; i < n; i++) { if (trou[i]) { D[i] = G; S[i] = -1 } else { S[i] = i; vide = false } } if (vide) return rgba;
    const voir = (i, j, c) => { if (S[j] >= 0 && D[j] + c < D[i]) { D[i] = D[j] + c; S[i] = S[j] } };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!D[i]) continue; if (x) voir(i, i - 1, 1); if (y) { voir(i, i - w, 1); if (x) voir(i, i - w - 1, 1.414); if (x < w - 1) voir(i, i - w + 1, 1.414) } }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!D[i]) continue; if (x < w - 1) voir(i, i + 1, 1); if (y < h - 1) { voir(i, i + w, 1); if (x < w - 1) voir(i, i + w + 1, 1.414); if (x) voir(i, i + w - 1, 1.414) } }
    const P = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], T = new Float32Array(n), r = 6, k = 2 * r + 1;
    for (let i = 0; i < n; i++) { const j = (S[i] < 0 ? i : S[i]) * 4; P[0][i] = rgba[j]; P[1][i] = rgba[j + 1]; P[2][i] = rgba[j + 2] }
    for (const p of P) for (let tour = 0; tour < 2; tour++) {
      for (let y = 0; y < h; y++) { const o = y * w; let a = 0; for (let x = -r; x <= r; x++) a += p[o + borne(x, 0, w - 1)]; for (let x = 0; x < w; x++) { T[o + x] = a / k; a += p[o + Math.min(w - 1, x + r + 1)] - p[o + Math.max(0, x - r)] } }
      for (let x = 0; x < w; x++) { let a = 0; for (let y = -r; y <= r; y++) a += T[borne(y, 0, h - 1) * w + x]; for (let y = 0; y < h; y++) { p[y * w + x] = a / k; a += T[Math.min(h - 1, y + r + 1) * w + x] - T[Math.max(0, y - r) * w + x] } } }
    for (let i = 0; i < n; i++) if (trou[i]) { rgba[i * 4] = P[0][i]; rgba[i * 4 + 1] = P[1][i]; rgba[i * 4 + 2] = P[2][i]; rgba[i * 4 + 3] = 255 }
    return rgba;
  }
  /* entrée du modèle pour une fenêtre : { rgba, trou (1 = à inventer), w, h } — tout pixel sans contenu est un trou pour le modèle */
  function genEntree(G, f) {
    const rgba = new Uint8ClampedArray(f.w * f.h * 4), trou = new Uint8Array(f.w * f.h); let n = 0;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const s = (f.y + y) * G.w + f.x + x, d = y * f.w + x; if (G.valide[s]) { rgba[d * 4] = G.rgba[s * 4]; rgba[d * 4 + 1] = G.rgba[s * 4 + 1]; rgba[d * 4 + 2] = G.rgba[s * 4 + 2]; rgba[d * 4 + 3] = 255 } else { trou[d] = 1; if (G.trou[s]) n++ } }
    preRemplir(rgba, trou, f.w, f.h); return { rgba, trou, w: f.w, h: f.h, utiles: n };
  }
  /* pose la sortie du modèle (CHW uint8, 3×h×w) : seuls les trous autorisés sont remplis ; ils deviennent du contexte pour la fenêtre suivante */
  function genPoser(G, f, chw) {
    const n = f.w * f.h; for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const s = (f.y + y) * G.w + f.x + x, d = y * f.w + x; if (!G.trou[s] || G.valide[s]) continue;
      G.rgba[s * 4] = chw[d]; G.rgba[s * 4 + 1] = chw[n + d]; G.rgba[s * 4 + 2] = chw[2 * n + d]; G.rgba[s * 4 + 3] = 255; G.valide[s] = 1; G.invente[s] = 1 }
    return G;
  }
  /* couche inventée finale (RGBA réduit) : opaque près du réel, fondue vers le prolongement flou à l'approche de la limite de portée */
  function genFinir(G) {
    const o = new Uint8ClampedArray(G.w * G.h * 4), f0 = G.lim * .65, f1 = Math.max(G.lim, f0 + 1); let n = 0;
    for (let i = 0; i < G.w * G.h; i++) { if (!G.invente[i]) continue; n++; o[i * 4] = G.rgba[i * 4]; o[i * 4 + 1] = G.rgba[i * 4 + 1]; o[i * 4 + 2] = G.rgba[i * 4 + 2]; const t = borne((f1 - G.D[i]) / (f1 - f0), 0, 1); o[i * 4 + 3] = 255 * t * t * (3 - 2 * t) }
    /* sous le réel, la couche inventée est prolongée de quelques pixels (copie du réel) pour un raccord sans liseré quand le réel est fondu par-dessus */
    for (let i = 0; i < G.w * G.h; i++) if (!G.invente[i] && G.valide[i] && G.D0 && G.D0[i] < 6) { o[i * 4] = G.rgba[i * 4]; o[i * 4 + 1] = G.rgba[i * 4 + 1]; o[i * 4 + 2] = G.rgba[i * 4 + 2]; o[i * 4 + 3] = 255 }
    return { rgba: o, w: G.w, h: G.h, pixels: n };
  }
  /* bord fondu du décor réel : alpha réduit (0…255) à multiplier à l'alpha de la plaque — 0 à la frontière du jamais-filmé, 255 à « plume » pixels à l'intérieur.
     À appeler AVANT la reconstruction (G.valide = réel seul). plume en pixels de la carte réduite. */
  function plumeReel(G, plume) {
    const inval = new Uint8Array(G.w * G.h); for (let i = 0; i < inval.length; i++) inval[i] = G.valide[i] ? 0 : 1;
    const D = distance(inval, G.w, G.h), a = new Uint8ClampedArray(G.w * G.h); G.D0 = D;
    for (let i = 0; i < a.length; i++) { const t = borne((D[i] - .5) / plume, 0, 1); a[i] = 255 * t * t * (3 - 2 * t) } return a;
  }

  /* ================= 4. lumière =================
     gain par couleur à appliquer au décor pour suivre l'image en cours (exposition automatique de la caméra) : médiane des rapports
     image / décor sur une vignette commune (rgba de même taille ; pixels sans décor ignorés). Renvoie [r, g, b] bornés, ou null. */
  function gain(image, decor, n) {
    const R = [[], [], []]; for (let i = 0; i < n; i++) { if (decor[i * 4 + 3] < 250 || image[i * 4 + 3] < 250) continue; for (let c = 0; c < 3; c++) R[c].push((image[i * 4 + c] + 6) / (decor[i * 4 + c] + 6)) }
    if (R[0].length < 24) return null; return R.map(v => { v.sort((a, b) => a - b); return borne(v[v.length >> 1], .6, 1.6) });
  }

  const api = { mul, inv, app, ech, versCanvas, matSource, cadre, manque, mosaique, reelDisponible, plaqueCreer, versPlaque, versSortie, plaqueReference, plaqueAccumuler, plaqueFinir, besoin, distance, reduire, genPreparer, preRemplir, genEntree, genPoser, genFinir, plumeReel, gain, borne };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  return api;
})();
