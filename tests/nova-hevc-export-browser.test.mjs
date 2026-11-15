/* NOVA 0.19 — AVI ? NON : vrai MOV HEVC BT.709/AAC -> MP4 H.264/AAC.
 * Source VFR et B-frames synthétique ; aucun média privé.
 * Vérifie les paquets audio SHA-256 et la synchro flash/impulsion avec
 * FFmpeg, FFprobe, ainsi que l'absence de trafic externe du navigateur.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
import DEMUX from "../experiences/nova-demux.js";
import PTS from "../experiences/nova-pts.js";
import {impulsionsPCM,comparerImpulsions} from "./nova-av-pulses.mjs";
const run=promisify(execFile),root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
function server(){
 return http.createServer(async(req,res)=>{
  const p=path.resolve(root,"."+new URL(req.url,"http://localhost").pathname);
  if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return}
  try{const b=await fs.readFile(p);res.setHeader("Content-Type",
   p.endsWith(".js")?"text/javascript":p.endsWith(".html")?"text/html":
   p.endsWith(".wasm")?"application/wasm":"application/octet-stream");
   res.end(b)}catch{res.writeHead(404).end("missing")}
 });
}
async function hashes(file){
 const {stdout}=await run("ffprobe",["-v","error","-select_streams","a:0",
  "-show_packets","-show_entries","packet=data_hash","-show_data_hash","sha256",
  "-of","json",file],{maxBuffer:4*1024*1024});
 return JSON.parse(stdout).packets.map(x=>x.data_hash);
}
async function soundTimes(file){
 const {stdout}=await run("ffmpeg",["-v","error","-i",file,"-map","0:a:0",
  "-ac","1","-ar","48000","-f","f32le","-"],
  {encoding:null,maxBuffer:8*1024*1024});
 return impulsionsPCM(stdout,{sampleRate:48000});
}
async function flashTimes(file){
 const [{stdout:raw},{stdout:frames}]=await Promise.all([
  run("ffmpeg",["-v","error","-i",file,"-map","0:v:0",
   "-vf","scale=8:8,format=gray","-fps_mode","passthrough",
   "-f","rawvideo","-"],{encoding:null,maxBuffer:8*1024*1024}),
  run("ffprobe",["-v","error","-select_streams","v:0",
   "-show_entries","frame=best_effort_timestamp_time","-of","json",file])
 ]);
 const t=JSON.parse(frames).frames.map(x=>Number(x.best_effort_timestamp_time));
 assert.equal(raw.length,t.length*64);
 const found=[];let active=false;
 for(let i=0;i<t.length;i++){
  let sum=0;for(let j=0;j<64;j++)sum+=raw[i*64+j];
  const bright=sum/64>150;
  if(bright&&!active)found.push(t[i]);
  active=bright;
 }
 return found;
}
for(const inputFPS of [30,60])test(
 "NOVA 0.20 : MOV HEVC VFR "+inputFPS+" i/s + AAC vers MP4 H.264/AAC sans dérive",
 async(t)=>{
 const d=await fs.mkdtemp(path.join(os.tmpdir(),"nova-hevc-export-"));
 const input=path.join(d,"source.mov"),app=server();let browser;
 try{
  await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-f","lavfi","-i",
   "color=c=black:s=160x90:r="+inputFPS+":d=2,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,0.395,0.47)+between(t,1.195,1.27)'",
   "-f","lavfi","-i",
   "aevalsrc=if(lt(abs(t-0.42)\\,0.03)\\,0.7*sin(2*PI*1000*t)\\,0)+if(lt(abs(t-1.22)\\,0.03)\\,0.7*sin(2*PI*1400*t)\\,0):s=48000:d=2",
   "-map","0:v:0","-map","1:a:0",
   "-vf","select='not(mod(n,2))+not(mod(n,7))'","-fps_mode","vfr",
   "-c:v","libx265","-preset","ultrafast","-threads","1",
   "-x265-params","pools=none:frame-threads=1:log-level=error:bframes=2",
   "-pix_fmt","yuv420p","-color_primaries","bt709","-color_trc","bt709",
   "-colorspace","bt709","-movflags","+write_colr+faststart",
   "-c:a","aac","-b:a","128k","-use_editlist","1","-y",input],{timeout:60000});
  const info=await DEMUX.analyser(new Blob([await fs.readFile(input)]));
  assert.ok(info,"MOV doit être analysable");
  assert.match(info.codec,/^(hvc1|hev1)\./);
  assert.deepEqual([info.color?.primaries,info.color?.transfer,info.color?.matrix],[1,1,1],
   "BT.709 source déclaré dans colr");
  const pts=PTS.planifier(info).nonnegative.map(x=>x.ptsUs);
  assert.ok(pts.length>25&&pts.length<=90,"VFR source 30/60 reste dans 90 échantillons");
  if(inputFPS===60)assert.ok(pts.length>55,"vraie source 60 i/s avec >55 images");
  assert.ok(new Set(pts.slice(1).map((x,i)=>x-pts[i])).size>1,"cadence réellement variable");
  assert.ok(info.ptsUs.some((v,i)=>i&&v<info.ptsUs[i-1]),"B-frames réelles");
  const {stdout:sourceVideoMeta}=await run("ffprobe",["-v","error","-select_streams","v:0",
   "-show_entries","stream=duration","-of","json",input]);
  const ffDuration=Number(JSON.parse(sourceVideoMeta).streams[0].duration);
  assert.ok(Math.abs(info.durationUs-ffDuration*1e6)<=1000,
   "durée de présentation MOV doit correspondre à FFprobe / tkhd, pas à mdhd - editMediaTime");
  t.diagnostic("NOVA HEVC MOV source : "+JSON.stringify({
   pts:pts.length,firstUs:pts[0],lastUs:pts.at(-1),durationUs:info.durationUs,
   ffDuration,editMediaTime:info.editMediaTime,colors:info.color}));
  const [audio0,video0,hash0]=await Promise.all([soundTimes(input),flashTimes(input),hashes(input)]);
  assert.deepEqual([audio0.length,video0.length],[2,2]);
  await new Promise(ok=>app.listen(0,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true,...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const jsErrors=[],external=[];
  page.on("pageerror",x=>jsErrors.push(x.message));
  page.on("request",x=>{
   if(!x.url().startsWith("http://127.0.0.1:")&&!x.url().startsWith("blob:")&&
       !x.url().startsWith("data:"))external.push(x.url());
  });
  await page.goto("http://127.0.0.1:"+app.address().port+"/experiences/nova.html");
  await page.locator("#file").setInputFiles(input);
  // Un iPhone pourrait signaler le HEVC natif pris en charge :
  // le parcours pilote doit rester WASM pour conserver l'audit SPS/VUI.
  if(inputFPS===30)await page.evaluate(()=>{
   const original=VideoDecoder.isConfigSupported.bind(VideoDecoder);
   VideoDecoder.isConfigSupported=async config=>
    /^(hvc1|hev1)\./.test(config.codec||"")?
    {supported:true,config}:original(config);
  });
  await page.locator("#exportVideo").click();
  await page.waitForFunction(()=>
    !!document.querySelector("#downloadVideo")?.getAttribute("href")||
    document.querySelector("#exportStatus")?.textContent.startsWith("Export refusé"),
    null,{timeout:90000});
  const status=await page.locator("#exportStatus").innerText();
  assert.match(await page.locator("#downloadVideo").getAttribute("href")||"",/^blob:/,status);
  assert.match(status,/audio AAC original copié/);
  assert.match(status,/HEVC WASM/);
  const pending=page.waitForEvent("download");
  await page.locator("#downloadVideo").click();
  const dl=await pending,output=await dl.path();
  const [audio1,video1,hash1,{stdout:probe}]=await Promise.all([
   soundTimes(output),flashTimes(output),hashes(output),
   run("ffprobe",["-v","error","-show_entries",
    "stream=codec_name,codec_type,avg_frame_rate,width,height,color_range,color_primaries,color_transfer,color_space","-of","json",output])
  ]);
  const tracks=JSON.parse(probe).streams;
  assert.ok(tracks.some(x=>x.codec_type==="video"&&x.codec_name==="h264"&&x.avg_frame_rate==="15/1"));
  assert.ok(tracks.some(x=>x.codec_type==="audio"&&x.codec_name==="aac"));
  const finalVideo=tracks.find(x=>x.codec_type==="video");
  assert.deepEqual(
    [finalVideo.color_range,finalVideo.color_primaries,
     finalVideo.color_transfer,finalVideo.color_space],
    ["tv","bt709","bt709","bt709"],
    "H.264 MP4 exporté doit signaler BT.709 plage limitée via colr/FFprobe");
  assert.ok(hash1.length>=80);
  assert.deepEqual(hash1,hash0.slice(0,hash1.length),"AAC copié sans altération");
  const measured=comparerImpulsions({sourceAudio:audio0,sourceVideo:video0,
    outputAudio:audio1,outputVideo:video1,toleranceMs:80});
  assert.ok(Math.abs(measured.offsetMs)<=80);
  assert.ok(measured.driftMs<=80);
  assert.deepEqual(jsErrors,[]);
  assert.deepEqual(external,[],"aucun média ou décodeur chargé d'un domaine tiers");
  t.diagnostic("NOVA HEVC WASM->MP4 + AAC : "+JSON.stringify({
   inputFPS,sourceFrames:pts.length,sourceDurationUs:info.durationUs,
   inputAudio:audio0,inputVideo:video0,outputAudio:audio1,outputVideo:video1,
   copiedAAC:hash1.length,offsetMs:measured.offsetMs,driftMs:measured.driftMs}));
 }finally{
  try{await browser?.close()}finally{
   if(app.listening)await new Promise(ok=>app.close(ok));
   await fs.rm(d,{recursive:true,force:true});
  }
 }
});


/* La matrice tkhd est modifiée sans toucher à aucun paquet HEVC source.
 * Transformation identique à celle testée par NOVA 0.14 sur les deux conteneurs.
 */
