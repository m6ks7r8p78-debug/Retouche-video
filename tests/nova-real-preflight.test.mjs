import test from "node:test";
import assert from "node:assert/strict";
import AUDIT from "../experiences/nova-real-preflight.js";
const file={type:"video/quicktime",name:"PRIVATE-user-face-157.mov",size:3*1048576,
 slice(){throw Error("Raw frame should never be read by the mock")}};
const track={codec:"hvc1.1.6.L30",W:160,H:90,dw:160,dh:90,ns:15,durationUs:1000000,
 ptsUs:[0,66667],color:{kind:"nclx",primaries:1,transfer:1,matrix:1,fullRange:false}};
const env={secureContext:true,videoEncoder:true,videoFrame:true,webAssembly:true};
const meta={width:160,height:90,encodedWidth:160,encodedHeight:90,durationSeconds:1};
function options(extra={}){
 return {file,getEnvironment:()=>env,
  probe:async()=>track,
  validate:()=>meta,
  plan:()=>({width:160,height:90,fps:15,frames:15}),
  guard:()=>({mebibytes:52.3,admissible:true}),
  audioPlan:async()=>({mode:"aac-copy",packets:[{offset:1400,size:30,data:"PRIVATE-AUDIO-RAW"}]}),
  ...extra};
}
test("vidéo réelle : précontrôle positif sans modifier ni exporter",async()=>{
 const result=await AUDIT.inspect(options());
 assert.equal(result.status,"ready-for-export-attempt");
 assert.equal(result.readyForExportAttempt,true);
 assert.equal(result.audio,"aac-copy-verified");
 assert.equal(result.source.codec,"hevc");
 assert.equal(result.estimatedMiB,52.3);
 assert.deepEqual(result.exportProposal,{width:160,height:90,fps:15,frames:15});
 const json=AUDIT.serialiser(result);
 assert.equal(JSON.parse(json).status,"ready-for-export-attempt");
 for(const forbidden of [file.name,"PRIVATE-AUDIO-RAW","data", "blob:","userAgent","gps","location"])
  assert.ok(!json.includes(forbidden),forbidden+" leaked into report");
 assert.equal(JSON.parse(json).privacy.mediaUploaded,false);
 assert.equal(JSON.parse(json).privacy.mediaModified,false);
});
test("format vidéo et volume refusés avant lecture binaire",async()=>{
 const bad=[{...file,type:"application/pdf",name:"PRIVATE.pdf"},
  {...file,size:61*1048576},{...file,size:0},null];
 for(const f of bad){
  const r=await AUDIT.inspect(options({file:f,probe:async()=>{throw Error("should not probe")}}));
  assert.equal(r.status,f?.type==="application/pdf"?"not-video":"file-budget");
  assert.equal(r.readyForExportAttempt,false);
 }
});
test("contexte et capacités WebCodecs : pas de faux positif",async()=>{
 for(const [environment,expected] of [
  [{...env,secureContext:false},"insecure-context"],
  [{...env,videoFrame:false},"browser-unavailable"],
  [{...env,videoEncoder:false},"browser-unavailable"]]){
  const r=await AUDIT.inspect(options({getEnvironment:()=>environment,
   probe:async()=>{throw Error("probe not called")}}));
  assert.equal(r.status,expected);
 }
});
test("MP4 invalide ou H264 : le pilote HEVC ne préconise pas l'export",async()=>{
 const unreadable=await AUDIT.inspect(options({probe:async()=>null}));
 assert.equal(unreadable.status,"container-unreadable");
 const broken=await AUDIT.inspect(options({probe:async()=>{throw Error("PRIVATE_FILE.mov")}}));
 assert.equal(broken.status,"container-unreadable");
 const h264=await AUDIT.inspect(options({probe:async()=>({...track,codec:"avc1.42C01E"}),
  validate:()=>{throw Error("not reached")}}));
 assert.equal(h264.source.codec,"h264");
 assert.equal(h264.status,"unsupported-video-codec");
 assert.ok(!AUDIT.serialiser(broken).includes("PRIVATE_FILE"));
});
test("HDR/P3 ou PTS ambigu : refus fidèle avant toute tentative AAC",async()=>{
 let audioCalls=0;
 const r=await AUDIT.inspect(options({validate:()=>{throw Error("HDR P3 raw file path PRIVATE")},audioPlan:async()=>{audioCalls++;return null}}));
 assert.equal(r.status,"hevc-profile-or-timeline-incompatible");
 assert.equal(audioCalls,0);
});
test("budget insuffisant et export de haute résolution interdit",async()=>{
 const missing=await AUDIT.inspect(options({guard:()=>{throw Error("budget dépassé")}}));
 assert.equal(missing.status,"resource-budget");
 const large=await AUDIT.inspect(options({plan:()=>({width:640,height:360,fps:15,frames:200}),
  guard:()=>({mebibytes:72,admissible:true})}));
 assert.equal(large.status,"resource-budget");
 assert.equal(large.readyForExportAttempt,false);
});
test("AAC non conservable : aucun succès implicite, même si l'image est compatible",async()=>{
 for(const audioPlan of [
  async()=>{throw Error("AAC sans couverture vidéo")},async()=>({mode:"silent",packets:[]}),
  async()=>({mode:"aac-copy",packets:[]})]){
  const r=await AUDIT.inspect(options({audioPlan}));
  assert.equal(r.status,"audio-not-preservable");
  assert.equal(r.readyForExportAttempt,false);
 }
});
test("annulation avant et après l'analyse : aucun rapport positif",async()=>{
 const c=new AbortController();c.abort();
 const r=await AUDIT.inspect(options({signal:c.signal}));
 assert.equal(r.status,"cancelled");
 const ctl=new AbortController();
 const after=await AUDIT.inspect(options({
  signal:ctl.signal,probe:async()=>{ctl.abort();return track}
 }));
 assert.equal(after.status,"cancelled");
});
test("sérialiseur bloque un faux statut et élimine les champs injectés",async()=>{
 const r=await AUDIT.inspect(options());
 assert.throws(()=>AUDIT.serialiser({...r,status:"PRIVATE-filename.mov"}),/inconnu/);
 assert.throws(()=>AUDIT.serialiser({...r,readyForExportAttempt:false}),/inconnu/);
 const tampered={...r,filename:"PRIVATE_BLOB",source:{...r.source,private:"PRIVATE_FRAME"},
  audioDetails:"PRIVATE_SAMPLES",exportProposal:{...r.exportProposal,device:"PRIVATE_GPS"}};
 const json=AUDIT.serialiser(tampered);
 assert.ok(!json.includes("PRIVATE_"));
 assert.deepEqual(JSON.parse(json).exportProposal,{width:160,height:90,fps:15,frames:15});
});

