/* RetoucheProAI v8.0 — FMA : ANALYSE pour « Changer de format » (calcul pur, sans écran : tourne aussi dans Node pour les tests).
   Ce module MESURE, il ne décide rien (le Directeur, format-directeur.js, décide) :
     • bandes noires incrustées dans la vidéo (vieux fichiers 4:3 dans un cadre 16:9) ;
     • changements de plan (signature de couleur par zones, seuil relatif au voisinage) ;
     • mouvement de la caméra d'une image à la suivante (similitude à 4 paramètres, Gauss-Newton robuste, 3 échelles) ;
     • suivi des sujets repérés par les détecteurs (visages YuNet, personnes / animaux / objets EfficientDet) ;
     • zone d'intérêt quand rien n'est repéré (contraste local + ce qui bouge autrement que la caméra) ;
     • ce qui se passe au bord de l'image (détails, mouvement, sujets coupés) : c'est là qu'une extension se raccorde.
   Unités : les images d'analyse font AW×AH pixels (gris 0…255) ; les boîtes des sujets sont en fractions de l'image (0…1). */
var FMA = (() => {
  const borne = (x, a, b) => x < a ? a : x > b ? b : x;

  /* ---------- images réduites ---------- */
  function gris(rgba, n) { const g = new Float32Array(n); for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = .299 * rgba[j] + .587 * rgba[j + 1] + .114 * rgba[j + 2]; return g }
  function moitie(g, w, h) { const W = w >> 1, H = h >> 1, o = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const j = 2 * y * w + 2 * x; o[y * W + x] = (g[j] + g[j + 1] + g[j + w] + g[j + w + 1]) / 4 } return o }
  function pyramide(g, w, h) { const p = [{ g, w, h }]; while (p.length < 3 && p[p.length - 1].w >= 64) { const l = p[p.length - 1]; p.push({ g: moitie(l.g, l.w, l.h), w: l.w >> 1, h: l.h >> 1 }) } return p.reverse() }

  /* ---------- signature d'une image (changements de plan) : 4×4 zones × (8 niveaux de gris + 2 moyennes de couleur) ---------- */
  function signature(rgba, w, h) {
    const s = new Float32Array(16 * 10), cnt = new Float32Array(16);
    for (let y = 0; y < h; y++) { const zy = Math.min(3, (y * 4 / h) | 0); for (let x = 0; x < w; x++) { const z = zy * 4 + Math.min(3, (x * 4 / w) | 0), j = (y * w + x) * 4, r = rgba[j], g = rgba[j + 1], b = rgba[j + 2], l = .299 * r + .587 * g + .114 * b;
      s[z * 10 + Math.min(7, l >> 5)]++; s[z * 10 + 8] += r - l; s[z * 10 + 9] += b - l; cnt[z]++ } }
    for (let z = 0; z < 16; z++) { const c = cnt[z] || 1; for (let k = 0; k < 8; k++) s[z * 10 + k] /= c; s[z * 10 + 8] /= c * 64; s[z * 10 + 9] /= c * 64 }
    return s;
  }
  function ecartSignature(a, b) { let d = 0; for (let z = 0; z < 16; z++) { let h = 0; for (let k = 0; k < 8; k++) h += Math.abs(a[z * 10 + k] - b[z * 10 + k]); d += h / 2 + .5 * (Math.abs(a[z * 10 + 8] - b[z * 10 + 8]) + Math.abs(a[z * 10 + 9] - b[z * 10 + 9])) } return d / 16 }
  /* coupures : écart fort ET nettement au-dessus du voisinage (un mouvement rapide donne des écarts élevés partout, une coupure un pic isolé).
     ecarts[i] = écart entre l'image i-1 et l'image i ; residus[i] (facultatif) = part de l'image que le mouvement de caméra n'explique pas */
  function coupures(ecarts, cadence, residus) {
    const n = ecarts.length, out = [0], mini = Math.max(3, Math.round(cadence * .4));
    for (let i = 1; i < n; i++) {
      const e = ecarts[i]; if (e < .16) continue;
      const v = []; for (let k = Math.max(1, i - 8); k <= Math.min(n - 1, i + 8); k++) if (k !== i) v.push(ecarts[k]); v.sort((a, b) => a - b);
      const med = v.length ? v[v.length >> 1] : 0, haut = v.length ? v[Math.min(v.length - 1, (v.length * .85) | 0)] : 0;
      const pic = e > .42 || (e > Math.max(.16, 3.2 * med, 1.8 * haut) && (!residus || residus[i] > .45));
      if (pic && i - out[out.length - 1] >= mini) out.push(i);
    }
    return out;
  }

  /* ---------- bandes noires incrustées : lignes / colonnes sombres et uniformes sur toutes les images échantillonnées ---------- */
  function bandesNoires(images, w, h) {   /* images : gris w×h ; renvoie le rectangle utile en fractions {x, y, w, h} */
    const lig = new Float32Array(h), col = new Float32Array(w);
    for (const g of images) { for (let y = 0; y < h; y++) { let m = 0; for (let x = 0; x < w; x++) m = Math.max(m, g[y * w + x]); lig[y] = Math.max(lig[y], m) }
      for (let x = 0; x < w; x++) { let m = 0; for (let y = 0; y < h; y++) m = Math.max(m, g[y * w + x]); col[x] = Math.max(col[x], m) } }
    const SEUIL = 26; let y0 = 0, y1 = h, x0 = 0, x1 = w;
    while (y0 < h * .3 && lig[y0] < SEUIL) y0++; while (y1 > h * .7 && lig[y1 - 1] < SEUIL) y1--; while (x0 < w * .3 && col[x0] < SEUIL) x0++; while (x1 > w * .7 && col[x1 - 1] < SEUIL) x1--;
    /* une bande doit faire au moins 2,5 % du côté (sinon : simple bord sombre de la scène) ; +1 pixel de marge contre le liseré */
    const fy0 = y0 / h >= .025 ? (y0 + 1) / h : 0, fy1 = (h - y1) / h >= .025 ? (y1 - 1) / h : 1, fx0 = x0 / w >= .025 ? (x0 + 1) / w : 0, fx1 = (w - x1) / w >= .025 ? (x1 - 1) / w : 1;
    return { x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0 };
  }

  /* liseré sombre au bord de l'image (fréquent sur les vieilles vidéos : 1 à 8 colonnes presque noires) : profil = luminance moyenne de chaque
     colonne (ou ligne), de l'extérieur vers l'intérieur, moyennée sur plusieurs images. Renvoie le nombre de lignes à retirer (0 si le bord est normal). */
  function lisere(profil, max) {
    const n = profil.length; if (n < 40) return 0; let ref = 0; for (let k = 12; k < 28; k++) ref += profil[k] / 16; if (ref < 24) return 0;
    let k = 0; while (k < max && profil[k] < .62 * ref) k++; if (!k || k >= max) return 0;   /* aucune ligne sombre, ou zone sombre trop large pour être un liseré */
    return profil[k + 1] > .8 * ref ? k + 1 : 0;   /* le retour à la normale doit être franc ; +1 ligne de marge (pixel mélangé) */
  }

  /* ---------- mouvement de caméra : B(M·x) ≈ A(x), M = [[1+a, −b], [b, 1+a]]·(x − c) + c + t ---------- */
  function echantillon(g, w, h, x, y) { x = borne(x, 0, w - 1.001); y = borne(y, 0, h - 1.001); const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, j = y0 * w + x0; return (g[j] * (1 - fx) + g[j + 1] * fx) * (1 - fy) + (g[j + w] * (1 - fx) + g[j + w + 1] * fx) * fy }
  function mouvement(pa, pb, init) {   /* pa, pb : pyramides (pyramide()) de deux images de même taille ; init (facultatif) : estimation de départ {a, b, tx, ty} */
    let a = 0, b = 0, tx = 0, ty = 0;
    if (init) { a = init.a; b = init.b; tx = init.tx / (1 << (pa.length - 1)); ty = init.ty / (1 << (pa.length - 1)) }
    else { /* départ : meilleur décalage entier à l'échelle la plus grossière (grands panoramiques) */
      const A = pa[0], B = pb[0], w = A.w, h = A.h, R = Math.max(2, Math.round(w * .2)); let best = 1e18;
      for (let dy = -R; dy <= R; dy += 1) for (let dx = -R; dx <= R; dx += 1) { let s = 0, n = 0;
        for (let y = Math.max(0, -dy); y < Math.min(h, h - dy); y += 2) for (let x = Math.max(0, -dx); x < Math.min(w, w - dx); x += 2) { s += Math.abs(A.g[y * w + x] - B.g[(y + dy) * w + x + dx]); n++ }
        if (n < w * h / 16) continue; s = s / n + .02 * (Math.abs(dx) + Math.abs(dy)); if (s < best) { best = s; tx = dx; ty = dy } }
    }
    let res = 0, inl = 0;
    for (let l = 0; l < pa.length; l++) {
      const A = pa[l], B = pb[l], w = A.w, h = A.h, cx = (w - 1) / 2, cy = (h - 1) / 2, fin = l === pa.length - 1, pas = fin && w > 96 ? 2 : 1; if (l) { tx *= 2; ty *= 2 }
      for (let it = 0; it < (fin ? 6 : 10); it++) {
        const H = [[1e-6, 0, 0, 0], [0, 1e-6, 0, 0], [0, 0, 1e-6, 0], [0, 0, 0, 1e-6]], g = [0, 0, 0, 0]; let sr = 0, sn = 0, ni = 0, nt = 0;
        for (let y = 2; y < h - 2; y += pas) for (let x = 2 + ((y >> 1) & (pas - 1)); x < w - 2; x += pas) {
          const xc = x - cx, yc = y - cy, mx = (1 + a) * xc - b * yc + cx + tx, my = b * xc + (1 + a) * yc + cy + ty;
          if (mx < 1 || my < 1 || mx > w - 2.001 || my > h - 2.001) continue;
          /* valeur et pente de B au point (mx, my) : une seule interpolation sur le voisinage 4×4 réduit à sa croix */
          const x0 = mx | 0, y0 = my | 0, fx = mx - x0, fy = my - y0, j = y0 * w + x0, G = B.g, p00 = G[j], p10 = G[j + 1], p01 = G[j + w], p11 = G[j + w + 1];
          const v = (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
          const gx = ((G[j + 1] - G[j - 1]) * (1 - fx) + (G[j + 2] - G[j]) * fx) * (1 - fy) / 2 + ((G[j + w + 1] - G[j + w - 1]) * (1 - fx) + (G[j + w + 2] - G[j + w]) * fx) * fy / 2;
          const gy = ((G[j + w] - G[j - w]) * (1 - fy) + (G[j + 2 * w] - G[j]) * fy) * (1 - fx) / 2 + ((G[j + w + 1] - G[j - w + 1]) * (1 - fy) + (G[j + 2 * w + 1] - G[j + 1]) * fy) * fx / 2;
          const e = v - A.g[y * w + x], ae = Math.abs(e); nt++; if (ae < 14) ni++;
          const k = ae < 10 ? 1 : 10 / ae * (ae > 40 ? .25 : 1);   /* poids robuste : ce qui bouge autrement que la caméra compte peu */
          const J0 = gx * xc + gy * yc, J1 = -gx * yc + gy * xc;
          g[0] -= k * J0 * e; g[1] -= k * J1 * e; g[2] -= k * gx * e; g[3] -= k * gy * e;
          H[0][0] += k * J0 * J0; H[0][1] += k * J0 * J1; H[0][2] += k * J0 * gx; H[0][3] += k * J0 * gy; H[1][1] += k * J1 * J1; H[1][2] += k * J1 * gx; H[1][3] += k * J1 * gy; H[2][2] += k * gx * gx; H[2][3] += k * gx * gy; H[3][3] += k * gy * gy;
          sr += Math.min(ae, 40); sn++;
        }
        if (sn < 50) break; res = sr / sn; inl = ni / nt;
        for (let p = 0; p < 4; p++) for (let q = 0; q < p; q++) H[p][q] = H[q][p];
        /* amortissement (Levenberg) : zoom et rotation ne sont estimés que si l'image a assez de relief */
        const am = 1e-3 * (H[2][2] + H[3][3]) + 1e-3; H[0][0] += am * w * w * .5; H[1][1] += am * w * w * .5; H[2][2] += am; H[3][3] += am;
        const d = resoudre(H, g); if (!d) break;
        a += d[0]; b += d[1]; tx += d[2]; ty += d[3];
        if (Math.abs(d[2]) + Math.abs(d[3]) < .01 && Math.abs(d[0]) + Math.abs(d[1]) < 2e-5) break;
      }
    }
    return { a, b, tx, ty, res, inl };
  }
  function resoudre(H, g) { const n = g.length, A = H.map((r, i) => [...r, g[i]]);
    for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; if (Math.abs(A[p][i]) < 1e-12) return null; [A[i], A[p]] = [A[p], A[i]];
      for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c <= n; c++) A[r][c] -= f * A[i][c] } }
    const d = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = A[i][n]; for (let c = i + 1; c < n; c++) s -= A[i][c] * d[c]; d[i] = s / A[i][i] } return d }

  /* matrices 2×3 [m00, m01, m02, m10, m11, m12] en pixels d'analyse */
  const IDENT = [1, 0, 0, 0, 1, 0];
  function matrice(m, w, h) { const cx = (w - 1) / 2, cy = (h - 1) / 2, s = 1 + m.a; return [s, -m.b, cx + m.tx - (s * cx - m.b * cy), m.b, s, cy + m.ty - (m.b * cx + s * cy)] }
  const mul = (A, B) => [A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2], A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5]];
  const inv = M => { const d = M[0] * M[4] - M[1] * M[3], a = M[4] / d, b = -M[1] / d, c = -M[3] / d, e = M[0] / d; return [a, b, -(a * M[2] + b * M[5]), c, e, -(c * M[2] + e * M[5])] };
  const appliquer = (M, x, y) => [M[0] * x + M[1] * y + M[2], M[3] * x + M[4] * y + M[5]];

  /* part des points de A qui coïncident avec B une fois déplacés par {a, b, tx, ty} (même critère que mouvement()) */
  function accord(pa, pb, m, bord) {   /* bord = true : seulement les points à relief du pourtour de l'image (là où l'on voit le décor, pas le sujet) ; renvoie alors { v, n } */
    const A = pa[pa.length - 1], B = pb[pb.length - 1], w = A.w, h = A.h, cx = (w - 1) / 2, cy = (h - 1) / 2, bx = w * .2, by = h * .2, pas = bord ? 1 : 2; let ni = 0, nt = 0;
    for (let y = 2; y < h - 2; y += pas) for (let x = 2; x < w - 2; x += pas) {
      if (bord) { if (x > bx && x < w - bx && y > by && y < h - by) continue; const j = y * w + x; if (Math.abs(A.g[j + 1] - A.g[j - 1]) + Math.abs(A.g[j + w] - A.g[j - w]) < 16) continue }
      const xc = x - cx, yc = y - cy, mx = (1 + m.a) * xc - m.b * yc + cx + m.tx, my = m.b * xc + (1 + m.a) * yc + cy + m.ty; if (mx < 1 || my < 1 || mx > w - 2.001 || my > h - 2.001) continue;
      nt++; if (Math.abs(echantillon(B.g, w, h, mx, my) - A.g[y * w + x]) < 14) ni++ }
    return bord ? { v: nt ? ni / nt : 0, n: nt } : nt ? ni / nt : 0;
  }
  /* écart moyen (borné) entre A et B déplacé par {a, b, tx, ty} ; bord = true : seulement les points à relief du pourtour (le décor, pas le sujet) */
  function ecartMoyen(pa, pb, m, bord) {
    const A = pa[pa.length - 1], B = pb[pb.length - 1], w = A.w, h = A.h, cx = (w - 1) / 2, cy = (h - 1) / 2, bx = w * .2, by = h * .2, pas = bord ? 1 : 2; let s = 0, nt = 0;
    for (let y = 2; y < h - 2; y += pas) for (let x = 2; x < w - 2; x += pas) {
      if (bord) { if (x > bx && x < w - bx && y > by && y < h - by) continue; const j = y * w + x; if (Math.abs(A.g[j + 1] - A.g[j - 1]) + Math.abs(A.g[j + w] - A.g[j - w]) < 16) continue }
      const xc = x - cx, yc = y - cy, mx = (1 + m.a) * xc - m.b * yc + cx + m.tx, my = m.b * xc + (1 + m.a) * yc + cy + m.ty; if (mx < 1 || my < 1 || mx > w - 2.001 || my > h - 2.001) continue;
      nt++; s += Math.min(40, Math.abs(echantillon(B.g, w, h, mx, my) - A.g[y * w + x])) }
    return { v: nt ? s / nt : 40, n: nt };
  }
  /* la caméra est-elle restée fixe (hypothèse f) plutôt que d'avoir suivi le mouvement estimé m ? Oui si « fixe » explique l'image aussi bien
     (écart moyen, sensible à un glissement d'une fraction de pixel), ou si le pourtour de l'image, lui, n'a pas bougé (grand sujet qui traverse). */
  function plutotFixe(pa, pb, f, m) {
    const e0 = ecartMoyen(pa, pb, f), e1 = ecartMoyen(pa, pb, m); if (e0.v <= e1.v * 1.02 + .03) return true;
    const b0 = ecartMoyen(pa, pb, f, true); if (b0.n < 60) return false; const b1 = ecartMoyen(pa, pb, m, true); return b0.v <= b1.v * 1.02 + .03 && b0.v < 9;
  }
  const NUL = { a: 0, b: 0, tx: 0, ty: 0 };
  /* inverse de matrice() : paramètres {a, b, tx, ty} d'une similitude donnée en matrice */
  function parametres(M, w, h) { const cx = (w - 1) / 2, cy = (h - 1) / 2, s = M[0], b = M[3]; return { a: s - 1, b, tx: M[2] - cx + (s * cx - b * cy), ty: M[5] - cy + (b * cx + s * cy) } }
  /* suiveur de caméra SANS DÉRIVE : chaque image est recalée directement sur une image clé (et non sur la précédente seulement).
     Sur un plan fixe, toutes les images se recalent sur la première : le décor ne « glisse » pas au fil des secondes.
     ajouter(pyramide) → { C : image → première image de la scène, pas : mouvement depuis l'image précédente, cle : nouvelle image clé ? } */
  function suiveur(w, h) {
    let K = null, CK = null, prec = null, Cprec = null;
    return { reinit() { K = prec = null },
      ajouter(p) {
        if (!prec) { K = prec = p; CK = Cprec = IDENT.slice(); return { C: IDENT.slice(), pas: { a: 0, b: 0, tx: 0, ty: 0, res: 0, inl: 1 }, cle: true } }
        /* a priori « caméra sur pied » : si ne pas bouger explique l'image aussi bien que le mouvement estimé, la caméra n'a pas bougé
           (un grand sujet qui traverse le champ entraînerait sinon l'estimation avec lui) */
        let pas = mouvement(prec, p); if (plutotFixe(prec, p, NUL, pas)) pas = { ...NUL, res: pas.res, inl: accord(prec, p, NUL) }
        const Cch = mul(Cprec, inv(matrice(pas, w, h))); let C = Cch, cle = false;
        if (K !== prec) { let d = mouvement(K, p, parametres(mul(inv(Cch), CK), w, h)); { const fixe = parametres(mul(inv(Cprec), CK), w, h); if (plutotFixe(K, p, fixe, d)) d = { ...fixe, res: d.res, inl: accord(K, p, fixe) } }
          const dep = Math.hypot(d.tx / w, d.ty / h);
          if (d.inl >= Math.max(.5, pas.inl - .12) && dep < .3 && Math.abs(d.a) < .2 && Math.abs(d.b) < .15) C = mul(CK, inv(matrice(d, w, h))); else cle = true }
        else { const dep = Math.hypot(pas.tx / w, pas.ty / h); if (dep > .3) cle = true }
        if (cle) { K = p; CK = C }
        prec = p; Cprec = C; return { C, pas, cle };
      } };
  }

  /* ce qui reste après avoir compensé la caméra : carte |A − B(M·x)| réduite à une grille gw×gh (0…1) */
  function residu(A, B, w, h, M, gw, gh) {
    const o = new Float32Array(gw * gh), c = new Float32Array(gw * gh);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const mx = M[0] * x + M[1] * y + M[2], my = M[3] * x + M[4] * y + M[5]; if (mx < 1 || my < 1 || mx > w - 2 || my > h - 2) continue;
      const z = ((y * gh / h) | 0) * gw + ((x * gw / w) | 0); o[z] += Math.min(1, Math.abs(echantillon(B, w, h, mx, my) - A[y * w + x]) / 48); c[z]++ }
    for (let i = 0; i < o.length; i++) o[i] = c[i] ? o[i] / c[i] : 0; return o;
  }
  /* détails (bords) par zone : moyenne de |gradient| sur une grille gw×gh (0…1) */
  function relief(g, w, h, gw, gh) {
    const o = new Float32Array(gw * gh), c = new Float32Array(gw * gh);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const j = y * w + x, z = ((y * gh / h) | 0) * gw + ((x * gw / w) | 0); o[z] += Math.min(1, (Math.abs(g[j + 1] - g[j - 1]) + Math.abs(g[j + w] - g[j - w])) / 64); c[z]++ }
    for (let i = 0; i < o.length; i++) o[i] = c[i] ? o[i] / c[i] : 0; return o;
  }
  /* zone d'intérêt quand aucun sujet n'est repéré : contraste local (centre − alentours) + ce qui bouge ; renvoie une boîte ou null si rien ne ressort */
  function interet(g, w, h, res, gw, gh) {
    const rel = relief(g, w, h, gw, gh), s = new Float32Array(gw * gh); let moy = 0; for (const v of rel) moy += v; moy /= rel.length;
    let tot = 0, sx = 0, sy = 0; for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const i = y * gw + x, v = Math.max(0, rel[i] - moy) + (res ? 2.5 * Math.max(0, res[i] - .06) : 0); s[i] = v; tot += v; sx += v * (x + .5) / gw; sy += v * (y + .5) / gh }
    if (tot < .02 * gw * gh) return null; const cx = sx / tot, cy = sy / tot; let vx = 0, vy = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const v = s[y * gw + x]; vx += v * ((x + .5) / gw - cx) ** 2; vy += v * ((y + .5) / gh - cy) ** 2 }
    const ex = Math.sqrt(vx / tot), ey = Math.sqrt(vy / tot); if (ex > .27 && ey > .27) return null;   /* intérêt étalé partout : pas de sujet */
    const bw = borne(2.4 * ex, .12, 1), bh = borne(2.4 * ey, .12, 1); return { x: borne(cx - bw / 2, 0, 1 - bw), y: borne(cy - bh / 2, 0, 1 - bh), w: bw, h: bh, concentration: 1 - Math.max(ex, ey) / .29 };
  }

  /* ---------- suivi des sujets ---------- */
  const POIDS = { visage: 1.6, personne: 1, animal: 1, vehicule: .6, objet: .35, interet: .3 };
  const iou = (p, q) => { const x0 = Math.max(p.x, q.x), y0 = Math.max(p.y, q.y), x1 = Math.min(p.x + p.w, q.x + q.w), y1 = Math.min(p.y + p.h, q.y + q.h), i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0); return i / (p.w * p.h + q.w * q.h - i + 1e-9) };
  /* reperes : [{i (n° d'image), boites: [{x, y, w, h, score, classe}]}] dans l'ordre ; n images ; debut/fin de la scène.
     Renvoie des pistes {classe, poids, x, y, w, h : Float32Array(n), present : Uint8Array(n)} interpolées et lissées. */
  function suivre(reperes, i0, i1, cadence) {
    const n = i1 - i0, actives = [], finies = [], trou = Math.max(2, Math.round(cadence * .9));
    for (const r of reperes) { if (r.i < i0 || r.i >= i1) continue;
      const libres = r.boites.map(b => ({ ...b })), paires = [];
      actives.forEach((p, k) => { const d = p.pts[p.pts.length - 1], dt = r.i - d.i, pr = { x: d.x + p.vx * dt, y: d.y + p.vy * dt, w: d.w, h: d.h };
        libres.forEach((b, j) => { if (b.classe !== p.classe) return; const v = Math.max(iou(pr, b), iou(d, b)), dc = Math.hypot(b.x + b.w / 2 - pr.x - pr.w / 2, b.y + b.h / 2 - pr.y - pr.h / 2) / Math.max(.02, Math.hypot(d.w, d.h));
          if (v > .12 || dc < .45) paires.push([v + Math.max(0, .5 - dc), k, j]) }) });
      paires.sort((a, b) => b[0] - a[0]); const pk = new Set(), pj = new Set();
      for (const [, k, j] of paires) { if (pk.has(k) || pj.has(j)) continue; pk.add(k); pj.add(j); const p = actives[k], d = p.pts[p.pts.length - 1], b = libres[j], dt = Math.max(1, r.i - d.i);
        p.vx = .6 * p.vx + .4 * (b.x - d.x) / dt; p.vy = .6 * p.vy + .4 * (b.y - d.y) / dt; p.pts.push({ i: r.i, ...b }) }
      libres.forEach((b, j) => { if (!pj.has(j)) actives.push({ classe: b.classe, vx: 0, vy: 0, pts: [{ i: r.i, ...b }] }) });
      for (let k = actives.length - 1; k >= 0; k--) if (r.i - actives[k].pts[actives[k].pts.length - 1].i > trou) finies.push(actives.splice(k, 1)[0]);
    }
    const pistes = [];
    for (const p of finies.concat(actives)) {
      const pts = p.pts; if (pts.length < 2 && reperes.length > 3) continue;   /* un repérage isolé : faux positif probable */
      const T = { classe: p.classe, x: new Float32Array(n), y: new Float32Array(n), w: new Float32Array(n), h: new Float32Array(n), present: new Uint8Array(n) }; let sc = 0, aire = 0;
      for (const q of pts) { sc += q.score; aire += q.w * q.h }
      const a = Math.max(i0, pts[0].i - trou / 2 | 0), z = Math.min(i1 - 1, pts[pts.length - 1].i + (trou / 2 | 0)); let k = 0;
      for (let i = a; i <= z; i++) { while (k < pts.length - 2 && pts[k + 1].i <= i) k++; const p0 = pts[Math.min(k, pts.length - 1)], p1 = pts[Math.min(k + 1, pts.length - 1)], f = p1.i > p0.i ? borne((i - p0.i) / (p1.i - p0.i), 0, 1) : 0, j = i - i0;
        T.x[j] = p0.x + (p1.x - p0.x) * f; T.y[j] = p0.y + (p1.y - p0.y) * f; T.w[j] = p0.w + (p1.w - p0.w) * f; T.h[j] = p0.h + (p1.h - p0.h) * f; T.present[j] = 1 }
      /* lissage aller-retour (sans retard) du centre et de la taille */
      const al = 1 - Math.exp(-1 / Math.max(1, cadence * .12)); for (const c of ["x", "y", "w", "h"]) { const v = T[c]; for (let j = a - i0 + 1; j <= z - i0; j++) v[j] = v[j - 1] + al * (v[j] - v[j - 1]); for (let j = z - i0 - 1; j >= a - i0; j--) v[j] = v[j + 1] + al * (v[j] - v[j + 1]) }
      T.duree = (z - a + 1) / n; T.aire = aire / pts.length; T.score = sc / pts.length;
      T.poids = (POIDS[p.classe] || .3) * T.score * Math.sqrt(Math.min(1, T.duree * 1.5)) * Math.min(1, .25 + 4 * Math.sqrt(T.aire));
      pistes.push(T);
    }
    pistes.sort((a, b) => b.poids - a.poids); return pistes.slice(0, 12);
  }

  /* ---------- résumé d'une scène pour le Directeur ----------
     S : { i0, i1, cadence, aw, ah, mouv: [{a,b,tx,ty,res,inl}] (image i-1 → i, mouv[0] ignoré), pistes, reliefBord, residuBord }
     reliefBord / residuBord : moyennes par côté {g, d, h, b} mesurées sur les images échantillonnées */
  function resumer(S) {
    const n = S.i1 - S.i0, ref = n >> 1, M = new Array(n); M[ref] = IDENT.slice();
    /* M[j] : image j → image de référence (milieu de scène). mouv[j] donne B=image j, A=image j-1 : j-1(x) ≈ j(Mj·x) ⇒ (j → j-1) = inv(Mj) */
    if (S.C) { const Ri = inv(S.C[ref]); for (let j = 0; j < n; j++) M[j] = mul(Ri, S.C[j]) }   /* C[j] : image j → première image (suiveur sans dérive) */
    else { for (let j = ref + 1; j < n; j++) M[j] = mul(M[j - 1], inv(matrice(S.mouv[j], S.aw, S.ah)));
      for (let j = ref - 1; j >= 0; j--) M[j] = mul(M[j + 1], matrice(S.mouv[j + 1], S.aw, S.ah)) }
    let dxm = 0, dym = 0, zmin = 1, zmax = 1, rot = 0, inl = 0, res = 0, k = 0, x0 = 0, x1 = 0, y0 = 0, y1 = 0;
    for (let j = 0; j < n; j++) { const m = M[j], cx = (S.aw - 1) / 2, cy = (S.ah - 1) / 2, [px, py] = appliquer(m, cx, cy), dx = (px - cx) / S.aw, dy = (py - cy) / S.ah, s = Math.hypot(m[0], m[3]);
      x0 = Math.min(x0, dx); x1 = Math.max(x1, dx); y0 = Math.min(y0, dy); y1 = Math.max(y1, dy); zmin = Math.min(zmin, s); zmax = Math.max(zmax, s); rot = Math.max(rot, Math.abs(Math.atan2(m[3], m[0])));
      if (j) { inl += S.mouv[j].inl; res += S.mouv[j].res; k++; dxm += Math.abs(S.mouv[j].tx) / S.aw; dym += Math.abs(S.mouv[j].ty) / S.ah } }
    inl = k ? inl / k : 1; res = k ? res / k : 0;
    const etendue = { x: x1 - x0, y: y1 - y0, zoom: zmax / zmin, rotation: rot }, vitesse = k ? Math.hypot(dxm, dym) / k * S.cadence : 0;
    /* classe du mouvement : fixe (trépied ou léger tremblement), panoramique (la similitude explique l'image), complexe (parallaxe, marche, zoom fort) */
    /* peu de points d'accord ET un déplacement mesuré : parallaxe (marche, travelling). Peu de points d'accord SANS déplacement : caméra fixe devant une foule */
    const bouge = etendue.x > .03 || etendue.y > .03 || etendue.zoom > 1.04 || rot > .03;
    let classe = "fixe"; if ((inl < .62 && bouge) || etendue.zoom > 1.35 || rot > .12) classe = "complexe"; else if (etendue.x > .04 || etendue.y > .04 || etendue.zoom > 1.04) classe = "panoramique";
    /* sujets coupés par un bord : part des images où une piste importante touche ce bord */
    const touche = { g: 0, d: 0, h: 0, b: 0 }, P = S.pistes || [], pmax = P.length ? P[0].poids : 0;
    for (const p of P) { if (p.poids < .35 * pmax || p.classe === "interet") continue; let g = 0, d = 0, h = 0, b = 0, c = 0;
      for (let j = 0; j < n; j++) if (p.present[j]) { c++; if (p.x[j] < .012) g++; if (p.x[j] + p.w[j] > .988) d++; if (p.y[j] < .012) h++; if (p.y[j] + p.h[j] > .988) b++ }
      const f = p.duree / Math.max(1, c); touche.g = Math.max(touche.g, g * f); touche.d = Math.max(touche.d, d * f); touche.h = Math.max(touche.h, h * f); touche.b = Math.max(touche.b, b * f) }
    /* plan sur pied : les écarts mesurés sont du bruit de mesure → décor verrouillé (aucun glissement possible) */
    const verrou = classe === "fixe" && etendue.x < .008 && etendue.y < .008 && etendue.zoom < 1.012 && rot < .012; if (verrou) for (let j = 0; j < n; j++) M[j] = IDENT.slice();
    return { M, ref, classe, etendue, vitesse, inl, res, touche, verrou };
  }

  const api = { gris, moitie, pyramide, signature, ecartSignature, coupures, bandesNoires, lisere, mouvement, accord, ecartMoyen, matrice, parametres, suiveur, mul, inv, appliquer, IDENT, residu, relief, interet, suivre, resumer, iou, POIDS, echantillon, resoudre, borne };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  return api;
})();
