/* RetoucheProAI v7.6 — RECALAGE : recalage fin d'une image sur une autre (similitude à 4 paramètres, Gauss-Newton, 3 échelles).
   Sert au retrait de filtre en vidéo (filtre-video.js, repère de la tête 384×384) et aux visages en vidéo (visages-video.js,
   visage aligné 512×512). Référence Python identique : tests/labo_filtres/recalage.py.
   Pourquoi : les 5 repères YuNet, même lissés, se trompent de plusieurs degrés et de quelques % d'échelle d'une image à l'autre
   (mesuré) ; recaler chaque image sur la première supprime l'essentiel du scintillement des reconstructions reportées.
   RECALAGE.creer(taille, poids) → { pyramide(gris), recaler(pyrRef, pyrImage) } ; images carrées taille×taille en niveaux de gris
   (Float32Array) ; poids : zone prise en compte (Float32Array, 0..1). recaler renvoie D = [m00, m01, m02, m10, m11, m12] tel que
   image(D(x)) ≈ référence(x), ou null si le résultat sort des bornes (±12 %, ±0,15 rad, 8 % du côté). */
var RECALAGE = (() => {
  const PYR = [8, 4, 2];
  function creer(HS, poids) {
    function reduire(g, ech, w) {   /* moyenne par blocs puis flou 1-4-6-4-1 ; w : poids réduits de la même façon (sans flou) */
      const n = HS / ech, a = new Float32Array(n * n), b = new Float32Array(n * n), k = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let s = 0; for (let v = 0; v < ech; v++) for (let u = 0; u < ech; u++) s += g[(y * ech + v) * HS + x * ech + u]; a[y * n + x] = s / (ech * ech) }
      if (w) return a;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let s = 0; for (let u = -2; u <= 2; u++) s += k[u + 2] * a[y * n + Math.min(n - 1, Math.max(0, x + u))]; b[y * n + x] = s }
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let s = 0; for (let u = -2; u <= 2; u++) s += k[u + 2] * b[Math.min(n - 1, Math.max(0, y + u)) * n + x]; a[y * n + x] = s }
      return a;
    }
    const POIDS = PYR.map(e => reduire(poids, e, true));
    const pyramide = g => PYR.map(e => reduire(g, e));
    function resoudre4(H, g) {   /* H·d = g, élimination de Gauss avec pivot */
      const A = H.map((r, i) => [...r, g[i]]);
      for (let i = 0; i < 4; i++) { let p = i; for (let r = i + 1; r < 4; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; if (Math.abs(A[p][i]) < 1e-12) return null; [A[i], A[p]] = [A[p], A[i]];
        for (let r = i + 1; r < 4; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < 5; c++) A[r][c] -= f * A[i][c] } }
      const d = [0, 0, 0, 0]; for (let i = 3; i >= 0; i--) { let s = A[i][4]; for (let c = i + 1; c < 4; c++) s -= A[i][c] * d[c]; d[i] = s / A[i][i] } return d;
    }
    function recaler(Rp, Ip) {
      let a00 = 1, a01 = 0, a10 = 0, a11 = 1, tx = 0, ty = 0;
      for (let l = 0; l < PYR.length; l++) {
        const ech = PYR[l], n = HS / ech, R = Rp[l], I = Ip[l], w = POIDS[l], h = (n - 1) / 2, Iw = new Float32Array(n * n);
        for (let it = 0; it < 12; it++) {
          for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
            const xc = x - h, yc = y - h; let mx = a00 * xc + a01 * yc + tx / ech + h, my = a10 * xc + a11 * yc + ty / ech + h;
            mx = Math.min(n - 1, Math.max(0, mx)); my = Math.min(n - 1, Math.max(0, my)); const x0 = Math.floor(mx), y0 = Math.floor(my), x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1), fx = mx - x0, fy = my - y0;
            Iw[y * n + x] = (I[y0 * n + x0] * (1 - fx) + I[y0 * n + x1] * fx) * (1 - fy) + (I[y1 * n + x0] * (1 - fx) + I[y1 * n + x1] * fx) * fy;
          }
          const H = [[1e-3, 0, 0, 0], [0, 1e-3, 0, 0], [0, 0, 1e-3, 0], [0, 0, 0, 1e-3]], g = [0, 0, 0, 0], J = [0, 0, 0, 0];
          for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
            const j = y * n + x, ww = w[j]; if (ww <= 0) continue;
            const gx = ((Iw[j - n + 1] - Iw[j - n - 1]) + 2 * (Iw[j + 1] - Iw[j - 1]) + (Iw[j + n + 1] - Iw[j + n - 1])) / 8, gy = ((Iw[j + n - 1] - Iw[j - n - 1]) + 2 * (Iw[j + n] - Iw[j - n]) + (Iw[j + n + 1] - Iw[j - n + 1])) / 8;
            const xc = x - h, yc = y - h, e = (Iw[j] - R[j]) * ww; J[0] = (gx * xc + gy * yc) * ww; J[1] = (-gx * yc + gy * xc) * ww; J[2] = gx * ww; J[3] = gy * ww;
            for (let p = 0; p < 4; p++) { g[p] -= J[p] * e; for (let q = p; q < 4; q++) H[p][q] += J[p] * J[q] }
          }
          for (let p = 0; p < 4; p++) for (let q = 0; q < p; q++) H[p][q] = H[q][p];
          const d = resoudre4(H, g); if (!d) break;
          tx += (a00 * d[2] + a01 * d[3]) * ech; ty += (a10 * d[2] + a11 * d[3]) * ech;
          const n00 = a00 * (1 + d[0]) + a01 * d[1], n01 = -a00 * d[1] + a01 * (1 + d[0]), n10 = a10 * (1 + d[0]) + a11 * d[1], n11 = -a10 * d[1] + a11 * (1 + d[0]); a00 = n00; a01 = n01; a10 = n10; a11 = n11;
          if (Math.max(Math.abs(d[2]), Math.abs(d[3])) < .01 && Math.max(Math.abs(d[0]), Math.abs(d[1])) < 1e-4) break;
        }
      }
      /* YuNet seul se trompe de plusieurs degrés et de quelques % d'échelle (mesuré) : le recalage corrige largement.
         Hors bornes (la tête a trop tourné ou changé) : null → une nouvelle section commence */
      if (Math.abs(Math.hypot(a00, a10) - 1) > .12 || Math.abs(Math.atan2(a10, a00)) > .15 || Math.max(Math.abs(tx), Math.abs(ty)) > .08 * HS) return null;
      const c = HS / 2; return [a00, a01, tx + c - (a00 * c + a01 * c), a10, a11, ty + c - (a10 * c + a11 * c)];
    }
    return { pyramide, recaler };
  }
  return { creer, PYR };
})();
