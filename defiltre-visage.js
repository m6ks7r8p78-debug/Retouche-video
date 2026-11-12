/* RetoucheProAI v7.1 — DFV : retirer les éléments d'un filtre AR (museau, moustaches, oreilles, nez de clown, autocollants,
   lunettes dessinées, couronnes…) d'une photo, automatiquement, sur le téléphone.
   Chaîne (identique au laboratoire tests/labo_filtres/noyau.py → retirer_ajouts) :
     1. repérage du visage (YuNet, déjà dans l'app) ;
     2. détecteur appris au laboratoire (petit U-Net, 1,5 Mo) sur un cadrage 192×192 autour de la tête → carte « ajouté par un filtre » ;
     3. la zone est reconstruite par MI-GAN (le moteur d'« Effacer une zone ») ;
     4. sur le visage, la zone reconstruite est redessinée par GFPGAN (le moteur de « Restaurer les visages »), et seulement elle.
   Tout ce qui est reconstruit est INVENTÉ (plausible, pas retrouvé) et montré en rose sur la carte. Une photo sans élément de
   filtre n'est pas touchée. Ne traite pas : déformations (gros yeux, visage affiné), lissage, maquillage, cagoule, floutage.
   Mesures et limites : REGISTRE_LIVRAISON_PERMANENT.md, fiche F30. */
