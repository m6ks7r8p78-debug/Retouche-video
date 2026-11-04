/* ===== Protection des visages =====
   Les visages sont l'endroit où la restauration IA invente le plus (peau lissée, « cireuse », yeux redessinés), surtout
   quand le visage ne fait que quelques dizaines de pixels. L'app ne « refait » pas les visages avec un gros modèle (risque
   de changer la personne) : elle les repère, puis y mêle davantage la version classique, qui n'invente rien.
   Détecteur : Ultra-Light-Fast-Generic-Face-Detector-1MB, version RFB-320 (licence MIT, voir LICENSE-UltraFace.txt),
   exécuté sur le téléphone par ONNX Runtime Web (WebAssembly). Rien ne quitte l'appareil.
   Pour les vidéos, la position des visages est suivie et lissée d'une image à l'autre (pas de scintillement). */
var FACES = (() => {
  const TH = .9, IOU = .3, LIFE = 8;
  let sess = null, loading = null, running = 0, cvs = null, cx = null;
  function ortLoad() {
    if (!window.__ortP) window.__ortP = new Promise((ok, ko) => {
      if (window.ort) return ok();
      const s = document.createElement("script"); s.src = "ort/ort.wasm.min.js"; s.onload = ok; s.onerror = () => { window.__ortP = null; ko(new Error("moteur ONNX introuvable")) }; document.head.appendChild(s);
    }).then(() => { ort.env.wasm.wasmPaths = new URL("ort/", location.href).href; ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1 });
    return window.__ortP;
  }
  async function load() {
    if (sess) return sess;
    if (!loading) loading = (async () => {
      const b = new Uint8Array(await MODELS.bytes("visages"));
      await ortLoad();
      sess = await ort.InferenceSession.create(b, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
      return sess;
    })().catch(e => { loading = null; throw e });
    return loading;
  }
  const iou = (a, b) => { const w = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), h = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)), i = w * h;
    return i / ((a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - i + 1e-9) };
  /* visages d'une image : liste de boîtes en coordonnées relatives (0..1), du plus sûr au moins sûr */
  async function detect(el) {
    running++;
    try {
      const s = await load();
      if (!cvs) { cvs = document.createElement("canvas"); cvs.width = 320; cvs.height = 240; cx = cvs.getContext("2d", { willReadFrequently: true }) }
      cx.drawImage(el, 0, 0, 320, 240);
      const d = cx.getImageData(0, 0, 320, 240).data, n = 76800, t = new Float32Array(3 * n);
      for (let i = 0; i < n; i++) { t[i] = (d[i * 4] - 127) / 128; t[n + i] = (d[i * 4 + 1] - 127) / 128; t[2 * n + i] = (d[i * 4 + 2] - 127) / 128 }
      const out = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", t, [1, 3, 240, 320]) });
      const sc = out[s.outputNames[0]].data, bx = out[s.outputNames[1]].data, c = [];
      for (let k = 0; k < sc.length / 2; k++) if (sc[k * 2 + 1] > TH) c.push({ s: sc[k * 2 + 1], x0: Math.max(0, bx[k * 4]), y0: Math.max(0, bx[k * 4 + 1]), x1: Math.min(1, bx[k * 4 + 2]), y1: Math.min(1, bx[k * 4 + 3]) });
      c.sort((a, b) => b.s - a.s); const keep = [];
      for (const b of c) if (b.x1 > b.x0 && b.y1 > b.y0 && keep.every(k => iou(k, b) < IOU)) keep.push(b);
      return keep.slice(0, 20);
    } finally { running-- }
  }
  /* suivi pour la vidéo : une boîte retrouvée est lissée ; un visage manqué une image reste protégé quelques images */
  const TR = { list: [], t: -1, src: null };
  function track(boxes, t, src) {
    if (src !== TR.src || t < TR.t || t - TR.t > .6) TR.list = [];
    TR.src = src; TR.t = t;
    const used = new Set();
    for (const p of TR.list) {
      let best = -1, bi = 0; boxes.forEach((b, i) => { if (used.has(i)) return; const v = iou(p, b); if (v > bi) { bi = v; best = i } });
      if (best >= 0 && bi > .25) { const b = boxes[best]; used.add(best); for (const k of ["x0", "y0", "x1", "y1"]) p[k] = p[k] * .6 + b[k] * .4; p.life = LIFE; p.s = b.s }
      else p.life--;
    }
    boxes.forEach((b, i) => { if (!used.has(i)) TR.list.push({ ...b, life: LIFE }) });
    TR.list = TR.list.filter(p => p.life > 0);
    return TR.list.map(p => ({ ...p, w: Math.min(1, p.life / 3) }));   /* un visage perdu s'efface en douceur */
  }
  async function unload() { const s = sess; sess = null; loading = null; try { if (s && s.release) await s.release() } catch (e) {} TR.list = [] }
  if (window.MODELS) MODELS.register("visages", { loaded: () => !!sess, busy: () => running > 0, unload });
  return { detect, track, unload, reset: () => { TR.list = []; TR.src = null }, get ready() { return !!sess } };
})();
