/* RetoucheProAI v9.1 — calcul LaMa dans un fil séparé : sa mémoire (≈ 1 Go) est rendue au système dès la fin (worker arrêté),
   sans s'ajouter à celle des autres modèles de la page. Messages : {charger, octets} → {pret} ; {infer, img, msk} → {sortie} ; erreurs → {erreur}. */
let sess = null;
self.onmessage = async e => { const m = e.data;
  try {
    if (m.charger) { importScripts(m.base + "ort.wasm.min.js"); ort.env.wasm.wasmPaths = m.base; ort.env.wasm.numThreads = m.fils || 1;
      sess = await ort.InferenceSession.create(new Uint8Array(m.octets), { executionProviders: ["wasm"], graphOptimizationLevel: "all" }); self.postMessage({ pret: true }) }
    else if (m.infer) { const N = 512, r = await sess.run({ image: new ort.Tensor("float32", m.img, [1, 3, N, N]), mask: new ort.Tensor("float32", m.msk, [1, 1, N, N]) }), o = r[sess.outputNames[0]].data;
      const out = new Float32Array(o); self.postMessage({ sortie: out }, [out.buffer]) }
  } catch (x) { self.postMessage({ erreur: String((x && x.message) || x) }) } };
