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
test("NOVA 0.17 : "+engineName+" décode HEVC MOV via WASM local et égale FFmpeg YUV",async(t)=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-hevc-wasm-"));
 const source=path.join(dir,"source.mov"),app=server();let browser;
 try{
  await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-f","lavfi","-i","testsrc2=size=160x90:rate=15:duration=1.2",
   "-c:v","libx265","-preset","ultrafast","-threads","1",
   "-x265-params","pools=none:frame-threads=1:log-level=error:bframes=2",
   "-pix_fmt","yuv420p","-f","mov","-y",source],{timeout:60000});
  const {stdout:raw}=await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-i",source,"-map","0:v:0","-vsync","0","-pix_fmt","yuv420p",
   "-f","rawvideo","-"],{encoding:null,maxBuffer:8*1024*1024});
  const expected=crypto.createHash("sha256").update(raw).digest("hex");
  const frameSize=160*90*3/2;
  const expectedFrames=raw.length/frameSize;
  assert.ok(Number.isInteger(expectedFrames)&&expectedFrames>=15);
  const expectedFrameHashes=Array.from({length:expectedFrames},(_,i)=>
   crypto.createHash("sha256").update(raw.subarray(i*frameSize,(i+1)*frameSize)).digest("hex"));
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
  const actual=await page.evaluate(async()=>{
   const HEVCDecoder=(await import("/experiences/vendor/hevc/decoder-entry.js")).HEVCDecoder;
   const f=document.querySelector("#file").files[0];
   const before=performance.now();
   const r=await NOVA_HEVC_LAB.decoder(f,{HEVCDecoder,
    wasmBinaryUrl:"/experiences/vendor/hevc/wasm/hevc-decode.wasm"});
   const total=r.stamped.reduce((n,x)=>n+x.frame.y.length+x.frame.cb.length+x.frame.cr.length,0);
   const raw=new Uint8Array(total);let pos=0;
   for(const {frame} of r.stamped){
    for(const p of [frame.y,frame.cb,frame.cr]){
     for(let i=0;i<p.length;i++)raw[pos++]=p[i];
    }
   }
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",raw)))
    .map(x=>x.toString(16).padStart(2,"0")).join("");
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
    streamed,streamMetrics:stream,
    firstPTS:r.stamped[0].ptsUs,lastPTS:r.stamped.at(-1).ptsUs,
    dimensions:[r.info.encodedWidth,r.info.encodedHeight],
    elapsedMs:Math.round(performance.now()-before)};
  });
  assert.equal(actual.frames,expectedFrames,"aucune image HEVC manquante ou ajoutée");
  assert.deepEqual(actual.dimensions,[160,90]);
  assert.equal(actual.digest,expected,"WASM doit décoder exactement les pixels de FFmpeg");
  assert.equal(actual.streamMetrics.frames,expectedFrames);
  assert.deepEqual(actual.streamed.map(x=>x.hash),expectedFrameHashes,
   "stream feed/drain/flush doit reproduire chaque image FFmpeg sans accumulation");
  assert.equal(actual.streamMetrics.annexBBytes,actual.annexBBytes);
  assert.ok(actual.streamMetrics.peakChunkBytes<actual.annexBBytes,
   "le décodage flux ne doit jamais assembler le bitstream entier");
  assert.ok(actual.streamMetrics.peakFrameBytes<=160*90*3);
  assert.deepEqual(errors,[]);
  assert.deepEqual(requests,[],"zéro appel externe pendant l'import et décodage WASM");
  t.diagnostic("HEVC WASM local : "+JSON.stringify(actual));
 }finally{
  try{await browser?.close()}finally{
   if(app.listening)await new Promise(ok=>app.close(ok));
   await fs.rm(dir,{recursive:true,force:true});
  }
 }
});
