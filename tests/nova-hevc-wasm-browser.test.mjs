/* NOVA 0.17 : vrai MOV HEVC -> extraits ISO-BMFF -> WASM -> pixels YUV,
 * vérifiés pixel-à-pixel par FFmpeg. Décodeur hébergé localement depuis npm
 * PINNÉ dans le job CI, sans appel réseau du navigateur.
 * Démonstration expérimentale, pas export iPhone ni activation utilisateur.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import {chromium,webkit} from "playwright";
const isWebKit=process.env.NOVA_HEVC_ENGINE==="webkit";
const browserEngine=isWebKit?webkit:chromium;
const engineName=isWebKit?"WebKit Linux":"Chromium";
const run=promisify(execFile);
const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
function server(){
 return http.createServer(async(req,res)=>{
  const p=path.resolve(root,"."+new URL(req.url,"http://localhost").pathname);
  if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return}
  try{const b=await fs.readFile(p);
   res.setHeader("Content-Type",p.endsWith(".html")?"text/html;charset=utf-8":
    p.endsWith(".js")?"text/javascript;charset=utf-8":
    p.endsWith(".wasm")?"application/wasm":"application/octet-stream");
   res.end(b)}catch{res.writeHead(404).end("Not found")}
 });
}
for(const isVFR of [false,true])test("NOVA 0.18 : "+engineName+
 (isVFR?" MOV HEVC VFR 30 B-frames PTS réels":" MOV HEVC CFR")+
 " — décodage WASM image par image identique FFmpeg",async(t)=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-hevc-wasm-"));
 const source=path.join(dir,"source.mov"),app=server();let browser;
 try{
  await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-f","lavfi","-i",isVFR?
    "testsrc2=size=160x90:rate=30:duration=1.6":
    "testsrc2=size=160x90:rate=15:duration=1.2",
   ...(isVFR?["-vf","select='not(mod(n,2))+not(mod(n,7))'",
    "-fps_mode","vfr","-use_editlist","1"]:[]),
   "-c:v","libx265","-preset","ultrafast","-threads","1",
   "-x265-params","pools=none:frame-threads=1:log-level=error:bframes=2",
   "-pix_fmt","yuv420p","-color_primaries","bt709",
   "-color_trc","bt709","-colorspace","bt709",
   "-movflags","+write_colr","-f","mov","-y",source],{timeout:60000});
  const {stdout:raw}=await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-i",source,"-map","0:v:0","-vsync","0","-pix_fmt","yuv420p",
   "-f","rawvideo","-"],{encoding:null,maxBuffer:8*1024*1024});
  const {stdout:ffFrames}=await run("ffprobe",["-v","error",
   "-select_streams","v:0","-show_entries",
   "frame=best_effort_timestamp_time","-of","json",source]);
  const expectedPTS=(JSON.parse(ffFrames).frames||[]).map(x=>
   Math.round(Number(x.best_effort_timestamp_time)*1e6));
  if(isVFR){
   const deltas=expectedPTS.slice(1).map((x,i)=>x-expectedPTS[i]);
   assert.ok(new Set(deltas).size>1,"la source HEVC doit être réellement VFR");
  }
  const expected=crypto.createHash("sha256").update(raw).digest("hex");
  const frameSize=160*90*3/2;
  const expectedFrames=raw.length/frameSize;
  assert.ok(Number.isInteger(expectedFrames)&&expectedFrames>=15);
  assert.equal(expectedPTS.length,expectedFrames,"FFprobe doit horodater chaque frame");
  const expectedFrameHashes=Array.from({length:expectedFrames},(_,i)=>
   crypto.createHash("sha256").update(raw.subarray(i*frameSize,(i+1)*frameSize)).digest("hex"));
  const {stdout:rgb}=await run("ffmpeg",["-v","error","-i",source,
   "-frames:v","1","-pix_fmt","rgba","-f","rawvideo","-"],
   {encoding:null,maxBuffer:1024*1024});
  assert.equal(rgb.length,160*90*4);
  const positions=Array.from({length:32},(_,i)=>((5+(i*17)%80)*160+((i*41+7)%155)));
  const expectedColors=positions.map(i=>Array.from(rgb.subarray(i*4,i*4+3)));
  await new Promise(ok=>app.listen(0,"127.0.0.1",ok));
  browser=await browserEngine.launch({headless:true,
   ...(!isWebKit&&process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[],requests=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(!r.url().startsWith("http://127.0.0.1:")&&
    !r.url().startsWith("blob:")&&!r.url().startsWith("data:"))
     requests.push(r.url())});
  await page.goto("http://127.0.0.1:"+app.address().port+"/experiences/nova.html");
  await page.addScriptTag({url:"/experiences/nova-hevc-annexb.js"});
  await page.addScriptTag({url:"/experiences/nova-hevc-lab.js"});
  // Le glue Emscripten actuel expose HEVCDecoderModule en global, pas
  // un export ES module. Chargement local explicite, sans CDN.
  await page.addScriptTag({url:"/experiences/vendor/hevc/wasm/hevc-decode.js"});
  await page.locator("#file").setInputFiles(source);
  const actual=await page.evaluate(async({positions})=>{
   const HEVCDecoder=(await import("/experiences/vendor/hevc/decoder-entry.js")).HEVCDecoder;
   const f=document.querySelector("#file").files[0];
   const source=await NOVA_DEMUX.analyser(f);
   const originalPTS=NOVA_PTS.planifier(source).nonnegative.map(x=>x.ptsUs);
   const before=performance.now();
   const r=await NOVA_HEVC_LAB.decoder(f,{HEVCDecoder,
    wasmBinaryUrl:"/experiences/vendor/hevc/wasm/hevc-decode.wasm"});
   const colorCanvas=document.createElement("canvas");
   colorCanvas.width=160;colorCanvas.height=90;
   NOVA_HEVC_RENDER.dessiner(r.stamped[0].frame,r.stamped[0].ptsUs,source,colorCanvas);
   const colors=colorCanvas.getContext("2d").getImageData(0,0,160,90).data;
   const colorSamples=positions.map(i=>[colors[i*4],colors[i*4+1],colors[i*4+2]]);
   const total=r.stamped.reduce((n,x)=>n+x.frame.y.length+x.frame.cb.length+x.frame.cr.length,0);
   const raw=new Uint8Array(total);let pos=0;
   for(const {frame} of r.stamped){
    for(const p of [frame.y,frame.cb,frame.cr]){
     for(let i=0;i<p.length;i++)raw[pos++]=p[i];
    }
   }
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",raw)))
    .map(x=>x.toString(16).padStart(2,"0")).join("");
   let smallBudgetRefused=false,smallBudgetCallbacks=0;
   try{
    await NOVA_HEVC_LAB.decoderFlux(f,{HEVCDecoder,
     wasmBinaryUrl:"/experiences/vendor/hevc/wasm/hevc-decode.wasm",
     maxWasmHeapBytes:1024,
     onFrame:async()=>{smallBudgetCallbacks++}});
   }catch(error){smallBudgetRefused=/capacité du tas HEVC WASM/i.test(error.message)}
   const streamed=[];
   const stream=await NOVA_HEVC_LAB.decoderFlux(f,{HEVCDecoder,
    wasmBinaryUrl:"/experiences/vendor/hevc/wasm/hevc-decode.wasm",
    onFrame:async({frame,ptsUs,index,provisional})=>{
     if(!provisional||index!==streamed.length)throw Error("Ordre HEVC flux incorrect");
     const combined=new Uint8Array(frame.y.length+frame.cb.length+frame.cr.length);
     let k=0;
     for(const plane of [frame.y,frame.cb,frame.cr])
      for(let j=0;j<plane.length;j++)combined[k++]=plane[j];
     const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",combined)))
      .map(x=>x.toString(16).padStart(2,"0")).join("");
     streamed.push({hash,ptsUs});
    }});
   return {digest,frames:r.stamped.length,annexBBytes:r.annexBBytes,
    streamed,streamMetrics:stream,originalPTS,colorSamples,
    smallBudgetRefused,smallBudgetCallbacks,
    firstPTS:r.stamped[0].ptsUs,lastPTS:r.stamped.at(-1).ptsUs,
    dimensions:[r.info.encodedWidth,r.info.encodedHeight],
    elapsedMs:Math.round(performance.now()-before)};
  },{positions});
  assert.equal(actual.frames,expectedFrames,"aucune image HEVC manquante ou ajoutée");
  assert.deepEqual(actual.dimensions,[160,90]);
  assert.equal(actual.digest,expected,"WASM doit décoder exactement les pixels de FFmpeg");
  const meanRgbError=actual.colorSamples.reduce((sum,p,i)=>sum+
   p.reduce((d,v,ch)=>d+Math.abs(v-expectedColors[i][ch]),0),0)/
   (positions.length*3);
  assert.ok(meanRgbError<=12,
   "rendu I420 BT.709 Canvas doit rester proche du RGB FFmpeg : MAE="+meanRgbError);
  assert.equal(actual.streamMetrics.frames,expectedFrames);
  assert.deepEqual(actual.streamed.map(x=>x.hash),expectedFrameHashes,
   "stream feed/drain/flush doit reproduire chaque image FFmpeg sans accumulation");
  assert.deepEqual(actual.streamed.map(x=>x.ptsUs),actual.originalPTS,
   "les PTS décodés doivent être repris sans création artificielle");
  assert.ok(actual.streamed.every((x,i)=>Math.abs(x.ptsUs-expectedPTS[i])<=2),
   "horodatages HEVC VFR doivent correspondre à FFprobe à 2 microsecondes près");
  assert.equal(actual.streamMetrics.annexBBytes,actual.annexBBytes);
  assert.ok(actual.streamMetrics.peakChunkBytes<actual.annexBBytes,
   "le décodage flux ne doit jamais assembler le bitstream entier");
  assert.ok(actual.streamMetrics.peakFrameBytes<=160*90*3);
  assert.equal(actual.streamMetrics.inbandParameterSets,0);
  assert.equal(actual.smallBudgetRefused,true,
   "capacité WASM supérieure à 1024 octets doit être refusée");
  assert.equal(actual.smallBudgetCallbacks,0,
   "aucune image livrée si le budget de tas WASM est déjà dépassé");
  assert.ok(actual.streamMetrics.peakDrainedFrames>=1);
  assert.ok(actual.streamMetrics.pipelineElapsedMs>=0);
  assert.equal(actual.streamMetrics.memorySemantics,
   "wasm-capacity-not-used; js-heap-optional-not-total-rss");
  const wasm=actual.streamMetrics.wasmHeapPeakBytes;
  assert.ok(wasm!==null&&wasm>=actual.streamMetrics.wasmHeapStartBytes);
  assert.ok(wasm<=384*1024*1024,"capacité WASM sous budget expérimental");
  assert.ok(actual.streamMetrics.wasmHeapEndBytes<=wasm);
  if(actual.streamMetrics.jsHeapPeakBytes!==null){
   assert.ok(actual.streamMetrics.jsHeapPeakBytes>=
    actual.streamMetrics.jsHeapStartBytes);
   assert.ok(actual.streamMetrics.jsHeapEndBytes<=
    actual.streamMetrics.jsHeapPeakBytes);
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(requests,[],"zéro appel externe pendant l'import et décodage WASM");
  t.diagnostic("HEVC WASM local : "+JSON.stringify({
   ...actual,meanRgbError,colorSamples:undefined}));
 }finally{
  try{await browser?.close()}finally{
   if(app.listening)await new Promise(ok=>app.close(ok));
   await fs.rm(dir,{recursive:true,force:true});
  }
 }
});
