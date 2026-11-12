/* RetoucheProAI v7.5 — RFV : retirer les éléments d'un filtre AR EN VIDÉO, de façon stable d'une image à l'autre (F10, essai).
   Même spécification que le banc d'essai tests/labo_filtres/banc_video.py (méthode « V ») :
     1. le visage est suivi (YuNet), ses repères lissés dans le temps ; tout le reste se passe dans le « repère de la tête »
        (carré HS×HS, même cadrage que le détecteur de l'outil photo), où un élément de filtre ne bouge presque pas ;
     2. chaque image est recalée finement sur la première image de la section (similitude, Gauss-Newton sur la zone du visage) :
        c'est ce qui supprime le scintillement (mesuré : 7,2 → 3,0, autant qu'avec un suivi parfait) ;
     3. la carte du détecteur (appris au laboratoire) est moyennée sur 5 images → zone à retirer stable ;
     4. UNE reconstruction par section (MI-GAN puis GFPGAN sur l'union des zones), reportée sur chaque image en suivant la tête ;
        la lumière est raccordée à chaque image sur le pourtour de la zone.
   Tout ce qui est reconstruit est INVENTÉ (plausible, pas retrouvé). Ce que le module ne fait pas : déformations, lissage, maquillage ;
   ce qui bouge SOUS le filtre (bouche cachée par un museau) est remplacé par une reconstruction fixe. Mesures et limites : registre, F10. */
