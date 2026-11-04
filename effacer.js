/* ===== Effacer une zone (v3.3) — reconstruction générative MI-GAN =====
   - Modèle : MI-GAN 512 Places2, « pipeline ONNX v2 » publié par l'auteur (Picsart AI Research, code et poids sous licence MIT).
     Téléchargé une seule fois (28 Mo, adresse figée, empreinte SHA-256 vérifiée par le gestionnaire de modèles), puis exécuté
     sur le téléphone par ONNX Runtime Web (WebAssembly). Aucune image ne quitte l'appareil.
   - L'original n'est jamais modifié : on travaille sur une copie. Hors de la zone peinte (légèrement élargie), chaque pixel
     du résultat est recopié tel quel de l'image d'avant (garanti au pixel près).
   - Chaque pixel inventé est noté dans une carte (« zones inventées ») : visible, exportable, et décrite dans une fiche de
     provenance. L'IA ne retrouve pas ce qui était caché : elle invente un remplissage plausible. */
var ERASE = (() => {
  const MODEL = "migan";
  const MAXPX = 16000000;                 /* au-delà, Safari refuse les grandes zones de dessin : la photo est réduite (dit à l'écran) */
  const MAPPX = 2000000;                  /* taille de la carte affichée (la carte exportée est en pleine taille) */
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  /* ---------- outils purs (testés par tests/effacer.test.mjs) ---------- */
  /* zone de travail : la photo entière si elle tient, sinon réduite (proportions gardées) */
  function fit(w, h, max = MAXPX) { if (w * h <= max) return { w, h, k: 1 }; const k = Math.sqrt(max / (w * h)); return { w: Math.max(1, Math.floor(w * k)), h: Math.max(1, Math.floor(h * k)), k } }
  /* élargit la zone peinte de r pixels (carré, en deux passes séparées) : couvre le liseré autour d'un objet */
  function dilate(m, w, h, r) {
    if (r <= 0) return m.slice();
    const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) { const b = y * w; let last = -1e9; for (let x = 0; x < w; x++) { if (m[b + x]) last = x; if (x - last <= r) t[b + x] = 1 } last = 1e9; for (let x = w - 1; x >= 0; x--) { if (m[b + x]) last = x; if (last - x <= r) t[b + x] = 1 } }
    for (let x = 0; x < w; x++) { let last = -1e9; for (let y = 0; y < h; y++) { if (t[y * w + x]) last = y; if (y - last <= r) o[y * w + x] = 1 } last = 1e9; for (let y = h - 1; y >= 0; y--) { if (t[y * w + x]) last = y; if (last - y <= r) o[y * w + x] = 1 } }
    return o;
  }
  /* rectangle englobant des pixels à 1 (null si vide) */
  function bbox(m, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) { const b = y * w; for (let x = 0; x < w; x++) if (m[b + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y } }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  /* contexte donné au modèle : la zone + une marge (au moins 96 px, sinon la moitié de la zone), dans l'image */
  function context(b, W, H) {
    const pad = Math.max(96, Math.round(Math.max(b.w, b.h) * 0.5));
    const x0 = Math.max(0, b.x - pad), y0 = Math.max(0, b.y - pad), x1 = Math.min(W, b.x + b.w + pad), y1 = Math.min(H, b.y + b.h + pad);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  /* rgba (canvas) -> tenseurs uint8 du modèle : image CHW, masque 255 = garder / 0 = à reconstruire */
  function tensors(rgba, hole, n) {
    const img = new Uint8Array(3 * n), msk = new Uint8Array(n);
    for (let i = 0; i < n; i++) { img[i] = rgba[i * 4]; img[n + i] = rgba[i * 4 + 1]; img[2 * n + i] = rgba[i * 4 + 2]; msk[i] = hole[i] ? 0 : 255 }
    return { img, msk };
  }
  /* sortie CHW du modèle -> pièce RGBA opaque sur la zone, transparente ailleurs (le reste de l'image n'est pas touché) */
  function patch(chw, hole, n) {
    const out = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) if (hole[i]) { out[i * 4] = chw[i]; out[i * 4 + 1] = chw[n + i]; out[i * 4 + 2] = chw[2 * n + i]; out[i * 4 + 3] = 255 }
    return out;
  }
  /* masque basse résolution (logits m×m) -> masque de la photo (w×h), interpolation bilinéaire avant le seuil */
  function upmask(lo, m, w, h) {
    const o = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) { const fy = Math.min(m - 1, Math.max(0, (y + .5) * m / h - .5)), y0 = Math.floor(fy), y1 = Math.min(m - 1, y0 + 1), ay = fy - y0;
      for (let x = 0; x < w; x++) { const fx = Math.min(m - 1, Math.max(0, (x + .5) * m / w - .5)), x0 = Math.floor(fx), x1 = Math.min(m - 1, x0 + 1), ax = fx - x0;
        const v = (lo[y0 * m + x0] * (1 - ax) + lo[y0 * m + x1] * ax) * (1 - ay) + (lo[y1 * m + x0] * (1 - ax) + lo[y1 * m + x1] * ax) * ay; o[y * w + x] = v > 0 ? 1 : 0 } }
    return o;
  }
  /* garde seulement la partie qui contient le point touché (sinon la plus grande), puis bouche les trous intérieurs */
  function clean(m, w, h, px, py) {
    const lab = new Int32Array(w * h), st = []; let id = 0, best = 0, bestN = 0, hit = 0;
    for (let i = 0; i < w * h; i++) { if (!m[i] || lab[i]) continue; id++; let n = 0; st.push(i); lab[i] = id;
      while (st.length) { const j = st.pop(), x = j % w, y = (j - x) / w; n++;
        if (x > 0 && m[j - 1] && !lab[j - 1]) { lab[j - 1] = id; st.push(j - 1) } if (x < w - 1 && m[j + 1] && !lab[j + 1]) { lab[j + 1] = id; st.push(j + 1) }
        if (y > 0 && m[j - w] && !lab[j - w]) { lab[j - w] = id; st.push(j - w) } if (y < h - 1 && m[j + w] && !lab[j + w]) { lab[j + w] = id; st.push(j + w) } }
      if (n > bestN) { bestN = n; best = id } }
    const pi = Math.min(h - 1, Math.max(0, Math.round(py))) * w + Math.min(w - 1, Math.max(0, Math.round(px)));
    hit = lab[pi] || best; if (!hit) return new Uint8Array(w * h);
    const o = new Uint8Array(w * h), out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) o[i] = lab[i] === hit ? 1 : 0;
    /* trous : le fond atteignable depuis le bord reste du fond, le reste est bouché */
    for (let i = 0; i < w * h; i++) { const x = i % w, y = (i - x) / w; if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && !o[i] && !out[i]) { out[i] = 1; st.push(i) } }
    while (st.length) { const j = st.pop(), x = j % w, y = (j - x) / w;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) if (k >= 0 && !o[k] && !out[k]) { out[k] = 1; st.push(k) } }
    for (let i = 0; i < w * h; i++) o[i] = out[i] ? 0 : 1;
    return o;
  }
  /* pose une pièce sur des pixels RGBA : seuls les pixels opaques de la pièce changent */
  function apply(dst, src) { for (let i = 0; i < src.length; i += 4) if (src[i + 3] === 255) { dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = 255 } return dst }

  /* ---------- moteur ---------- */
  let sess = null, loading = null, running = 0;
  function script(src) { return new Promise((ok, ko) => { if (window.ort) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => ko(new Error("moteur introuvable")); document.head.appendChild(s) }) }
  async function load(onP) {
    if (sess) return sess;
    if (!loading) loading = (async () => {
      await MODELS.beforeLoad(MODEL);
      const b = new Uint8Array(await MODELS.bytes(MODEL, { download: true, onProgress: onP }));
      await script("ort/ort.wasm.min.js");
      ort.env.wasm.wasmPaths = new URL("ort/", location.href).href;
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      sess = await ort.InferenceSession.create(b, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
      return sess;
    })().catch(e => { loading = null; throw e });
    return loading;
  }
  async function unload() { const s = sess; sess = null; loading = null; try { if (s && s.release) await s.release() } catch (e) {} }
  /* reconstruit : rgba (w×h) + trou (w×h, 1 = à inventer) -> sortie CHW uint8 */
  async function infer(rgba, hole, w, h, onP) {
    running++;
    try {
      const s = await load(onP), n = w * h, t = tensors(rgba, hole, n);
      const r = await s.run({ image: new ort.Tensor("uint8", t.img, [1, 3, h, w]), mask: new ort.Tensor("uint8", t.msk, [1, 1, h, w]) });
      const o = r[s.outputNames[0]];
      if (!o || o.dims[2] !== h || o.dims[3] !== w) throw new Error("sortie du modèle inattendue");
      return o.data;
    } finally { running-- }
  }
  /* ---------- sélection au toucher (EdgeTAM) ---------- */
  const SEG = { g1: ["modeles/edgetam_encodeur.onnx", "ed068218eba96760fe02d04ce899c449660ac813a088d80ed7f42c8bb01e7cec", "vision_encoder.onnx_data", "edgetam"],
    g2: ["modeles/edgetam_decodeur.onnx", "d3668299ec3edf70fbb139ec642b54bf3d4be453fd1b688a6b5938e0856fe546", "prompt_encoder_mask_decoder.onnx_data", "edgetam_dec"] };
  let enc = null, dec = null, segLoading = null, segRunning = 0;
  async function graph(g) {           /* structure du modèle livrée avec l'app, vérifiée par empreinte comme les poids */
    const r = await fetch(g[0]); if (!r.ok) throw new Error("fichier de l’app manquant : " + g[0]);
    const b = await r.arrayBuffer(); if (await MODELS.sha256(b) !== g[1]) { const e = new Error("empreinte fausse : " + g[0]); e.code = "EMPREINTE"; throw e }
    return new Uint8Array(b);
  }
  async function loadSeg(onP) {
    if (enc && dec) return;
    if (!segLoading) segLoading = (async () => {
      await script("ort/ort.wasm.min.js");
      ort.env.wasm.wasmPaths = new URL("ort/", location.href).href;
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      const mk = async (g, i) => { const d = new Uint8Array(await MODELS.bytes(g[3], { download: true, onProgress: f => onP && onP(i, f) })), gr = await graph(g);
        return ort.InferenceSession.create(gr, { executionProviders: ["wasm"], graphOptimizationLevel: "all", externalData: [{ path: g[2], data: d }] }) };
      if (!enc) enc = await mk(SEG.g1, 1);
      if (!dec) dec = await mk(SEG.g2, 2);
    })().finally(() => { segLoading = null });
    return segLoading;
  }
  async function unloadSeg() { const a = enc, b = dec; enc = dec = null; for (const s of [a, b]) try { if (s && s.release) await s.release() } catch (e) {} }
  /* lit la photo (une fois par état de la photo) : étirée à 1024×1024, normalisée comme à l'entraînement */
  async function embed(src, w, h) {
    const c = document.createElement("canvas"); c.width = c.height = 1024; const x = c.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, w, h, 0, 0, 1024, 1024);
    const d = x.getImageData(0, 0, 1024, 1024).data, n = 1024 * 1024, t = new Float32Array(3 * n), M = [.485, .456, .406], D = [.229, .224, .225];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) t[k * n + i] = (d[i * 4 + k] / 255 - M[k]) / D[k];
    const r = await enc.run({ pixel_values: new ort.Tensor("float32", t, [1, 3, 1024, 1024]) });
    return [r["image_embeddings.0"], r["image_embeddings.1"], r["image_embeddings.2"]];
  }
  /* un toucher -> masque de la photo (1 = élément proposé) ; le point de remplissage (étiquette -1) est exigé par SAM 2 sans rectangle */
  async function segment(emb, px, py, w, h) {
    const r = await dec.run({ input_points: new ort.Tensor("float32", new Float32Array([px * 1024 / w, py * 1024 / h, 0, 0]), [1, 1, 2, 2]),
      input_labels: new ort.Tensor("int64", new BigInt64Array([1n, -1n]), [1, 1, 2]), input_boxes: new ort.Tensor("float32", new Float32Array(0), [1, 0, 4]),
      "image_embeddings.0": emb[0], "image_embeddings.1": emb[1], "image_embeddings.2": emb[2] });
    const iou = r.iou_scores.data, pm = r.pred_masks, m = pm.dims[pm.dims.length - 1]; let b = 0; for (let i = 1; i < 3; i++) if (iou[i] > iou[b]) b = i;
    const lo = pm.data.subarray(b * m * m, (b + 1) * m * m);
    /* nettoyage à 4 Mpx au plus (le contour vient d'une carte 256×256), puis agrandi à la taille de la photo */
    const k = Math.min(1, Math.sqrt(4e6 / (w * h))), ww = Math.max(1, Math.round(w * k)), hh = Math.max(1, Math.round(h * k));
    const small = clean(upmask(lo, m, ww, hh), ww, hh, px * k, py * k);
    if (k === 1) return { mask: small, score: iou[b] };
    const full = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) { const sy = Math.min(hh - 1, Math.floor(y * hh / h)) * ww; for (let x = 0; x < w; x++) full[y * w + x] = small[sy + Math.min(ww - 1, Math.floor(x * ww / w))] }
    return { mask: full, score: iou[b] };
  }
  if (window.MODELS) { const hk = { loaded: () => !!(enc || dec), busy: () => segRunning > 0 || !!segLoading, unload: unloadSeg, compat: () => typeof WebAssembly === "object" ? { ok: true, why: "WebAssembly (processeur)" } : { ok: false, why: "WebAssembly indisponible" } };
    MODELS.register("edgetam", hk); MODELS.register("edgetam_dec", hk) }
  if (window.MODELS) MODELS.register(MODEL, { loaded: () => !!sess, busy: () => running > 0 || (!!loading && !sess), unload,
    compat: () => typeof WebAssembly === "object" ? { ok: true, why: "WebAssembly (processeur)" } : { ok: false, why: "WebAssembly indisponible" } });

  /* ---------- état de la séance ---------- */
  let S = null;            /* séance ouverte */
  const MSG = t => { const e = $("#ez_msg"); if (e) e.textContent = t || "" };

  function css() {
    if ($("#ez_css")) return;
    const st = document.createElement("style"); st.id = "ez_css";
    st.textContent = `
#ez{position:fixed;inset:0;z-index:60;background:var(--stage,#0a0f10);color:#e8f0ee;display:flex;flex-direction:column;font:15px/1.4 var(--fb,system-ui)}
#ez[hidden]{display:none}
#ez header{display:flex;align-items:center;gap:8px;padding:calc(env(safe-area-inset-top) + 8px) 12px 8px;background:rgba(0,0,0,.35)}
#ez header h2{flex:1;margin:0;font:600 16px/1.2 var(--fd,system-ui);color:#fff}
#ez .ez-ib{min-width:44px;min-height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:15px;padding:0 10px;cursor:pointer}
#ez .ez-ib:disabled{opacity:.35}
#ez_stage{position:relative;flex:1;min-height:0;touch-action:none;overflow:hidden;user-select:none;-webkit-user-select:none}
#ez_cv{position:absolute;inset:0;width:100%;height:100%;display:block}
#ez_badge{position:absolute;left:10px;top:10px;padding:5px 9px;border-radius:9px;background:rgba(0,0,0,.6);font-size:12px;color:#fff;pointer-events:none}
#ez_badge.gen{background:#7a1f5c}
#ez_msg{min-height:20px;margin:0;padding:6px 12px 0;font-size:13px;color:#cfe0dc}
#ez footer{padding:6px 12px calc(env(safe-area-inset-bottom) + 10px);background:rgba(0,0,0,.35);display:grid;gap:8px}
#ez .ez-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
#ez .ez-seg{display:flex;flex:1;border:1px solid rgba(255,255,255,.18);border-radius:12px;overflow:hidden}
#ez .ez-seg button{flex:1;min-height:44px;border:0;background:transparent;color:#e8f0ee;font-size:13px;cursor:pointer;padding:0 3px;white-space:nowrap}
#ez .ez-seg button[aria-pressed="true"]{background:var(--acc,#0b7a80);color:var(--accink,#fff);font-weight:600}
#ez .ez-go{flex:1;min-height:48px;border-radius:12px;border:0;background:var(--acc,#0b7a80);color:var(--accink,#fff);font-weight:700;font-size:15px;cursor:pointer}
#ez .ez-go:disabled{opacity:.4}
#ez .ez-no{flex:1;min-height:48px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;font-weight:600;font-size:15px;cursor:pointer}
#ez label.ez-sz{display:flex;align-items:center;gap:8px;flex:1;font-size:13px}
#ez input[type=range]{flex:1;accent-color:var(--acc,#0b7a80)}
#ez details{font-size:13px;color:#cfe0dc}#ez details summary{cursor:pointer;min-height:32px;display:flex;align-items:center}
#ez .ez-lg{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-1px;margin-right:4px}
#ez_info ul{margin:4px 0 0;padding-left:18px}`;
    document.head.appendChild(st);
  }
  function ui() {
    if ($("#ez")) return $("#ez");
    css();
    const d = document.createElement("div"); d.id = "ez"; d.hidden = true; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Effacer une zone");
    d.innerHTML = `
<header><button class="ez-ib" id="ez_x" aria-label="Fermer">✕</button><h2>Effacer une zone</h2>
  <button class="ez-ib" id="ez_undo" aria-label="Annuler la dernière action">↶ Annuler</button></header>
<div id="ez_stage"><canvas id="ez_cv"></canvas><span id="ez_badge">Original</span></div>
<p id="ez_msg" role="status" aria-live="polite"></p>
<footer>
  <div class="ez-row" id="ez_draw">
    <div class="ez-seg" role="group" aria-label="Outil"><button data-m="add" aria-pressed="true">🖌️ Peindre</button><button data-m="sub" aria-pressed="false">🧽 Gommer</button><button data-m="tap" aria-pressed="false">👆 Toucher</button><button data-m="pan" aria-pressed="false">✋ Déplacer</button></div>
  </div>
  <div class="ez-row" id="ez_draw2"><label class="ez-sz">Pinceau<input type="range" id="ez_sz" min="6" max="90" value="28" aria-label="Taille du pinceau"></label>
    <button class="ez-ib" id="ez_clear" aria-label="Recommencer le masque">Recommencer</button></div>
  <div class="ez-row" id="ez_view" hidden>
    <div class="ez-seg" role="group" aria-label="Affichage"><button data-v="orig" aria-pressed="false">Original</button><button data-v="res" aria-pressed="true">Résultat</button><button data-v="map" aria-pressed="false">Zones inventées</button></div>
  </div>
  <div class="ez-row" id="ez_op" hidden><label class="ez-sz"><span><span class="ez-lg" style="background:#ff2fa8"></span>Opacité de la carte</span><input type="range" id="ez_opac" min="0" max="100" value="60" aria-label="Opacité de la carte des zones inventées"></label></div>
  <div class="ez-row" id="ez_act"><button class="ez-go" id="ez_go" disabled>✨ Reconstruire la zone</button></div>
  <div class="ez-row" id="ez_dec" hidden><button class="ez-no" id="ez_no">✗ Refuser</button><button class="ez-go" id="ez_yes">✓ Garder</button></div>
  <div class="ez-row" id="ez_exp" hidden><button class="ez-no" id="ez_save">Enregistrer la photo</button><button class="ez-no" id="ez_more" aria-expanded="false">Plus…</button></div>
  <div class="ez-row" id="ez_more_p" hidden><button class="ez-no" id="ez_png">En PNG (sans perte)</button><button class="ez-no" id="ez_smap">Carte des zones</button><button class="ez-no" id="ez_sprov">Fiche de provenance</button><button class="ez-no" id="ez_reset">Revenir à l’original</button></div>
  <details id="ez_info"><summary>ⓘ Comment ça marche et paramètres</summary><div id="ez_info_b"></div></details>
</footer>`;
    document.body.appendChild(d);
    wire(d);
    return d;
  }

  /* ---------- ouverture ---------- */
  async function decode(file) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }) } catch (e) {}
    const u = URL.createObjectURL(file);
    try { const im = new Image(); im.decoding = "async"; im.src = u; await im.decode(); return im } finally { setTimeout(() => URL.revokeObjectURL(u), 2000) }
  }
  async function open(file) {
    if (!file) return;
    const d = ui(); d.hidden = false; document.documentElement.style.overflow = "hidden";
    MSG("Ouverture de la photo…");
    let src;
    try { src = await decode(file) } catch (e) { MSG("Cette photo n’a pas pu être ouverte (format non pris en charge par le navigateur)."); return }
    const W0 = src.naturalWidth || src.width, H0 = src.naturalHeight || src.height, f = fit(W0, H0);
    const cur = document.createElement("canvas"); cur.width = f.w; cur.height = f.h;
    const cx = cur.getContext("2d", { willReadFrequently: true }); cx.imageSmoothingQuality = "high"; cx.drawImage(src, 0, 0, f.w, f.h);
    const orig = await createImageBitmap(cur);   /* copie figée de l'original (taille de travail) : jamais modifiée */
    if (src.close) try { src.close() } catch (e) {}
    const mk = document.createElement("canvas"); mk.width = f.w; mk.height = f.h;
    const mapk = Math.min(1, Math.sqrt(MAPPX / (f.w * f.h))), gm = document.createElement("canvas"); gm.width = Math.max(1, Math.round(f.w * mapk)); gm.height = Math.max(1, Math.round(f.h * mapk));
    S = { file, name: file.name || "photo", W0, H0, w: f.w, h: f.h, reduced: f.k < 1, orig, cur, cx, mk, mx: mk.getContext("2d", { willReadFrequently: true }),
      G: new Uint8Array(f.w * f.h), gm, mapk, strokes: [], hist: [], ops: [], prop: null, view: "res", mode: "add", busy: false, saved: true,
      vs: { s: 1, tx: 0, ty: 0 }, ptr: new Map(), rev: 0, emb: null, live: null, cursor: null, opac: .6 };
    setMode("add"); setView("res"); resetView(); sync();
    MSG((S.reduced ? `Photo réduite à ${f.w}×${f.h} pour l’édition (le navigateur de l’iPhone limite la taille des images). ` : "") + "Peins avec le doigt sur ce que tu veux effacer. Deux doigts : zoomer et déplacer.");
    info();
  }
  function close() {
    if (S && !S.saved && S.ops.length && !confirm("Fermer sans enregistrer ? Les modifications seront perdues (l’original n’a pas été modifié).")) return;
    const d = $("#ez"); if (d) d.hidden = true; document.documentElement.style.overflow = "";
    if (S) { try { S.orig.close() } catch (e) {} S.cur.width = S.mk.width = S.gm.width = 0 }
    S = null; MODELS.unload(MODEL); unloadSeg();
  }

  /* ---------- affichage : zoom, déplacement ---------- */
  function cvs() { const c = $("#ez_cv"), r = c.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1); const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr); if (c.width !== W || c.height !== H) { c.width = W; c.height = H } return { c, r, dpr } }
  function resetView() { const { r } = cvs(); const s = Math.min(r.width / S.w, r.height / S.h) * .96; S.vs = { s, tx: (r.width - S.w * s) / 2, ty: (r.height - S.h * s) / 2, s0: s }; draw() }
  const toImg = (px, py) => ({ x: (px - S.vs.tx) / S.vs.s, y: (py - S.vs.ty) / S.vs.s });
  let raf = 0;
  function draw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint() }) }
  function paint() {
    if (!S) return;
    const { c, dpr } = cvs(), x = c.getContext("2d"), v = S.vs;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
    x.setTransform(v.s * dpr, 0, 0, v.s * dpr, v.tx * dpr, v.ty * dpr);
    x.imageSmoothingEnabled = v.s < 2; x.imageSmoothingQuality = "high";
    const showOrig = S.view === "orig" || S.peek;
    x.drawImage(showOrig ? S.orig : S.cur, 0, 0);
    if (!showOrig && S.prop) x.drawImage(S.prop.cv, S.prop.x, S.prop.y);
    if (!showOrig && S.view === "map") { x.fillStyle = "rgba(0,0,0,.45)"; x.fillRect(0, 0, S.w, S.h) }
    if (!showOrig && (S.view === "map" || S.prop)) {
      x.save(); x.globalAlpha = S.view === "map" ? S.opac : .5; x.imageSmoothingEnabled = false;
      x.drawImage(S.gm, 0, 0, S.w, S.h);
      if (S.prop) x.drawImage(S.prop.gcv, S.prop.x, S.prop.y);
      x.restore();
    }
    if (!S.prop && !showOrig && S.view !== "map") { x.save(); x.globalAlpha = .55; x.drawImage(S.mk, 0, 0); x.restore() }
    if (S.cursor) { x.setTransform(dpr, 0, 0, dpr, 0, 0); x.beginPath(); x.arc(S.cursor.x, S.cursor.y, S.cursor.r, 0, Math.PI * 2); x.lineWidth = 1.5; x.strokeStyle = "#fff"; x.stroke(); x.strokeStyle = "rgba(0,0,0,.6)"; x.lineWidth = .8; x.stroke() }
    const b = $("#ez_badge"), gen = S.ops.length > 0 || !!S.prop;
    b.textContent = showOrig ? "Original" : S.view === "map" ? "Carte des zones inventées par l’IA" : S.prop ? "Proposition de l’IA (zone inventée)" : gen ? "Résultat — contient des zones inventées par l’IA" : "Photo (rien d’inventé)";
    b.className = !showOrig && gen ? "gen" : "";
  }

  /* ---------- pinceau ---------- */
  function strokeBounds(st) { if (st.sel) return { x0: st.x, y0: st.y, x1: st.x + st.w, y1: st.y + st.h }; return strokeBounds0(st) }
  function strokeBounds0(st) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of st.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) } return { x0: x0 - st.r, y0: y0 - st.r, x1: x1 + st.r, y1: y1 + st.r } }
  function drawStroke(x, st, from = 0) {
    if (st.sel) { const c = document.createElement("canvas"); c.width = st.w; c.height = st.h; const im = new ImageData(st.w, st.h);
      for (let i = 0; i < st.w * st.h; i++) if (st.sel[i]) { im.data[i * 4] = 255; im.data[i * 4 + 1] = 47; im.data[i * 4 + 2] = 168; im.data[i * 4 + 3] = 255 }
      c.getContext("2d").putImageData(im, 0, 0); x.drawImage(c, st.x, st.y); return }
    x.save(); x.globalCompositeOperation = st.m === "sub" ? "destination-out" : "source-over";
    x.strokeStyle = x.fillStyle = "#ff2fa8"; x.lineWidth = st.r * 2; x.lineCap = x.lineJoin = "round";
    const p = st.pts; x.beginPath();
    if (p.length === 1 || from >= p.length - 1) { const q = p[p.length - 1]; x.arc(q.x, q.y, st.r, 0, Math.PI * 2); x.fill() }
    else { x.moveTo(p[Math.max(0, from)].x, p[Math.max(0, from)].y); for (let i = Math.max(1, from + 1); i < p.length; i++) x.lineTo(p[i].x, p[i].y); x.stroke() }
    x.restore();
  }
  function replay() { S.mx.clearRect(0, 0, S.w, S.h); for (const st of S.strokes) drawStroke(S.mx, st); draw(); sync() }
  function hasMask() { return S.strokes.some(s => s.m === "add") }
  /* toucher : l'IA propose le contour de l'élément ; il s'ajoute au masque, qu'on peut corriger au pinceau et à la gomme */
  async function select(px, py) {
    if (!S || S.busy) return;
    S.busy = true; sync(); segRunning++;
    try {
      if (!enc || !dec) MSG("Préparation de la sélection au toucher…");
      await loadSeg((i, f) => MSG("Téléchargement de la sélection au toucher (" + i + "/2, 40 Mo en tout, une seule fois)… " + Math.round(f * 100) + " %"));
      if (!S.emb || S.embAt !== S.ops.length + ":" + S.rev) { MSG("Lecture de la photo par l’IA (une fois)…"); const t0 = performance.now(); S.emb = await embed(S.cur, S.w, S.h); S.embAt = S.ops.length + ":" + S.rev; S.embMs = Math.round(performance.now() - t0) }
      const t1 = performance.now(), r = await segment(S.emb, px, py, S.w, S.h), b = bbox(r.mask, S.w, S.h);
      if (!b) { MSG("Rien de net n’a été trouvé à cet endroit. Touche un peu plus au centre de l’élément, ou peins-le au doigt."); return }
      const sel = new Uint8Array(b.w * b.h); for (let y = 0; y < b.h; y++) sel.set(r.mask.subarray((b.y + y) * S.w + b.x, (b.y + y) * S.w + b.x + b.w), y * b.w);
      const st = { m: "add", sel, x: b.x, y: b.y, w: b.w, h: b.h }; S.strokes.push(st); drawStroke(S.mx, st); S.hist.push({ t: "stroke" });
      let n = 0; for (const v of sel) n += v;
      S.lastSel = { score: +r.score.toFixed(3), px: n, ms: Math.round(performance.now() - t1), lecture_ms: S.embMs };
      MSG(`Contour proposé par l’IA (confiance ${Math.round(r.score * 100)} %, ${(100 * n / (S.w * S.h)).toFixed(1)} % de la photo). Vérifie-le : corrige au pinceau ou à la gomme, ou ↶ Annuler. Puis « Reconstruire la zone ».`);
    } catch (e) {
      const x = window.MODELS && MODELS.explain ? MODELS.explain(e) : null;
      if (window.STUDIO && !STUDIO.granted("modele")) MSG("Téléchargement non autorisé : rien n’a été envoyé. Tu peux toujours peindre la zone au doigt, ou autoriser les modèles dans ⚙️ Paramètres.");
      else MSG((x ? x.texte + " " + x.solution : "La sélection au toucher a échoué : " + (e && e.message || e) + ".") + " Tu peux peindre la zone au doigt.");
    } finally { segRunning--; if (S) { S.busy = false; sync(); draw() } }
  }

  /* ---------- gestes ---------- */
  function wire(d) {
    const st = d.querySelector("#ez_stage");
    const pos = e => { const r = st.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } };
    let pinch = null;
    st.addEventListener("pointerdown", e => {
      if (!S || S.busy) return; st.setPointerCapture(e.pointerId); S.ptr.set(e.pointerId, pos(e));
      if (S.ptr.size === 2) {                                   /* deux doigts : on annule le trait commencé, on zoome */
        if (S.live) { S.strokes.pop(); S.live = null; replay() } S.tap = null;
        const [a, b] = [...S.ptr.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v: { ...S.vs } }; S.cursor = null; return;
      }
      if (S.ptr.size > 2) return;
      const p = pos(e);
      if (S.mode === "pan" || S.prop || S.view !== "res") { S.pan = { p, v: { ...S.vs } }; return }
      if (S.mode === "tap") { S.tap = { p, t: performance.now() }; return }
      const q = toImg(p.x, p.y), r = (+$("#ez_sz").value) / 2 / S.vs.s;
      S.live = { m: S.mode, r, pts: [q] }; S.strokes.push(S.live); drawStroke(S.mx, S.live); S.cursor = { x: p.x, y: p.y, r: r * S.vs.s }; draw();
    });
    st.addEventListener("pointermove", e => {
      if (!S || !S.ptr.has(e.pointerId)) { if (S && e.pointerType === "mouse" && !S.prop && S.mode !== "pan") { const p = pos(e); S.cursor = { x: p.x, y: p.y, r: +$("#ez_sz").value / 2 }; draw() } return }
      S.ptr.set(e.pointerId, pos(e));
      if (pinch && S.ptr.size >= 2) {
        const [a, b] = [...S.ptr.values()], dd = Math.hypot(a.x - b.x, a.y - b.y), c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const s = Math.min(pinch.v.s0 * 12, Math.max(pinch.v.s0 * .5, pinch.v.s * dd / Math.max(1, pinch.d)));
        const ix = (pinch.c.x - pinch.v.tx) / pinch.v.s, iy = (pinch.c.y - pinch.v.ty) / pinch.v.s;
        S.vs = { ...S.vs, s, tx: c.x - ix * s, ty: c.y - iy * s }; draw(); return;
      }
      const p = pos(e);
      if (S.tap && Math.hypot(p.x - S.tap.p.x, p.y - S.tap.p.y) > 10) { S.pan = { p: S.tap.p, v: { ...S.vs } }; S.tap = null }
      if (S.pan) { S.vs = { ...S.vs, tx: S.pan.v.tx + p.x - S.pan.p.x, ty: S.pan.v.ty + p.y - S.pan.p.y }; draw(); return }
      if (S.live) { const q = toImg(p.x, p.y), L = S.live.pts[S.live.pts.length - 1]; if (Math.hypot(q.x - L.x, q.y - L.y) * S.vs.s < 1.5) return; S.live.pts.push(q); drawStroke(S.mx, S.live, S.live.pts.length - 2); S.cursor = { x: p.x, y: p.y, r: S.live.r * S.vs.s }; draw() }
    });
    const up = e => {
      if (!S) return; S.ptr.delete(e.pointerId);
      if (S.ptr.size < 2) pinch = null;
      if (S.ptr.size === 0 && S.tap && e.type === "pointerup") { const q = toImg(S.tap.p.x, S.tap.p.y); S.tap = null; if (q.x >= 0 && q.y >= 0 && q.x < S.w && q.y < S.h) select(q.x, q.y) }
      if (S.ptr.size === 0) { S.tap = null; if (S.live) S.hist.push({ t: "stroke" }); S.live = null; S.pan = null; if (e.pointerType !== "mouse") S.cursor = null; sync(); draw() }
    };
    st.addEventListener("pointerup", up); st.addEventListener("pointercancel", up);
    st.addEventListener("pointerleave", e => { if (S && e.pointerType === "mouse") { S.cursor = null; draw() } });
    st.addEventListener("wheel", e => { if (!S) return; e.preventDefault(); const p = pos(e), k = Math.exp(-e.deltaY * .0015), v = S.vs, s = Math.min(v.s0 * 12, Math.max(v.s0 * .5, v.s * k)); const ix = (p.x - v.tx) / v.s, iy = (p.y - v.ty) / v.s; S.vs = { ...v, s, tx: p.x - ix * s, ty: p.y - iy * s }; draw() }, { passive: false });
    st.addEventListener("dblclick", () => S && resetView());
    window.addEventListener("resize", () => { if (S && !$("#ez").hidden) resetView() });

    d.querySelectorAll("[data-m]").forEach(b => b.onclick = () => setMode(b.dataset.m));
    d.querySelectorAll("[data-v]").forEach(b => b.onclick = () => setView(b.dataset.v));
    $("#ez_x").onclick = close;
    $("#ez_undo").onclick = undo;
    $("#ez_clear").onclick = () => { if (!S || S.busy || !S.strokes.length) return; S.hist.push({ t: "clear", strokes: S.strokes }); S.strokes = []; replay(); MSG("Masque effacé. Peins à nouveau la zone à effacer.") };
    $("#ez_go").onclick = reconstruct;
    $("#ez_yes").onclick = accept;
    $("#ez_no").onclick = refuse;
    $("#ez_opac").oninput = e => { if (S) { S.opac = e.target.value / 100; draw() } };
    $("#ez_save").onclick = () => exportImg("jpeg");
    $("#ez_png").onclick = () => exportImg("png");
    $("#ez_smap").onclick = exportMap;
    $("#ez_sprov").onclick = exportProv;
    $("#ez_more").onclick = () => { const p = $("#ez_more_p"); p.hidden = !p.hidden; $("#ez_more").setAttribute("aria-expanded", String(!p.hidden)) };
    $("#ez_reset").onclick = resetAll;
    /* maintenir « Original » pour comparer rapidement */
    const ob = d.querySelector('[data-v="orig"]');
    ob.addEventListener("pointerdown", () => { if (S && S.view !== "orig") { S.peek = true; draw() } });
    ["pointerup", "pointercancel", "pointerleave"].forEach(t => ob.addEventListener(t, () => { if (S && S.peek) { S.peek = false; draw() } }));
  }
  function setMode(m) { if (!S) return; S.mode = m; if (m === "tap") MSG("Touche un élément (objet, accessoire, oreille ou museau d’un filtre…) : l’IA propose son contour, tu vérifies, puis tu reconstruis."); document.querySelectorAll("#ez [data-m]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === m))) }
  function setView(v) { if (!S) return; S.view = v; document.querySelectorAll("#ez [data-v]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === v))); sync(); draw() }
  function sync() {
    if (!S) return;
    const gen = S.ops.length > 0, prop = !!S.prop;
    $("#ez_go").disabled = S.busy || prop || !hasMask() || S.view !== "res";
    $("#ez_undo").disabled = S.busy || prop || !S.hist.length;
    $("#ez_clear").disabled = S.busy || prop || !S.strokes.length;
    $("#ez_draw").hidden = $("#ez_draw2").hidden = prop || S.view !== "res";
    $("#ez_act").hidden = prop || S.view !== "res";
    $("#ez_dec").hidden = !prop;
    $("#ez_view").hidden = !gen && !prop;
    $("#ez_op").hidden = S.view !== "map";
    $("#ez_exp").hidden = !gen || prop;
    if (!gen || prop) $("#ez_more_p").hidden = true;
  }

  /* ---------- reconstruction ---------- */
  async function reconstruct() {
    if (!S || S.busy || S.prop || !hasMask()) return;
    S.busy = true; sync();
    const t0 = performance.now();
    try {
      /* zone peinte (rectangle des traits), lue seulement là où il faut */
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const st of S.strokes) { const b = strokeBounds(st); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1) }
      const R = Math.max(2, Math.round(Math.max(S.w, S.h) * .003));          /* liseré : couvre le contour flou de l'objet */
      x0 = Math.max(0, Math.floor(x0) - R); y0 = Math.max(0, Math.floor(y0) - R); x1 = Math.min(S.w, Math.ceil(x1) + R + 1); y1 = Math.min(S.h, Math.ceil(y1) + R + 1);
      if (x1 <= x0 || y1 <= y0) throw new Error("zone vide");
      const bw = x1 - x0, bh = y1 - y0, a = S.mx.getImageData(x0, y0, bw, bh).data, m0 = new Uint8Array(bw * bh);
      for (let i = 0; i < m0.length; i++) m0[i] = a[i * 4 + 3] > 127 ? 1 : 0;
      const holeB = dilate(m0, bw, bh, R), hb = bbox(holeB, bw, bh);
      if (!hb) { MSG("La zone peinte est vide : peins sur ce que tu veux effacer."); return }
      const hole = { x: x0 + hb.x, y: y0 + hb.y, w: hb.w, h: hb.h }, C = context(hole, S.w, S.h), n = C.w * C.h;
      const holeC = new Uint8Array(n);
      for (let y = 0; y < C.h; y++) { const yy = C.y + y - y0; if (yy < 0 || yy >= bh) continue; for (let x = 0; x < C.w; x++) { const xx = C.x + x - x0; if (xx >= 0 && xx < bw && holeB[yy * bw + xx]) holeC[y * C.w + x] = 1 } }
      const rgba = S.cx.getImageData(C.x, C.y, C.w, C.h).data;
      MSG(sess ? "Reconstruction de la zone…" : "Préparation de l’IA…");
      const out = await infer(rgba, holeC, C.w, C.h, f => MSG("Téléchargement du modèle d’effacement (28 Mo, une seule fois)… " + Math.round(f * 100) + " %"));
      MSG("Reconstruction terminée.");
      const pc = document.createElement("canvas"); pc.width = C.w; pc.height = C.h; pc.getContext("2d").putImageData(new ImageData(patch(out, holeC, n), C.w, C.h), 0, 0);
      const gc = document.createElement("canvas"); gc.width = C.w; gc.height = C.h; { const g = new ImageData(C.w, C.h); stripes(g.data, holeC, C.w, C.h, C.x, C.y); gc.getContext("2d").putImageData(g, 0, 0) }
      let cnt = 0; for (let i = 0; i < n; i++) cnt += holeC[i];
      S.prop = { x: C.x, y: C.y, w: C.w, h: C.h, cv: pc, gcv: gc, hole: holeC, zone: hole, px: cnt, ms: Math.round(performance.now() - t0) };
      setView("res");
      MSG(`Proposition : ${cnt.toLocaleString("fr-FR")} pixels inventés par l’IA (${(100 * cnt / (S.w * S.h)).toFixed(2)} % de la photo), en ${(S.prop.ms / 1000).toFixed(1)} s. Maintiens « Original » pour comparer, puis garde ou refuse.`);
    } catch (e) {
      const x = window.MODELS && MODELS.explain ? MODELS.explain(e) : null;
      if (window.STUDIO && !STUDIO.granted("modele")) MSG("Téléchargement du modèle non autorisé : rien n’a été envoyé ni effacé. Tu peux l’autoriser dans ⚙️ Paramètres, puis relancer.");
      else MSG((x ? x.texte + " " + x.solution : "La reconstruction a échoué : " + (e && e.message || e) + ".") + " La photo n’a pas été modifiée.");
    } finally { S && (S.busy = false); sync(); draw(); info() }
  }
  /* rayures de la carte (zones inventées) : bien visibles, même sur des couleurs proches */
  function stripes(d, hole, w, h, ox, oy) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!hole[i]) continue; const s = ((x + ox + y + oy) >> 3) & 1; d[i * 4] = 255; d[i * 4 + 1] = s ? 47 : 255; d[i * 4 + 2] = s ? 168 : 255; d[i * 4 + 3] = 255 } }
  function accept() {
    if (!S || !S.prop) return;
    const p = S.prop, before = S.cx.getImageData(p.x, p.y, p.w, p.h), gBefore = new Uint8Array(p.w * p.h);
    for (let y = 0; y < p.h; y++) gBefore.set(S.G.subarray((p.y + y) * S.w + p.x, (p.y + y) * S.w + p.x + p.w), y * p.w);
    S.cx.drawImage(p.cv, p.x, p.y);                                          /* seuls les pixels de la zone changent */
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.hole[y * p.w + x]) S.G[(p.y + y) * S.w + p.x + x] = 1;
    refreshMap(p);
    const op = { n: S.ops.length + 1, date: new Date().toISOString(), zone: p.zone, contexte: { x: p.x, y: p.y, w: p.w, h: p.h }, pixels_inventes: p.px, duree_ms: p.ms };
    S.ops.push(op);
    S.hist.push({ t: "recon", p: { x: p.x, y: p.y, w: p.w, h: p.h }, before, gBefore, strokes: S.strokes });
    S.strokes = []; S.prop = null; S.saved = false; S.rev++; replay(); record(op);
    MSG("Gardé. Tu peux effacer une autre zone, voir la carte des zones inventées ou enregistrer.");
    info();
  }
  function refuse() { if (!S || !S.prop) return; S.prop = null; MSG("Proposition refusée : rien n’a changé. Corrige le masque et relance, ou annule."); sync(); draw() }
  function refreshMap(r) {
    const k = S.mapk, gx = Math.floor(r.x * k), gy = Math.floor(r.y * k), gw = Math.min(S.gm.width - gx, Math.ceil(r.w * k) + 2), gh = Math.min(S.gm.height - gy, Math.ceil(r.h * k) + 2);
    if (gw <= 0 || gh <= 0) return;
    const im = new ImageData(gw, gh), d = im.data;
    for (let y = 0; y < gh; y++) { const sy = Math.min(S.h - 1, Math.floor((gy + y + .5) / k)); for (let x = 0; x < gw; x++) { const sx = Math.min(S.w - 1, Math.floor((gx + x + .5) / k)); if (S.G[sy * S.w + sx]) { const i = (y * gw + x) * 4, s = ((gx + x + gy + y) >> 2) & 1; d[i] = 255; d[i + 1] = s ? 47 : 255; d[i + 2] = s ? 168 : 255; d[i + 3] = 255 } } }
    S.gm.getContext("2d").putImageData(im, gx, gy);
  }
  function undo() {
    if (!S || S.busy || S.prop || !S.hist.length) return;
    const h = S.hist.pop();
    if (h.t === "stroke") { S.strokes.pop(); replay(); MSG("Dernier trait annulé.") }
    else if (h.t === "clear") { S.strokes = h.strokes; replay(); MSG("Masque rétabli.") }
    else if (h.t === "recon") {
      const p = h.p; S.cx.putImageData(h.before, p.x, p.y);
      for (let y = 0; y < p.h; y++) S.G.set(h.gBefore.subarray(y * p.w, (y + 1) * p.w), (p.y + y) * S.w + p.x);
      refreshMap(p); S.ops.pop(); S.rev++; S.strokes = h.strokes; replay(); if (!S.ops.length) setView("res");
      MSG("Reconstruction annulée : la zone est revenue comme avant, avec son masque.");
    }
    sync(); draw(); info();
  }
  function resetAll() {
    if (!S || S.busy) return;
    if (!confirm("Revenir à l’original ? Toutes les zones reconstruites seront retirées.")) return;
    S.cx.clearRect(0, 0, S.w, S.h); S.cx.drawImage(S.orig, 0, 0); S.G.fill(0); S.gm.getContext("2d").clearRect(0, 0, S.gm.width, S.gm.height);
    S.ops = []; S.hist = []; S.strokes = []; S.prop = null; S.saved = true; S.rev++; setView("res"); replay(); info();
    MSG("Retour à l’original : plus aucune zone inventée.");
  }

  /* ---------- provenance, historique, export ---------- */
  function model() { const e = MODELS.get(MODEL); return { modele: e.modele, version: e.version, fichier_sha256: e.sha256, licence: e.licence, source: e.source, moteur: e.moteur } }
  function prov() {
    const tot = S.G.reduce((a, b) => a + b, 0);
    return { format: "retouche-provenance", v: 1, app: typeof VER !== "undefined" ? VER : "", date: new Date().toISOString(),
      avertissement: "Les zones marquées ont été inventées par une IA générative : elles ne montrent pas ce qui se trouvait réellement à cet endroit.",
      source: { nom: S.name, largeur: S.W0, hauteur: S.H0, taille_de_travail: S.w + "×" + S.h, reduite: S.reduced },
      ia: model(), operations: S.ops, pixels_inventes_total: tot, part_inventee: +(tot / (S.w * S.h)).toFixed(5) };
  }
  function record(op) {
    try {
      const h = JSON.parse(localStorage.getItem("recettes") || "[]");
      h.push({ app: typeof VER !== "undefined" ? VER : "", date: op.date, media: "photo", source: S.W0 + "×" + S.H0, sortie: S.w + "×" + S.h, profil: "effacement",
        ia: { modele: "MI-GAN 512 Places2 (pipeline ONNX v2)", moteur: "ONNX Runtime Web (WebAssembly)" },
        operations: ["effacement génératif : " + op.pixels_inventes + " pixels inventés"] });
      localStorage.setItem("recettes", JSON.stringify(h.slice(-30)));
    } catch (e) {}
  }
  const base = () => S.name.replace(/\.[^.]+$/, "") || "photo";
  async function out(blob, name) { if (typeof shareBlob === "function") return shareBlob(blob, typeof uniqName === "function" ? uniqName(name.replace(/\.[^.]+$/, ""), name.split(".").pop()) : name); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000) }
  const toBlob = (c, type, q) => new Promise((ok, ko) => c.toBlob(b => b ? ok(b) : ko(new Error("export impossible")), type, q));
  async function exportImg(fmt) {
    if (!S || !S.ops.length) return;
    MSG("Préparation de la photo…");
    try { const b = await toBlob(S.cur, fmt === "png" ? "image/png" : "image/jpeg", .95); S.saved = true; await out(b, base() + "-efface." + (fmt === "png" ? "png" : "jpg")); MSG("Photo prête. Elle contient des zones inventées par l’IA : garde la carte ou la fiche de provenance si tu veux t’en souvenir.") }
    catch (e) { MSG("Export impossible : " + (e.message || e)) }
  }
  async function exportMap() {
    if (!S || !S.ops.length) return;
    MSG("Préparation de la carte (pleine taille)…");
    try {
      const c = document.createElement("canvas"); c.width = S.w; c.height = S.h; const x = c.getContext("2d");
      x.drawImage(S.cur, 0, 0); x.fillStyle = "rgba(0,0,0,.45)"; x.fillRect(0, 0, S.w, S.h);
      const B = 1024; for (let ty = 0; ty < S.h; ty += B) for (let tx = 0; tx < S.w; tx += B) {
        const w = Math.min(B, S.w - tx), h = Math.min(B, S.h - ty), hole = new Uint8Array(w * h); let any = 0;
        for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) if (S.G[(ty + y) * S.w + tx + xx]) { hole[y * w + xx] = 1; any = 1 }
        if (!any) continue; const g = x.getImageData(tx, ty, w, h), m = new ImageData(w, h); stripes(m.data, hole, w, h, tx, ty);
        for (let i = 0; i < w * h; i++) if (hole[i]) for (let k = 0; k < 3; k++) g.data[i * 4 + k] = Math.round(g.data[i * 4 + k] * .35 + m.data[i * 4 + k] * .65);
        x.putImageData(g, tx, ty);
      }
      const b = await toBlob(c, "image/png"); c.width = 0; await out(b, base() + "-zones-inventees.png"); MSG("Carte prête : les rayures roses montrent les pixels inventés par l’IA.");
    } catch (e) { MSG("Export impossible : " + (e.message || e)) }
  }
  async function exportProv() { if (!S || !S.ops.length) return; await out(new Blob([JSON.stringify(prov(), null, 2)], { type: "application/json" }), base() + "-provenance.json"); MSG("Fiche de provenance prête (modèle, empreinte, zones, date).") }

  function info() {
    const e = $("#ez_info_b"); if (!e || !S) return; const m = MODELS.get(MODEL), tot = S.G.reduce((a, b) => a + b, 0);
    e.innerHTML = `<ul>
<li>Peins ce que tu veux retirer (objet, élément d’un filtre AR, défaut). L’IA remplit la zone avec ce qui lui semble <b>plausible</b> d’après les alentours : elle <b>invente</b> ces pixels, elle ne retrouve pas ce qui était réellement caché.</li>
<li>Hors de la zone peinte (élargie de quelques pixels pour couvrir les contours), la photo n’est pas modifiée, au pixel près. L’original n’est jamais touché.</li>
<li>Pour une grande zone, le résultat est meilleur en plusieurs petits coups successifs.</li>
<li>Modèle : ${esc(m.modele)} — ${esc(m.version)} ; licence ${esc(m.licence)}.</li>
<li>Calcul : sur ton téléphone (${esc(m.moteur)}). Rien n’est envoyé sur Internet ; seul le modèle est téléchargé une fois, après ton accord.</li>
<li>Photo : ${S.W0}×${S.H0}${S.reduced ? ` (édition en ${S.w}×${S.h})` : ""} ; zones reconstruites gardées : ${S.ops.length} ; pixels inventés : ${tot.toLocaleString("fr-FR")} (${(100 * tot / (S.w * S.h)).toFixed(2)} %).</li>
${S.ops.length ? `<li>Dernière reconstruction : ${(S.ops[S.ops.length - 1].duree_ms / 1000).toFixed(1)} s.</li>` : ""}</ul>`;
  }

  return { open, close, _t: { fit, dilate, bbox, context, tensors, patch, apply, stripes, upmask, clean }, get state() { return S }, infer, unload, loaded: () => !!sess, segLoaded: () => !!(enc || dec) };
})();
