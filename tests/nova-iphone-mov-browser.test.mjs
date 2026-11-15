/* NOVA 0.16 : vrai export local MOV 60fps VFR + B frames + AAC.
 * Oracle : FFmpeg (images PCM/grises) et FFprobe (PTS et hashes AAC).
 * Ne démontre ni sortie 60 fps ni test Safari iPhone physique.
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
import {impulsionsPCM,comparerImpulsions} from "./nova-av-pulses.mjs";
import DEMUX from "../experiences/nova-demux.js";
import PTS from "../experiences/nova-pts.js";
const run=promisify(execFile);
const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
function server(){
 return http.createServer(async(req,res)=>{
  const p=path.resolve(root,"."+new URL(req.url,"http://localhost").pathname);
  if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return}
  try{res.setHeader("Content-Type",p.endsWith(".js")?"text/javascript":
   p.endsWith(".html")?"text/html;charset=utf-8":"application/octet-stream");
   res.end(await fs.readFile(p))}catch{res.writeHead(404).end("not found")}
 });
}
async function audioTimes(file){
 const {stdout}=await run("ffmpeg",["-hide_banner","-loglevel","error",
  "-i",file,"-map","0:a:0","-ac","1","-ar","48000","-f","f32le","-"],
  {encoding:null,maxBuffer:8*1024*1024});
 return impulsionsPCM(stdout,{sampleRate:48000});
}
async function visualTimes(file){
 const [{stdout:raw},{stdout:metadata}]=await Promise.all([
  run("ffmpeg",["-hide_banner","-loglevel","error","-i",file,
   "-map","0:v:0","-vf","scale=8:8,format=gray","-fps_mode","passthrough",
   "-f","rawvideo","-"],{encoding:null,maxBuffer:8*1024*1024}),
  run("ffprobe",["-v","error","-select_streams","v:0",
   "-show_entries","frame=best_effort_timestamp_time","-of","json",file])
 ]);
 const pts=JSON.parse(metadata).frames.map(x=>Number(x.best_effort_timestamp_time));
 assert.equal(raw.length%64,0);
 assert.equal(raw.length/64,pts.length,"PTS de toutes les trames réellement décodées");
 const result=[];let active=false;
 for(let i=0;i<pts.length;i++){
  let mean=0;for(let j=0;j<64;j++)mean+=raw[i*64+j];mean/=64;
  if(mean>150&&!active)result.push(pts[i]);
  active=mean>150;
 }
 return result;
}
async function hashes(file){
 const {stdout}=await run("ffprobe",["-v","error","-select_streams","a:0",
  "-show_packets","-show_entries","packet=data_hash","-show_data_hash","sha256",
  "-of","json",file],{maxBuffer:4*1024*1024});
 return JSON.parse(stdout).packets.map(x=>x.data_hash);
}
test("NOVA 0.16 : MOV VFR 60 vers MP4 15, flashs/son mesurés et AAC intact",async(t)=>{
 const d=await fs.mkdtemp(path.join(os.tmpdir(),"nova-mov60-av-")),source=path.join(d,"source.mov");
 const app=server();let browser;
 try{
  await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-f","lavfi","-i",
   "color=c=black:s=160x90:r=60:d=2,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,0.395,0.47)+between(t,1.195,1.27)'",
   "-f","lavfi","-i",
   "aevalsrc=if(lt(abs(t-0.42)\\,0.03)\\,0.7*sin(2*PI*1000*t)\\,0)+if(lt(abs(t-1.22)\\,0.03)\\,0.7*sin(2*PI*1400*t)\\,0):s=48000:d=2",
   "-map","0:v:0","-map","1:a:0",
   "-vf","select='not(mod(n,3))+not(mod(n,11))'","-fps_mode","vfr",
   "-c:v","libx264","-bf","2","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k",
   "-movflags","+faststart","-use_editlist","1","-y",source],{timeout:60000});
  const info=await DEMUX.analyser(new Blob([await fs.readFile(source)]));
  assert.ok(info,"le fichier MOV réel est reconnu");
  const sorted=PTS.planifier(info).nonnegative.map(x=>x.ptsUs);
  assert.ok(sorted.length>=40&&new Set(sorted.slice(1).map((x,i)=>x-sorted[i])).size>1);
  assert.ok(info.ptsUs.some((v,i)=>i>0&&v<info.ptsUs[i-1]),"B-frames réelles");
  const [a0,v0,h0]=await Promise.all([audioTimes(source),visualTimes(source),hashes(source)]);
  assert.deepEqual([a0.length,v0.length],[2,2]);
  await new Promise(ok=>app.listen(0,"127.0.0.1",ok));
  browser=await chromium.launch({headless:true,...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
  const errors=[],external=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(!r.url().startsWith("http://127.0.0.1:")&&
   !r.url().startsWith("blob:")&&!r.url().startsWith("data:"))external.push(r.url())});
  await page.goto("http://127.0.0.1:"+app.address().port+"/experiences/nova.html");
  await page.locator("#file").setInputFiles(source);
  await page.waitForFunction(()=>!document.querySelector("#exportVideo").disabled,
   null,{timeout:20000});
  await page.locator("#exportVideo").click();
  await page.waitForFunction(()=>!!document.querySelector("#downloadVideo")?.getAttribute("href")||
   document.querySelector("#exportStatus").textContent.startsWith("Export refusé"),
   null,{timeout:90000});
  const msg=await page.locator("#exportStatus").innerText();
  assert.match(await page.locator("#downloadVideo").getAttribute("href")||"",/^blob:/,msg);
  assert.match(msg,/audio AAC original copié/);
  const pending=page.waitForEvent("download");await page.locator("#downloadVideo").click();
  const saved=await pending,out=await saved.path();
  const [a1,v1,h1,{stdout:probe}]=await Promise.all([
   audioTimes(out),visualTimes(out),hashes(out),
   run("ffprobe",["-v","error","-show_entries","stream=codec_type,codec_name,avg_frame_rate,width,height",
    "-of","json",out])
  ]);
  const tracks=JSON.parse(probe).streams;
  assert.ok(tracks.some(x=>x.codec_type==="video"&&x.codec_name==="h264"&&x.avg_frame_rate==="15/1"));
  assert.ok(tracks.some(x=>x.codec_type==="audio"&&x.codec_name==="aac"));
  assert.ok(h1.length>=70);assert.deepEqual(h1,h0.slice(0,h1.length),"AAC bit-exact");
  const measured=comparerImpulsions({sourceAudio:a0,sourceVideo:v0,
   outputAudio:a1,outputVideo:v1,toleranceMs:75});
  assert.ok(measured.driftMs<=75);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  t.diagnostic("MOV VFR 60 -> MP4 15 : "+JSON.stringify({
   sourceFrames:sorted.length,sourceAudio:a0,sourceVideo:v0,
   outputAudio:a1,outputVideo:v1,aacPackets:h1.length,
   introducedOffsetMs:measured.offsetMs,driftMs:measured.driftMs}));
 }finally{
  try{await browser?.close()}finally{
   if(app.listening)await new Promise(ok=>app.close(ok));
   await fs.rm(d,{recursive:true,force:true});
  }
 }
});