var RFV = (() => {
  const HS = 384, Q = HS * HS, IOH = HS / 4.6, CX = HS / 2, CY = HS / 2 - .35 * IOH;
  const toile = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c };
  /* porte (tête et juste autour) et ovale du visage, dans le repère de la tête — mêmes formes que l'outil photo */
  const PORTE = new Uint8Array(Q), OVALE = new Uint8Array(Q), OVF = new Float32Array(Q);
  for (let y = 0; y < HS; y++) for (let x = 0; x < HS; x++) { const u = (x - CX) / IOH, v = (y - CY) / IOH, j = y * HS + x;
    PORTE[j] = (u / 1.7) ** 2 + ((v - .2) / 2.4) ** 2 < 1 ? 1 : 0; OVALE[j] = (u / 1.15) ** 2 + ((v - .55) / 1.45) ** 2 < 1 ? 1 : 0; OVF[j] = OVALE[j] }
  let S = null;

  /* cadrage image → tête : M = [m00, m01, m02, m10, m11, m12] (x' = m00·x + m01·y + m02) à partir des 5 repères YuNet */
  function cadre(p) {
    const io = Math.hypot(p[2] - p[0], p[3] - p[1]), ux = [(p[2] - p[0]) / io, (p[3] - p[1]) / io], uy = [-ux[1], ux[0]];
    const c = [(p[0] + p[2]) / 2 + uy[0] * io * .35, (p[1] + p[3]) / 2 + uy[1] * io * .35], k = HS / (io * 4.6);
    return [k * ux[0], k * ux[1], HS / 2 - k * (c[0] * ux[0] + c[1] * ux[1]), k * uy[0], k * uy[1], HS / 2 - k * (c[0] * uy[0] + c[1] * uy[1])];
  }
  const inv = M => { const d = M[0] * M[4] - M[1] * M[3], a = M[4] / d, b = -M[1] / d, c = -M[3] / d, e = M[0] / d; return [a, b, -(a * M[2] + b * M[5]), c, e, -(c * M[2] + e * M[5])] };
  const mul = (A, B) => [A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2], A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5]];
  /* image → carré s×s du repère de la tête (fond gris neutre hors de l'image, comme l'outil photo) */
  function tete(src, M, s, cv) {
    const c = cv || toile(s, s), x = c.getContext("2d", { willReadFrequently: true }), k = s / HS; x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = "#808080"; x.fillRect(0, 0, s, s);
    x.imageSmoothingQuality = "high"; x.setTransform(M[0] * k, M[3] * k, M[1] * k, M[4] * k, M[2] * k, M[5] * k); x.drawImage(src, 0, 0); x.setTransform(1, 0, 0, 1, 0, 0); return c;
  }
  const gris = d => { const g = new Float32Array(Q); for (let j = 0, i = 0; j < Q; j++, i += 4) g[j] = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; return g };

  /* ---------- recalage fin : D tel que I(D(x)) ≈ R(x) sur la zone pondérée ; D(x) = A·(x − c) + t + c ---------- */
  function reduire(g, ech, w) {   /* moyenne par blocs puis flou 1-4-6-4-1 ; w : poids réduits de la même façon (sans flou) */
    const n = HS / ech, a = new Float32Array(n * n), b = new Float32Array(n * n), k = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let s = 0; for (let v = 0; v < ech; v++) for (let u = 0; u < ech; u++) s += g[(y * ech + v) * HS + x * ech + u]; a[y * n + x] = s / (ech * ech) }
    if (w) return a;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let s = 0; for (let u = -2; u <= 2; u++) s += k[u + 2] * a[y * n + Math.min(n - 1, Math.max(0, x + u))]; b[y * n + x] = s }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let s = 0; for (let u = -2; u <= 2; u++) s += k[u + 2] * b[Math.min(n - 1, Math.max(0, y + u)) * n + x]; a[y * n + x] = s }
    return a;
  }
  const PYR = [8, 4, 2], POIDS = PYR.map(e => reduire(OVF, e, true));
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

  /* ---------- zone à retirer dans le repère de la tête, à partir de la moyenne des cartes (192×192) ---------- */
  function masque(lg, veto) {
    const m = new Uint8Array(Q), k = 192 / HS, seuil = Math.log(DFV.R.seuil / (1 - DFV.R.seuil)); let n = 0;
    for (let y = 0; y < HS; y++) for (let x = 0; x < HS; x++) { const j = y * HS + x; if (!PORTE[j]) continue;
      const u = Math.min(191, Math.max(0, (x + .5) * k - .5)), v = Math.min(191, Math.max(0, (y + .5) * k - .5)), u0 = Math.floor(u), v0 = Math.floor(v), u1 = Math.min(191, u0 + 1), v1 = Math.min(191, v0 + 1), fu = u - u0, fv = v - v0;
      if ((lg[v0 * 192 + u0] * (1 - fu) + lg[v0 * 192 + u1] * fu) * (1 - fv) + (lg[v1 * 192 + u0] * (1 - fu) + lg[v1 * 192 + u1] * fu) * fv > seuil) { m[j] = 1; n++ } }
    if (!n) return null;
    const c = DFV._t.nettoyer(m, HS, HS, (DFV.R.aireMin * IOH) ** 2, veto); let r = 0; for (let j = 0; j < Q; j++) r += c[j];
    return r ? DFV._t.dilater(c, HS, HS, Math.max(1, Math.round(DFV.R.dilat * IOH / 2))) : null;
  }
  const tasser = m => { const b = new Uint8Array(Q >> 3); for (let j = 0; j < Q; j++) if (m[j]) b[j >> 3] |= 1 << (j & 7); return b };
  const detasser = b => { const m = new Uint8Array(Q); for (let j = 0; j < Q; j++) m[j] = (b[j >> 3] >> (j & 7)) & 1; return m };
  function flouBoite(a, r, passes) {   /* plan HS×HS, flou boîte de rayon r, `passes` fois (sommes glissantes) */
    let b = new Float32Array(Q); const k = 2 * r + 1; a = Float32Array.from(a);
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < HS; y++) { const o = y * HS; let s = 0; for (let x = -r; x <= r; x++) s += a[o + Math.min(HS - 1, Math.max(0, x))]; for (let x = 0; x < HS; x++) { b[o + x] = s / k; s += a[o + Math.min(HS - 1, x + r + 1)] - a[o + Math.max(0, x - r)] } }
      for (let x = 0; x < HS; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[Math.min(HS - 1, Math.max(0, y)) * HS + x]; for (let y = 0; y < HS; y++) { a[y * HS + x] = s / k; s += b[Math.min(HS - 1, y + r + 1) * HS + x] - b[Math.max(0, y - r) * HS + x] } }
    }
    return a;
  }

  /* ---------- 1) préparation (2 lectures). ouvrir() → { need(i), close() } ; opt : { onProgress, signal, mains } ---------- */
  async function preparer(ouvrir, n, W, H, opt) {
    opt = opt || {}; const P = opt.onProgress || (() => {}), t0 = performance.now(), J = []; S = null;
    const stop = () => { if (opt.signal && opt.signal.aborted) throw new DOMException("annulé", "AbortError") };
    let r = await ouvrir(); const brut = new Array(n).fill(null);
    try { for (let i = 0; i < n; i++) { stop(); const F = await VISAGE.detecter(await r.need(i), W, H, .55);
        if (F.length) { const f = F.reduce((a, b) => a.w * a.h > b.w * b.h ? a : b); if (Math.hypot(f.pts[2] - f.pts[0], f.pts[3] - f.pts[1]) >= 12) brut[i] = Array.from(f.pts) }
        if (i % 10 === 0) { P("Filtre : suivi du visage " + (i + 1) + " / " + n + "…", .15 * i / n); await new Promise(z => setTimeout(z, 0)) } } }
    finally { try { r.close() } catch (e) {} }
    for (let i = 1; i < n - 1; i++) if (!brut[i] && brut[i - 1]) { const j = brut[i + 1] ? i + 1 : (i + 2 < n && brut[i + 2] ? i + 2 : -1); if (j > 0) brut[i] = brut[i - 1].map((v, c) => v + (brut[j][c] - v) / (j - i + 1)) }
    const pts = RVV._lisser(brut), M = new Array(n).fill(null), masques = new Array(n).fill(null), sec = new Array(n).fill(-1), fills = new Map();
    if (!pts.some(Boolean)) { S = { n, W, H, M, masques, sec, fills }; return resume(t0, J) }
    await DFV.charger(f => P("Téléchargement du détecteur (1,5 Mo, une seule fois)…", .15));
    const hc = toile(HS, HS), dc = toile(192, 192); let C = null, nsec = -1;   /* C : section en cours */
    const finMasque = t => {   /* zone de l'image t = seuil sur la moyenne des cartes t−2 … t+2 de la section */
      const L = []; for (let s = t - 2; s <= t + 2; s++) if (C.lg.has(s)) L.push(C.lg.get(s)); const moy = new Float32Array(192 * 192);
      for (const l of L) for (let j = 0; j < moy.length; j++) moy[j] += l[j] / L.length;
      const m = masque(moy, C.veto); if (m) { masques[t] = tasser(m); for (let j = 0; j < Q; j++) if (m[j]) C.U[j] = 1; C.vu++ }
      C.lg.delete(t - 2);
    };
    const fermer = async dernier => {   /* fin de section : dernières zones, puis UNE reconstruction sur l'union */
      if (!C) return; for (let t = Math.max(C.deb, C.fait + 1); t <= dernier; t++) finMasque(t);
      if (C.vu) {
        P("Filtre : reconstruction de la zone (section " + (nsec + 1) + ")…", .9);
        const bb = ERASE._t.bbox(C.U, HS, HS), K = ERASE._t.context(bb, HS, HS), nC = K.w * K.h, hole = new Uint8Array(nC), cx = C.ref.getContext("2d", { willReadFrequently: true });
        for (let y = 0; y < K.h; y++) for (let x = 0; x < K.w; x++) hole[y * K.w + x] = C.U[(K.y + y) * HS + K.x + x];
        const chw = await ERASE.infer(cx.getImageData(K.x, K.y, K.w, K.h).data, hole, K.w, K.h, f => P("Téléchargement du modèle de reconstruction (28 Mo, une seule fois)…", .9));
        const pc = toile(K.w, K.h); pc.getContext("2d").putImageData(new ImageData(ERASE._t.patch(chw, hole, nC), K.w, K.h), 0, 0); cx.drawImage(pc, K.x, K.y);
        const zf = new Uint8Array(Q); let z = 0; for (let j = 0; j < Q; j++) if (C.U[j] && OVALE[j]) { zf[j] = 1; z++ }
        if (z && opt.visage !== false) try { await RVIS.restaurerZone(C.ref, C.ptsH, DFV._t.flouZone(DFV._t.dilater(zf, HS, HS, Math.round(DFV.R.gfpgan * IOH / 2)), HS, HS, Math.max(1, Math.round(.03 * IOH))), f => P("Téléchargement du modèle de visage (86 Mo, une seule fois)…", .9)) }
          catch (e) { J.push("Finition du visage impossible (" + ((e && e.message) || e) + ") : reconstruction simple gardée.") }
        fills.set(nsec, cx.getImageData(0, 0, HS, HS).data);
      }
      C = null;
    };
    r = await ouvrir();
    try {
      for (let i = 0; i < n; i++) {
        stop(); if (!pts[i]) { await fermer(i - 1); continue }
        const im = await r.need(i); let Mi = cadre(pts[i]), g = pyramide(gris(tete(im, Mi, HS, hc).getContext("2d").getImageData(0, 0, HS, HS).data)), D = C ? recaler(C.Rp, g) : null;
        if (C && !D) await fermer(i - 1);
        if (!C) { nsec++; const ref = toile(HS, HS); ref.getContext("2d").drawImage(hc, 0, 0);
          C = { deb: i, fait: i - 1, Rp: g, ref, ptsH: pts[i].map((v, k) => k % 2 === 0 ? Mi[0] * v + Mi[1] * pts[i][k + 1] + Mi[2] : Mi[3] * pts[i][k - 1] + Mi[4] * v + Mi[5]), lg: new Map(), U: new Uint8Array(Q), vu: 0, veto: null, mainsVues: false } }
        else Mi = mul(inv(D), Mi);
        M[i] = Mi; sec[i] = nsec;
        const lg = await DFV.logits(tete(im, Mi, 192, dc).getContext("2d").getImageData(0, 0, 192, 192).data); C.lg.set(i, lg);
        /* veto « mains » : cherché une fois par section, dès que le détecteur voit quelque chose (comme l'outil photo) */
        if (!C.mainsVues && opt.mains !== false && window.MAINS) { let vu = false; const s0 = Math.log(DFV.R.seuil / (1 - DFV.R.seuil)); for (let j = 0; j < lg.length; j += 7) if (lg[j] > s0) { vu = true; break }
          if (vu) { C.mainsVues = true; try { const fc = toile(W, H); fc.getContext("2d").drawImage(im, 0, 0, W, H); const z = await MAINS.zone(fc, W, H);
              if (z.n) { const v = new Uint8Array(Q), Iv = inv(Mi); for (let y = 0; y < HS; y++) for (let x = 0; x < HS; x++) { const px = Math.round(Iv[0] * x + Iv[1] * y + Iv[2]), py = Math.round(Iv[3] * x + Iv[4] * y + Iv[5]); if (px >= 0 && py >= 0 && px < W && py < H && z.zone[py * W + px]) v[y * HS + x] = 1 } C.veto = v; J.push("Main repérée : ce qui est posé dessus n’est pas effacé.") } }
            catch (e) { J.push("Repérage des mains indisponible : retrait sans cette vérification.") } } }
        if (i - 2 >= C.deb) { finMasque(i - 2); C.fait = i - 2 }
        if (i % 5 === 0) { P("Filtre : recherche des éléments " + (i + 1) + " / " + n + "…", .15 + .75 * i / n); await new Promise(z => setTimeout(z, 0)) }
      }
      await fermer(n - 1);
    } finally { try { r.close() } catch (e) {} }
    S = { n, W, H, M, masques, sec, fills };
    return resume(t0, J);
  }
  function resume(t0, J) {
    const im = S.masques.filter(Boolean).length, r = { images: S.n, avec_filtre: im, sections: S.fills.size, journal: J || [], ms: Math.round(performance.now() - t0) };
    r.texte = !im ? "Aucun élément de filtre trouvé dans la vidéo : rien n’est modifié."
      : "Filtre : éléments retirés sur " + im + " images (" + r.sections + " reconstruction" + (r.sections > 1 ? "s" : "") + " ; ce qui est reconstruit est inventé, plausible et non retrouvé).";
    return r;
  }

  /* ---------- 2) à l'export : compose la reconstruction sur l'image exportée i (canvas, n'importe quelle taille) ---------- */
  let oc = null, hc2 = null, fc = null;
  function appliquer(sortie, i) {
    if (!S || !S.masques[i] || !S.fills.has(S.sec[i])) return sortie;
    const w = sortie.width, h = sortie.height, sx = w / S.W, m = detasser(S.masques[i]), F = S.fills.get(S.sec[i]), M0 = S.M[i], M = [M0[0] / sx, M0[1] / sx, M0[2], M0[3] / sx, M0[4] / sx, M0[5]];
    if (!oc || oc.width !== w || oc.height !== h) { oc = toile(w, h); hc2 = toile(HS, HS); fc = toile(HS, HS) }
    const ox = oc.getContext("2d"); ox.setTransform(1, 0, 0, 1, 0, 0); ox.globalAlpha = 1; ox.drawImage(sortie, 0, 0);
    const Ht = tete(oc, M, HS, hc2).getContext("2d").getImageData(0, 0, HS, HS).data;
    /* lumière : écart (image − reconstruction) mesuré hors de la zone, prolongé dedans (convolution normalisée, 3 échelles) */
    const connu = Float32Array.from(DFV._t.dilater(m, HS, HS, 3), v => 1 - v), img = new ImageData(HS, HS), q = img.data, res = [new Float32Array(Q), new Float32Array(Q), new Float32Array(Q)], fait = new Uint8Array(Q), D = new Float32Array(Q);
    /* seule la zone (et son bord) a besoin du résultat */
    for (const rr of [Math.round(.12 * IOH), Math.round(.4 * IOH), Math.round(1.2 * IOH)]) {
      const den = flouBoite(connu, rr, 2), ok = new Uint8Array(Q); let reste = 0;
      for (let j = 0; j < Q; j++) { if (!fait[j] && den[j] > .05) ok[j] = 1; else if (!fait[j]) reste++ }
      for (let c = 0; c < 3; c++) { for (let j = 0; j < Q; j++) D[j] = (Ht[4 * j + c] - F[4 * j + c]) * connu[j]; const num = flouBoite(D, rr, 2); for (let j = 0; j < Q; j++) if (ok[j]) res[c][j] = num[j] / Math.max(den[j], 1e-3) }
      for (let j = 0; j < Q; j++) if (ok[j]) fait[j] = 1;
      if (!reste) break;
    }
    const a = flouBoite(m, 1, 2);
    for (let j = 0; j < Q; j++) { q[4 * j] = F[4 * j] + res[0][j]; q[4 * j + 1] = F[4 * j + 1] + res[1][j]; q[4 * j + 2] = F[4 * j + 2] + res[2][j]; q[4 * j + 3] = Math.round(255 * a[j]) }
    fc.getContext("2d").putImageData(img, 0, 0);
    const I = inv(M); ox.save(); ox.imageSmoothingQuality = "high"; ox.setTransform(I[0], I[3], I[1], I[4], I[2], I[5]); ox.drawImage(fc, 0, 0); ox.restore();
    return oc;
  }
  function vider() { S = null; oc = hc2 = fc = null }
  return { preparer, appliquer, vider, etat: () => S && { images: S.n, avec_filtre: S.masques.filter(Boolean).length, sections: S.fills.size }, _t: { cadre, recaler, pyramide, gris, inv, mul, HS } };
})();
