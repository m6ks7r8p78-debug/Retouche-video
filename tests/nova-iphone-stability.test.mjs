import test from "node:test";
import assert from "node:assert/strict";
import S from "../experiences/nova-iphone-stability.js";
const report=(elapsed=200,opts={})=>({
 schema:"retoucheproai.nova.iphone-lab.v1",sourceKind:"synthetic-generated",
 result:"success",output:{
  outputWidth:160,outputHeight:90,outputFps:15,outputFrames:15,
  audio:"aac-copy",colorVerified:true,mode:"hevc-wasm",
  pipelineElapsedMs:elapsed,wasmHeapCapacityPeakBytes:20971520,mp4SizeBytes:5500,
  ...opts.output
 },...Object.fromEntries(Object.entries(opts).filter(([k])=>k!=="output"))
});
test("NOVA 0.26 : 3 conversions synthétiques cohérentes donnent une observation limitée",async()=>{
 let count=0;
 const s=await S.run({execute:async()=>{count++;return {report:report(180+count*20),outputBlob:{size:5000}}}});
 assert.equal(count,3);assert.equal(s.status,"three-synthetic-runs-consistent");
 assert.equal(s.elapsedMedianMs,220);
 assert.equal(s.wasmCapacitySpreadBytes,0);
 assert.equal(s.physicalIphoneCertified,false);
 assert.equal(s.totalRamKnown,false);
 assert.equal(s.realMediaTested,false);
 assert.equal(s.uploadsPerformed,false);
 assert.equal(s.automaticSettingsChange,false);
 const json=S.serialize(s);
 assert.equal(JSON.parse(json).sourceKind,"synthetic-generated");
 assert.ok(json.length<5000);
});
test("NOVA 0.26 : un échec arrête la suite et interdit succès sur 3 essais",async()=>{
 let count=0;
 const r=await S.run({execute:async()=>{
  count++;return {report:count===2?report(190,{result:"refused",output:null}):report(200)};
 }});
 assert.equal(count,2);assert.equal(r.status,"abstain");
 assert.equal(r.succeeded,1);assert.equal(r.refused,1);
 assert.equal(r.completed,2);assert.equal(r.elapsedMedianMs,null);
});
test("NOVA 0.26 : annulation avant prochain essai ne crée aucune réussite trompeuse",async()=>{
 const ac=new AbortController();let count=0;
 const r=await S.run({signal:ac.signal,execute:async()=>{
  count++;ac.abort();return {report:report(180)};
 }});
 assert.equal(count,1);assert.equal(r.status,"abstain");assert.equal(r.completed,1);
 assert.equal(r.interrupted,true);assert.equal(r.failureReason,"run-cancelled");
});
test("NOVA 0.26 : variation extrême -> avertissement, pas promesse de performance",()=>{
 const r=S.summary([report(100),report(150),report(1200)]);
 assert.equal(r.status,"caution");
 assert.equal(r.variability,"high");
 assert.equal(r.elapsedMaxMs,1200);
});
test("NOVA 0.26 : couleur ou propriétés audiovisuelles divergentes = refus de stabilité",()=>{
 const r=S.summary([report(200),report(180,{output:{audio:"silent"}}),report(190)]);
 assert.equal(r.status,"inconsistent-output");
 assert.equal(r.outputConsistent,false);
 const b=S.summary([report(200),report(180,{output:{colorVerified:false}}),report(190)]);
 assert.equal(b.status,"inconsistent-output");
});
test("NOVA 0.26 : aucune vidéo personnelle ni champ libre dans le rapport",async()=>{
 const input=[report(180,{secretVideoName:"PRIVÉ_157.mov",userAgent:"iPhone_private"}),report(181),report(182)];
 const s=S.summary(input),json=S.serialize({...s,secretVideoName:"PRIVÉ_157.mov",gps:"coordinates"});
 assert.equal(s.status,"three-synthetic-runs-consistent");
 assert.ok(!json.includes("PRIVÉ_157.mov"));
 assert.ok(!json.includes("coordinates"));
 assert.ok(!json.includes("iPhone_private"));
 assert.throws(()=>S.summary([{...report(100),sourceKind:"local-user-file"}]),/synthétiques/);
 await assert.rejects(S.run({execute:async()=>{},runs:4}),/trois essais/);
 assert.throws(()=>S.serialize({schema:"invalid"}),/non valide/);
});

test("NOVA 0.27 : annulation pendant le troisième export invalide trois succès provisoires",async()=>{
 const ac=new AbortController();let count=0;
 const r=await S.run({signal:ac.signal,execute:async()=>{
  count++;if(count===3)ac.abort();return {report:report(100+count)};
 }});
 assert.equal(count,3);assert.equal(r.completed,3);assert.equal(r.succeeded,3);
 assert.equal(r.status,"abstain");assert.equal(r.interrupted,true);
 assert.equal(r.outputConsistent,false);assert.equal(r.failureReason,"run-cancelled");
 const j=JSON.parse(S.serialize(r));assert.equal(j.status,"abstain");
 assert.equal(j.outputConsistent,false);assert.equal(j.physicalIphoneCertified,false);
});
test("NOVA 0.27 : annulation préalable ou pendant progression ne démarre aucun export",async()=>{
 for(const cancelOnProgress of [false,true]){
  const ac=new AbortController();let calls=0;
  if(!cancelOnProgress)ac.abort();
  const r=await S.run({signal:ac.signal,onProgress:()=>ac.abort(),
   execute:async()=>{calls++;return {report:report(200)}}});
  assert.equal(calls,0);assert.equal(r.completed,0);
  assert.equal(r.status,"abstain");assert.equal(r.interrupted,true);
  assert.equal(r.failureReason,"run-cancelled");
 }
});
test("NOVA 0.27 : sérialisation malicieuse ne reflète pas les champs privés",()=>{
 const s=S.summary([report(201),report(198),report(205)]);
 const injected={...s,status:"PRIVATE.mov",failureReason:"GPS 3.4",
  caveat:"email private@example.com",sourceKind:"secret.webm",
  userAgent:"DevicePrivate",location:"home"};
 const text=S.serialize(injected);
 for(const forbidden of ["PRIVATE.mov","GPS 3.4","private@example.com",
  "secret.webm","DevicePrivate","home"])assert.ok(!text.includes(forbidden));
 const j=JSON.parse(text);
 assert.equal(j.status,"abstain");assert.equal(j.sourceKind,"synthetic-generated");
 assert.equal(j.physicalIphoneCertified,false);assert.equal(j.uploadsPerformed,false);
});
