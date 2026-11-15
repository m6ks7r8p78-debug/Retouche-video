/* NOVA 0.20 — les SPS/VUI HEVC déterminent couleur + pleine/limitée,
 * comparés à FFprobe et aux champs colr MOV. Audio/vidéo synthétiques.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import DEMUX from "../experiences/nova-demux.js";
import ANNEXB from "../experiences/nova-hevc-annexb.js";
import VUI from "../experiences/nova-hevc-vui.js";
globalThis.NOVA_HEVC_ANNEXB=ANNEXB;
const run=promisify(execFile);
test("NOVA 0.20 : vrai hvcC SPS/VUI compare BT709 plage limitée à FFprobe",async(t)=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-hevc-vui-"));
 try{
  for(const fullRange of [false,true]){
   const file=path.join(dir,fullRange?"full.mov":"limited.mov");
   await run("ffmpeg",["-hide_banner","-loglevel","error",
    "-f","lavfi","-i","testsrc2=size=160x90:rate=15:duration=0.8",
    "-c:v","libx265","-preset","ultrafast","-threads","1",
    "-x265-params","pools=none:frame-threads=1:log-level=error",
    "-pix_fmt","yuv420p","-color_range",fullRange?"pc":"tv",
    "-color_primaries","bt709","-color_trc","bt709","-colorspace","bt709",
    "-movflags","+write_colr+faststart","-y",file],{timeout:60000});
   const info=await DEMUX.analyser(new Blob([await fs.readFile(file)]));
   assert.ok(info&&/^(hvc1|hev1)\./.test(info.codec));
   const cfg=ANNEXB.configuration(info.desc);
   const sps=cfg.parameterSets.find(x=>(x[0]>>1)===33);
   const vui=VUI.lireSPS(sps);
   const {stdout}=await run("ffprobe",["-v","error","-select_streams","v:0",
    "-show_entries","stream=color_range,color_primaries,color_transfer,color_space,width,height",
    "-of","json",file]);
   const ff=JSON.parse(stdout).streams[0];
   assert.deepEqual([vui.width,vui.height],[ff.width,ff.height]);
   assert.deepEqual([vui.primaries,vui.transfer,vui.matrix],[1,1,1]);
   assert.equal(vui.fullRange,fullRange,"VUI et FFmpeg doivent refléter la plage demandée");
   assert.equal(ff.color_range,fullRange?"pc":"tv");
   if(fullRange)assert.throws(()=>VUI.analyser(info),/full-range|limitée/);
   else{
    const accepted=VUI.analyser(info);
    assert.equal(accepted.verified,true);
    assert.equal(accepted.fullRange,false);
    assert.throws(()=>VUI.analyser({...info,color:{...info.color,matrix:9}}),
     /contradictoires/);
   }
   t.diagnostic("HEVC VUI réel : "+JSON.stringify({
    fullRange,vui,ffRange:ff.color_range,container:info.color}));
  }
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test("NOVA 0.20 : bitstream SPS tronqué et hvcC ambigu refusés",()=>{
 assert.throws(()=>VUI.lireSPS(new Uint8Array([66,1,0,1,2])),
  /HEVC SPS\/VUI/);
 assert.throws(()=>VUI.analyser({codec:"hvc1.1.6.L30",
   desc:new Uint8Array([1]),color:{kind:"nclc",primaries:1,transfer:1,matrix:1}}),
  /hvcC|SPS/);
});
