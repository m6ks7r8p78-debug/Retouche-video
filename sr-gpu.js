/* ===== Restauration IA en WebGPU (iOS 26 et plus récents, navigateurs récents) =====
   Même réseau et mêmes poids que sr.js (Real-ESRGAN general v3, licence BSD-3), mêmes tuiles avec marge :
   le résultat est le même qu'en WebGL2, mais le calcul passe par des « compute shaders », bien plus adaptés aux réseaux
   de neurones (mémoire partagée entre les fils de calcul, pas de passage par des textures).
   Si WebGPU manque ou échoue, sr.js garde son moteur WebGL2. */
var SRGPU = (() => {
  const CORE = 224, WG = 8;
  let dev = null, st = null, why = "", M = null, dnCur = -1, layers = [], pipes = {}, tile = null, full = null, img = null, outT = null, stats = { ms: 0, px: 0 }, cacheKey = null;

  const h2f = (() => { const t = new Float32Array(1), u = new Uint32Array(t.buffer);
    return h => { const s = (h & 0x8000) << 16, e = (h >> 10) & 31, m = h & 1023;
      if (e === 0) return (s ? -1 : 1) * m * 5.960464477539063e-8; if (e === 31) { u[0] = s | 0x7f800000 | (m << 13); return t[0] }
      u[0] = s | ((e + 112) << 23) | (m << 13); return t[0] } })();

  /* une couche 3×3 + PReLU : chaque fil calcule 16 canaux de sortie d'un pixel ; l'entrée est mise en commun par blocs de 16 canaux */
  const CONV = (first) => `
struct P{org:vec2<i32>,isz:vec2<i32>,tsz:vec2<i32>,ci:u32,act:u32};
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var<storage,read> W:array<vec4<f32>>;
@group(0) @binding(2) var<storage,read> B:array<vec4<f32>>;
${first ? "@group(0) @binding(3) var I:texture_2d<f32>;" : "@group(0) @binding(3) var<storage,read> X:array<f32>;"}
@group(0) @binding(4) var<storage,read_write> Y:array<f32>;
var<workgroup> sh:array<f32,${16 * (WG + 2) * (WG + 2)}>;
@compute @workgroup_size(${WG},${WG},1)
fn main(@builtin(global_invocation_id) gid:vec3<u32>,@builtin(local_invocation_id) lid:vec3<u32>,@builtin(workgroup_id) wid:vec3<u32>){
  let og=gid.z; let pix=vec2<i32>(gid.xy); let base=vec2<i32>(wid.xy)*${WG}-1;
  var a0=B[og*4u]; var a1=B[og*4u+1u]; var a2=B[og*4u+2u]; var a3=B[og*4u+3u];
  let li0=lid.y*${WG}u+lid.x; let plane=u32(p.tsz.x*p.tsz.y);
  for(var c0:u32=0u;c0<p.ci;c0=c0+16u){
    for(var li=li0;li<${16 * (WG + 2) * (WG + 2)}u;li=li+${WG * WG}u){
      let ic=li/${(WG + 2) * (WG + 2)}u; let r=li%${(WG + 2) * (WG + 2)}u;
      let q=base+vec2<i32>(i32(r%${WG + 2}u),i32(r/${WG + 2}u)); let g=q+p.org; var v=0.;
      if(c0+ic<p.ci && all(g>=vec2<i32>(0)) && all(g<p.isz) && ${first ? "true" : "all(q>=vec2<i32>(0)) && all(q<p.tsz)"}){
        ${first ? "v=textureLoad(I,g,0)[ic];" : "v=X[(c0+ic)*plane+u32(q.y*p.tsz.x+q.x)];"}
      }
      sh[li]=v;
    }
    workgroupBarrier();
    let n=min(16u,p.ci-c0);
    for(var ic:u32=0u;ic<n;ic=ic+1u){
      for(var t:u32=0u;t<9u;t=t+1u){
        let x=sh[ic*${(WG + 2) * (WG + 2)}u+(lid.y+t/3u)*${WG + 2}u+lid.x+t%3u];
        let w=((og*p.ci+c0+ic)*9u+t)*4u;
        a0=a0+x*W[w]; a1=a1+x*W[w+1u]; a2=a2+x*W[w+2u]; a3=a3+x*W[w+3u];
      }
    }
    workgroupBarrier();
  }
  if(any(pix>=p.tsz)){return;}
  if(p.act==1u){let n4=arrayLength(&B)/2u;
    a0=max(a0,vec4(0.))+B[n4+og*4u]*min(a0,vec4(0.)); a1=max(a1,vec4(0.))+B[n4+og*4u+1u]*min(a1,vec4(0.));
    a2=max(a2,vec4(0.))+B[n4+og*4u+2u]*min(a2,vec4(0.)); a3=max(a3,vec4(0.))+B[n4+og*4u+3u]*min(a3,vec4(0.));}
  let o=u32(pix.y*p.tsz.x+pix.x); let oc=og*16u;
  for(var k:u32=0u;k<4u;k=k+1u){ Y[(oc+k)*plane+o]=a0[k]; Y[(oc+4u+k)*plane+o]=a1[k]; Y[(oc+8u+k)*plane+o]=a2[k]; Y[(oc+12u+k)*plane+o]=a3[k]; }
}`;
  /* réarrangement ×4 + image d'origine agrandie, sur la partie utile de la tuile */
  const SHUF = `
struct P{org:vec2<i32>,isz:vec2<i32>,tsz:vec2<i32>,c0:vec2<i32>,n:vec2<i32>};
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var<storage,read> L:array<f32>;
@group(0) @binding(2) var I:texture_2d<f32>;
@group(0) @binding(3) var F:texture_storage_2d<rgba8unorm,write>;
@compute @workgroup_size(8,8,1)
fn main(@builtin(global_invocation_id) gid:vec3<u32>){
  let d=vec2<i32>(gid.xy); if(any(d>=p.n)){return;}
  let Q=p.c0*4+d; let lr=Q/4; let sub=Q-lr*4; let q=lr-p.org; let plane=p.tsz.x*p.tsz.y; let o=q.y*p.tsz.x+q.x;
  let im=textureLoad(I,lr,0).rgb; var c:vec3<f32>;
  for(var ch=0;ch<3;ch=ch+1){ c[ch]=L[(ch*16+sub.y*4+sub.x)*plane+o]+im[ch]; }
  textureStore(F,Q,vec4(clamp(c,vec3(0.),vec3(1.)),1.));
}`;
  /* mise à l'échelle voulue : moyenne des pixels ×4 couverts */
  const RES = `
struct P{rat:vec2<f32>,fsz:vec2<i32>,k:i32,pad:i32};
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var F:texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4<f32>{ let x=f32((i<<1u)&2u); let y=f32(i&2u); return vec4(x*2.-1.,1.-y*2.,0.,1.); }
@fragment fn fs(@builtin(position) pos:vec4<f32>)->@location(0) vec4<f32>{
  let P0=pos.xy-.5; var s=vec3(0.);
  for(var j=0;j<p.k;j=j+1){ for(var i=0;i<p.k;i=i+1){
    let Q=clamp(vec2<i32>(floor((P0+(vec2(f32(i),f32(j))+.5)/f32(p.k))*p.rat)),vec2<i32>(0),p.fsz-1); s=s+textureLoad(F,Q,0).rgb; } }
  return vec4(s/f32(p.k*p.k),1.);
}`;

  async function init() {
    if (st !== null) return st;
    try {
      if (!navigator.gpu) { why = "WebGPU absent"; return st = false }
      const ad = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" }); if (!ad) { why = "pas de carte graphique WebGPU"; return st = false }
      dev = await ad.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: Math.min(ad.limits.maxStorageBufferBindingSize, 256 * 1048576), maxBufferSize: Math.min(ad.limits.maxBufferSize, 256 * 1048576) } });
      dev.lost.then(() => { st = false; why = "carte graphique perdue" });
      const r = await fetch("sr.bin"); if (!r.ok) throw new Error("poids introuvables");
      const h = new Uint16Array(await r.arrayBuffer()), A = new Float32Array(h.length); for (let i = 0; i < h.length; i++) A[i] = h2f(h[i]);
      const nf = 64, nc = 32, n = 3 * nf * 9 + 2 * nf + nc * (nf * nf * 9 + 2 * nf) + nf * 48 * 9 + 48;
      if (A.length !== 2 * n) throw new Error("fichier de poids inattendu");
      M = { nf, nc, n, A, halo: nc + 4 };
      const mk = code => dev.createComputePipeline({ layout: "auto", compute: { module: dev.createShaderModule({ code }), entryPoint: "main" } });
      pipes.first = mk(CONV(true)); pipes.conv = mk(CONV(false)); pipes.shuf = mk(SHUF);
      const rm = dev.createShaderModule({ code: RES });
      pipes.res = dev.createRenderPipeline({ layout: "auto", vertex: { module: rm, entryPoint: "vs" }, fragment: { module: rm, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] }, primitive: { topology: "triangle-list" } });
      setWeights(.3);
      return st = true;
    } catch (e) { why = (e && e.message) || "erreur"; return st = false }
  }

  function setWeights(dn) {
    if (dn === dnCur) return; dnCur = dn; cacheKey = null;
    const { A, n, nf, nc } = M, val = i => dn * A[i] + (1 - dn) * A[n + i];
    layers.forEach(L => { L.w.destroy(); L.b.destroy() }); layers = [];
    const shapes = [[3, nf, 1]]; for (let i = 0; i < nc; i++) shapes.push([nf, nf, 1]); shapes.push([nf, 48, 0]);
    let o = 0;
    for (const [ci, co, act] of shapes) {
      const w0 = o; o += co * ci * 9; const b0 = o; o += co; let a0 = -1; if (act) { a0 = o; o += co }
      const ng = co / 16, w = new Float32Array(ng * ci * 9 * 16);
      for (let og = 0; og < ng; og++) for (let ic = 0; ic < ci; ic++) for (let t = 0; t < 9; t++) for (let k = 0; k < 16; k++)
        w[(((og * ci + ic) * 9 + t) * 4 + (k >> 2)) * 4 + (k & 3)] = val(w0 + (((og * 16 + k) * ci + ic) * 9 + t));
      const b = new Float32Array(co * 2); for (let k = 0; k < co; k++) { b[k] = val(b0 + k); b[co + k] = a0 >= 0 ? val(a0 + k) : 0 }
      const buf = (d) => { const x = dev.createBuffer({ size: d.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }); dev.queue.writeBuffer(x, 0, d); return x };
      layers.push({ ci, co, act, w: buf(w), b: buf(b) });
    }
    if (o !== n) throw new Error("taille des poids inattendue");
  }

  function uni(words) { const b = dev.createBuffer({ size: Math.max(16, Math.ceil(words.byteLength / 16) * 16), usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); dev.queue.writeBuffer(b, 0, words); return b }

  async function network(src, W, H, onTile) {
    const halo = M.halo;
    if (!img || img.width !== W || img.height !== H) {
      if (img) img.destroy(); if (full) full.destroy();
      img = dev.createTexture({ size: [W, H], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
      full = dev.createTexture({ size: [W * 4, H * 4], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });
    }
    let srcImg = src; try { dev.queue.copyExternalImageToTexture({ source: srcImg }, { texture: img }, [W, H]) }
    catch (e) { srcImg = await createImageBitmap(src); dev.queue.copyExternalImageToTexture({ source: srcImg }, { texture: img }, [W, H]) }
    const TW = Math.min(W, CORE + 2 * halo), TH = Math.min(H, CORE + 2 * halo), plane = TW * TH;
    if (!tile || tile.TW !== TW || tile.TH !== TH) {
      if (tile) tile.bufs.forEach(b => b.destroy());
      const mk = c => dev.createBuffer({ size: c * plane * 4, usage: GPUBufferUsage.STORAGE });
      tile = { TW, TH, bufs: [mk(M.nf), mk(M.nf), mk(48)] };
    }
    const [X0, X1, XL] = tile.bufs, nT = Math.ceil(W / CORE) * Math.ceil(H / CORE); let done = 0;
    for (let cy = 0; cy < H; cy += CORE) for (let cx = 0; cx < W; cx += CORE) {
      const ex = Math.max(0, Math.min(cx - halo, W - TW)), ey = Math.max(0, Math.min(cy - halo, H - TH));
      const enc = dev.createCommandEncoder(), tmp = [];
      let cur = X0, nxt = X1;
      for (let li = 0; li < layers.length; li++) {
        const Ly = layers[li], last = li === layers.length - 1, first = li === 0, dst = last ? XL : nxt, pl = first ? pipes.first : pipes.conv;
        const u = uni(new Int32Array([ex, ey, W, H, TW, TH, Ly.ci, Ly.act])); tmp.push(u);
        const bg = dev.createBindGroup({ layout: pl.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: u } }, { binding: 1, resource: { buffer: Ly.w } }, { binding: 2, resource: { buffer: Ly.b } },
          { binding: 3, resource: first ? img.createView() : { buffer: cur } }, { binding: 4, resource: { buffer: dst } }] });
        const pass = enc.beginComputePass(); pass.setPipeline(pl); pass.setBindGroup(0, bg);
        pass.dispatchWorkgroups(Math.ceil(TW / WG), Math.ceil(TH / WG), Ly.co / 16); pass.end();
        if (!first && !last) { const t = cur; cur = nxt; nxt = t } else if (first) { cur = nxt; nxt = X0 }
      }
      const x1 = Math.min(W, cx + CORE), y1 = Math.min(H, cy + CORE), nx = (x1 - cx) * 4, ny = (y1 - cy) * 4;
      const u = uni(new Int32Array([ex, ey, W, H, TW, TH, cx, cy, nx, ny])); tmp.push(u);
      const bg = dev.createBindGroup({ layout: pipes.shuf.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: u } }, { binding: 1, resource: { buffer: XL } }, { binding: 2, resource: img.createView() }, { binding: 3, resource: full.createView() }] });
      const pass = enc.beginComputePass(); pass.setPipeline(pipes.shuf); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(Math.ceil(nx / 8), Math.ceil(ny / 8)); pass.end();
      dev.queue.submit([enc.finish()]);
      await dev.queue.onSubmittedWorkDone(); tmp.forEach(b => b.destroy());
      done++; if (onTile) onTile(done / nT);
    }
  }

  /* même interface que SR.run : renvoie un canevas de W·s × H·s */
  let out2d = null;
  async function run(src, s, dn, onTile, key) {
    if (!(await init())) throw new Error(why);
    const W = src.videoWidth || src.displayWidth || src.naturalWidth || src.width, H = src.videoHeight || src.displayHeight || src.naturalHeight || src.height;
    const lim = dev.limits.maxTextureDimension2D; if (W * 4 > lim || H * 4 > lim) throw new Error("image trop grande pour la carte graphique");
    s = Math.min(4, Math.max(.25, s)); setWeights(dn == null ? .3 : dn);
    const k2 = key == null ? null : key + "|" + W + "x" + H + "|" + dnCur;
    if (k2 === null || k2 !== cacheKey || !full || full.width !== W * 4) {
      cacheKey = null; const t0 = performance.now(); await network(src, W, H, onTile); stats = { ms: performance.now() - t0, px: W * H }; cacheKey = k2;
    } else if (onTile) onTile(1);
    const OW = Math.max(2, Math.round(W * s)), OH = Math.max(2, Math.round(H * s));
    if (!outT || outT.width !== OW || outT.height !== OH) { if (outT) outT.destroy(); outT = dev.createTexture({ size: [OW, OH], format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC }) }
    const rx = W * 4 / OW, ry = H * 4 / OH, kk = Math.min(8, Math.max(1, Math.ceil(Math.max(rx, ry) - 1e-6)));
    const ub = new ArrayBuffer(32), f = new Float32Array(ub), i32 = new Int32Array(ub); f[0] = rx; f[1] = ry; i32[2] = W * 4; i32[3] = H * 4; i32[4] = kk;
    const u = uni(new Uint8Array(ub)), enc = dev.createCommandEncoder();
    const bg = dev.createBindGroup({ layout: pipes.res.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: u } }, { binding: 1, resource: full.createView() }] });
    const rp = enc.beginRenderPass({ colorAttachments: [{ view: outT.createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }] });
    rp.setPipeline(pipes.res); rp.setBindGroup(0, bg); rp.draw(3); rp.end();
    /* lecture du résultat (rangées alignées sur 256 octets) puis copie dans un canevas 2D, utilisable partout */
    const bpr = Math.ceil(OW * 4 / 256) * 256, rb = dev.createBuffer({ size: bpr * OH, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    enc.copyTextureToBuffer({ texture: outT }, { buffer: rb, bytesPerRow: bpr }, [OW, OH]);
    dev.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ); const raw = new Uint8Array(rb.getMappedRange());
    const id = new ImageData(OW, OH); if (bpr === OW * 4) id.data.set(raw.subarray(0, OW * 4 * OH)); else for (let y = 0; y < OH; y++) id.data.set(raw.subarray(y * bpr, y * bpr + OW * 4), y * OW * 4);
    rb.unmap(); rb.destroy(); u.destroy();
    if (!out2d) out2d = document.createElement("canvas"); if (out2d.width !== OW || out2d.height !== OH) { out2d.width = OW; out2d.height = OH }
    out2d.getContext("2d").putImageData(id, 0, 0);
    return out2d;
  }
  return { init, run, get ok() { return st }, get why() { return why }, get speed() { return stats.px ? Math.round(stats.ms / stats.px * 1e6) : 0 } };
})();