test("NOVA 0.26 : vidéo verticale HD synthétique : deux raisons exactes + cadence indicative",async()=>{
 const trackHD={...track,W:1080,H:1920,dw:1080,dh:1920,ns:180,durationUs:6000000};
 let audioCalls=0;
 const r=await AUDIT.inspect(options({probe:async()=>trackHD,
  validate:()=>{throw Error("NOVA HEVC limite stricte")},
  audioPlan:async()=>{audioCalls++;return null}}));
 assert.equal(r.status,"hevc-profile-or-timeline-incompatible");
 assert.deepEqual(r.blockers,["coded-pixels-over-limit","source-frames-over-limit"]);
 assert.deepEqual(r.advisories,["source-rate-above-output-rate"]);
 assert.equal(r.source.estimatedSourceFps,30);
 assert.equal(r.audio,"not-tested");
 assert.equal(audioCalls,0,"ne doit pas tenter l'audio si le profil vidéo échoue");
 const j=JSON.parse(AUDIT.serialiser(r));
 assert.deepEqual(j.blockers,["coded-pixels-over-limit","source-frames-over-limit"]);
 assert.equal(j.source.estimatedSourceFps,30);
 assert.equal(j.pilotLimits.codedPixelAreaMax,230400);
 assert.equal(j.pilotLimits.sourceFramesMax,90);
 assert.equal(j.pilotLimits.outputFpsMax,15);
 assert.equal(j.privacy.mediaModified,false);
 assert.ok(!JSON.stringify(j).includes(file.name));
});
test("NOVA 0.26 : distinguer durée / dimensions impaires, sans fuite",async()=>{
 const r=await AUDIT.inspect(options({
  probe:async()=>({...track,W:639,H:359,ns:15,durationUs:13000000}),
  validate:()=>{throw Error("duration rejected")}
 }));
 assert.equal(r.status,"hevc-profile-or-timeline-incompatible");
 assert.deepEqual(r.blockers,["duration-over-limit","coded-dimensions-not-even"]);
 const j=JSON.parse(AUDIT.serialiser({...r,blockers:[...r.blockers,"PRIVATE-RAW",r.blockers[0]],
  advisories:["source-rate-above-output-rate","PRIVATE-RAW"]}));
 assert.deepEqual(j.blockers,["duration-over-limit","coded-dimensions-not-even"]);
 assert.deepEqual(j.advisories,["source-rate-above-output-rate"]);
 assert.ok(!JSON.stringify(j).includes("PRIVATE"));
});
test("NOVA 0.26 : rejet VUI ou PTS avec source petite : pas de fausse raison connue",async()=>{
 const r=await AUDIT.inspect(options({
  validate:()=>{throw Error("HDR/P3 sans preuve de couleur")}
 }));
 assert.equal(r.status,"hevc-profile-or-timeline-incompatible");
 assert.deepEqual(r.blockers,[]);
 assert.deepEqual(r.advisories,[]);
});