var DFV = (() => {
  const ID = "ajouts", S = 192, R = { seuil: .6, aireMin: .04, dilat: .06, gfpgan: .08 };
  let sess = null, chargement = null, enCours = 0;
  const $ = s => document.querySelector(s), toile = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c };
  function script(src) { return new Promise((ok, ko) => { if (window.ort) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => ko(new Error("moteur introuvable")); document.head.appendChild(s) }) }
  async function charger(onP) {
    if (sess) return sess;
    if (!chargement) chargement = (async () => {
      if (MODELS.beforeLoad) await MODELS.beforeLoad(ID);
      const b = new Uint8Array(await MODELS.bytes(ID, { download: true, onProgress: onP }));
      await script("ort/ort.wasm.min.js"); ort.env.wasm.wasmPaths = new URL("ort/", location.href).href;
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      sess = await ort.InferenceSession.create(b, { executionProviders: ["wasm"] }); return sess;
    })().catch(e => { chargement = null; throw e });
    return chargement;
  }
  async function liberer() { const s = sess; sess = null; chargement = null; try { if (s && s.release) await s.release() } catch (e) {} }
  if (window.MODELS) MODELS.register(ID, { loaded: () => !!sess, busy: () => enCours > 0, unload: liberer });

  /* repère du visage à partir des 5 points YuNet : origine entre les yeux, axes, écart des yeux (même définition que le labo) */
  function repere(p) {
    const ax = p[0], ay = p[1], bx = p[2], by = p[3], io = Math.hypot(bx - ax, by - ay), ux = [(bx - ax) / io, (by - ay) / io], uy = [-ux[1], ux[0]];
    return { o: [(ax + bx) / 2, (ay + by) / 2], ux, uy, io };
  }
  /* cadrage image → carré S×S (identique à entrainer_ajouts.py / noyau.detecter_ajouts) */
  function cadrage(f) {
    const r = repere(f.pts), c = [r.o[0] + r.uy[0] * r.io * .35, r.o[1] + r.uy[1] * r.io * .35], k = S / (r.io * 4.6);
    return { r, c, k, a: k * r.ux[0], b: k * r.uy[0], cc: k * r.ux[1], d: k * r.uy[1], e: S / 2 - k * (c[0] * r.ux[0] + c[1] * r.ux[1]), f: S / 2 - k * (c[0] * r.uy[0] + c[1] * r.uy[1]) };
  }
  /* carte de probabilité (0..1) des éléments ajoutés, pour UN visage, ramenée à la taille de la photo (Float32Array w×h) */
  async function carte(base, f, prob) {
    const W = base.width, H = base.height, C = cadrage(f), cr = toile(S, S), x = cr.getContext("2d", { willReadFrequently: true });
    x.fillStyle = "#808080"; x.fillRect(0, 0, S, S); x.imageSmoothingQuality = "high"; x.setTransform(C.a, C.b, C.cc, C.d, C.e, C.f); x.drawImage(base, 0, 0);
    const d = x.getImageData(0, 0, S, S).data, t = new Float32Array(3 * S * S), n = S * S;
    for (let j = 0, i = 0; j < n; j++, i += 4) { t[j] = d[i + 2]; t[n + j] = d[i + 1]; t[2 * n + j] = d[i] }   /* le détecteur a appris en BGR, 0..255 */
    const s = await charger(); enCours++; let lg;
    try { lg = (await s.run({ image: new ort.Tensor("float32", t, [1, 3, S, S]) })).logit.data } finally { enCours-- }
    /* retour vers la photo : chaque pixel de la photo lit la carte au point correspondant (bilinéaire) */
    const det = C.a * C.d - C.cc * C.b, ia = C.d / det, ib = -C.b / det, ic = -C.cc / det, id = C.a / det;
    const coins = [[0, 0], [S, 0], [0, S], [S, S]].map(([u, v]) => [ia * (u - C.e) + ic * (v - C.f), ib * (u - C.e) + id * (v - C.f)]);
    const x0 = Math.max(0, Math.floor(Math.min(...coins.map(q => q[0])))), x1 = Math.min(W - 1, Math.ceil(Math.max(...coins.map(q => q[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...coins.map(q => q[1])))), y1 = Math.min(H - 1, Math.ceil(Math.max(...coins.map(q => q[1]))));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const u = C.a * xx + C.cc * yy + C.e - .5, v = C.b * xx + C.d * yy + C.f - .5; if (u < 0 || v < 0 || u > S - 1 || v > S - 1) continue;
      const u0 = Math.floor(u), v0 = Math.floor(v), u1 = Math.min(S - 1, u0 + 1), v1 = Math.min(S - 1, v0 + 1), au = u - u0, av = v - v0;
      const l = (lg[v0 * S + u0] * (1 - au) + lg[v0 * S + u1] * au) * (1 - av) + (lg[v1 * S + u0] * (1 - au) + lg[v1 * S + u1] * au) * av;
      const dx = xx - C.r.o[0], dy = yy - C.r.o[1], uu = (dx * C.r.ux[0] + dy * C.r.ux[1]) / C.r.io, vv = (dx * C.r.uy[0] + dy * C.r.uy[1]) / C.r.io;
      if ((uu / 1.7) ** 2 + ((vv - .2) / 2.4) ** 2 >= 1) continue;   /* seulement la tête et juste autour (oreilles d'animal) : pas le décor */
      const p = 1 / (1 + Math.exp(-l)), k = yy * W + xx; if (p > prob[k]) prob[k] = p;
    }
    return C.r;
  }
  /* composantes : on retire les points isolés (moins de aireMin² écarts des yeux) et, v7.1, celles posées à plus de moitié sur
     une main (veto : ongles, doigts, cigarette, bague — de vrais objets) */
  function nettoyer(m, W, H, aire, veto) {
    const lab = new Int32Array(W * H), st = []; let n = 0;
    for (let i = 0; i < W * H; i++) if (m[i] && !lab[i]) { n++; let c = 0; const q = [i]; lab[i] = n; while (q.length) { const k = q.pop(); c++; const x = k % W, y = (k - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const kk = yy * W + xx; if (m[kk] && !lab[kk]) { lab[kk] = n; q.push(kk) } } } st[n] = c }
    const surMain = new Int32Array(n + 1); if (veto) for (let i = 0; i < W * H; i++) if (lab[i] && veto[i]) surMain[lab[i]]++;
    let enleves = 0; for (let k = 1; k <= n; k++) if (veto && st[k] >= aire && surMain[k] > .5 * st[k]) enleves++;
    for (let i = 0; i < W * H; i++) if (lab[i] && (st[lab[i]] < aire || (veto && surMain[lab[i]] > .5 * st[lab[i]]))) m[i] = 0;
    m.enleves = enleves; return m;
  }
  function dilater(m, W, H, r) {   /* disque de rayon r (séparable approché : carré puis coins) */
    if (r < 1) return m; const t = new Uint8Array(W * H), o = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) { let last = -1e9; for (let x = 0; x < W; x++) { if (m[y * W + x]) last = x; if (x - last <= r) t[y * W + x] = 1 } last = 1e9; for (let x = W - 1; x >= 0; x--) { if (m[y * W + x]) last = x; if (last - x <= r) t[y * W + x] = 1 } }
    for (let x = 0; x < W; x++) { let last = -1e9; for (let y = 0; y < H; y++) { if (t[y * W + x]) last = y; if (y - last <= r) o[y * W + x] = 1 } last = 1e9; for (let y = H - 1; y >= 0; y--) { if (t[y * W + x]) last = y; if (last - y <= r) o[y * W + x] = 1 } }
    return o;
  }
  function flouZone(m, W, H, r) {   /* masque binaire → zone douce 0..1 (flou boîte ×2) */
    let a = Float32Array.from(m), b = new Float32Array(W * H); const k = 2 * r + 1;
    for (let p = 0; p < 2; p++) {
      for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * W + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { b[y * W + x] = s / k; s += a[y * W + Math.min(W - 1, x + r + 1)] - a[y * W + Math.max(0, x - r)] } }
      for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { a[y * W + x] = s / k; s += b[Math.min(H - 1, y + r + 1) * W + x] - b[Math.max(0, y - r) * W + x] } }
    }
    return a;
  }
  /* ovale approximatif du visage (pour décider où GFPGAN redessine) à partir des 5 points */
  function dansVisage(r, x, y) { const dx = x - r.o[0], dy = y - r.o[1], u = (dx * r.ux[0] + dy * r.ux[1]) / r.io, v = (dx * r.uy[0] + dy * r.uy[1]) / r.io; return (u / 1.15) ** 2 + ((v - .55) / 1.45) ** 2 < 1 }

  /* ---------- proportions (réglage guidé) : mêmes formes de déformation que le laboratoire (noyau.champ_oeil / champ_nez / champ_joues).
     Le labo a montré qu'on ne peut PAS mesurer automatiquement de façon fiable un agrandissement des yeux ou un visage affiné à
     partir d'une autre photo (la variation naturelle d'une photo à l'autre est aussi grande que l'effet du filtre) : c'est donc
     la personne qui règle, en comparant avec sa photo sans filtre. k = 1 : rien ne bouge. ---------- */
  const cloche = (r, R) => r < R ? (1 - (r / R) ** 2) ** 2 : 0;
  function deformer(src, f, k) {
    const W = src.width, H = src.height, out = toile(W, H), ox = out.getContext("2d"); ox.drawImage(src, 0, 0);
    if (Math.abs(k.yeux - 1) < .005 && Math.abs(k.nez - 1) < .005 && Math.abs(k.bas - 1) < .005) return out;
    const r = repere(f.pts), io = r.io, oe = [[f.pts[0], f.pts[1]], [f.pts[2], f.pts[3]]], nz = [f.pts[4], f.pts[5]], bo = [(f.pts[6] + f.pts[8]) / 2, (f.pts[7] + f.pts[9]) / 2];
    const uv = (x, y) => { const dx = x - r.o[0], dy = y - r.o[1]; return [(dx * r.ux[0] + dy * r.ux[1]) / io, (dx * r.uy[0] + dy * r.uy[1]) / io] };
    const xy = (u, v) => [r.o[0] + (u * r.ux[0] + v * r.uy[0]) * io, r.o[1] + (u * r.ux[1] + v * r.uy[1]) * io];
    const E = oe.map(p => uv(p[0], p[1])), Nz = uv(nz[0], nz[1]), Bo = uv(bo[0], bo[1]), vt = Nz[1], vc = Bo[1] + (Bo[1] - vt) * 1.4, mid = (Nz[0] + Bo[0]) / 2;
    const x0 = Math.max(0, Math.floor(r.o[0] - 2.4 * io)), x1 = Math.min(W, Math.ceil(r.o[0] + 2.4 * io)), y0 = Math.max(0, Math.floor(r.o[1] - 1.5 * io)), y1 = Math.min(H, Math.ceil(r.o[1] + 3.2 * io));
    if (x1 <= x0 || y1 <= y0) return out;
    const sx = src.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data, O = ox.getImageData(x0, y0, x1 - x0, y1 - y0), od = O.data;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      let [u, v] = uv(x, y);
      /* champs appliqués à l'envers (sortie → source), dans l'ordre inverse du filtre : bas du visage, nez, yeux */
      if (k.bas !== 1) { const t = (v - vt) / (vc - vt), kk = t < -.45 ? 1 : t < .2 ? 1 + (k.bas - 1) * (t + .45) / .65 : k.bas, w = Math.min(1.69, (Math.abs(u - mid) / 1.05) ** 2); u = mid + (u - mid) / (1 + (kk - 1) * w) }
      if (k.nez !== 1) { const b = cloche(Math.hypot((u - Nz[0]) * .8, v - (Nz[1] - .1)), .55); u = Nz[0] + (u - Nz[0]) / (1 + (k.nez - 1) * b) }
      if (k.yeux !== 1) for (const e of E) { const d = Math.hypot(u - e[0], v - e[1]), g = 1 + (k.yeux - 1) * cloche(d, .45); u = e[0] + (u - e[0]) / g; v = e[1] + (v - e[1]) / g }
      const [px, py] = xy(u, v); if (px < 0 || py < 0 || px > W - 1 || py > H - 1) continue;
      const ix = Math.floor(px), iy = Math.floor(py), ax = px - ix, ay = py - iy, i00 = (iy * W + ix) * 4, i10 = i00 + (ix < W - 1 ? 4 : 0), i01 = i00 + (iy < H - 1 ? W * 4 : 0), i11 = i01 + (ix < W - 1 ? 4 : 0), o = ((y - y0) * (x1 - x0) + x - x0) * 4;
      for (let c = 0; c < 3; c++) od[o + c] = (sx[i00 + c] * (1 - ax) + sx[i10 + c] * ax) * (1 - ay) + (sx[i01 + c] * (1 - ax) + sx[i11 + c] * ax) * ay;
    }
    ox.putImageData(O, x0, y0); return out;
  }

  /* src : image ou canvas. Renvoie { canvas, carte (canvas rose), trou (Uint8Array), part (fraction de l'image), visages, journal, ms } */
  async function retirer(src, opt) {
    opt = opt || {}; const t0 = performance.now(), P = opt.onProgress || (() => {}), J = [];
    const W = src.naturalWidth || src.width, H = src.naturalHeight || src.height, base = toile(W, H); base.getContext("2d").drawImage(src, 0, 0, W, H);
    P("Recherche des visages…", 0);
    const F = (await VISAGE.detecter(base, W, H, .55)).slice(0, 6);
    if (!F.length) return { canvas: base, carte: toile(W, H), trou: new Uint8Array(W * H), part: 0, visages: [], journal: ["Aucun visage trouvé : la photo n’a pas été modifiée."], ms: 0 };
    P("Recherche des éléments du filtre…", .05);
    await charger(f => P("Téléchargement du détecteur (1,5 Mo, une seule fois)…", f));
    const prob = new Float32Array(W * H), reps = [];
    for (const f of F) reps.push(await carte(base, f, prob));
    const io = Math.max(...reps.map(r => r.io)); let m = new Uint8Array(W * H), vu = 0; for (let i = 0; i < m.length; i++) { m[i] = prob[i] > R.seuil ? 1 : 0; vu += m[i] }
    let veto = null;
    if (vu && opt.mains !== false && window.MAINS) {   /* v7.1 : seulement s'il y a quelque chose à vérifier (évite le téléchargement sinon) */
      P("Vérification des mains…", .1);
      try { const z = await MAINS.zone(base, W, H); veto = z.zone; if (z.n) J.push(z.n + (z.n > 1 ? " mains repérées" : " main repérée") + " : ce qui est posé dessus n’est pas effacé.") }
      catch (e) { J.push("Repérage des mains indisponible (" + ((e && e.message) || e) + ") : retrait sans cette vérification.") }
    }
    m = nettoyer(m, W, H, (R.aireMin * io) ** 2, veto);
    if (m.enleves) J.push(m.enleves + (m.enleves > 1 ? " éléments laissés car posés" : " élément laissé car posé") + " sur une main.");
    let n = 0; for (let i = 0; i < m.length; i++) n += m[i];
    if (!n) return { canvas: base, carte: toile(W, H), trou: m, part: 0, visages: F, journal: ["Aucun élément de filtre trouvé : la photo n’a pas été modifiée."], ms: Math.round(performance.now() - t0) };
    const trou = dilater(m, W, H, Math.max(1, Math.round(R.dilat * io / 2)));
    /* 3) MI-GAN, par zone (contexte autour de chaque groupe de pixels, comme « Effacer une zone ») */
    P("Reconstruction de la zone…", .2);
    const bb = ERASE._t.bbox(trou, W, H), C = ERASE._t.context(bb, W, H), nC = C.w * C.h, holeC = new Uint8Array(nC);
    for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) holeC[y * C.w + x] = trou[(C.y + y) * W + C.x + x];
    const rgba = base.getContext("2d", { willReadFrequently: true }).getImageData(C.x, C.y, C.w, C.h).data;
    const chw = await ERASE.infer(rgba, holeC, C.w, C.h, f => P("Téléchargement du modèle de reconstruction (28 Mo, une seule fois)…", f));
    const pc = toile(C.w, C.h); pc.getContext("2d").putImageData(new ImageData(ERASE._t.patch(chw, holeC, nC), C.w, C.h), 0, 0); base.getContext("2d").drawImage(pc, C.x, C.y);
    let tot = 0; for (let i = 0; i < trou.length; i++) tot += trou[i];
    J.push("Éléments du filtre retirés : " + (100 * tot / (W * H)).toFixed(1) + " % de la photo reconstruite (en rose sur la carte).");
    /* 4) GFPGAN sur chaque visage touché, seulement dans la zone reconstruite élargie */
    if (opt.visage !== false && window.RVIS) for (let k = 0; k < F.length; k++) {
      const r = reps[k], zf = new Uint8Array(W * H); let z = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (trou[i] && dansVisage(r, x, y)) { zf[i] = 1; z++ } }
      if (!z) continue;
      P("Le visage est redessiné là où était le filtre…", .6);
      const zone = flouZone(dilater(zf, W, H, Math.round(R.gfpgan * r.io / 2)), W, H, Math.max(1, Math.round(.03 * r.io)));
      try { if (await RVIS.restaurerZone(base, F[k].pts, zone, f => P("Téléchargement du modèle de visage (86 Mo, une seule fois)…", f))) J.push("Visage " + (k + 1) + " : zone redessinée pour accorder lumière et netteté.") }
      catch (e) { J.push("Visage " + (k + 1) + " : finition du visage impossible (" + ((e && e.message) || e) + "), reconstruction simple gardée.") }
    }
    const cc = toile(W, H), cx = cc.getContext("2d"), cd = cx.createImageData(W, H);
    for (let i = 0; i < trou.length; i++) if (trou[i]) { cd.data[i * 4] = 255; cd.data[i * 4 + 2] = 200; cd.data[i * 4 + 3] = 170 }
    cx.putImageData(cd, 0, 0);
    return { canvas: base, carte: cc, trou, part: tot / (W * H), visages: F, journal: J, ms: Math.round(performance.now() - t0) };
  }

  /* ---------- écran ---------- */
  function ui() {
    if ($("#dfv")) return $("#dfv");
    if (!$("#dfv_css")) { const st = document.createElement("style"); st.id = "dfv_css"; st.textContent = `
#dfv{position:fixed;inset:0;z-index:60;background:var(--stage,#0a0f10);color:#e8f0ee;display:flex;flex-direction:column;font:15px/1.4 var(--fb,system-ui)}
#dfv[hidden]{display:none}#dfv header{display:flex;align-items:center;gap:8px;padding:calc(env(safe-area-inset-top) + 8px) 12px 8px;background:rgba(0,0,0,.35)}
#dfv header h2{flex:1;margin:0;font:600 16px/1.2 var(--fd,system-ui);color:#fff}
#dfv .d-ib{min-width:44px;min-height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:15px;padding:0 10px}
#dfv_st{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}
#dfv_st canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}#dfv_av{clip-path:inset(0 0 0 50%)}
#dfv_ca{opacity:0;transition:opacity .2s}#dfv.carte #dfv_ca{opacity:1}
#dfv_li{position:absolute;top:0;bottom:0;left:50%;width:2px;background:#fff;box-shadow:0 0 6px #000;pointer-events:none}
.dfv-tag{position:absolute;top:10px;padding:5px 9px;border-radius:9px;background:rgba(0,0,0,.6);font-size:12px;pointer-events:none}
#dfv_msg{margin:0;padding:6px 12px 0;font-size:13px;color:#cfe0dc;min-height:20px}#dfv_bar{height:4px;margin:4px 12px 0;border-radius:2px;background:rgba(255,255,255,.12);overflow:hidden}#dfv_bar i{display:block;height:100%;width:0;background:var(--acc,#0b7a80)}
#dfv footer{padding:6px 12px calc(env(safe-area-inset-bottom) + 10px);background:rgba(0,0,0,.35);display:grid;gap:8px}#dfv .d-row{display:flex;gap:8px}
#dfv .d-go{flex:1;min-height:48px;border-radius:12px;border:0;background:var(--acc,#0b7a80);color:var(--accink,#fff);font-weight:700;font-size:15px}
#dfv .d-no{flex:1;min-height:48px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;font-weight:600;font-size:15px}
#dfv button:disabled{opacity:.4}#dfv label.d-f{display:flex;align-items:center;gap:8px;flex:1;font-size:13px}#dfv input[type=range]{flex:1;accent-color:var(--acc,#0b7a80)}
#dfv_rv{position:absolute;right:10px;bottom:10px;width:28%;max-width:160px;border-radius:10px;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.5)}#dfv_rv[hidden]{display:none}#dfv details{font-size:12.5px;color:#cfe0dc}#dfv summary{min-height:32px;display:flex;align-items:center}`; document.head.appendChild(st) }
    const d = document.createElement("div"); d.id = "dfv"; d.hidden = true; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Retirer un filtre du visage");
    d.innerHTML = `<header><button class="d-ib" id="dfv_x" aria-label="Fermer">✕</button><h2>Retirer un filtre du visage</h2><button class="d-ib" id="dfv_cb" aria-pressed="false" disabled>Carte</button></header>
<div id="dfv_st"><canvas id="dfv_ap"></canvas><canvas id="dfv_av"></canvas><canvas id="dfv_ca"></canvas><div id="dfv_li"></div><img id="dfv_rv" alt="Photo de comparaison sans filtre" hidden><span class="dfv-tag" style="left:10px">Avec filtre</span><span class="dfv-tag" style="right:10px">Sans filtre</span></div>
<div id="dfv_bar"><i></i></div><p id="dfv_msg" role="status" aria-live="polite"></p>
<footer><div id="dfv_pr" hidden><div class="d-row"><label class="d-f">Yeux <input type="range" id="dfv_ky" min="70" max="115" step="1" value="100" aria-label="Taille des yeux"><output id="dfv_oy">100 %</output></label></div>
<div class="d-row"><label class="d-f">Nez <input type="range" id="dfv_kn" min="85" max="125" step="1" value="100" aria-label="Largeur du nez"><output id="dfv_on">100 %</output></label></div>
<div class="d-row"><label class="d-f">Bas du visage <input type="range" id="dfv_kb" min="90" max="120" step="1" value="100" aria-label="Largeur du bas du visage"><output id="dfv_ob">100 %</output></label></div>
<div class="d-row"><button class="d-no" id="dfv_ref">📷 Photo de comparaison (sans filtre)</button><button class="d-no" id="dfv_raz">Remettre à 100 %</button></div><input type="file" id="dfv_fr" accept="image/*" hidden></div>
<div class="d-row"><button class="d-no" id="dfv_pb" disabled aria-pressed="false">Proportions</button></div>
<div class="d-row"><button class="d-no" id="dfv_ann">Annuler</button><button class="d-go" id="dfv_ok" disabled>Enregistrer la photo</button></div>
<details><summary>Ce que fait cet outil (essai)</summary>L’IA cherche ce qu’un filtre a <b>dessiné</b> sur la photo (museau, moustaches, oreilles, nez de clown, autocollants, lunettes, couronne…), l’efface, puis reconstruit la peau et le visage en dessous. Ce qui est reconstruit est <b>inventé</b> (plausible, pas retrouvé) : la carte rose le montre. Les gros yeux, le nez ou le visage affinés ne se mesurent pas de façon fiable automatiquement : « Proportions » permet de les corriger toi-même, en comparant avec une photo de toi sans filtre (elle reste sur ton téléphone). Le lissage et le maquillage ne sont pas encore retirés. Le calcul se fait sur ton téléphone.</details></footer>`;
    document.body.appendChild(d);
    const st = d.querySelector("#dfv_st"), av = d.querySelector("#dfv_av"), li = d.querySelector("#dfv_li");
    const pos = e => { const r = st.getBoundingClientRect(), p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); av.style.clipPath = "inset(0 0 0 " + p * 100 + "%)"; li.style.left = p * 100 + "%" };
    st.addEventListener("pointerdown", e => { pos(e); st.setPointerCapture(e.pointerId) }); st.addEventListener("pointermove", e => { if (e.buttons) pos(e) });
    d.querySelector("#dfv_cb").onclick = e => e.currentTarget.setAttribute("aria-pressed", d.classList.toggle("carte"));
    d.querySelector("#dfv_x").onclick = d.querySelector("#dfv_ann").onclick = fermer; d.querySelector("#dfv_ok").onclick = enregistrer;
    d.querySelector("#dfv_pb").onclick = e => { const p = d.querySelector("#dfv_pr"); p.hidden = !p.hidden; e.currentTarget.setAttribute("aria-pressed", !p.hidden) };
    for (const [i, o] of [["ky", "oy"], ["kn", "on"], ["kb", "ob"]]) d.querySelector("#dfv_" + i).oninput = e => { d.querySelector("#dfv_" + o).textContent = e.target.value + " %"; clearTimeout(ui.t); ui.t = setTimeout(apercu, 80) };
    d.querySelector("#dfv_raz").onclick = () => { for (const [i, o] of [["ky", "oy"], ["kn", "on"], ["kb", "ob"]]) { d.querySelector("#dfv_" + i).value = 100; d.querySelector("#dfv_" + o).textContent = "100 %" } apercu() };
    d.querySelector("#dfv_ref").onclick = () => d.querySelector("#dfv_fr").click();
    d.querySelector("#dfv_fr").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; const im = d.querySelector("#dfv_rv"); if (im.src) URL.revokeObjectURL(im.src); im.src = URL.createObjectURL(f); im.hidden = false };
    return d;
  }
  let E = null;
  const MSG = (t, f) => { $("#dfv_msg").textContent = t || ""; $("#dfv_bar i").style.width = f == null ? "0" : Math.round(100 * f) + "%" };
  const dessiner = (id, c) => { const x = $(id); x.width = c.width; x.height = c.height; x.getContext("2d").drawImage(c, 0, 0) };
  async function ouvrir(file) {
    const d = ui(); d.hidden = false; d.classList.remove("carte"); ["#dfv_ok", "#dfv_cb", "#dfv_pb"].forEach(s => $(s).disabled = true); $("#dfv_pr").hidden = true; $("#dfv_raz").onclick && $("#dfv_raz").onclick();
    const url = URL.createObjectURL(file), im = new Image(); E = { nom: (file.name || "photo").replace(/\.[^.]+$/, "") };
    try {
      im.src = url; await im.decode(); const c = toile(im.naturalWidth, im.naturalHeight); c.getContext("2d").drawImage(im, 0, 0);
      dessiner("#dfv_ap", c); dessiner("#dfv_av", c); dessiner("#dfv_ca", toile(c.width, c.height));
      const r = await retirer(c, { onProgress: (t, f) => MSG(t, f) }); if (!E) return; E.r = r;
      dessiner("#dfv_av", r.canvas); dessiner("#dfv_ca", r.carte); MSG(r.journal.join(" "));
      const ok = r.part > 0; ["#dfv_ok", "#dfv_cb"].forEach(s => $(s).disabled = !ok);
      E.f = r.visages.length ? r.visages.reduce((a, v) => (v.w * v.h > a.w * a.h ? v : a)) : null; $("#dfv_pb").disabled = !E.f;
      if (E.f) { $("#dfv_ok").disabled = false; const e = Math.min(1, 900 / Math.max(r.canvas.width, r.canvas.height)); E.e = e; E.mini = toile(Math.round(r.canvas.width * e), Math.round(r.canvas.height * e)); E.mini.getContext("2d").drawImage(r.canvas, 0, 0, E.mini.width, E.mini.height); E.fm = { pts: E.f.pts.map(v => v * e) } }
      try { if (window.REC && REC.log) REC.log("dfv", { visages: r.visages.length, part: +r.part.toFixed(4), ms: r.ms }) } catch (e) {}
    } catch (e) {
      if (window.STUDIO && !STUDIO.granted("modele")) return MSG("Téléchargement du modèle non autorisé : rien n’a été envoyé ni modifié. Tu peux l’autoriser dans ⚙️ Paramètres, puis relancer.");
      const x = window.MODELS && MODELS.explain ? MODELS.explain(e) : null;
      MSG("Impossible de retirer le filtre : " + (x ? x.texte + " " + x.solution : (e && e.message) || e) + " La photo d’origine n’a pas été modifiée.");
    } finally { URL.revokeObjectURL(url) }
  }
  const coeffs = () => ({ yeux: +$("#dfv_ky").value / 100, nez: +$("#dfv_kn").value / 100, bas: +$("#dfv_kb").value / 100 });
  function apercu() { if (!E || !E.mini) return; const k = coeffs(), c = deformer(E.mini, E.fm, k), v = $("#dfv_av"); v.width = E.r.canvas.width; v.height = E.r.canvas.height; v.getContext("2d").drawImage(c, 0, 0, v.width, v.height);
    MSG(k.yeux === 1 && k.nez === 1 && k.bas === 1 ? E.r.journal.join(" ") : `Proportions : yeux ${Math.round(k.yeux * 100)} %, nez ${Math.round(k.nez * 100)} %, bas du visage ${Math.round(k.bas * 100)} %. Compare avec ta photo sans filtre, puis enregistre.`) }
  function fermer() { E = null; const d = $("#dfv"); if (d) d.hidden = true }
  async function enregistrer() {
    if (!E || !E.r) return; const c = E.f ? deformer(E.r.canvas, E.f, coeffs()) : E.r.canvas; let b = await new Promise(r => c.toBlob(r, "image/jpeg", .95)); const n = E.nom + "-sans-filtre";
    try { if (window.MARQUAGE) b = await MARQUAGE.marquer(b, { outil: "RetoucheProAI " + (typeof VER !== "undefined" ? VER : ""), modele: "détecteur RetoucheProAI + MI-GAN + GFPGAN" }) } catch (e) {}
    if (typeof shareBlob === "function") return shareBlob(b, typeof uniqName === "function" ? uniqName(n, "jpg") : n + ".jpg");
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = n + ".jpg"; a.click();
  }
  return { retirer, deformer, ouvrir, fermer, charger, liberer, cadrage, repere, R, ID };
})();
