import test from "node:test";
import assert from "node:assert/strict";
import H264 from "../experiences/nova-h264-path.js";
import PREFLIGHT from "../experiences/nova-real-preflight.js";

const goodFile={type:"video/mp4",name:"PRIVATE_157.mp4",size:900000,
 slice(){throw Error("No raw video should be read by synthetic mock")}};
const goodInfo={
 codec:"avc1.42C01E",W:160,H:90,dw:160,dh:90,ns:18,durationUs:1200000,
 ptsUs:Array.from({length:18},(_,i)=>i*66667),
 key:[true,...Array(17).fill(false)],
 so:Array.from({length:18},(_,i)=>1000+i*100),
 sz:Array(18).fill(100),
 color:{kind:"nclx",primaries:1,transfer:1,matrix:1,fullRange:false}
};
const proposal={width:160,height:90,fps:15,frames:18};
const success=()=>({supported:true});
const audio=()=>({mode:"aac-copy",packets:[{timestamp:0,duration:20000,size:30}],sampleRate:48000});
const deps=()=>({
 file:goodFile,info:goodInfo,
 ptsPlan:()=>({nonnegative:goodInfo.ptsUs.map(x=>({ptsUs:x}))}),
 sourceAudit:()=>({debutFidele:true}),
 plan:()=>proposal,
 guard:()=>({admissible:true,mebibytes:51.4}),
 checkDecoder:success,checkEncoder:success,
 checkColor:()=>({verified:true,primaries:1,transfer:1,matrix:1,fullRange:false}),
 audioPlan:audio,
 avsyncAnalyze:async()=>({durationUs:1200000}),
 avsyncVerify:()=>({aligned:true})
});
const inspect=(opts={})=>H264.inspect({...deps(),...opts});

