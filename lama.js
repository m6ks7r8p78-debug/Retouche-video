/* RetoucheProAI v9.1 — LAMA : reconstruction de grandes zones (LaMa « big-lama », Apache-2.0, ONNX 512×512 de Carve).
   Utilisé par « Changer de format » quand tu choisis « Plein écran, rien coupé » sans serveur : le téléphone dessine les côtés.
   Mesuré (tests/format/banc_generateurs.json, 16 images à vérité connue) : nettement plus juste que MI-GAN sur les grandes profondeurs
   (LPIPS 0,27 contre 0,31 à 0,45 de profondeur ; 0,15 contre 0,32 à 0,1). INVENTE des pixels : chaque zone inventée est marquée.
   API identique à ERASE.infer : infer(rgba, trou, w, h) → CHW uint8 (3×h×w). */
var LAMA = (() => {
  const MODELE = "lama", N = 512; let w = null, pr = null, n = 0, attente = null;
  /* le modèle tourne dans un fil séparé (lama-worker.js) : mémoire isolée, rendue dès liberer() */
  function charger(onP) {
    if (pr) return pr;
    pr = (async () => {
      if (MODELS.beforeLoad) await MODELS.beforeLoad(MODELE);
      const b = await MODELS.bytes(MODELE, { download: true, onProgress: onP }), buf = b.buffer ? b.buffer.slice(b.byteOffset || 0, (b.byteOffset || 0) + b.byteLength) : b;
      w = new Worker("lama-worker.js"); w.onmessage = e => { const f = attente; attente = null; if (f) f(e.data) }; w.onerror = e => { const f = attente; attente = null; if (f) f({ erreur: e.message || "fil de calcul arrêté" }) };
      const r = await appel({ charger: true, octets: buf, base: new URL("ort/", location.href).href, fils: self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1 }, [buf]);
      if (r.erreur) throw new Error(r.erreur); return true })().catch(e => { liberer(); throw e });
    return pr;
  }
  const appel = (m, t) => new Promise(ok => { attente = ok; w.postMessage(m, t || []) });
  function liberer() { try { if (w) w.terminate() } catch (e) {} w = null; pr = null; const f = attente; attente = null; if (f) f({ erreur: "arrêté" }) }
  const toile = (a, b) => { const c = document.createElement("canvas"); c.width = a; c.height = b; c.x = c.getContext("2d", { willReadFrequently: true }); return c };
  async function infer(rgba, trou, W, H) {
    n++;
    try {
      await charger(); const a = toile(W, H), b = toile(N, N), id = new ImageData(new Uint8ClampedArray(rgba), W, H);
      for (let i = 0; i < W * H; i++) id.data[i * 4 + 3] = 255; a.x.putImageData(id, 0, 0); b.x.imageSmoothingQuality = "high"; b.x.drawImage(a, 0, 0, N, N);
      const d = b.x.getImageData(0, 0, N, N).data, P = N * N, img = new Float32Array(3 * P), msk = new Float32Array(P);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const j = y * N + x, sx = Math.min(W - 1, Math.floor((x + .5) * W / N)), sy = Math.min(H - 1, Math.floor((y + .5) * H / N)), t = trou[sy * W + sx] ? 1 : 0;
        msk[j] = t; for (let c = 0; c < 3; c++) img[c * P + j] = t ? 0 : d[j * 4 + c] / 255 }
      const r = await appel({ infer: true, img, msk }, [img.buffer, msk.buffer]); if (r.erreur) throw new Error(r.erreur); const o = r.sortie;
      const od = new ImageData(N, N); for (let j = 0; j < P; j++) { for (let c = 0; c < 3; c++) od.data[j * 4 + c] = o[c * P + j]; od.data[j * 4 + 3] = 255 }
      b.x.putImageData(od, 0, 0); a.x.clearRect(0, 0, W, H); a.x.imageSmoothingQuality = "high"; a.x.drawImage(b, 0, 0, W, H);
      const q = a.x.getImageData(0, 0, W, H).data, out = new Uint8Array(3 * W * H); for (let i = 0; i < W * H; i++) { out[i] = q[i * 4]; out[W * H + i] = q[i * 4 + 1]; out[2 * W * H + i] = q[i * 4 + 2] }
      return out;
    } finally { n-- }
  }
  if (window.MODELS) try { MODELS.register(MODELE, { loaded: () => !!w, busy: () => n > 0, unload: liberer }) } catch (e) {}
  return { charger, infer, liberer, loaded: () => !!w && !!pr };
})();
