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
test("NOVA 0.19 : MOV HEVC VFR BT.709 + AAC vers MP4 H.264/AAC avec synchro réelle",async(t)=>{
 const d=await fs.mkdtemp(path.join(os.tmpdir(),"nova-hevc-export-"));
 const input=path.join(d,"source.mov"),app=server();let browser;
 try{
  await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-f","lavfi","-i",
   "color=c=black:s=160x90:r=30:d=2,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,0.395,0.47)+between(t,1.195,1.27)'",
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
  assert.ok(pts.length>25&&pts.length<=90);
  assert.ok(new Set(pts.slice(1).map((x,i)=>x-pts[i])).size>1,"cadence réellement variable");
  assert.ok(info.ptsUs.some((v,i)=>i&&v<info.ptsUs[i-1]),"B-frames réelles");
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
    "stream=codec_name,codec_type,avg_frame_rate,width,height","-of","json",output])
  ]);
  const tracks=JSON.parse(probe).streams;
  assert.ok(tracks.some(x=>x.codec_type==="video"&&x.codec_name==="h264"&&x.avg_frame_rate==="15/1"));
  assert.ok(tracks.some(x=>x.codec_type==="audio"&&x.codec_name==="aac"));
  assert.ok(hash1.length>=80);
  assert.deepEqual(hash1,hash0.slice(0,hash1.length),"AAC copié sans altération");
  const measured=comparerImpulsions({sourceAudio:audio0,sourceVideo:video0,
    outputAudio:audio1,outputVideo:video1,toleranceMs:80});
  assert.ok(Math.abs(measured.offsetMs)<=80);
  assert.ok(measured.driftMs<=80);
  assert.deepEqual(jsErrors,[]);
  assert.deepEqual(external,[],"aucun média ou décodeur chargé d'un domaine tiers");
  t.diagnostic("NOVA HEVC WASM->MP4 + AAC : "+JSON.stringify({
   sourceFrames:pts.length,sourceDurationUs:info.durationUs,
   inputAudio:audio0,inputVideo:video0,outputAudio:audio1,outputVideo:video1,
   copiedAAC:hash1.length,offsetMs:measured.offsetMs,driftMs:measured.driftMs}));
 }finally{
  try{await browser?.close()}finally{
   if(app.listening)await new Promise(ok=>app.close(ok));
   await fs.rm(d,{recursive:true,force:true});
  }
 }
});
