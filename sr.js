/* ===== Restauration IA « qualité maximale » =====
   Réseau de type Real-ESRGAN (SRVGGNetCompact, licence BSD-3, voir LICENSE-Real-ESRGAN.txt) : retire les blocs de
   compression, le bruit et le flou, et recrée du détail, en agrandissant ×4.
   Tout tourne sur la carte graphique du téléphone (WebGL2), sans serveur : aucune image ne quitte l'appareil.

   Organisation du calcul (pensée pour les puces Apple) :
   - chaque passe calcule 16 canaux à la fois (4 cibles de dessin), et les cibles sont préparées une fois pour toutes ;
   - l'image est traitée par tuiles avec une marge plus grande que le champ de vision du réseau : résultat identique
     à un calcul d'un seul bloc, mémoire limitée, et on rend la main au navigateur entre les tuiles ;
   - le résultat ×4 complet est gardé : l'aperçu puis l'export d'une même image ne lancent le réseau qu'une fois. */
var SR = (() => {
  const CORE = 224;
  const MAXPX = 1100000;                           // au-delà (image déjà HD), l'IA n'apporte rien et serait très longue
  let g = null, cvs = null, st = null, why = "", vao, img, full = null, fullW = 0, fullH = 0, fbFull = null;
  let M = null;                                    // modèle chargé : {nf, nc, halo, A (poids, 1 ou 2 jeux), layers, progs}
  let dnCur = -1, tileW = 0, tileH = 0, X0, X1, XL, fbs = null, cacheKey = null, stats = { ms: 0, px: 0 };

  const h2f = (() => {
    const t = new Float32Array(1), u = new Uint32Array(t.buffer);
    return h => { const s = (h & 0x8000) << 16, e = (h >> 10) & 31, m = h & 1023;
      if (e === 0) return (s ? -1 : 1) * m * 5.960464477539063e-8;
      if (e === 31) { u[0] = s | 0x7f800000 | (m << 13); return t[0] }
      u[0] = s | ((e + 112) << 23) | (m << 13); return t[0] };
  })();

  const VS = `#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
  const HEAD = `#version 300 es
precision highp float;precision highp int;precision highp sampler2DArray;precision highp sampler2D;`;
  /* une couche : 16 sorties par passe (4 cibles × 4 canaux), entrées « ng » groupes de 4 canaux */
  function convSrc(ng, first, act, nout) {
    const nv = 9 * ng * 4;
    let s = HEAD + (first ? "uniform sampler2D I;" : "uniform sampler2DArray X;") + `
uniform ivec2 org,isz,tsz;
layout(std140) uniform Wb{vec4 W[${nv}];vec4 Bi;vec4 Al;}wb[${nout}];
`;
    for (let k = 0; k < nout; k++) s += `layout(location=${k}) out vec4 o${k};\n`;
    s += `void main(){ivec2 p=ivec2(gl_FragCoord.xy);`;
    for (let k = 0; k < nout; k++) s += `vec4 a${k}=wb[${k}].Bi;`;
    s += `
for(int t=0;t<9;t++){ivec2 q=p+ivec2(t-(t/3)*3-1,t/3-1);ivec2 gg=q+org;
 if(any(lessThan(gg,ivec2(0)))||any(greaterThanEqual(gg,isz)))continue;
 ${first ? "" : "if(any(lessThan(q,ivec2(0)))||any(greaterThanEqual(q,tsz)))continue;"}
 for(int ig=0;ig<${ng};ig++){
  vec4 x=${first ? "vec4(texelFetch(I,gg,0).rgb,0.)" : "texelFetch(X,ivec3(q,ig),0)"};int b=(t*${ng}+ig)*4;
`;
    for (let k = 0; k < nout; k++) s += `  a${k}+=vec4(dot(x,wb[${k}].W[b]),dot(x,wb[${k}].W[b+1]),dot(x,wb[${k}].W[b+2]),dot(x,wb[${k}].W[b+3]));\n`;
    s += `}}\n`;
    for (let k = 0; k < nout; k++) s += act ? `o${k}=max(a${k},0.)+wb[${k}].Al*min(a${k},0.);` : `o${k}=a${k};`;
    return s + "}";
  }
  /* PixelShuffle ×4 + image d'origine agrandie : écrit le résultat ×4 de la tuile */
  const FSHUF = HEAD + `
uniform sampler2DArray L;uniform sampler2D I;uniform ivec2 org,isz;out vec4 o;
void main(){ivec2 Q=ivec2(gl_FragCoord.xy),lr=Q/4,sub=Q-lr*4,q=lr-org;vec3 c;
for(int ch=0;ch<3;ch++){int n=ch*16+sub.y*4+sub.x;vec4 v=texelFetch(L,ivec3(q,n/4),0);int m=n-(n/4)*4;c[ch]=m==0?v.x:m==1?v.y:m==2?v.z:v.w;}
o=vec4(clamp(c+texelFetch(I,lr,0).rgb,0.,1.),1.);}`;
  /* mise à l'échelle demandée : moyenne des pixels ×4 couverts (réduction sans crénelage), sortie retournée pour le canevas */
  const FRES = HEAD + `
uniform sampler2D F;uniform vec2 rat;uniform float oh;uniform int k;uniform ivec2 fsz;out vec4 o;
void main(){vec2 P=vec2(gl_FragCoord.x-.5,oh-gl_FragCoord.y-.5);vec3 s=vec3(0.);
for(int j=0;j<8;j++){if(j>=k)break;for(int i=0;i<8;i++){if(i>=k)break;
 ivec2 Q=clamp(ivec2(floor((P+(vec2(i,j)+.5)/float(k))*rat)),ivec2(0),fsz-1);s+=texelFetch(F,Q,0).rgb;}}
o=vec4(s/float(k*k),1.);}`;

  function prog(fs, blocks) {
    const sh = (t, s) => { const x = g.createShader(t); g.shaderSource(x, s); g.compileShader(x);
      if (!g.getShaderParameter(x, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(x) || "compilation"); return x };
    const p = g.createProgram(); g.attachShader(p, sh(g.VERTEX_SHADER, VS)); g.attachShader(p, sh(g.FRAGMENT_SHADER, fs));
    g.bindAttribLocation(p, 0, "p"); g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(p) || "liaison");
    for (let k = 0; k < (blocks || 0); k++) { const bi = g.getUniformBlockIndex(p, "Wb[" + k + "]"); if (bi !== 0xFFFFFFFF) g.uniformBlockBinding(p, bi, k) }
    p.u = n => g.getUniformLocation(p, n);
    return p;
  }
  function arr(n, w, h) {
    const t = g.createTexture(); g.bindTexture(g.TEXTURE_2D_ARRAY, t);
    g.texStorage3D(g.TEXTURE_2D_ARRAY, 1, g.RGBA16F, w, h, n);
    g.texParameteri(g.TEXTURE_2D_ARRAY, g.TEXTURE_MIN_FILTER, g.NEAREST); g.texParameteri(g.TEXTURE_2D_ARRAY, g.TEXTURE_MAG_FILTER, g.NEAREST);
    return t;
  }
  function fbArr(t, first, n) {             // cible de dessin : couches first..first+n-1 de t
    const f = g.createFramebuffer(); g.bindFramebuffer(g.FRAMEBUFFER, f); const db = [];
    for (let k = 0; k < n; k++) { g.framebufferTextureLayer(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0 + k, t, 0, first + k); db.push(g.COLOR_ATTACHMENT0 + k) }
    g.drawBuffers(db); return f;
  }

  /* poids : un ou deux jeux (« débruitage fort / faible », mélangés comme l'outil d'origine), ordre PyTorch */
  function setWeights(dn) {
    if (dn === dnCur) return; dnCur = dn; cacheKey = null;
    const { A, nf, nc } = M, two = A.length === M.n * 2, val = two ? (i => dn * A[i] + (1 - dn) * A[M.n + i]) : (i => A[i]);
    (M.layers || []).forEach(L => L.ubos.forEach(u => g.deleteBuffer(u)));
    const shapes = [[3, nf, true]]; for (let i = 0; i < nc; i++) shapes.push([nf, nf, true]); shapes.push([nf, 48, false]);
    let o = 0; M.layers = [];
    for (const [ci, co, act] of shapes) {
      const w0 = o; o += co * ci * 9; const b0 = o; o += co; let a0 = -1; if (act) { a0 = o; o += co }
      const ng = ci === 3 ? 1 : ci / 4, nv = 9 * ng * 4, ubos = [];
      for (let og = 0; og < co / 4; og++) {
        const f = new Float32Array((nv + 2) * 4);
        for (let t = 0; t < 9; t++) for (let ig = 0; ig < ng; ig++) for (let j = 0; j < 4; j++) {
          const oc = og * 4 + j, b = ((t * ng + ig) * 4 + j) * 4;
          for (let c = 0; c < 4; c++) { const ic = ig * 4 + c; f[b + c] = ic < ci ? val(w0 + ((oc * ci + ic) * 9 + t)) : 0 }
        }
        for (let j = 0; j < 4; j++) { f[nv * 4 + j] = val(b0 + og * 4 + j); f[nv * 4 + 4 + j] = a0 >= 0 ? val(a0 + og * 4 + j) : 0 }
        const u = g.createBuffer(); g.bindBuffer(g.UNIFORM_BUFFER, u); g.bufferData(g.UNIFORM_BUFFER, f, g.STATIC_DRAW); ubos.push(u);
      }
      M.layers.push({ ci, co, act, ng, ubos });
    }
    if (o !== M.n) throw new Error("taille des poids inattendue");
  }

  async function init(model) {
    if (st !== null) return st;
    try {
      cvs = document.createElement("canvas"); cvs.width = cvs.height = 1;
      g = cvs.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
      if (!g) { why = "ce navigateur n’a pas WebGL2"; return st = false }
      if (!g.getExtension("EXT_color_buffer_float")) { why = "la carte graphique ne gère pas les calculs en virgule flottante"; return st = false }
      if (g.getParameter(g.MAX_DRAW_BUFFERS) < 4) { why = "carte graphique trop limitée"; return st = false }
      model = model || { file: "sr.bin", nf: 64, nc: 32, pairs: 2 };
      const r = await fetch(model.file); if (!r.ok) throw new Error("poids introuvables");
      const h = new Uint16Array(await r.arrayBuffer()); const A = new Float32Array(h.length); for (let i = 0; i < h.length; i++) A[i] = h2f(h[i]);
      const { nf, nc } = model, n = 3 * nf * 9 + 2 * nf + nc * (nf * nf * 9 + 2 * nf) + nf * 48 * 9 + 48;
      if (A.length !== n * (model.pairs || 1)) throw new Error("fichier de poids inattendu");
      M = { nf, nc, n, A, halo: nc + 4 };
      const ngh = nf / 4;
      M.pFirst = prog(convSrc(1, true, true, 4), 4); M.pHid = prog(convSrc(ngh, false, true, 4), 4);
      M.pLast = prog(convSrc(ngh, false, false, 4), 4);
      M.pShuf = prog(FSHUF); M.pRes = prog(FRES);
      vao = g.createVertexArray(); g.bindVertexArray(vao); const vb = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, vb);
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW); g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
      img = g.createTexture();
      setWeights(.3);
      return st = true;
    } catch (e) { why = (e && e.message) || "erreur"; return st = false }
  }
  const frame = () => new Promise(r => setTimeout(r, 0));
  async function gpuWait() {
    const s = g.fenceSync(g.SYNC_GPU_COMMANDS_COMPLETE, 0); g.flush();
    for (let i = 0; i < 200000; i++) { const r = g.clientWaitSync(s, 0, 0); if (r !== g.TIMEOUT_EXPIRED) break; await frame() }
    g.deleteSync(s);
  }
  const tex2d = (t, filt) => { g.bindTexture(g.TEXTURE_2D, t);
    [[g.TEXTURE_MIN_FILTER, filt], [g.TEXTURE_MAG_FILTER, filt], [g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE], [g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE]].forEach(([a, b]) => g.texParameteri(g.TEXTURE_2D, a, b)) };

  /* calcule le résultat ×4 complet de src dans la texture « full » */
  async function network(src, W, H, onTile) {
    const halo = M.halo, nfg = M.nf / 4;
    g.activeTexture(g.TEXTURE0); tex2d(img, g.NEAREST);
    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false); g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, W, H, 0, g.RGBA, g.UNSIGNED_BYTE, src);
    if (fullW !== W * 4 || fullH !== H * 4) {
      if (full) { g.deleteTexture(full); g.deleteFramebuffer(fbFull) }
      full = g.createTexture(); tex2d(full, g.NEAREST); g.texStorage2D(g.TEXTURE_2D, 1, g.RGBA8, W * 4, H * 4);
      fbFull = g.createFramebuffer(); g.bindFramebuffer(g.FRAMEBUFFER, fbFull); g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, full, 0);
      fullW = W * 4; fullH = H * 4;
    }
    const TW = Math.min(W, CORE + 2 * halo), TH = Math.min(H, CORE + 2 * halo);
    if (TW !== tileW || TH !== tileH) {
      [X0, X1, XL].forEach(t => t && g.deleteTexture(t)); if (fbs) [].concat(fbs.x0, fbs.x1, fbs.xl).forEach(f => g.deleteFramebuffer(f));
      X0 = arr(nfg, TW, TH); X1 = arr(nfg, TW, TH); XL = arr(12, TW, TH); tileW = TW; tileH = TH;
      fbs = { x0: [], x1: [], xl: [] };
      for (let d = 0; d < nfg / 4; d++) { fbs.x0.push(fbArr(X0, d * 4, 4)); fbs.x1.push(fbArr(X1, d * 4, 4)) }
      for (let d = 0; d < 3; d++) fbs.xl.push(fbArr(XL, d * 4, 4));
    }
    const nT = Math.ceil(W / CORE) * Math.ceil(H / CORE); let done = 0;
    for (let cy = 0; cy < H; cy += CORE) for (let cx = 0; cx < W; cx += CORE) {
      const ex = Math.max(0, Math.min(cx - halo, W - TW)), ey = Math.max(0, Math.min(cy - halo, H - TH));
      let cur = X0, curF = fbs.x0, nxt = X1, nxtF = fbs.x1;
      g.viewport(0, 0, TW, TH);
      const L = M.layers;
      for (let li = 0; li < L.length; li++) {
        const Ly = L[li], last = li === L.length - 1, p = li === 0 ? M.pFirst : last ? M.pLast : M.pHid, F = last ? fbs.xl : nxtF;
        g.useProgram(p); g.uniform2i(p.u("org"), ex, ey); g.uniform2i(p.u("isz"), W, H); if (li) g.uniform2i(p.u("tsz"), TW, TH);
        g.activeTexture(g.TEXTURE0);
        if (li === 0) { g.bindTexture(g.TEXTURE_2D, img); g.uniform1i(p.u("I"), 0) } else { g.bindTexture(g.TEXTURE_2D_ARRAY, cur); g.uniform1i(p.u("X"), 0) }
        for (let d = 0; d < F.length; d++) {
          g.bindFramebuffer(g.FRAMEBUFFER, F[d]);
          for (let k = 0; k < 4; k++) g.bindBufferBase(g.UNIFORM_BUFFER, k, Ly.ubos[d * 4 + k]);
          g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
        }
        if (!last) { [cur, nxt] = [nxt, cur]; [curF, nxtF] = [nxtF, curF] }
        if (li % 8 === 7) await gpuWait();
      }
      /* partie utile de la tuile -> résultat ×4 */
      g.bindFramebuffer(g.FRAMEBUFFER, fbFull); g.viewport(0, 0, fullW, fullH);
      const x1 = Math.min(W, cx + CORE), y1 = Math.min(H, cy + CORE);
      g.enable(g.SCISSOR_TEST); g.scissor(cx * 4, cy * 4, (x1 - cx) * 4, (y1 - cy) * 4);
      const p = M.pShuf; g.useProgram(p);
      g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D_ARRAY, XL); g.uniform1i(p.u("L"), 0);
      g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, img); g.uniform1i(p.u("I"), 1);
      g.uniform2i(p.u("org"), ex, ey); g.uniform2i(p.u("isz"), W, H);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4); g.disable(g.SCISSOR_TEST); g.activeTexture(g.TEXTURE0);
      await gpuWait(); done++; if (onTile) onTile(done / nT);
    }
  }

  /* src : vidéo, image, canevas ou VideoFrame ; s : échelle de sortie ; key : identifiant de l'image (null = pas de réutilisation).
     Renvoie un canevas de W·s × H·s. */
  async function run(src, s, dn, onTile, key) {
    if (!(await init())) throw new Error(why);
    const W = src.videoWidth || src.displayWidth || src.naturalWidth || src.width, H = src.videoHeight || src.displayHeight || src.naturalHeight || src.height;
    if (W * H > MAXPX) throw new Error("image trop grande");
    if (W * 4 > g.getParameter(g.MAX_TEXTURE_SIZE) || H * 4 > g.getParameter(g.MAX_TEXTURE_SIZE)) throw new Error("image trop grande pour la carte graphique");
    s = Math.min(4, Math.max(.25, s)); setWeights(dn == null ? .3 : dn);
    g.bindVertexArray(vao);
    const k2 = key == null ? null : key + "|" + W + "x" + H + "|" + dnCur;
    if (k2 === null || k2 !== cacheKey || fullW !== W * 4) {
      cacheKey = null; const t0 = performance.now();
      await network(src, W, H, onTile);
      stats = { ms: performance.now() - t0, px: W * H }; cacheKey = k2;
    } else if (onTile) onTile(1);
    const OW = Math.max(2, Math.round(W * s)), OH = Math.max(2, Math.round(H * s));
    if (cvs.width !== OW || cvs.height !== OH) { cvs.width = OW; cvs.height = OH }
    g.bindFramebuffer(g.FRAMEBUFFER, null); g.viewport(0, 0, OW, OH);
    const p = M.pRes; g.useProgram(p);
    g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, full); g.uniform1i(p.u("F"), 0);
    const rx = fullW / OW, ry = fullH / OH;
    g.uniform2f(p.u("rat"), rx, ry); g.uniform1f(p.u("oh"), OH); g.uniform2i(p.u("fsz"), fullW, fullH);
    g.uniform1i(p.u("k"), Math.min(8, Math.max(1, Math.ceil(Math.max(rx, ry) - 1e-6))));
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    await gpuWait();
    return cvs;
  }
  return {
    init, run, MAXPX,
    get ok() { return st }, get why() { return why },
    /* vitesse mesurée du dernier calcul : millisecondes par mégapixel d'image d'origine */
    get speed() { return stats.px ? Math.round(stats.ms / stats.px * 1e6) : 0 },
    fits(W, H) { return W * H <= MAXPX },
  };
})();
