import test from "node:test";
import assert from "node:assert/strict";
import LAB from "../experiences/nova-iphone-report.js";
const input={type:"video/quicktime",size:6800000,name:"PRIVATE-157-video-sensitive.mov",
 slice(){}};
const track={codec:"hvc1.1.6.L30",ns:42,dw:160,dh:90,durationUs:1900000,
 color:{kind:"nclc",primaries:1,transfer:1,matrix:1}};
const env={secureContext:true,videoEncoder:true,videoFrame:true,webAssembly:true,worker:true,
 standalone:false,audioEncoder:false,videoDecoder:false};
const fakeResult={blob:{size:64000},sourceMode:"hevc-wasm",audioMode:"aac-copy",
 plan:{width:160,height:90,fps:15,frames:28},validation:{duration:1.87},
 colorAudit:{kind:"nclx",primaries:1,transfer:1,matrix:1,fullRange:false},
 hevcDiagnostics:{pipelineElapsedMs:163,wasmHeapPeakBytes:21*1048576,inbandParameterSets:0},
 pipelineAudit:{completed:true,elapsedMs:418,
 stagesMs:{preflight:8,audio:32,video:220,"video-flush":9,"aac-copy":60,mux:14,verify:75},
 jsHeapPeakBytes:null,encodedPayloadBytes:62000,finalMp4Bytes:64000,
 peakVideoEncodeQueue:4}};
function run(o={}){return LAB.executer({file:input,getEnvironment:()=>env,
 probeFile:async()=>track,validateSource:()=>({verified:true}),
 exporter:async()=>fakeResult,clock:()=>130,...o});}
test("NOVA 0.23 : rapport iPhone contient mesures A/V agrégées, jamais média/nom/device UA",async()=>{
 const {report,outputBlob}=await run();
 assert.equal(report.result,"success");
 assert.equal(report.source.inputBytes,6800000);
 assert.equal(report.output.wasmHeapCapacityPeakBytes,21*1048576);
 assert.equal(report.output.timingMs["aac-copy"],60);
 assert.equal(report.output.mp4SizeBytes,64000);
 assert.equal(report.output.colorVerified,true);
 assert.strictEqual(outputBlob,fakeResult.blob);
 const data=LAB.serialiser(report);
 assert.equal(report.sourceKind,"local-user-file");
 assert.equal(JSON.parse(data).sourceKind,"local-user-file");
 assert.match(data,/retoucheproai.nova.iphone-lab.v1/);
 for(const leaked of ["PRIVATE-157-video-sensitive.mov","location","latitude","iPhone15,","userAgent","blob:","rawMediaBytes"]){
  assert.ok(!data.includes(leaked),leaked+" must never appear in local report");
 }
 assert.equal(JSON.parse(data).privacy.mediaUploaded,false);
});
test("NOVA 0.23 : refuse format autre que HEVC et sérialise le diagnostic, pas l'image",async()=>{
 const {report,outputBlob}=await run({probeFile:async()=>({...track,codec:"avc1.4d002a"})});
 assert.equal(report.result,"refused");
 assert.equal(report.errorCode,"export-failed");
 assert.equal(outputBlob,null);
 assert.equal(JSON.parse(LAB.serialiser(report)).source.containerVideo,"other-or-unknown");
});
test("NOVA 0.23 : échec audio, HDR ou manque de support sont classés sans message privé",async()=>{
 for(const [msg,expected] of [
  ["Piste AAC non reconnue","audio-preservation-rejected"],
  ["colorimétrie HDR P3 interdite","color-or-bitstream-rejected"],
  ["NOVA 0.22 budget export : MP4 final dépasse le plafond mémoire","resource-budget-rejected"]]){
  const {report}=await run({exporter:async()=>{throw new Error(msg)}});
  assert.equal(report.result,"refused");
  assert.equal(report.errorCode,expected);
  assert.ok(!LAB.serialiser(report).includes(msg));
 }
});
test("NOVA 0.23 : contexte non sécurisé et codec absent refusés avant export",async()=>{
 let calls=0;
 for(const e of [{...env,secureContext:false},{...env,videoEncoder:false}]){
  const {report}=await run({getEnvironment:()=>e,
   exporter:async()=>{calls++;return fakeResult}});
  assert.equal(report.result,"refused");
 }
 assert.equal(calls,0);
});
test("NOVA 0.23 : annulation ne publie pas le MP4 et conserve un rapport technique",async()=>{
 const ctrl=new AbortController();
 const {report,outputBlob}=await run({signal:ctrl.signal,
  exporter:async()=>{ctrl.abort();return fakeResult}});
 assert.equal(report.result,"cancelled");
 assert.equal(report.errorCode,"cancelled");
 assert.equal(outputBlob,null);
});
test("NOVA 0.23 : série de métriques non certifiée n'est jamais publiée comme succès",async()=>{
 const {report}=await run({exporter:async()=>({...fakeResult,
  pipelineAudit:{...fakeResult.pipelineAudit,completed:false}})});
 assert.equal(report.result,"refused");
 assert.equal(report.output,null);
 assert.throws(()=>LAB.serialiser({schema:"garbage"}),/invalide/);
});

test("NOVA 0.23 : MOV iPhone sans MIME reconnu sans enregistrer son nom",async()=>{
 const mov={...input,type:"",name:"absolument-prive.MOV"};
 assert.equal(LAB.videoFile(mov),true);
 assert.equal(LAB.videoFile({...mov,name:"archive.xyz"}),false);
 const {report}=await run({file:mov});
 assert.equal(report.result,"success");
 assert.equal(report.source.mimeCategory,"video");
 assert.equal(LAB.serialiser(report).includes(mov.name),false);
});

test("NOVA 0.24 : la source synthétique est tracée sans identifier l'appareil",async()=>{
 const {report,outputBlob}=await run({synthetic:true});
 assert.equal(report.result,"success");
 assert.equal(report.sourceKind,"synthetic-generated");
 assert.equal(outputBlob,fakeResult.blob);
 const data=JSON.parse(LAB.serialiser(report));
 assert.equal(data.sourceKind,"synthetic-generated");
 assert.equal(data.privacy.automaticSharing,false);
 assert.ok(!JSON.stringify(data).includes(input.name));
});
