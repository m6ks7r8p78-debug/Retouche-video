import test from "node:test";
import assert from "node:assert/strict";
import EXPORT from "../experiences/nova-export.js";
import COLOR from "../experiences/nova-color709.js";
import METER from "../experiences/nova-export-meter.js";
import H264 from "../experiences/nova-h264-path.js";
import PREFLIGHT from "../experiences/nova-real-preflight.js";
const privateFile={name:"SECRET_PERSONAL_157.mov",type:"video/mp4",size:900000,
 slice(){throw Error("NO_PRIVATE_BYTES")}};
const hd={codec:"avc1.42C01E",W:1280,H:720,dw:1280,dh:720,
 ns:60,durationUs:2000000,ptsUs:Array.from({length:60},(_,i)=>i*33333),
 color:{kind:"nclx",primaries:1,transfer:1,matrix:1,fullRange:false}};
const opt=()=>({
 file:privateFile,info:hd,
 ptsPlan:()=>({nonnegative:[{ptsUs:0}]}),
 sourceAudit:()=>({debutFidele:true}),
 guard:()=>({admissible:true,mebibytes:96.3}),
 checkDecoder:async()=>({supported:true}),
 checkEncoder:async()=>({supported:true}),
 checkColor:()=>({verified:true}),
 checkOpfs:async()=>true,
 audioPlan:async()=>({mode:"aac-copy",packets:[{timestamp:0,duration:21333}]}),
 avsyncAnalyze:async()=>({durationUs:2000000}),
 avsyncVerify:()=>({aligned:true}),
 plan:EXPORT.plan,outputProfile:"h264-hd720-opfs-6s",storageMode:"opfs"
});
test("Profil HD720 opt-in seulement, 1280x720 réel, 15 fps et non upscale",()=>{
 const std=EXPORT.plan({duration:2,width:1280,height:720,bytes:900000});
 assert.deepEqual([std.width,std.height,std.frames],[640,360,30]);
 const hdPlan=EXPORT.plan({duration:2,width:1280,height:720,bytes:900000,
  profile:"h264-hd720-opfs-6s"});
 assert.deepEqual([hdPlan.width,hdPlan.height,hdPlan.frames],[1280,720,30]);
 assert.equal(hdPlan.outputProfile,"h264-hd720-opfs-6s");
 const portrait=EXPORT.plan({duration:2,width:720,height:1280,bytes:900000,
  profile:"h264-hd720-opfs-6s"});
 assert.deepEqual([portrait.width,portrait.height],[720,1280]);
 const six=EXPORT.plan({duration:6,width:1280,height:720,bytes:900000,
  profile:"h264-hd720-opfs-6s"});
 assert.deepEqual([six.width,six.height,six.frames],[1280,720,90]);
 assert.throws(()=>EXPORT.plan({duration:6.1,width:1280,height:720,bytes:900000,
  profile:"h264-hd720-opfs-6s"}),/6 secondes/);
 assert.throws(()=>EXPORT.plan({duration:2,width:640,height:360,bytes:900000,
  profile:"h264-hd720-opfs-6s"}),/aucun agrandissement/);
 assert.throws(()=>EXPORT.plan({duration:2,width:1280,height:800,bytes:900000,
  profile:"h264-hd720-opfs-6s"}),/budget pixels/);
 assert.throws(()=>EXPORT.plan({duration:2,width:1280,height:720,bytes:900000,
  maxSide:1280}),/640 px/);
});
test("Conversion couleur 720p : vraie trame I420 bornée au profil HD",()=>{
 const rgba=new Uint8ClampedArray(1280*720*4);
 for(let i=0;i<rgba.length;i+=4){rgba[i]=128;rgba[i+1]=128;
  rgba[i+2]=128;rgba[i+3]=255}
 assert.throws(()=>COLOR.convertir(rgba,1280,720),/budget/);
 const yuv=COLOR.convertir(rgba,1280,720,"h264-hd720-opfs-6s");
 assert.equal(yuv.length,1280*720*3/2);
 assert.ok(yuv[0]>16&&yuv[0]<235);
 assert.equal(yuv[1280*720],128);
 assert.equal(yuv.at(-1),128);
 assert.throws(()=>COLOR.convertir(new Uint8ClampedArray(1282*720*4),
  1282,720,"h264-hd720-opfs-6s"),/budget/);
});
test("Budget de copie HD720 opt-in, standard ne peut pas prendre 5 Mio par image",()=>{
 const bytes=1280*720*5.5;
 assert.throws(()=>METER.create().frame({bufferBytes:bytes}),/statistiques/);
 const m=METER.create({frameProfile:"h264-hd720-opfs-6s"});
 m.frame({bufferBytes:bytes,queue:3});
 assert.equal(m.snapshot().peakFrameCopyBytes,bytes);
 assert.throws(()=>METER.create({frameProfile:"h264-unrestricted"}),/profil/);
});
test("Précontrôle HD720 : OPFS obligatoire, couleur, durée et source suffisantes",async()=>{
 const fail=await H264.inspect({...opt(),storageMode:"memory"});
 assert.equal(fail.status,"h264-hd720-requires-opfs");
 const unsupported=await H264.inspect({...opt(),checkOpfs:async()=>false});
 assert.equal(unsupported.status,"h264-opfs-unavailable");
 const long=await H264.inspect({...opt(),info:{...hd,durationUs:6100000}});
 assert.equal(long.status,"h264-pilot-limit");
 const low=await H264.inspect({...opt(),info:{...hd,dw:640,dh:360}});
 assert.equal(low.status,"h264-pilot-limit");
 const color=await H264.inspect({...opt(),checkColor:()=>({verified:false})});
 assert.equal(color.status,"h264-unsafe-color");
 let encCfg=null;
 const success=await H264.inspect({...opt(),checkEncoder:async c=>{
  encCfg=c;return {supported:true}
 }});
 assert.equal(success.status,"ready-for-export-attempt");
 assert.deepEqual(success.proposal,{width:1280,height:720,fps:15,frames:30});
 assert.deepEqual([encCfg.width,encCfg.height,encCfg.bitrate],[1280,720,4000000]);
});
test("Rapport de précontrôle HD720 : proposition 1280x720, sans fuite privée",async()=>{
 const r=await PREFLIGHT.inspect({
  file:privateFile,outputProfile:"h264-hd720-opfs-6s",storageMode:"opfs",
  getEnvironment:()=>({secureContext:true,videoEncoder:true,videoFrame:true,webAssembly:true}),
  probe:async()=>hd,
  h264Inspect:params=>{
   assert.equal(params.outputProfile,"h264-hd720-opfs-6s");
   assert.equal(params.storageMode,"opfs");
   return H264.inspect({...params,...opt(),checkOpfs:async()=>true,
    checkDecoder:async()=>({supported:true}),checkEncoder:async()=>({supported:true}),
    ptsPlan:()=>({nonnegative:[{ptsUs:0}]}),
    sourceAudit:()=>({debutFidele:true}),
    checkColor:()=>({verified:true}),
    avsyncAnalyze:async()=>({durationUs:2000000}),
    avsyncVerify:()=>({aligned:true})});
  }
 });
 assert.equal(r.status,"ready-for-export-attempt");
 const report=JSON.parse(PREFLIGHT.serialiser(r));
 assert.deepEqual(report.exportProposal,{width:1280,height:720,fps:15,frames:30});
 assert.equal(report.outputProfile,"h264-hd720-opfs-6s");
 assert.equal(report.pilotLimits.outputSideMax,1280);
 assert.equal(report.pilotLimits.maxDurationMs,6000);
 assert.equal(report.privacy.mediaUploaded,false);
 assert.ok(!JSON.stringify(report).includes(privateFile.name));
});

test("Précontrôle HD720 6 s : 90 trames, refuse RAM, quota mémoire et >6s",async()=>{
 const longInfo={...hd,ns:180,durationUs:6000000,
  ptsUs:Array.from({length:180},(_,i)=>i*33333)};
 const proposed=await H264.inspect({...opt(),info:longInfo,
  ptsPlan:()=>({nonnegative:longInfo.ptsUs.map(v=>({ptsUs:v}))}),
  sourceAudit:()=>({debutFidele:true})});
 assert.equal(proposed.status,"ready-for-export-attempt");
 assert.deepEqual(proposed.proposal,{width:1280,height:720,fps:15,frames:90});
 const noMemory=await H264.inspect({...opt(),info:longInfo,
  storageMode:"memory"});
 assert.equal(noMemory.status,"h264-hd720-requires-opfs");
 const over=await H264.inspect({...opt(),info:{...longInfo,durationUs:6000001}});
 assert.equal(over.status,"h264-pilot-limit");
 const budget=await H264.inspect({...opt(),info:longInfo,
  guard:()=>({admissible:false,mebibytes:160.5})});
 assert.equal(budget.status,"resource-budget");
});
