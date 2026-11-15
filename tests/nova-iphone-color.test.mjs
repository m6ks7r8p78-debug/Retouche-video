/* NOVA 0.16 : métadonnées réelles QuickTime, observées indépendamment
 * par ffprobe. Les échantillons ne proviennent d'aucun média privé.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import DEMUX from "../experiences/nova-demux.js";
const run=promisify(execFile);
test("NOVA 0.16 : fichier MOV HEVC marqué BT2020 -> refuse export SDR",async()=>{
 const d=await fs.mkdtemp(path.join(os.tmpdir(),"nova-hdr-probe-")),file=path.join(d,"hdr.mov");
 try{
  await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-f","lavfi","-i","testsrc2=size=160x90:rate=15:duration=0.8",
   "-c:v","libx265","-preset","ultrafast","-threads","1",
   "-x265-params","pools=none:frame-threads=1:log-level=error:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc",
   "-pix_fmt","yuv420p10le","-color_primaries","bt2020",
   "-color_trc","smpte2084","-colorspace","bt2020nc",
   "-movflags","+write_colr+faststart","-y",file],{timeout:60000});
  const b=await fs.readFile(file),info=await DEMUX.analyser(new Blob([b]));
  assert.ok(info&&info.color,"HEVC MOV doit porter une boîte colr exploitable");
  const {stdout}=await run("ffprobe",["-v","error","-select_streams","v:0",
   "-show_entries","stream=codec_name,color_primaries,color_transfer,color_space",
   "-of","json",file]);
  const s=JSON.parse(stdout).streams[0];
  assert.equal(s.codec_name,"hevc");
  assert.equal(s.color_space,"bt2020nc");
  assert.equal(s.color_transfer,"smpte2084");
  assert.ok(info.color.matrix===9||info.color.transfer===16||info.color.primaries===9);
  assert.throws(()=>DEMUX.exigerPresentationFidele(info),/Couleur HDR/);
 }finally{await fs.rm(d,{recursive:true,force:true})}
});
test("NOVA 0.16 : fichier MOV H.264 anamorphique -> refuse déformation",async()=>{
 const d=await fs.mkdtemp(path.join(os.tmpdir(),"nova-pasp-probe-")),file=path.join(d,"anamorphic.mov");
 try{
  await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-f","lavfi","-i","testsrc2=size=160x90:rate=15:duration=0.8",
   "-vf","setsar=4/3","-c:v","libx264","-pix_fmt","yuv420p",
   "-movflags","+faststart","-y",file],{timeout:60000});
  const info=await DEMUX.analyser(new Blob([await fs.readFile(file)]));
  assert.ok(info?.pixelAspect,"pasp requis");
  const {stdout}=await run("ffprobe",["-v","error","-select_streams","v:0",
   "-show_entries","stream=sample_aspect_ratio","-of","json",file]);
  const sar=JSON.parse(stdout).streams[0].sample_aspect_ratio;
  assert.equal(sar,"4:3");
  assert.equal(info.pixelAspect.h*3,info.pixelAspect.v*4);
  assert.throws(()=>DEMUX.exigerPresentationFidele(info),/Pixels non carrés/);
 }finally{await fs.rm(d,{recursive:true,force:true})}
});