function pivoterSource90(raw){
 const b=Buffer.from(raw),name=o=>b.toString("ascii",o+4,o+8);
 function boxes(start,end){
  const out=[];
  for(let p=start;p<end;){
   if(p+8>end)throw Error("boîte MOV tronquée");
   const size=b.readUInt32BE(p);
   if(size<8||p+size>end)throw Error("boîte MOV invalide");
   out.push({start:p,end:p+size,type:name(p)});p+=size;
  }
  return out;
 }
 const moov=boxes(0,b.length).find(x=>x.type==="moov");
 const track=boxes(moov.start+8,moov.end).find(x=>{
  if(x.type!=="trak")return false;
  const mdia=boxes(x.start+8,x.end).find(y=>y.type==="mdia");
  const hdlr=mdia&&boxes(mdia.start+8,mdia.end).find(y=>y.type==="hdlr");
  return !!hdlr&&b.toString("ascii",hdlr.start+16,hdlr.start+20)==="vide";
 });
 assert.ok(track,"piste HEVC MOV");
 const tkhd=boxes(track.start+8,track.end).find(x=>x.type==="tkhd");
 const version=b[tkhd.start+8],at=tkhd.start+8+(version===1?52:40);
 assert.ok(at+36<=tkhd.end);
 [0,65536,0,-65536,0,0,90*65536,0,1073741824]
  .forEach((x,i)=>b.writeInt32BE(x,at+i*4));
 return b;
}
test("NOVA 0.19 : HEVC HDR PQ/BT2020 refusé sans conversion SDR silencieuse",async()=>{
 const d=await fs.mkdtemp(path.join(os.tmpdir(),"nova-hevc-hdr-deny-"));
 const file=path.join(d,"hdr.mov"),app=server();let browser;
 try{
  await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-f","lavfi","-i","testsrc2=size=160x90:rate=15:duration=0.8",
   "-c:v","libx265","-preset","ultrafast","-threads","1",
   "-x265-params","pools=none:frame-threads=1:log-level=error",
   "-pix_fmt","yuv420p10le","-color_primaries","bt2020",
   "-color_trc","smpte2084","-colorspace","bt2020nc",
   "-movflags","+write_colr+faststart","-y",file],{timeout:60000});
  const info=await DEMUX.analyser(new Blob([await fs.readFile(file)]));
  assert.equal(info?.color?.transfer,16,"le fichier est effectivement marqué PQ");
  await new Promise(ok=>app.listen(0,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true,...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const external=[];page.on("request",r=>{
   if(!r.url().startsWith("http://127.0.0.1:")&&
    !r.url().startsWith("blob:")&&!r.url().startsWith("data:"))external.push(r.url());
  });
  await page.goto("http://127.0.0.1:"+app.address().port+"/experiences/nova.html");
  await page.locator("#file").setInputFiles(file);
  await page.locator("#allowSilent").check();
  await page.locator("#exportVideo").click();
  await page.waitForFunction(()=>document.querySelector("#exportStatus")
   .textContent.startsWith("Export refusé"),null,{timeout:30000});
  const status=await page.locator("#exportStatus").innerText();
  assert.match(status,/HDR|gamut|Couleur|P3|BT.709/);
  assert.equal(await page.locator("#downloadVideo").getAttribute("href"),null);
  assert.deepEqual(external,[]);
 }finally{
  try{await browser?.close()}finally{
   if(app.listening)await new Promise(ok=>app.close(ok));
   await fs.rm(d,{recursive:true,force:true});
  }
 }
});
test("NOVA 0.19 : HEVC MOV SDR portrait rotation 90 degrés exporte MP4 90x160 sans son explicite",async(t)=>{
 const d=await fs.mkdtemp(path.join(os.tmpdir(),"nova-hevc-portrait-"));
 const base=path.join(d,"base.mov"),file=path.join(d,"portrait.mov");
 const app=server();let browser;
 try{
  await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-f","lavfi","-i","testsrc2=size=160x90:rate=15:duration=1.2",
   "-c:v","libx265","-preset","ultrafast","-threads","1",
   "-x265-params","pools=none:frame-threads=1:log-level=error:bframes=2",
   "-pix_fmt","yuv420p","-color_primaries","bt709",
   "-color_trc","bt709","-colorspace","bt709",
   "-movflags","+write_colr+faststart","-use_editlist","1","-y",base],{timeout:60000});
  await fs.writeFile(file,pivoterSource90(await fs.readFile(base)));
  const info=await DEMUX.analyser(new Blob([await fs.readFile(file)]));
  assert.deepEqual([info?.dw,info?.dh],[90,160]);
  assert.deepEqual([info?.color?.primaries,info?.color?.transfer,info?.color?.matrix],[1,1,1]);
  await new Promise(ok=>app.listen(0,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true,...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const external=[];page.on("request",r=>{
   if(!r.url().startsWith("http://127.0.0.1:")&&
    !r.url().startsWith("blob:")&&!r.url().startsWith("data:"))external.push(r.url());
  });
  await page.goto("http://127.0.0.1:"+app.address().port+"/experiences/nova.html");
  await page.locator("#file").setInputFiles(file);
  await page.locator("#allowSilent").check();
  await page.locator("#exportVideo").click();
  await page.waitForFunction(()=>
   !!document.querySelector("#downloadVideo")?.getAttribute("href")||
   document.querySelector("#exportStatus").textContent.startsWith("Export refusé"),
   null,{timeout:90000});
  const status=await page.locator("#exportStatus").innerText();
  assert.match(await page.locator("#downloadVideo").getAttribute("href")||"",/^blob:/,status);
  assert.match(status,/HEVC WASM/);
  assert.match(status,/sans son/);
  const pending=page.waitForEvent("download");await page.locator("#downloadVideo").click();
  const output=await (await pending).path();
  const {stdout}=await run("ffprobe",["-v","error",
    "-show_entries","stream=codec_name,codec_type,width,height,avg_frame_rate,color_range,color_primaries,color_transfer,color_space",
    "-of","json",output]);
  const streams=JSON.parse(stdout).streams;
  assert.ok(streams.some(x=>x.codec_type==="video"&&x.codec_name==="h264"&&
   x.width===90&&x.height===160&&x.avg_frame_rate==="15/1"));
  assert.ok(!streams.some(x=>x.codec_type==="audio"),"l'utilisateur a choisi sans son");
  const color=streams.find(x=>x.codec_type==="video");
  assert.deepEqual([color.color_range,color.color_primaries,
    color.color_transfer,color.color_space],["tv","bt709","bt709","bt709"]);
  assert.deepEqual(external,[]);
  t.diagnostic("NOVA HEVC portrait local export : 90x160, 15 fps, sans piste audio");
 }finally{
  try{await browser?.close()}finally{
   if(app.listening)await new Promise(ok=>app.close(ok));
   await fs.rm(d,{recursive:true,force:true});
  }
 }
});
