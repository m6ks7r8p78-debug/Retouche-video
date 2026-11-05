/* ===== Caméra virtuelle (v6.0, essai) =====
   Idée : au lieu d'« embellir » l'image d'un bloc, on reconnaît l'appareil qui a filmé, on mesure les défauts de chacune de ses couches
   et on les défait dans l'ordre inverse de leur apparition :
     traitement interne (compression) → capteur (bruit) → objectif (franges colorées, coins sombres, flou)
   puis le rendu de référence de l'app (lumière, couleurs, protection des blancs) « refilme » la scène.
   - CAM.lire(fichier)  : fiche d'identité (marque, modèle, année, format, codec, débit) lue dans le fichier, sans l'envoyer nulle part ;
   - CAM.mesurer(...)   : mesures de l'objectif sur quelques images (fonctions pures, testées dans tests/camera.test.mjs) ;
   - CAM.reglages()     : ce que la passe « objectif » du rendu applique (uniforms du shader FSL d'index.html).
   Rien n'est appliqué si la case « Caméra virtuelle » est décochée : le rendu habituel reste strictement identique. */
var CAM = (() => {
  const S = { fiche: null, lens: null, file: null, busy: false };
  let actif = false;
  try { actif = localStorage.getItem("o_cam") === "1" } catch (e) {}

  /* ---------- 1. Fiche d'identité : lecture des métadonnées du fichier ---------- */
  const td = new TextDecoder("utf-8"), tl = new TextDecoder("latin1");
  const u32 = (b, p) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
  const u16 = (b, p) => (b[p] << 8) | b[p + 1];
  const typ = (b, p) => String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
  const clean = s => String(s || "").replace(/\0/g, "").replace(/[\x00-\x1f]/g, " ").trim().slice(0, 60);
  const CONT = new Set(["moov", "trak", "mdia", "minf", "stbl", "udta", "edts", "dinf"]);

  /* chaîne d'un atome QuickTime « ©xxx » : soit [longueur 2 o][langue 2 o][texte], soit un atome « data » (style iTunes) */
  function qtStr(b, p, end) {
    if (end - p >= 16 && typ(b, p + 4) === "data") return clean(td.decode(b.subarray(p + 16, Math.min(end, p + u32(b, p)))));
    const n = u16(b, p); if (n > 0 && p + 4 + n <= end) return clean(td.decode(b.subarray(p + 4, p + 4 + n)));
    return clean(td.decode(b.subarray(p, end)));
  }

  /* parcourt les atomes d'un MP4 / MOV / 3GP et remplit o */
  function walk(b, p, end, o, path) {
    while (p + 8 <= end) {
      let sz = u32(b, p); const t = typ(b, p + 4); let h = 8;
      if (sz === 1) { if (p + 16 > end) break; sz = u32(b, p + 8) * 4294967296 + u32(b, p + 12); h = 16 }
      else if (sz === 0) sz = end - p;
      if (sz < h || p + sz > end) break;
      const s = p + h, e = p + sz;
      if (CONT.has(t)) walk(b, s, e, o, path.concat(t));
      else if (t === "meta") {
        /* ISO : 4 octets de version avant les enfants ; QuickTime : enfants directement */
        const iso = typ(b, s + 4) !== "hdlr";
        walk(b, iso ? s + 4 : s, e, o, path.concat(t));
      }
      else if (t === "keys") {
        const n = u32(b, s + 4); let q = s + 8; o._keys = [];
        for (let i = 0; i < n && q + 8 <= e; i++) { const l = u32(b, q); o._keys.push(clean(tl.decode(b.subarray(q + 8, q + l)))); q += l }
      }
      else if (t === "ilst") {
        let q = s;
        while (q + 8 <= e) {
          const l = u32(b, q), idx = u32(b, q + 4), k = o._keys && o._keys[idx - 1];
          if (l < 8) break;
          if (k && q + 24 <= q + l && typ(b, q + 12) === "data") {
            const val = clean(td.decode(b.subarray(q + 24, q + l)));
            if (/make$/i.test(k)) o.marque = o.marque || val;
            else if (/model$/i.test(k)) o.modele = o.modele || val;
            else if (/software$/i.test(k)) o.logiciel = o.logiciel || val;
            else if (/creationdate$/i.test(k)) o.date = o.date || val;
            else if (/android\.version$/i.test(k)) o.android = val;
            else if (/manufacturer$/i.test(k)) o.marque = o.marque || val;
          }
          q += l;
        }
      }
      else if (t === "mvhd") {
        const v = b[s], c = v === 1 ? u32(b, s + 4) * 4294967296 + u32(b, s + 8) : u32(b, s + 4);
        if (c > 2082844800 + 315532800 /* après 1980 */) o.creation = new Date((c - 2082844800) * 1000).toISOString();
      }
      else if (t === "tkhd") {
        const v = b[s], q = s + (v === 1 ? 88 : 76), W = u32(b, q) / 65536, H = u32(b, q + 4) / 65536;
        if (W > 0 && H > 0 && !o._w) { o._w = Math.round(W); o._h = Math.round(H) }
      }
      else if (t === "hdlr") { if (path.includes("mdia")) o._hd = typ(b, s + 8) }
      else if (t === "stsd" && o._hd === "vide" && !o.codec) o.codec = typ(b, s + 12);
      else if (path.includes("udta")) {
        if (t === "\xa9mak" || t === "manu") o.marque = o.marque || qtStr(b, s, e);
        else if (t === "\xa9mod" || t === "modl") o.modele = o.modele || qtStr(b, s, e);
        else if (t === "\xa9swr" || t === "\xa9too") o.logiciel = o.logiciel || qtStr(b, s, e);
        else if (t === "\xa9day") o.date = o.date || qtStr(b, s, e);
      }
      p = e;
    }
  }

  async function bytes(f, a, z) { return new Uint8Array(await f.slice(a, z).arrayBuffer()) }

  /* AVI (appareils photo compacts, vieux caméscopes numériques) : en-têtes RIFF au début du fichier */
  function avi(b, o) {
    const s = tl.decode(b);
    const strh = s.indexOf("strh"); if (strh > 0) { const c = s.substr(strh + 12, 4); if (/[A-Za-z0-9]{3}/.test(c)) o.codec = c.trim() }
    const av = s.indexOf("avih"); if (av > 0) { o._w = u32le(b, av + 40); o._h = u32le(b, av + 44) }
    const id = s.indexOf("IDIT"); if (id > 0) o.date = clean(s.substr(id + 8, u32le(b, id + 4)));
    const sf = s.indexOf("ISFT"); if (sf > 0) o.logiciel = clean(s.substr(sf + 8, u32le(b, sf + 4)));
    const mk = s.indexOf("IMAK"); if (mk > 0) o.marque = clean(s.substr(mk + 8, u32le(b, mk + 4)));
  }
  const u32le = (b, p) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;

  async function lire(f) {
    const o = { ext: ((f && f.name || "").split(".").pop() || "").toLowerCase().slice(0, 5), taille_mo: f ? +(f.size / 1048576).toFixed(1) : 0 };
    if (!f) return o;
    try {
      const head = await bytes(f, 0, Math.min(f.size, 1 << 20));
      if (typ(head, 0) === "RIFF" && typ(head, 8) === "AVI ") { o.format = "AVI"; avi(head, o) }
      else if (typ(head, 4) === "ftyp") {
        o.format = typ(head, 8).trim();
        /* boîtes de premier niveau : on va chercher « moov » où qu'il soit (début ou fin du fichier) */
        let p = 0, guard = 0;
        while (p + 8 <= f.size && guard++ < 64) {
          const hb = p + 16 <= head.length ? head.subarray(p, p + 16) : await bytes(f, p, Math.min(f.size, p + 16));
          let sz = u32(hb, 0); const t = typ(hb, 4);
          if (sz === 1) sz = u32(hb, 8) * 4294967296 + u32(hb, 12); else if (sz === 0) sz = f.size - p;
          if (sz < 8) break;
          if (t === "moov") { const m = sz <= 32 << 20 ? await bytes(f, p, p + sz) : null; if (m) walk(m, 8, m.length, o, ["moov"]); break }
          if (t === "udta" || t === "meta") { const m = await bytes(f, p, Math.min(f.size, p + Math.min(sz, 1 << 20))); walk(m, 0, m.length, o, []) }
          p += sz;
        }
      } else if (head[0] === 0x47 && head[188] === 0x47 || head[4] === 0x47 && head[196] === 0x47) o.format = "MPEG-TS";
    } catch (e) { o.erreur = String(e && e.message || e).slice(0, 80) }
    delete o._keys; delete o._hd;
    return o;
  }

  /* année : date de l'appareil si elle est plausible, sinon date de création du fichier */
  function annee(o) {
    for (const d of [o.date, o.creation]) { const m = String(d || "").match(/(19[89]\d|20[0-4]\d)/); if (m) return +m[1] }
    return null;
  }

  /* famille d'appareil : d'après le format, le codec, la définition et la marque */
  function famille(o, w, h) {
    const W = Math.max(w || o._w || 0, h || o._h || 0), H = Math.min(w || o._w || 0, h || o._h || 0);
    const mk = (o.marque || "").toLowerCase(), fmt = (o.format || "").toLowerCase(), cod = (o.codec || "").toLowerCase();
    if (fmt.startsWith("3g") || o.ext === "3gp" || o.ext === "3g2") return { id: "tel_3gp", nom: "Téléphone ancien (format 3GP)", periode: "2003–2011" };
    if (o.format === "MPEG-TS" || o.ext === "mts" || o.ext === "m2ts") return { id: "camescope", nom: "Caméscope (AVCHD)", periode: "2006–2015" };
    if (o.format === "AVI" || cod === "mjpg" || cod === "jpeg" || cod === "mjpa") return { id: "compact", nom: "Appareil photo compact (vidéo MJPEG)", periode: "2000–2012" };
    if (mk.includes("apple")) return { id: "iphone", nom: o.modele ? o.modele : "iPhone", periode: "" };
    if (mk.includes("canon") || mk.includes("nikon") || mk.includes("sony") && !o.android || mk.includes("panasonic") || mk.includes("olympus") || mk.includes("fuji") || mk.includes("kodak"))
      return { id: "appareil_photo", nom: "Appareil photo " + (o.marque || ""), periode: "" };
    if (mk || o.android) return { id: "smartphone", nom: "Smartphone " + (o.marque || "Android"), periode: "" };
    if (cod === "mp4v" || cod === "s263" || cod === "h263") return { id: "tel_ancien", nom: "Téléphone ancien (MPEG-4)", periode: "2005–2012" };
    if (W && W <= 352) return { id: "tel_ancien", nom: "Appareil ancien (très petite définition)", periode: "avant 2010" };
    if (W && W <= 640) return { id: "ancien", nom: "Appareil ancien (définition VGA)", periode: "2005–2012" };
    if (W && W <= 1280 && H <= 720) return { id: "hd", nom: "Smartphone ou appareil HD", periode: "2010–2016" };
    return { id: "inconnu", nom: "Appareil non reconnu", periode: "" };
  }

  /* ---------- 2. Mesures de l'objectif (fonctions pures sur des tableaux de pixels) ---------- */
  /* rayon normalisé : 0 au centre, 1 dans les coins, en pixels réels (pas en proportion de l'image) */
  function rayon(W, H) { const R = .5 * Math.hypot(W, H), cx = (W - 1) / 2, cy = (H - 1) / 2; return (i, j) => Math.hypot(i - cx, j - cy) / R }

  /* coins sombres : luminance des coins rapportée à celle du centre ; modèle L(r) = L0 / (1 + vg·r²) */
  function vignetage(f) {
    const { W, H, y } = f, r = rayon(W, H); let c = 0, nc = 0, k = 0, nk = 0;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const v = y[j * W + i], q = r(i, j);
      if (v < 8 || v > 247) continue;                  /* noirs et blancs brûlés : pas d'information */
      if (q < .3) { c += v; nc++ } else if (q > .85) { k += v; nk++ }
    }
    if (nc < 50 || nk < 50) return null;
    return (k / nk) / (c / nc);                         /* < 1 : coins plus sombres */
  }

  /* passe-haut (laplacien 3×3) d'un canal */
  function hp(ch, W, H) {
    const o = new Float32Array(W * H);
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) { const k = j * W + i; o[k] = 4 * ch[k] - ch[k - 1] - ch[k + 1] - ch[k - W] - ch[k + W] }
    return o;
  }
  const bil = (a, W, H, x, y) => {
    if (x < 0 || y < 0 || x > W - 2 || y > H - 2) return NaN;
    const i = x | 0, j = y | 0, fx = x - i, fy = y - j, k = j * W + i;
    return (a[k] * (1 - fx) + a[k + 1] * fx) * (1 - fy) + (a[k + W] * (1 - fx) + a[k + W + 1] * fx) * fy;
  };

  /* franges colorées (aberration chromatique latérale) : le rouge et le bleu sont légèrement agrandis ou réduits par rapport au vert.
     On cherche l'échelle qui superpose le mieux leurs contours à ceux du vert, sur les bords forts de la moitié extérieure de l'image. */
  function franges(f) {
    const { W, H, d } = f, n = W * H, R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0, k = 0; k < n; i += 4, k++) { R[k] = d[i]; G[k] = d[i + 1]; B[k] = d[i + 2] }
    const hR = hp(R, W, H), hG = hp(G, W, H), hB = hp(B, W, H), r = rayon(W, H), cx = (W - 1) / 2, cy = (H - 1) / 2;
    /* bords les plus marqués de la moitié extérieure (seuil relatif : une image floue a des contours faibles mais exploitables) */
    const cand = [];
    for (let j = 3; j < H - 3; j++) for (let i = 3; i < W - 3; i++) { const k = j * W + i; if (r(i, j) > .45) cand.push(Math.abs(hG[k])) }
    if (cand.length < 500) return null;
    cand.sort((p, q) => q - p);
    const thr = Math.max(4, cand[Math.floor(cand.length * .04)]);
    const pts = [];
    for (let j = 3; j < H - 3; j++) for (let i = 3; i < W - 3; i++) { const k = j * W + i; if (r(i, j) > .45 && Math.abs(hG[k]) >= thr) pts.push(k) }
    if (pts.length < 60) return null;
    /* ressemblance = corrélation entre le canal décalé et le vert : insensible à la couleur propre des objets (un contour rouge sur gris
       a un saut plus fort en rouge qu'en vert, mais au même endroit) */
    const corr = (hX, s) => { let xy = 0, xx = 0, yy = 0, m = 0;
      for (const k of pts) { const i = k % W, j = (k / W) | 0, a = bil(hX, W, H, cx + (i - cx) * (1 + s), cy + (j - cy) * (1 + s)); if (a !== a) continue; const g = hG[k]; xy += a * g; xx += a * a; yy += g * g; m++ }
      return m > 30 && xx > 0 ? xy / Math.sqrt(xx * yy) : NaN };
    const best = hX => { let bs = 0, bc = corr(hX, 0); const c0 = bc;
      for (let s = -.006; s <= .0061; s += .0005) { const c = corr(hX, s); if (c > bc) { bc = c; bs = s } }
      for (let s = bs - .0005; s <= bs + .00051; s += .0001) { const c = corr(hX, s); if (c > bc) { bc = c; bs = s } }
      /* gain : part de l'écart restant (1 − corrélation) supprimée par le décalage */
      return { s: +bs.toFixed(4), gain: c0 < 1 ? +((bc - c0) / (1 - c0)).toFixed(3) : 0 } };
    /* étalonnage : dans une vidéo compressée, le rouge et le bleu sont en partie reconstruits à partir de la luminance (couleur stockée
       en demi-définition) ; le décalage mesuré ne se corrige donc pas « 1 pour 1 ». On essaie la correction sur l'image elle-même,
       on remesure, et on retient la correction qui ramène la frange mesurée à zéro (méthode de la sécante, deux essais). */
    const shift = (X, c) => { const o = new Float32Array(n);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const a = bil(X, W, H, cx + (i - cx) * (1 + c), cy + (j - cy) * (1 + c)); o[j * W + i] = a === a ? a : X[j * W + i] }
      return o };
    const cal = (X, b0) => {
      let c = b0.s; if (!c) return b0;
      for (let it = 0; it < 2; it++) {
        const res = best(hp(shift(X, c), W, H)).s;           /* frange restante après correction c */
        if (Math.abs(res) < .00025) break;
        const nc = c + res * (c / (b0.s - res || c));         /* sécante entre (0 → mesure) et (c → reste) */
        if (!(Math.abs(nc) <= Math.abs(b0.s) * 1.2) || Math.sign(nc) !== Math.sign(b0.s)) break;
        c = nc;
      }
      return { s: +c.toFixed(4), gain: b0.gain, mesure: b0.s } };
    return { r: cal(R, best(hR)), b: cal(B, best(hB)), n: pts.length };
  }

  /* flou de l'objectif : largeur 10–90 % des contours nets, mesurée le long du gradient, en pixels de la vidéo d'origine.
     Pour un flou gaussien de rayon σ, cette largeur vaut ≈ 2,56 σ. */
  function flou(f) {
    const { W, H, y } = f, n = W * H, gx = new Float32Array(n), gy = new Float32Array(n), gm = new Float32Array(n);
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const k = j * W + i;
      const a = -y[k - W - 1] - 2 * y[k - 1] - y[k + W - 1] + y[k - W + 1] + 2 * y[k + 1] + y[k + W + 1];
      const b = -y[k - W - 1] - 2 * y[k - W] - y[k - W + 1] + y[k + W - 1] + 2 * y[k + W] + y[k + W + 1];
      gx[k] = a; gy[k] = b; gm[k] = Math.hypot(a, b);
    }
    /* seuil : les 1 % de pixels au plus fort gradient, et au moins un vrai contour */
    const s = Array.from(gm).filter(x => x > 0).sort((p, q) => q - p); if (s.length < 200) return null;
    const thr = Math.max(60, s[Math.floor(s.length * .01)]);
    const ws = [];
    for (let j = 9; j < H - 9 && ws.length < 1500; j += 2) for (let i = 9; i < W - 9; i += 2) {
      const k = j * W + i, g = gm[k]; if (g < thr) continue;
      const ux = gx[k] / g, uy = gy[k] / g;
      if (gm[k] < bil(gm, W, H, i + ux, j + uy) || gm[k] < bil(gm, W, H, i - ux, j - uy)) continue; /* sommet du contour seulement */
      /* profil de luminance le long du gradient, sur ±8 pixels */
      const pr = []; for (let t = -8; t <= 8.01; t += .25) pr.push(bil(y, W, H, i + ux * t, j + uy * t));
      if (pr.some(v => v !== v)) continue;
      const N = pr.length, mean = (p, q) => { let m = 0; for (let x = p; x < q; x++) m += pr[x]; return m / (q - p) };
      const rng = (p, q) => { let mn = 1e9, mx = -1e9; for (let x = p; x < q; x++) { mn = Math.min(mn, pr[x]); mx = Math.max(mx, pr[x]) } return mx - mn };
      /* paliers de part et d'autre : un vrai contour isolé (une barre fine ou deux contours proches donneraient une largeur trop courte) */
      const lo = mean(0, 6), hi = mean(N - 6, N), c = hi - lo; if (c < 25) continue;
      if (rng(0, 12) > .12 * c || rng(N - 12, N) > .12 * c) continue;
      let mono = true; for (let q = 1; q < N; q++) if (pr[q] < pr[q - 1] - .05 * c) { mono = false; break }
      if (!mono) continue;
      let a = -1, z = -1;
      for (let q = 0; q < N; q++) { if (a < 0 && pr[q] >= lo + .1 * c) a = q; if (z < 0 && pr[q] >= lo + .9 * c) { z = q; break } }
      if (a < 0 || z < 0) continue;
      ws.push((z - a) * .25);
    }
    if (ws.length < 40) return null;      /* trop peu de contours nets (scène douce, dessin) : pas de mesure plutôt qu'une mesure fausse */
    ws.sort((p, q) => p - q);
    /* le quart le plus net : ce sont les contours vraiment nets de la scène (les autres sont flous par la profondeur ou le bougé) */
    const w = ws[Math.floor(ws.length * .3)];
    return { largeur: +w.toFixed(2), sigma: +(w / 2.56).toFixed(2), n: ws.length };
  }

  const med = a => { const b = a.filter(x => x != null && x === x).sort((p, q) => p - q); return b.length ? b[b.length >> 1] : null };

  /* regroupe les mesures de plusieurs images en réglages prudents */
  function synthese(vg, fr, fl, ctx) {
    ctx = ctx || {};
    const L = { ca: [0, 0], vg: 0, sig: 0, k: 0, notes: [] };
    /* coins sombres : corrigé seulement si la majorité des images le montrent (une scène peut être sombre sur les bords sans que l'objectif y soit pour rien) */
    const v = vg.filter(x => x != null);
    if (v.length >= 3) {
      const m = med(v), share = v.filter(x => x < .93).length / v.length;
      if (m < .9 && share >= .7) { L.vg = +Math.min(.45, Math.max(0, (1 / m - 1) / .85 * .75)).toFixed(3); L.notes.push("coins plus sombres de " + Math.round((1 - m) * 100) + " %") }
    }
    /* franges : échelle médiane, gardée seulement si elle améliore nettement la superposition et reste stable d'une image à l'autre */
    const F = fr.filter(Boolean);
    if (F.length >= 2) {
      for (const [c, i] of [["r", 0], ["b", 1]]) {
        const s = F.map(x => x[c].s), g = med(F.map(x => x[c].gain)), m = med(s), spread = Math.max(...s) - Math.min(...s);
        if (Math.abs(m) >= .0006 && g > .04 && spread <= .002) L.ca[i] = m;
      }
      if (L.ca[0] || L.ca[1]) L.notes.push("franges colorées sur les bords");
    }
    /* flou : σ médian ; la correction se dose selon le bruit et les blocs (un débruitage ne doit pas être défait par une netteté trop forte) */
    const sg = med(fl.filter(Boolean).map(x => x.sigma));
    if (sg != null) {
      L.sig = +Math.max(.6, Math.min(2.5, sg)).toFixed(2);
      let k = .9 * Math.max(0, Math.min(1, (sg - .65) / 1.1));
      if (ctx.bruit != null) k *= 1 - Math.max(0, Math.min(.5, (ctx.bruit - 1.2) / 3));
      if (ctx.blocs != null) k *= 1 - Math.max(0, Math.min(.5, (ctx.blocs - 1.08) * 1.5));
      L.k = +k.toFixed(3);
      if (L.k > .1) L.notes.push("objectif un peu flou (" + sg.toFixed(1) + " px)");
    }
    return L;
  }

  /* ---------- 3. Analyse d'une vidéo dans l'app (utilise AZ / seekEl d'index.html) ---------- */
  async function analyser(el, file, ctx) {
    if (S.busy) return S.lens;
    S.busy = true;
    try {
      const fiche = await lire(file);
      const [w, h] = [el.videoWidth || el.naturalWidth || 0, el.videoHeight || el.naturalHeight || 0];
      fiche.definition = w + "×" + h;
      fiche.annee = annee(fiche);
      const fam = famille(fiche, w, h); fiche.famille = fam.id; fiche.nom = fam.nom; fiche.periode = fam.periode;
      const dur = el.duration || 0;
      if (dur > 0 && dur < 1e5 && file && file.size) fiche.debit_kbps = Math.round(file.size * 8 / dur / 1000);
      S.fiche = fiche; S.file = file;
      /* 6 images réparties dans la vidéo (en évitant le tout début et la toute fin, souvent noirs ou flous) */
      const T = dur > 0 && isFinite(dur) ? [.12, .27, .42, .57, .72, .87].map(x => x * dur) : [0];
      const vg = [], fr = [], fl = [];
      const cvs = document.createElement("canvas"), x = cvs.getContext("2d", { willReadFrequently: true });
      for (const t of T) {
        if (ctx && ctx.cancel && ctx.cancel()) return null;
        if (dur > 0) await AZ.seek(el, t);
        /* coins sombres et franges : image réduite à 480 px (assez pour des écarts de 0,05 %) */
        const W = Math.min(480, w), H = Math.max(8, Math.round(W * h / w));
        cvs.width = W; cvs.height = H; x.drawImage(el, 0, 0, W, H);
        const d = x.getImageData(0, 0, W, H).data, y = new Float32Array(W * H);
        for (let i = 0, k = 0; i < d.length; i += 4, k++) y[k] = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
        vg.push(vignetage({ W, H, y }));
        fr.push(franges({ W, H, d }));
        /* flou : centre de l'image en définition d'origine (le flou se mesure en vrais pixels) */
        const cw = Math.min(w, 640), ch = Math.min(h, 640), sx = (w - cw) >> 1, sy = (h - ch) >> 1;
        cvs.width = cw; cvs.height = ch; x.drawImage(el, sx, sy, cw, ch, 0, 0, cw, ch);
        const d2 = x.getImageData(0, 0, cw, ch).data, y2 = new Float32Array(cw * ch);
        for (let i = 0, k = 0; i < d2.length; i += 4, k++) y2[k] = .299 * d2[i] + .587 * d2[i + 1] + .114 * d2[i + 2];
        fl.push(flou({ W: cw, H: ch, y: y2 }));
      }
      const L = synthese(vg, fr, fl, ctx);
      L.mesures = { coins: vg.map(v => v == null ? null : +v.toFixed(3)), franges: fr.map(f => f && [f.r.s, f.b.s]), flou: fl.map(f => f && f.sigma) };
      S.lens = L;
      return L;
    } finally { S.busy = false }
  }

  /* ---------- 4. Ce que le rendu applique ---------- */
  function on() { return actif && !!S.lens && S.file === (typeof curFile !== "undefined" ? curFile : S.file) }
  function reglages() {
    const L = S.lens; if (!on() || !L) return null;
    return L;
  }
  /* part de la netteté classique (FSB) gardée quand le flou de l'objectif est corrigé par la passe dédiée : on n'empile pas deux netteté */
  function partNettete() { const L = S.lens; return on() && L && L.k > .1 ? Math.max(.45, 1 - L.k * .6) : 1 }
  function setActif(v) { actif = !!v; try { localStorage.setItem("o_cam", actif ? "1" : "0") } catch (e) {} }

  /* texte de la fiche affichée dans l'app */
  function texte() {
    const f = S.fiche, L = S.lens; if (!f) return "";
    const id = [f.marque && f.modele ? f.marque + " " + f.modele : f.nom, f.annee ? "(" + f.annee + ")" : f.periode ? "(" + f.periode + ")" : ""].join(" ").trim();
    const tech = [f.definition, f.codec && f.codec.trim(), f.debit_kbps ? Math.round(f.debit_kbps) + " kb/s" : ""].filter(Boolean).join(" · ");
    const def = L && L.notes.length ? L.notes.join(", ") : "aucun défaut d'objectif net mesuré";
    return { id, tech, def };
  }
  /* fiche envoyée avec le diagnostic : des nombres et des noms d'appareil, jamais de nom de fichier ; la date est réduite à l'année */
  function diag() {
    const f = S.fiche || {}, L = S.lens || {};
    return { appareil: { famille: f.famille, marque: f.marque || null, modele: f.modele || null, annee: f.annee || null, format: f.format || null, codec: f.codec || null, definition: f.definition, debit_kbps: f.debit_kbps || null, ext: f.ext },
      objectif: { coins: L.vg, franges: L.ca, flou_sigma: L.sig, correction_flou: L.k, mesures: L.mesures }, actif };
  }

  return { lire, annee, famille, vignetage, franges, flou, synthese, analyser, on, reglages, partNettete, setActif, actif: () => actif, texte, diag, S };
})();
if (typeof module !== "undefined") module.exports = CAM;
