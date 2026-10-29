/* ===== Effet de relief pour « Animer la photo » =====
   1. Profondeur : Depth Anything V2 Small (licence Apache-2.0), exécuté sur le téléphone par ONNX Runtime Web (licence MIT,
      fichiers dans ort/). Le modèle (27 Mo) est téléchargé une seule fois puis gardé sur l'appareil.
   2. Relief : la caméra se déplace doucement ; ce qui est proche bouge plus que le fond (parallaxe), calculé en WebGL2.
   Rien n'est inventé : chaque pixel affiché vient de la photo, seule sa position change selon sa distance. */
var DEPTH = (() => {
  const MODEL = "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx";
  const CACHE = "retouche-modeles-v1", SIDE = 518;
  let sess = null, loading = null;

  function script(src) {
    return new Promise((ok, ko) => { if (window.ort) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => ko(new Error("moteur introuvable")); document.head.appendChild(s) });
  }
  /* téléchargement du modèle avec progression, puis copie gardée sur l'appareil (fonctionne ensuite hors ligne) */
  async function modelBytes(onP) {
    let c = null; try { c = await caches.open(CACHE); const hit = await c.match(MODEL); if (hit) return new Uint8Array(await hit.arrayBuffer()) } catch (e) { c = null }
    const r = await fetch(MODEL); if (!r.ok || !r.body) throw new Error("téléchargement du modèle impossible (" + r.status + ")");
    const tot = +r.headers.get("content-length") || 27258801, rd = r.body.getReader(), parts = []; let n = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; if (onP) onP(Math.min(1, n / tot)) }
    const buf = new Uint8Array(n); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length }
    try { if (c) await c.put(MODEL, new Response(buf, { headers: { "content-type": "application/octet-stream" } })) } catch (e) {}
    return buf;
  }
  async function load(onP) {
    if (sess) return sess;
    if (!loading) loading = (async () => {
      await script("ort/ort.wasm.min.js");
      ort.env.wasm.wasmPaths = new URL("ort/", location.href).href;
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      const b = await modelBytes(onP);
      sess = await ort.InferenceSession.create(b, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
      return sess;
    })().catch(e => { loading = null; throw e });
    return loading;
  }
  /* carte de profondeur (proche = 1, loin = 0), à la taille d'entrée du modèle */
  async function estimate(img, onP) {
    const s = await load(onP);
    const w = img.naturalWidth || img.videoWidth || img.width, h = img.naturalHeight || img.videoHeight || img.height;
    const k = SIDE / Math.max(w, h), W = Math.max(14, Math.round(w * k / 14) * 14), H = Math.max(14, Math.round(h * k / 14) * 14);
    const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, n = W * H, t = new Float32Array(3 * n), M = [.485, .456, .406], S = [.229, .224, .225];
    for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) t[ch * n + i] = (d[i * 4 + ch] / 255 - M[ch]) / S[ch];
    const inName = s.inputNames[0], out = await s.run({ [inName]: new ort.Tensor("float32", t, [1, 3, H, W]) });
    const o = out[s.outputNames[0]], z = o.data, dims = o.dims, OH = dims[dims.length - 2], OW = dims[dims.length - 1];
    /* normalisation robuste (1er–99e centile), puis léger lissage pour éviter les déchirures aux contours */
    const srt = Float32Array.from(z).sort(), lo = srt[Math.floor(srt.length * .01)], hi = srt[Math.floor(srt.length * .99)] || lo + 1;
    let dep = new Float32Array(OW * OH); for (let i = 0; i < dep.length; i++) dep[i] = Math.min(1, Math.max(0, (z[i] - lo) / (hi - lo)));
    const bl = new Float32Array(dep.length);
    for (let y = 0; y < OH; y++) for (let x2 = 0; x2 < OW; x2++) { let a = 0, m = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x2 + dx; if (yy < 0 || xx < 0 || yy >= OH || xx >= OW) continue; a += dep[yy * OW + xx]; m++ } bl[y * OW + x2] = a / m }
    return { W: OW, H: OH, d: bl };
  }

  /* ---------- rendu du relief (WebGL2) ---------- */
  let g = null, cvs = null, prog = null, tI = null, tD = null, loc = {};
  const VS = `#version 300 es
in vec2 p;out vec2 uv;void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}`;
  /* pour chaque pixel affiché, on cherche le point de la photo qui, déplacé selon sa profondeur, arrive ici (quelques itérations) */
  const FS = `#version 300 es
precision highp float;in vec2 uv;out vec4 o;uniform sampler2D I,D;uniform vec2 cam,ctr;uniform float zoom,focus,alpha;
void main(){vec2 q=ctr+(uv-.5)/zoom;vec2 s=q;
for(int i=0;i<10;i++){float d=texture(D,s).r;s=q-cam*(d-focus);}
s=clamp(s,vec2(0.),vec2(1.));o=vec4(texture(I,s).rgb*alpha,1.);}`;
  function setup(img, dep, W, H) {
    if (!cvs) { cvs = document.createElement("canvas"); g = cvs.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false }) }
    if (!g) throw new Error("WebGL2 indisponible");
    cvs.width = W; cvs.height = H;
    if (!prog) {
      const sh = (t, s) => { const x = g.createShader(t); g.shaderSource(x, s); g.compileShader(x); if (!g.getShaderParameter(x, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(x)); return x };
      prog = g.createProgram(); g.attachShader(prog, sh(g.VERTEX_SHADER, VS)); g.attachShader(prog, sh(g.FRAGMENT_SHADER, FS)); g.bindAttribLocation(prog, 0, "p"); g.linkProgram(prog);
      ["I", "D", "cam", "ctr", "zoom", "focus", "alpha"].forEach(k => loc[k] = g.getUniformLocation(prog, k));
      const b = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
      g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
      tI = g.createTexture(); tD = g.createTexture();
    }
    const par = t => { [[g.TEXTURE_MIN_FILTER, g.LINEAR], [g.TEXTURE_MAG_FILTER, g.LINEAR], [g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE], [g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE]].forEach(([a, b]) => g.texParameteri(g.TEXTURE_2D, a, b)) };
    g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, tI); par(); g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, img);
    g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, tD); par();
    g.texImage2D(g.TEXTURE_2D, 0, g.R16F, dep.W, dep.H, 0, g.RED, g.FLOAT, dep.d);   /* R16F : interpolée, donc relief sans marches */
    /* point de mise au point : profondeur du centre de l'image (le sujet reste à peu près immobile, le fond glisse) */
    let a = 0, m = 0; for (let y = Math.floor(dep.H * .3); y < dep.H * .7; y++) for (let x = Math.floor(dep.W * .3); x < dep.W * .7; x++) { a += dep.d[y * dep.W + x]; m++ }
    return a / m;
  }
  /* t : 0..1 dans l'animation ; renvoie le canevas de l'image */
  function frame(t, focus, amp, alpha) {
    const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, ph = e * 2 - 1;
    g.viewport(0, 0, cvs.width, cvs.height); g.useProgram(prog);
    g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, tI); g.uniform1i(loc.I, 0);
    g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, tD); g.uniform1i(loc.D, 1);
    g.uniform2f(loc.cam, amp * ph, amp * .35 * ph);
    g.uniform2f(loc.ctr, .5, .5); g.uniform1f(loc.zoom, 1.06 + .06 * e); g.uniform1f(loc.focus, focus); g.uniform1f(loc.alpha, alpha);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    return cvs;
  }
  return { load, estimate, setup, frame, get ready() { return !!sess } };
})();