test("NOVA Directeur HD : vidéo iPhone 1088×1920 195 images testée sur moteur natif, pas rejetée comme trop grande",async()=>{
 const original=globalThis.NOVA_NATIVE_HD;
 let calls=0;
 globalThis.NOVA_NATIVE_HD={
  analyse:(info,bytes)=>{
   assert.equal(info.ns,195);assert.equal(bytes,file.size);
   return {width:1088,height:1920,sourceFrames:195,sourceFps:30,
    durationSeconds:6.5};
  },
  configDecoder:async()=>{calls++;return {codec:"hvc1"}},
  configEncoder:async()=>{calls++;return {codec:"avc1"}}
 };
 try{
  const iphone={...track,codec:"hvc1.1.6.L120",W:1920,H:1088,dw:1088,dh:1920,
   ns:195,durationUs:6500000};
  const result=await AUDIT.inspect(options({
   probe:async()=>iphone,
   validate:()=>{throw Error("old WASM must not run")},
   audioPlan:async()=>({mode:"aac-copy",packets:[{}]})
  }));
  assert.equal(result.status,"ready-for-native-hd-attempt");
  assert.equal(result.readyForExportAttempt,true);
  assert.equal(result.audio,"aac-copy-verified");
  assert.equal(result.exportProposal.width,1088);
  assert.equal(result.exportProposal.height,1920);
  assert.equal(result.exportProposal.frames,195);
  assert.deepEqual(result.blockers,[]);
  assert.equal(calls,2);
  const json=JSON.parse(AUDIT.serialiser(result));
  assert.equal(json.exportProposal.fps,30);
  assert.equal(json.source.estimatedSourceFps,30);
  assert.ok(!JSON.stringify(json).includes(file.name));
 }finally{
  if(original===undefined)delete globalThis.NOVA_NATIVE_HD;
  else globalThis.NOVA_NATIVE_HD=original;
 }
});