test("H264 natif PTS + AAC positif : seulement essai d'export, pas export réalisé",async()=>{
 const r=await inspect();
 assert.equal(r.schema,"retoucheproai.nova.h264-path.v1");
 assert.equal(r.status,"ready-for-export-attempt");
 assert.equal(r.readyForExportAttempt,true);
 assert.equal(r.audio,"aac-copy-verified");
 assert.deepEqual(r.proposal,proposal);
 assert.equal(r.engine,"webcodecs-h264-native-pts");
 assert.equal(r.mediaUploaded,false);
 assert.equal(r.mediaModified,false);
 assert.ok(!JSON.stringify(r).includes(goodFile.name));
});
test("H264 : environnement sans décodeur ou sans encodeur explicitement refusé",async()=>{
 assert.equal((await inspect({checkDecoder:async()=>({supported:false})})).status,
  "h264-decoder-unavailable");
 assert.equal((await inspect({checkEncoder:async()=>({supported:false})})).status,
  "h264-encoder-unavailable");
});
test("H264 : couleurs imprécises ou HDR et aspect non carré refusés",async()=>{
 for(const color of [null,
  {kind:"nclx",primaries:9,transfer:16,matrix:9,fullRange:false},
  {kind:"nclx",primaries:1,transfer:1,matrix:1,fullRange:true}]){
  assert.equal((await inspect({info:{...goodInfo,color},checkColor:()=>({verified:false})})).status,"h264-unsafe-color");
 }
 assert.equal((await inspect({info:{...goodInfo,pixelAspect:{h:4,v:3}}})).status,
  "h264-unsafe-metadata");
});
test("H264 : limites du pilote, mais non confusion 640x360 HEVC/1080p H264",async()=>{
 for(const info of [
  {...goodInfo,W:1922,H:1080},{...goodInfo,ns:5001},
  {...goodInfo,durationUs:48100000},{...goodInfo,W:161}]){
  assert.equal((await inspect({info})).status,"h264-pilot-limit");
 }
 const r=await inspect({info:{...goodInfo,W:1280,H:720}});
 assert.equal(r.status,"ready-for-export-attempt");
});
test("H264 : la timeline invalide bloque avant toute analyse audio",async()=>{
 let calls=0;
 const r=await inspect({ptsPlan:()=>{throw Error("PRIVATE_FRAME")},audioPlan:()=>{
  calls++;return audio();
 }});
 assert.equal(r.status,"h264-timeline-incompatible");
 assert.equal(calls,0);
 assert.ok(!JSON.stringify(r).includes("PRIVATE_FRAME"));
});
test("H264 : budget hors limite bloque avant audio",async()=>{
 const r=await inspect({guard:()=>({admissible:false,mebibytes:200})});
 assert.equal(r.status,"resource-budget");
 assert.equal(r.readyForExportAttempt,false);
 assert.equal(r.audio,"not-tested");
});
test("H264 : AAC non préservable, erreur privée non exposée",async()=>{
 for(const fn of [async()=>{throw Error("PRIVATE_AAC")},async()=>({mode:"silent",packets:[]})]){
  const r=await inspect({audioPlan:fn});
  assert.equal(r.status,"audio-not-preservable");
  assert.equal(r.audio,"not-tested");
  assert.ok(!JSON.stringify(r).includes("PRIVATE_AAC"));
 }
 const r=await inspect({avsyncVerify:()=>{throw Error("PRIVATE_SYNC")}});
 assert.equal(r.status,"audio-not-preservable");
 assert.ok(!JSON.stringify(r).includes("PRIVATE_SYNC"));
});
test("H264 : annulation à chaque étape, jamais success implicite",async()=>{
 const ctl=new AbortController();ctl.abort();
 const x=await inspect({signal:ctl.signal});
 assert.equal(x.status,"cancelled");
 const next=new AbortController();
 const y=await inspect({signal:next.signal,checkDecoder:async()=>{next.abort();return {supported:true}}});
 assert.equal(y.status,"cancelled");
});
test("H264 : précontrôle global accepte le chemin natif prouvé sans automatiser",async()=>{
 const r=await PREFLIGHT.inspect({
  file:goodFile,
  getEnvironment:()=>({secureContext:true,videoEncoder:true,videoFrame:true,webAssembly:true}),
  probe:async()=>goodInfo,
  h264Inspect:({file,info,signal})=>H264.inspect({...deps(),file,info,signal})
 });
 assert.equal(r.status,"ready-for-export-attempt");
 assert.equal(r.source.codec,"h264");
 assert.equal(r.sourceEngine,"webcodecs-h264-native-pts");
 assert.equal(r.audio,"aac-copy-verified");
 assert.deepEqual(r.exportProposal,proposal);
 const json=JSON.parse(PREFLIGHT.serialiser(r));
 assert.equal(json.pilotLimits.codedPixelAreaMax,1920*1080);
 assert.equal(json.pilotLimits.sourceFramesMax,5000);
 assert.equal(json.pilotLimits.outputFpsMax,15);
 assert.equal(json.readyForExportAttempt,true);
 assert.equal(json.privacy.mediaModified,false);
 assert.ok(!JSON.stringify(json).includes(goodFile.name));
});
test("H264 : rapport public ne transfère pas de champs injectés ou d'exception",async()=>{
 const r=await PREFLIGHT.inspect({
  file:goodFile,
  getEnvironment:()=>({secureContext:true,videoEncoder:true,videoFrame:true,webAssembly:true}),
  probe:async()=>goodInfo,
  h264Inspect:async()=>({...await inspect(),secret:"PRIVATE_RAW",proposal:{...proposal,secret:"PRIVATE_FACE"}})
 });
 const json=PREFLIGHT.serialiser(r);
 assert.equal(r.status,"ready-for-export-attempt");
 assert.ok(!json.includes("PRIVATE_"));
 assert.deepEqual(JSON.parse(json).exportProposal,proposal);
});

test("H264 >24s : OPFS indisponible = refus avant tous les décodages",async()=>{
 let decoded=0;
 const x=await inspect({info:{...goodInfo,durationUs:36000000,ns:540},
  checkOpfs:()=>false,
  checkDecoder:()=>{decoded++;return {supported:true}}});
 assert.equal(x.status,"h264-opfs-unavailable");
 assert.equal(x.readyForExportAttempt,false);
 assert.equal(decoded,0);
});
test("H264 OPFS 48s : précontrôle accepte le profil explicite 720 images",async()=>{
 const x=await inspect({info:{...goodInfo,durationUs:48000000,ns:720},
  checkOpfs:()=>true,
  ptsPlan:()=>({nonnegative:[{ptsUs:0}]}),
  sourceAudit:()=>({debutFidele:true}),
  plan:({duration,profile})=>{
   assert.equal(duration,48);
   assert.equal(profile,"h264-opfs-48s");
   return {width:160,height:90,fps:15,frames:720}
  },
  audioPlan:async()=>({mode:"aac-copy",packets:[{timestamp:0,duration:21333}]})
 });
 assert.equal(x.status,"ready-for-export-attempt");
 assert.equal(x.proposal.frames,720);
 assert.equal(x.audio,"aac-copy-verified");
});
