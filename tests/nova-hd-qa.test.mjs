import test from "node:test";
import assert from "node:assert/strict";
import QA from "../experiences/nova-hd-qa.js";

function fixture(){
 return {
  source:{dw:1088,dh:1920,ns:195,durationUs:6465017},
  output:{dw:1088,dh:1920,ns:195,durationUs:6465017,
   color:{kind:"nclx",primaries:1,transfer:1,matrix:1,fullRange:false}},
  outputAudio:{
   sampleRate:48000,channels:1,
   packets:Array.from({length:306},(_,i)=>({
    timestamp:Math.round(i*1024*1e6/48000),
    duration:Math.round((i+1)*1024*1e6/48000)-
     Math.round(i*1024*1e6/48000)
   }))
  },
  sourceFps:30.2,modifiedFrames:189,colorMismatchFrames:0,
  luminosity:{frames:195,samples:399360,totalAbsDelta:0.9,
   totalSignedDelta:0.5,strongFrames:0}
 };
}
test("NOVA 0.35 : rapport fondé sur MP4 HD réel observé, 195 images, AAC 306 paquets et écart de fin ~63ms",()=>{
 const out=QA.bilan(fixture());
 assert.equal(out.video.sourceFrames,195);
 assert.equal(out.video.outputFrames,195);
 assert.deepEqual(out.video.outputDimensions,[1088,1920]);
 assert.equal(out.video.frameCountPreserved,true);
 assert.equal(out.video.dimensionsPreserved,true);
 assert.equal(out.audio.packets,306);
 assert.ok(out.audio.lastAudioPacketMinusVideoDurationMs>40&&
  out.audio.lastAudioPacketMinusVideoDurationMs<80);
 assert.equal(out.audio.synchronizationPerceptuallyCertified,false);
 assert.equal(out.color.visuallyIdenticalToSourceCertified,false);
 assert.equal(out.correction.interventionFrames,189);
 assert.equal(out.correction.isProofOfImprovement,false);
 assert.equal(out.privacy.automaticUpload,false);
 assert.ok(out.warnings.some(x=>x.includes("Fin des paquets AAC")));
});
test("NOVA 0.35 : échantillonnage mesure le changement réel, ne stocke ni pixels ni trame",()=>{
 const source=new Uint8ClampedArray([
  64,64,64,255,128,128,128,255,200,200,200,255,255,255,255,255
 ]);
 const measure=QA.avant(source);
 const output=source.slice();
 output[0]=128;output[1]=128;output[2]=128;
 const delta=QA.apres(output,measure);
 assert.equal(delta.samples,4);
 assert.ok(delta.meanAbsDelta>.05);
 assert.ok(delta.meanSignedDelta>0);
 assert.ok(delta.largeSampleShare>.20);
 const report=QA.bilan({...fixture(),luminosity:{
  frames:1,samples:delta.samples,totalAbsDelta:delta.meanAbsDelta,
  totalSignedDelta:delta.meanSignedDelta,strongFrames:1
 }});
 assert.equal(report.correction.stronglyChangedFrames,1);
 const json=JSON.stringify(report);
 for(const term of ['"filename":','"fileContent":','"pixels":',
   '"audioBuffer":','"location":','"videoBytes":','"source":']){
  assert.equal(json.includes(term),false);
 }
 assert.ok(json.length<4096,"Le rapport ne doit contenir que des mesures bornées");
});
test("NOVA 0.35 : absence de piste audio ou timeline AAC invalide ne produit pas de faux rapport",()=>{
 const f=fixture();
 assert.throws(()=>QA.bilan({...f,outputAudio:{packets:[]}}),/incomplet/);
 assert.throws(()=>QA.bilan({...f,outputAudio:{
  ...f.outputAudio,packets:[{timestamp:0,duration:-50}]
 }}),/invalides/);
 assert.throws(()=>QA.bilan({...f,modifiedFrames:196}),/invalides/);
 assert.throws(()=>QA.apres(new Uint8Array(2),{stride:1,luminances:[1]}));
});
test("NOVA 0.35 : désaccord des frames est rapporté, jamais certifié",()=>{
 const f=fixture();
 const r=QA.bilan({...f,output:{...f.output,ns:194},colorMismatchFrames:195});
 assert.equal(r.video.frameCountPreserved,false);
 assert.equal(r.color.nativeSafariUncertifiedFrames,195);
 assert.ok(r.warnings.some(x=>x.includes("trames")));
});
