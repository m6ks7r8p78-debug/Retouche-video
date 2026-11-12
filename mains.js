/* RetoucheProAI v7.1 — MAINS : repérage des mains (MediaPipe Hand Landmarker, Apache-2.0), utilisé comme « veto » par
   « Retirer un filtre du visage » : un élément repéré sur une main (ongles colorés, doigts, cigarette tenue, bague…) est un vrai
   objet, pas un filtre → il n'est pas effacé. Mesuré sur de vrais clips filtrés (registre, fiche F30) : pixels signalés à tort
   ÷ 4 sans perte de rappel. Si la bibliothèque ne se charge pas, le retrait se fait sans veto (et le journal le dit).
   Fichiers : modeles/lourds/mains/ (bibliothèque 0,2 Mo + moteur WebAssembly 14,7 Mo + modèle 7,8 Mo), téléchargés une fois. */
var MAINS = (() => {
  const ID = "mains", BASE = "modeles/lourds/mains/";
  let det = null, chargement = null, enCours = 0;
  if (window.MODELS) MODELS.register(ID, { loaded: () => !!det, busy: () => enCours > 0, unload: liberer });
  async function charger(onP) {
    if (det) return det;
    if (!chargement) chargement = (async () => {
      if (MODELS.beforeLoad) await MODELS.beforeLoad(ID);
      const tache = new Uint8Array(await MODELS.bytes(ID, { download: true, onProgress: onP }));
      const V = await import(new URL(BASE + "vision_bundle.mjs", location.href).href);
      const fichiers = { wasmLoaderPath: new URL(BASE + "vision_wasm_internal.js", location.href).href, wasmBinaryPath: new URL(BASE + "vision_wasm_internal.wasm", location.href).href };
      det = await V.HandLandmarker.createFromOptions(fichiers, { baseOptions: { modelAssetBuffer: tache, delegate: "CPU" }, runningMode: "IMAGE", numHands: 4,
        minHandDetectionConfidence: .3, minHandPresenceConfidence: .3 });
      return det;
    })().catch(e => { chargement = null; throw e });
    return chargement;
  }
  async function liberer() { const d = det; det = null; chargement = null; try { if (d && d.close) d.close() } catch (e) {} }
  /* zone des mains (Uint8Array W×H, 1 = main) : os des doigts épaissis, paume, et prolongement du bout des doigts (ongles longs).
     Mêmes règles que le laboratoire (prive : scripts/eval_mains.py → tests/labo_filtres/LISEZMOI.md). */
  const OS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17]];
  const BOUTS = [[4, 3], [8, 7], [12, 11], [16, 15], [20, 19]];
  async function zone(canvas, W, H) {
    const d = await charger(); enCours++; let r;
    try { r = d.detect(canvas) } finally { enCours-- }
    const n = (r && r.landmarks) ? r.landmarks.length : 0; if (!n) return { zone: null, n: 0 };
    const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d", { willReadFrequently: true });
    x.strokeStyle = x.fillStyle = "#fff"; x.lineCap = "round";
    for (const h of r.landmarks) {
      const q = h.map(p => [p.x * W, p.y * H]), lg = Math.hypot(q[0][0] - q[9][0], q[0][1] - q[9][1]);
      x.lineWidth = Math.max(3, lg * .28); x.beginPath(); for (const [a, b] of OS) { x.moveTo(...q[a]); x.lineTo(...q[b]) } x.stroke();
      x.lineWidth = Math.max(3, lg * .22); x.beginPath(); for (const [t, k] of BOUTS) { const e = [q[t][0] + (q[t][0] - q[k][0]) * 1.6, q[t][1] + (q[t][1] - q[k][1]) * 1.6]; x.moveTo(...q[t]); x.lineTo(...e) } x.stroke();
      x.beginPath(); [0, 1, 2, 5, 9, 13, 17].forEach((k, i) => i ? x.lineTo(...q[k]) : x.moveTo(...q[k])); x.closePath(); x.fill();
    }
    const px = x.getImageData(0, 0, W, H).data, z = new Uint8Array(W * H); for (let i = 0; i < z.length; i++) z[i] = px[i * 4 + 3] > 127 ? 1 : 0;
    return { zone: z, n };
  }
  return { charger, zone, liberer };
})();
