/* NOVA 0.15 — véritables MOV / MP4 VFR à 30 et 60 images/s source.
 * L'oracle des horodatages est FFprobe, indépendant des tables NOVA.
 * Pas de validation Safari iPhone physique ni d'export 60 fps.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import DEMUX from "../experiences/nova-demux.js";
import PTS from "../experiences/nova-pts.js";
const run=promisify(execFile);

for(const [fps,extension] of [[30,"mp4"],[60,"mov"]]){
 test("NOVA 0.15 : "+fps+" i/s VFR + B-frames + AAC, PTS conformes à FFprobe ("+extension+")",async(t)=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-vfr-iphone-"));
  const source=path.join(dir,"vfr-"+fps+"."+extension);
  try{
   await run("ffmpeg",["-hide_banner","-loglevel","error",
    "-f","lavfi","-i","testsrc2=size=160x90:rate="+fps+":duration=2",
    "-f","lavfi","-i","sine=frequency=730:duration=2",
    "-map","0:v:0","-map","1:a:0",
    "-vf","select='not(mod(n,3))+not(mod(n,11))'","-fps_mode","vfr",
    "-c:v","libx264","-preset","veryfast","-bf","2","-pix_fmt","yuv420p",
    "-c:a","aac","-b:a","96k","-movflags","+faststart",
    "-use_editlist","1","-y",source],{timeout:60000});
   const bytes=await fs.readFile(source);
   const meta=await DEMUX.analyser(new Blob([bytes]));
   assert.ok(meta,"MOV/MP4 VFR réel doit être démultiplexable");
   assert.match(meta.codec,/^avc1\./);
   assert.deepEqual([meta.W,meta.H,meta.dw,meta.dh],[160,90,160,90]);
   const timeline=PTS.planifier(meta);
   const actual=timeline.nonnegative.map(x=>x.ptsUs);
   const gaps=actual.slice(1).map((x,i)=>x-actual[i]);
   assert.ok(new Set(gaps.map(d=>Math.round(d/1000))).size>=2,
    "cadence réellement variable (pas simple déclaration de FPS)");
   assert.ok(meta.ptsUs.some((x,i)=>i>0&&x<meta.ptsUs[i-1]),
    "B-frames réellement réordonnées en présentation");
   assert.ok(meta.ns>=fps/2&&meta.ns<fps*2);
   const {stdout}=await run("ffprobe",["-v","error","-select_streams","v:0",
    "-show_packets","-show_entries","packet=pts_time,dts_time",
    "-of","json",source],{maxBuffer:4*1024*1024});
   const packets=JSON.parse(stdout).packets;
   const reference=packets.map(p=>Math.round(Number(p.pts_time)*1e6))
    .sort((a,b)=>a-b).filter(x=>x>=0);
   assert.equal(reference.length,actual.length,"nombre d'images PTS identique à FFprobe");
   const err=Math.max(...reference.map((p,i)=>Math.abs(p-actual[i])));
   assert.ok(err<=2000,"dérive du lecteur PTS versus FFprobe <= 2 ms, mesurée "+err+" µs");
   const {stdout:streams}=await run("ffprobe",["-v","error",
    "-show_entries","stream=codec_type,codec_name","-of","json",source]);
   const s=JSON.parse(streams).streams;
   assert.ok(s.some(x=>x.codec_type==="video"&&x.codec_name==="h264"));
   assert.ok(s.some(x=>x.codec_type==="audio"&&x.codec_name==="aac"));
   t.diagnostic(JSON.stringify({container:extension,inputFps:fps,frames:meta.ns,
    distinctIntervals:new Set(gaps.map(d=>Math.round(d/1000))).size,
    reorderedBFrames:true,maxPtsErrorUs:err,aacPresent:true}));
  }finally{await fs.rm(dir,{recursive:true,force:true})}
 });
}
