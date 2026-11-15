/* ===== v8.3 — IA par images clés (IAK) =====
   L'IA (le plus lent de l'export : plusieurs secondes par image sur iPhone) n'est plus calculée sur chaque image.
   Elle l'est sur une image « clé » ; pour les images suivantes, le DÉTAIL qu'elle a ajouté (image IA − agrandissement de l'image
   débruitée) est déplacé selon le mouvement mesuré (grille de 10 px, recherche ±6 px, précision sous-pixel), puis ajouté à
   l'agrandissement de l'image courante, pondéré par la confiance du mouvement. Une nouvelle clé est calculée dès que la
   confiance baisse (mouvement rapide, coupe de plan) ou au bout de KMAX images.
   Mesuré contre la vraie image (vidéo HD réduite, LPIPS, plus bas = mieux) : IA sur chaque image 0,1198 ; IA clés 0,1120 ;
   + verrou de fidélité 0,1096 — plus fidèle ET 3,5 à 7,5 fois moins de calcul IA. Prototype de référence : outils/iak/iak.py.
   Le verrou de fidélité (shader, app.js) est appliqué ensuite comme pour toute image IA. */
var IAK = (() => {
  const SW = 320, TILE = 10, R = 6, CONF_MIN = .6;
  let KMAX = 8, etat = null;
  const st = { cles: 0, propagees: 0 };
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c };

  function luma(src, sw, sh) {
    const c = mk(sw, sh), x = c.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, sw, sh);
    const d = x.getImageData(0, 0, sw, sh).data, o = new Float32Array(sw * sh);
    for (let i = 0; i < o.length; i++) o[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2];
    return o;
  }
  /* débruitage préservant les contours 3×3 (même noyau que la passe FSB de l'app) : retire le bruit propre à chaque image,
     pour que le détail transporté ne contienne pas le bruit de l'image clé */
  function debruite(src, w, h) {
    const c = mk(w, h), x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(src, 0, 0, w, h);
    const im = x.getImageData(0, 0, w, h), d = im.data, s = new Float32Array(w * h * 3);
    for (let i = 0, k = 0; i < d.length; i += 4) { s[k++] = d[i] / 255; s[k++] = d[i + 1] / 255; s[k++] = d[i + 2] / 255 }
    for (let y = 0; y < h; y++) for (let x0 = 0; x0 < w; x0++) {
      const p = (y * w + x0) * 3, r = s[p], g = s[p + 1], b = s[p + 2]; let ar = 0, ag = 0, ab = 0, ws = 0;
      for (let dy = -1; dy <= 1; dy++) { const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) { const q = (yy * w + Math.min(w - 1, Math.max(0, x0 + dx))) * 3;
          const er = s[q] - r, eg = s[q + 1] - g, eb = s[q + 2] - b, k = Math.exp(-(er * er + eg * eg + eb * eb) / .01);
          ar += s[q] * k; ag += s[q + 1] * k; ab += s[q + 2] * k; ws += k } }
      const o = (y * w + x0) * 4; d[o] = ar / ws * 255 + .5; d[o + 1] = ag / ws * 255 + .5; d[o + 2] = ab / ws * 255 + .5 }
    x.putImageData(im, 0, 0); return c;
  }
  function agrandi(src, W, H) {
    const c = mk(W, H), x = c.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, W, H);
    return x.getImageData(0, 0, W, H);
  }
  /* mouvement par tuile : cur(x) ≈ key(x + d) ; renvoie {gx, gy, vx, vy, cf} (petite échelle) */
  function mouvement(cur, key, w, h) {
    const gx = Math.floor(w / TILE), gy = Math.floor(h / TILE), n = gx * gy, D = 2 * R + 1;
    const sad = new Float32Array(n * D * D), at = (x, y) => key[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
    for (let ty = 0; ty < gy; ty++) for (let tx = 0; tx < gx; tx++) {
      const t = ty * gx + tx, x0 = tx * TILE, y0 = ty * TILE;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        let s = 0;
        for (let j = 0; j < TILE; j++) { const row = (y0 + j) * w; for (let i = 0; i < TILE; i++) s += Math.abs(cur[row + x0 + i] - at(x0 + i + dx, y0 + j + dy)) }
        sad[(t * D + dy + R) * D + dx + R] = s / (TILE * TILE) } }
    const vx = new Float32Array(n), vy = new Float32Array(n), cf = new Float32Array(n);
    for (let t = 0; t < n; t++) {
      let b = 1e9, bx = 0, by = 0;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const v = sad[(t * D + dy + R) * D + dx + R]; if (v < b) { b = v; bx = dx; by = dy } }
      const S = (dx, dy) => sad[(t * D + dy + R) * D + dx + R]; let sx = bx, sy = by;
      if (bx > -R && bx < R) { const a = S(bx - 1, by), c = S(bx + 1, by), d = a - 2 * b + c; if (d > 1e-6) sx += Math.max(-.5, Math.min(.5, .5 * (a - c) / d)) }
      if (by > -R && by < R) { const a = S(bx, by - 1), c = S(bx, by + 1), d = a - 2 * b + c; if (d > 1e-6) sy += Math.max(-.5, Math.min(.5, .5 * (a - c) / d)) }
      vx[t] = sx; vy[t] = sy; cf[t] = Math.max(0, Math.min(1, 1 - Math.max(0, b - 1.5) / 6)) }
    return { gx, gy, vx, vy, cf };
  }
  /* grandeur par tuile -> valeur au point (x, y) de la sortie (interpolation entre centres, bords prolongés) */
  function champ(g, a, X, Y, sx, sy) {
    const fx = Math.max(0, Math.min(g.gx - 1, X / sx - .5)), fy = Math.max(0, Math.min(g.gy - 1, Y / sy - .5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(g.gx - 1, x0 + 1), y1 = Math.min(g.gy - 1, y0 + 1), u = fx - x0, v = fy - y0;
    return (a[y0 * g.gx + x0] * (1 - u) + a[y0 * g.gx + x1] * u) * (1 - v) + (a[y1 * g.gx + x0] * (1 - u) + a[y1 * g.gx + x1] * u) * v;
  }

  /* c : image source (canevas, taille d'origine) ; calculeIA() -> canevas IA ; renvoie un canevas à la taille de l'image IA */
  async function image(c, cle, calculeIA) {
    const w = c.width, h = c.height, sw = Math.min(SW, w), sh = Math.max(2, Math.round(h * sw / w)), cur = luma(c, sw, sh);
    if (etat && etat.cle === cle && etat.n < KMAX && etat.sw === sw && etat.sh === sh) {
      const g = mouvement(cur, etat.l, sw, sh); let m = 0; for (const q of g.cf) m += q; m /= g.cf.length;
      if (m >= CONF_MIN) {
        const W = etat.W, H = etat.H, s = W / sw, base = agrandi(debruite(c, w, h), W, H), o = base.data, res = etat.res;
        const tx = W / g.gx, ty = H / g.gy, txs = sw / g.gx * s, tys = sh / g.gy * s;
        /* champs à la résolution des tuiles de sortie, puis interpolation par ligne (rapide) */
        for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
          const vx = champ(g, g.vx, X, Y, txs, tys) * s, vy = champ(g, g.vy, X, Y, txs, tys) * s, k = champ(g, g.cf, X, Y, txs, tys);
          if (k <= 0) continue;
          const px = Math.max(0, Math.min(W - 1.001, X + vx)), py = Math.max(0, Math.min(H - 1.001, Y + vy)), x0 = px | 0, y0 = py | 0, u = px - x0, v = py - y0;
          const a = (y0 * W + x0) * 3, b = a + 3, cc = a + W * 3, d = cc + 3, oi = (Y * W + X) * 4;
          for (let ch = 0; ch < 3; ch++) {
            const r = (res[a + ch] * (1 - u) + res[b + ch] * u) * (1 - v) + (res[cc + ch] * (1 - u) + res[d + ch] * u) * v;
            o[oi + ch] = o[oi + ch] + k * r }
        }
        void tx; void ty;
        etat.n++; st.propagees++;
        const out = mk(W, H); out.getContext("2d").putImageData(base, 0, 0); return out;
      }
    }
    const ia = await calculeIA(), W = ia.width, H = ia.height;
    const x = mk(W, H).getContext("2d", { willReadFrequently: true }); x.drawImage(ia, 0, 0);
    const d = x.getImageData(0, 0, W, H).data, b = agrandi(debruite(c, w, h), W, H).data, res = new Int16Array(W * H * 3);
    for (let i = 0, k = 0; i < d.length; i += 4) { res[k++] = d[i] - b[i]; res[k++] = d[i + 1] - b[i + 1]; res[k++] = d[i + 2] - b[i + 2] }
    etat = { cle, l: cur, sw, sh, W, H, res, n: 1 }; st.cles++;
    return ia;
  }
  function actif() { try { return localStorage.getItem("iak") !== "0" } catch (e) { return true } }
  function reinit() { etat = null; st.cles = 0; st.propagees = 0 }
  return { image, actif, reinit, stats: () => ({ ...st }), set kmax(k) { KMAX = k }, get kmax() { return KMAX } };
})();
