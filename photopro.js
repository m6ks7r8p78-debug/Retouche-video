/* ===== v6.0 : « Rendu photographe » — IA Real-ESRGAN x4plus pour les photos =====
   Réseau RRDBNet (23 blocs, 16,7 millions de paramètres), licence BSD-3 (même projet que l'IA vidéo, LICENSE-Real-ESRGAN.txt).
   Beaucoup plus puissant que le réseau compact utilisé pour la vidéo : textures, contours et blocs de compression bien mieux
   reconstruits. Trop lourd pour la vidéo sur téléphone ; pour une photo, quelques dizaines de secondes à quelques minutes.

   Calcul sur le téléphone avec ONNX Runtime Web : la puce graphique (WebGPU) quand elle est disponible, sinon le processeur
   (WebAssembly, plus lent). Le modèle (33,7 Mo, demi-précision) est téléchargé une seule fois, empreinte vérifiée.
   Image traitée par tuiles avec marge (résultat sans raccord visible, mémoire limitée), chaque tuile ×4 étant aussitôt réduite
   à la taille demandée : le résultat complet ×4 n'est jamais gardé (les iPhone refusent les canevas de plus de 16,7 Mpx). */
window.PHOTOPRO = (() => {
  const ID = "x4plus", TUILE = 160, MARGE = 12, MAXPX = 2.5e6;
  let sess = null, ep = "", chargement = null, occupe = 0, cache = null, vitesse = 0;

  function script(src) {
    return new Promise((ok, ko) => {
      if (window.ort && ort.__webgpu) return ok();
      const s = document.createElement("script"); s.src = src;
      s.onload = () => { try { ort.__webgpu = true } catch (e) {} ok() }; s.onerror = () => ko(new Error("moteur introuvable"));
      document.head.appendChild(s);
    });
  }
  const dispo = () => !!(window.MODELS && MODELS.get(ID)) && !(window.MODELS && MODELS.isOff && MODELS.isOff(ID));
  const fits = (w, h) => w > 0 && h > 0 && w * h <= MAXPX;

  async function charger(onP) {
    if (sess) return sess;
    if (chargement) return chargement;
    chargement = (async () => {
      if (window.MODELS && MODELS.beforeLoad) await MODELS.beforeLoad(ID);
      /* moteur WebGPU d'ONNX Runtime (sait aussi calculer sur le processeur) ; remplace la version « WebAssembly seul » si elle était chargée */
      await script("ort/ort.webgpu.min.js");
      ort.env.wasm.wasmPaths = new URL("ort/", location.href).href;
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      const b = new Uint8Array(await MODELS.bytes(ID, { download: true, onProgress: onP }));
      let err = null;
      for (const e of navigator.gpu ? ["webgpu", "wasm"] : ["wasm"]) {
        try { sess = await ort.InferenceSession.create(b, { executionProviders: [e], graphOptimizationLevel: "all" }); ep = e; break }
        catch (x) { err = x; sess = null }
      }
      if (!sess) throw err || new Error("moteur indisponible");
      return sess;
    })();
    try { return await chargement } finally { chargement = null }
  }
  async function liberer() { cache = null; if (sess) { try { await sess.release() } catch (e) {} } sess = null; ep = "" }
  if (window.MODELS && MODELS.register) MODELS.register(ID, { loaded: () => !!sess, busy: () => occupe > 0, unload: liberer });

  const pause = () => new Promise(r => setTimeout(r, 0));
  /* src : image, canevas ou vidéo ; s : échelle de sortie (≤ 4) ; renvoie un canevas de W·s × H·s */
  async function run(src, s, onTile, key, onP) {
    occupe++;
    try {
      const W = src.naturalWidth || src.videoWidth || src.width, H = src.naturalHeight || src.videoHeight || src.height;
      if (!fits(W, H)) throw new Error("image trop grande");
      s = Math.min(4, Math.max(.25, s));
      const OW = Math.max(2, Math.round(W * s)), OH = Math.max(2, Math.round(H * s)), k2 = key == null ? null : key + "|" + W + "x" + H + "|" + OW;
      if (k2 && cache && cache.k === k2) { if (onTile) onTile(1); return cache.c }
      await charger(onP);
      const ent = document.createElement("canvas"); ent.width = W; ent.height = H;
      const xe = ent.getContext("2d", { willReadFrequently: true }); xe.drawImage(src, 0, 0, W, H);
      const sortie = document.createElement("canvas"); sortie.width = OW; sortie.height = OH;
      const xs = sortie.getContext("2d"); xs.imageSmoothingEnabled = true; xs.imageSmoothingQuality = "high";
      const tmp = document.createElement("canvas"), xt = tmp.getContext("2d");
      const nX = Math.ceil(W / TUILE), nY = Math.ceil(H / TUILE), nT = nX * nY; let fait = 0; const t0 = performance.now();
      for (let ty = 0; ty < nY; ty++) for (let tx = 0; tx < nX; tx++) {
        const x0 = tx * TUILE, y0 = ty * TUILE, x1 = Math.min(W, x0 + TUILE), y1 = Math.min(H, y0 + TUILE);
        const a0 = Math.max(0, x0 - MARGE), b0 = Math.max(0, y0 - MARGE), a1 = Math.min(W, x1 + MARGE), b1 = Math.min(H, y1 + MARGE);
        const w = a1 - a0, h = b1 - b0, px = xe.getImageData(a0, b0, w, h).data, n = w * h, t = new Float32Array(3 * n);
        for (let i = 0; i < n; i++) { t[i] = px[i * 4] / 255; t[n + i] = px[i * 4 + 1] / 255; t[2 * n + i] = px[i * 4 + 2] / 255 }
        const inp = new ort.Tensor("float32", t, [1, 3, h, w]);
        const r = await sess.run({ input: inp }); const out = r.output, d = out.data, W4 = w * 4, H4 = h * 4, n4 = W4 * H4;
        tmp.width = W4; tmp.height = H4; const im = xt.createImageData(W4, H4), q = im.data;
        for (let i = 0; i < n4; i++) {
          const R = d[i], G = d[n4 + i], B = d[2 * n4 + i];
          q[i * 4] = R <= 0 ? 0 : R >= 1 ? 255 : R * 255 + .5; q[i * 4 + 1] = G <= 0 ? 0 : G >= 1 ? 255 : G * 255 + .5; q[i * 4 + 2] = B <= 0 ? 0 : B >= 1 ? 255 : B * 255 + .5; q[i * 4 + 3] = 255;
        }
        try { inp.dispose && inp.dispose(); out.dispose && out.dispose() } catch (e) {}
        xt.putImageData(im, 0, 0);
        /* on ne garde que le cœur de la tuile (sans la marge), ramené à l'échelle demandée */
        const cx = (x0 - a0) * 4, cy = (y0 - b0) * 4, cw = (x1 - x0) * 4, ch = (y1 - y0) * 4;
        const dx = Math.round(x0 * s), dy = Math.round(y0 * s), dw = Math.round(x1 * s) - dx, dh = Math.round(y1 * s) - dy;
        xs.drawImage(tmp, cx, cy, cw, ch, dx, dy, dw, dh);
        fait++; if (onTile) onTile(fait / nT); await pause();
      }
      tmp.width = tmp.height = 0; ent.width = ent.height = 0;
      vitesse = (performance.now() - t0) / (W * H / 1e6);
      try { localStorage.setItem("pp_spd", String(Math.round(vitesse))) } catch (e) {}
      cache = k2 ? { k: k2, c: sortie } : null;
      return sortie;
    } finally { occupe-- }
  }
  /* durée estimée (secondes) pour une photo de w × h, d'après la vitesse mesurée sur CET appareil (0 si inconnue) */
  function estimation(w, h) { let ms = vitesse; try { ms = ms || +localStorage.getItem("pp_spd") || 0 } catch (e) {} return ms ? ms * w * h / 1e6 / 1000 : 0 }
  return { dispo, fits, run, charger, liberer, estimation, moteur: () => ep, ID };
})();
