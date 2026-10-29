/* ===== Restauration IA « qualité maximale » =====
   Modèle : Real-ESRGAN « general v3 » (SRVGGNetCompact, 1,2 M de paramètres, licence BSD-3, voir LICENSE-Real-ESRGAN.txt).
   Il retire les blocs de compression, le bruit et le flou, et recrée du détail, en agrandissant ×4.
   Tout tourne sur la carte graphique du téléphone (WebGL2), sans serveur : aucune image ne quitte l'appareil.
   L'image est traitée par tuiles (avec une marge de 36 px, plus grande que le champ de vision du réseau : 34 px),
   ce qui donne exactement le même résultat qu'en une fois, tout en limitant la mémoire.
   Après chaque tuile, on rend la main au navigateur : l'iPhone n'arrête donc jamais un calcul trop long. */
var SR = (() => {
  const NH = 32, HALO = 36, CORE = 224;            // 32 couches cachées ; tuile utile 224 px + marge
  const MAXPX = 1100000;                           // vidéo : au-delà (déjà HD), le calcul serait trop long sur iPhone
  const PHOTO = 13000000;                          // photo : une seule image, on peut se permettre plus
  let g = null, cvs = null, st = null, why = "", A = null, Bm = null, dnCur = -1;
  let pFirst, pHid, pLast, pOut, layers = [], X0, X1, XL, img, fb, vao, tileW = 0, tileH = 0;

  const h2f = (() => {           // demi-précision -> float
    const t = new Float32Array(1), u = new Uint32Array(t.buffer);
    return h => { const s = (h & 0x8000) << 16, e = (h >> 10) & 31, m = h & 1023;
      if (e === 0) { return (s ? -1 : 1) * m * 5.960464477539063e-8 }
      if (e === 31) { u[0] = s | 0x7f800000 | (m << 13); return t[0] }
      u[0] = s | ((e + 112) << 23) | (m << 13); return t[0] };
  })();

  const VS = `#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
  /* une couche : 4 sorties par passe, poids dans un bloc uniforme (std140), PReLU */
  const conv = (first) => `#version 300 es
precision highp float;precision highp int;precision highp sampler2DArray;precision highp sampler2D;
${first ? "uniform sampler2D I;" : "uniform sampler2DArray X;"}
uniform ivec2 org,isz,tsz;
layout(std140) uniform Wb{vec4 W[${first ? 36 : 576}];vec4 Bi;vec4 Al;};
out vec4 o;
void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 a=Bi;
for(int t=0;t<9;t++){ivec2 q=p+ivec2(t-(t/3)*3-1,t/3-1);ivec2 gg=q+org;
  if(any(lessThan(gg,ivec2(0)))||any(greaterThanEqual(gg,isz)))continue;
  ${first ? `vec4 x=vec4(texelFetch(I,gg,0).rgb,0.);int b=t*4;
  a+=vec4(dot(x,W[b]),dot(x,W[b+1]),dot(x,W[b+2]),dot(x,W[b+3]));`
  : `if(any(lessThan(q,ivec2(0)))||any(greaterThanEqual(q,tsz)))continue;
  for(int ig=0;ig<16;ig++){vec4 x=texelFetch(X,ivec3(q,ig),0);int b=(t*16+ig)*4;
    a+=vec4(dot(x,W[b]),dot(x,W[b+1]),dot(x,W[b+2]),dot(x,W[b+3]));}`}}
o=${"%ACT%"};}`;
  const convF = first => conv(first).replace("%ACT%", "max(a,0.)+Al*min(a,0.)");
  const convL = () => conv(false).replace("%ACT%", "a");
  /* réarrangement ×4 (PixelShuffle) + image d'origine agrandie, moyenné à l'échelle voulue */
  const FOUT = `#version 300 es
precision highp float;precision highp int;precision highp sampler2DArray;precision highp sampler2D;
uniform sampler2DArray L;uniform sampler2D I;uniform ivec2 org,isz;uniform vec2 rat;uniform float oh;uniform int k;
out vec4 o;
void main(){vec2 P=vec2(gl_FragCoord.x-.5,oh-gl_FragCoord.y-.5);vec3 s=vec3(0.);
for(int j=0;j<4;j++){if(j>=k)break;for(int i=0;i<4;i++){if(i>=k)break;
  ivec2 Q=ivec2(floor((P+(vec2(i,j)+.5)/float(k))*rat));Q=clamp(Q,ivec2(0),isz*4-1);
  ivec2 lr=Q/4,sub=Q-lr*4,q=lr-org;vec3 c;
  for(int ch=0;ch<3;ch++){int n=ch*16+sub.y*4+sub.x;vec4 v=texelFetch(L,ivec3(q,n/4),0);int m=n-(n/4)*4;
    c[ch]=m==0?v.x:m==1?v.y:m==2?v.z:v.w;}
  s+=clamp(c+texelFetch(I,lr,0).rgb,0.,1.);}}
o=vec4(s/float(k*k),1.);}`;

  function prog(fs) {
    const sh = (t, s) => { const x = g.createShader(t); g.shaderSource(x, s); g.compileShader(x);
      if (!g.getShaderParameter(x, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(x)); return x };
    const p = g.createProgram(); g.attachShader(p, sh(g.VERTEX_SHADER, VS)); g.attachShader(p, sh(g.FRAGMENT_SHADER, fs));
    g.bindAttribLocation(p, 0, "p"); g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(p));
    const bi = g.getUniformBlockIndex(p, "Wb"); if (bi !== 0xFFFFFFFF) g.uniformBlockBinding(p, bi, 0);
    return p;
  }
  function arr(layersN, w, h) {
    const t = g.createTexture(); g.bindTexture(g.TEXTURE_2D_ARRAY, t);
    g.texStorage3D(g.TEXTURE_2D_ARRAY, 1, g.RGBA16F, w, h, layersN);
    [[g.TEXTURE_MIN_FILTER, g.NEAREST], [g.TEXTURE_MAG_FILTER, g.NEAREST]].forEach(([a, b]) => g.texParameteri(g.TEXTURE_2D_ARRAY, a, b));
    return t;
  }

  /* poids : mélange des deux versions officielles (« débruitage fort » / « faible »), comme l'outil d'origine */
  function setWeights(dn) {
    if (dn === dnCur) return; dnCur = dn;
    const n = A.length / 2;let o = 0;const val = i => dn * A[i] + (1 - dn) * A[n + i];
    layers.forEach(L => L.ubos.forEach(u => g.deleteBuffer(u))); layers = [];
    const shapes = [[3, 64, true]]; for (let i = 0; i < NH; i++) shapes.push([64, 64, true]); shapes.push([64, 48, false]);
    for (const [ci, co, act] of shapes) {
      const w0 = o; o += co * ci * 9; const b0 = o; o += co; let a0 = -1; if (act) { a0 = o; o += co }
      const ng = ci === 3 ? 1 : 16, nv = ci === 3 ? 36 : 576, ubos = [];
      for (let og = 0; og < co / 4; og++) {
        const f = new Float32Array((nv + 2) * 4);
        for (let t = 0; t < 9; t++) for (let ig = 0; ig < ng; ig++) for (let j = 0; j < 4; j++) {
          const oc = og * 4 + j, b = ((t * ng + ig) * 4 + j) * 4;
          for (let c = 0; c < 4; c++) { const ic = ig * 4 + c; f[b + c] = ic < ci ? val(w0 + ((oc * ci + ic) * 9 + t)) : 0 }
        }
        for (let j = 0; j < 4; j++) { f[nv * 4 + j] = val(b0 + og * 4 + j); f[nv * 4 + 4 + j] = a0 >= 0 ? val(a0 + og * 4 + j) : 0 }
        const u = g.createBuffer(); g.bindBuffer(g.UNIFORM_BUFFER, u); g.bufferData(g.UNIFORM_BUFFER, f, g.STATIC_DRAW); ubos.push(u);
      }
      layers.push({ ci, co, act, ubos });
    }
    if (o !== n) throw new Error("taille des poids inattendue");
  }

  async function init() {
    if (st !== null) return st;
    try {
      cvs = document.createElement("canvas"); cvs.width = cvs.height = 1;
      g = cvs.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
      if (!g) { why = "ce navigateur n’a pas WebGL2"; return st = false }
      if (!g.getExtension("EXT_color_buffer_float")) { why = "la carte graphique ne gère pas les calculs en virgule flottante"; return st = false }
      const r = await fetch("sr.bin"); if (!r.ok) throw new Error("poids introuvables");
      const h = new Uint16Array(await r.arrayBuffer()); A = new Float32Array(h.length); for (let i = 0; i < h.length; i++) A[i] = h2f(h[i]);
      pFirst = prog(convF(true)); pHid = prog(convF(false)); pLast = prog(convL()); pOut = prog(FOUT);
      vao = g.createVertexArray(); g.bindVertexArray(vao); const vb = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, vb);
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW); g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
      fb = g.createFramebuffer(); img = g.createTexture();
      setWeights(.3);
      return st = true;
    } catch (e) { why = (e && e.message) || "erreur"; return st = false }
  }
  const frame = () => new Promise(r => setTimeout(r, 0));
  async function gpuWait() {
    const s = g.fenceSync(g.SYNC_GPU_COMMANDS_COMPLETE, 0); g.flush();
    for (let i = 0; i < 20000; i++) { const r = g.clientWaitSync(s, 0, 0); if (r === g.ALREADY_SIGNALED || r === g.CONDITION_SATISFIED) break; if (r === g.WAIT_FAILED) break; await frame() }
    g.deleteSync(s);
  }
  const uni = (p, n) => g.getUniformLocation(p, n);

  /* src : vidéo, image, canevas ou VideoFrame. s : échelle de sortie (≤ 4). Renvoie un canevas à la taille W·s × H·s. */
  async function run(src, s, dn, onTile, maxpx) {
    if (!(await init())) throw new Error(why);
    const W = src.videoWidth || src.displayWidth || src.naturalWidth || src.width, H = src.videoHeight || src.displayHeight || src.naturalHeight || src.height;
    if (W * H > (maxpx || MAXPX)) throw new Error("image trop grande");
    s = Math.min(4, Math.max(.25, s)); setWeights(dn == null ? .3 : dn);
    const OW = Math.max(2, Math.round(W * s)), OH = Math.max(2, Math.round(H * s));
    if (cvs.width !== OW || cvs.height !== OH) { cvs.width = OW; cvs.height = OH }
    g.bindVertexArray(vao);
    g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, img);
    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false); g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, W, H, 0, g.RGBA, g.UNSIGNED_BYTE, src);
    [[g.TEXTURE_MIN_FILTER, g.NEAREST], [g.TEXTURE_MAG_FILTER, g.NEAREST], [g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE], [g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE]].forEach(([a, b]) => g.texParameteri(g.TEXTURE_2D, a, b));
    const TW = Math.min(W, CORE + 2 * HALO), TH = Math.min(H, CORE + 2 * HALO);
    if (TW !== tileW || TH !== tileH) {
      [X0, X1, XL].forEach(t => t && g.deleteTexture(t));
      X0 = arr(16, TW, TH); X1 = arr(16, TW, TH); XL = arr(12, TW, TH); tileW = TW; tileH = TH;
    }
    const rx = 4 * W / OW, ry = 4 * H / OH, k = Math.min(4, Math.max(1, Math.ceil(Math.max(rx, ry) - 1e-6)));
    const ox = x => Math.round(x * OW / W), oy = y => Math.round(y * OH / H);
    const nT = Math.ceil(W / CORE) * Math.ceil(H / CORE); let done = 0;
    for (let cy = 0; cy < H; cy += CORE) for (let cx = 0; cx < W; cx += CORE) {
      const ex = Math.max(0, Math.min(cx - HALO, W - TW)), ey = Math.max(0, Math.min(cy - HALO, H - TH));
      let cur = X0, nxt = X1;
      g.bindFramebuffer(g.FRAMEBUFFER, fb); g.viewport(0, 0, TW, TH);
      for (let li = 0; li < layers.length; li++) {
        const Ly = layers[li], p = li === 0 ? pFirst : li === layers.length - 1 ? pLast : pHid, dst = li === layers.length - 1 ? XL : nxt;
        g.useProgram(p);
        g.uniform2i(uni(p, "org"), ex, ey); g.uniform2i(uni(p, "isz"), W, H); if (li) g.uniform2i(uni(p, "tsz"), TW, TH);
        g.activeTexture(g.TEXTURE0);
        if (li === 0) { g.bindTexture(g.TEXTURE_2D, img); g.uniform1i(uni(p, "I"), 0) } else { g.bindTexture(g.TEXTURE_2D_ARRAY, cur); g.uniform1i(uni(p, "X"), 0) }
        for (let og = 0; og < Ly.ubos.length; og++) {
          g.framebufferTextureLayer(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, dst, 0, og);
          g.bindBufferBase(g.UNIFORM_BUFFER, 0, Ly.ubos[og]);
          g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
        }
        g.flush();
        if (li < layers.length - 1) { const t = cur; cur = nxt; nxt = t }
        if (li % 6 === 5) await gpuWait();
      }
      /* sortie de la partie utile de la tuile */
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      const x0 = ox(cx), x1 = ox(Math.min(W, cx + CORE)), y0 = oy(cy), y1 = oy(Math.min(H, cy + CORE));
      g.viewport(0, 0, OW, OH); g.enable(g.SCISSOR_TEST); g.scissor(x0, OH - y1, x1 - x0, y1 - y0);
      g.useProgram(pOut);
      g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D_ARRAY, XL); g.uniform1i(uni(pOut, "L"), 0);
      g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, img); g.uniform1i(uni(pOut, "I"), 1);
      g.uniform2i(uni(pOut, "org"), ex, ey); g.uniform2i(uni(pOut, "isz"), W, H); g.uniform2f(uni(pOut, "rat"), rx, ry);
      g.uniform1f(uni(pOut, "oh"), OH); g.uniform1i(uni(pOut, "k"), k);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4); g.disable(g.SCISSOR_TEST); g.activeTexture(g.TEXTURE0);
      await gpuWait(); done++; if (onTile) onTile(done / nT);
    }
    return cvs;
  }
  return {
    init, run, MAXPX, PHOTO,
    get ok() { return st }, get why() { return why },
    fits(W, H, maxpx) { return W * H <= (maxpx || MAXPX) },
  };
})();
