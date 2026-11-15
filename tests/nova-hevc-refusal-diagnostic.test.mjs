import test from "node:test";
import assert from "node:assert/strict";
import DIAG from "../experiences/nova-hevc-refusal-diagnostic.js";
import PREFLIGHT from "../experiences/nova-real-preflight.js";

const hevc=()=>({
 codec:"hvc1.1.6.L30",W:160,H:90,dw:160,dh:90,ns:3,
 durationUs:200000,ptsUs:[0,66667,133334],key:[true,false,false],
 so:[256,356,456],sz:[100,100,100],
 color:{kind:"nclx",primaries:1,transfer:1,matrix:1,fullRange:false}
});
const verifiedVui=()=>({
 verified:true,width:160,height:90,chroma:1,lumaBits:8,chromaBits:8,
 fullRange:false,primaries:1,transfer:1,matrix:1
});
const deps={vui:verifiedVui,timeline:()=>({sorted:[{}],nonnegative:[{}]})};
const code=(info,options=deps)=>DIAG.inspect(info,options).code;
const file={name:"CONFIDENTIEL.mov",type:"video/quicktime",size:1024*1024,slice(){throw Error("should not access raw bytes")}};
const environment=()=>({secureContext:true,videoFrame:true,videoEncoder:true,webAssembly:true});

test("diagnostic sans fichier, réseau, pixels, ni autorisation d'export",()=>{
 const out=DIAG.inspect(hevc(),deps);
 assert.equal(out.code,"independent-checks-inconclusive");
 assert.equal(out.confidence,"unverified");
 assert.equal(out.videoExportAllowed,false);
 assert.equal(out.automaticFallbackAllowed,false);
 assert.equal(out.audioTested,false);
 assert.equal(JSON.stringify(out).includes("CONFIDENTIEL"),false);
});

test("H.264 valide ne devient pas fichier corrompu : le pilote seul est limité",()=>{
 assert.equal(code({...hevc(),codec:"avc1.42C01E"}),"not-hevc-pilot");
});

test("les bornes du pilote HEVC et géométrie sont objectivement signalées",()=>{
 for(const input of [
  {...hevc(),W:1080,H:1920},
  {...hevc(),ns:91},
  {...hevc(),durationUs:12000001},
  {...hevc(),W:159}
 ]){
  const result=DIAG.inspect(input,deps);
  assert.equal(result.code,"pilot-limit-exceeded");
  assert.equal(result.stage,"pilot-limits");
  assert.equal(result.confidence,"confirmed-by-metadata");
 }
 assert.equal(code({...hevc(),pixelAspect:{h:4,v:3}}),"pixel-aspect-unsupported");
});

test("couleur manquante ou non SDR : différence entre connu et inconnu",()=>{
 assert.equal(code({...hevc(),color:null}),"color-metadata-missing");
 assert.equal(code({...hevc(),color:{kind:"nclx",primaries:9,transfer:16,matrix:9,fullRange:false}}),"color-metadata-unsupported");
 assert.equal(code({...hevc(),color:{kind:"nclc",primaries:1,transfer:1,matrix:1,fullRange:true}}),"color-metadata-unsupported");
});

test("SPS/VUI rejeté sans inventer le motif exact de l'exception",()=>{
 const result=DIAG.inspect(hevc(),{...deps,vui:()=>{throw Error("PRIVATE_VIDEO_OWNER path and bits")}});
 assert.equal(result.code,"sps-vui-unverified");
 assert.equal(result.confidence,"unverified");
 assert.ok(!JSON.stringify(result).includes("PRIVATE"));
 assert.equal(code(hevc(),{timeline:deps.timeline}),"sps-vui-check-unavailable");
 assert.equal(code(hevc(),{...deps,vui:()=>({...verifiedVui(),fullRange:true})}),"sps-vui-unsupported");
});

test("horodatages doublés, preroll, départ et fin incorrects distingués",()=>{
 assert.equal(code({...hevc(),ptsUs:[0,0,133334]}),"timeline-duplicate-pts");
 assert.equal(code({...hevc(),ptsUs:[-350000,0,133334]}),"timeline-negative-preroll");
 assert.equal(code({...hevc(),ptsUs:[1000,66667,133334]}),"timeline-start-nonzero");
 assert.equal(code({...hevc(),durationUs:130000,ptsUs:[0,66667,133334]}),"timeline-end-inconsistent");
 assert.equal(code({...hevc(),durationUs:500000,ptsUs:[0,66667,133334]}),"timeline-end-inconsistent");
 assert.equal(code({...hevc(),key:[false,false,false]}),"timeline-first-keyframe-missing");
});

test("données de timeline incomplètes : abstention plutôt que fausse faute PTS",()=>{
 assert.equal(code({...hevc(),ptsUs:[0,1]}),"timeline-data-unavailable");
 assert.equal(code({...hevc(),ptsUs:[0,NaN,133334]}),"timeline-data-unavailable");
 assert.equal(code(hevc(),{vui:verifiedVui}),"timeline-check-unavailable");
 assert.equal(code(hevc(),{...deps,timeline:()=>{throw Error("SECRET TIMING")}}),"timeline-check-inconclusive");
});

test("sérialisation du diagnostic refuse les champs inconnus/privés",()=>{
 const d=DIAG.publicReport({...DIAG.inspect(hevc(),deps),raw:"PRIVATE_GPS"});
 assert.equal(JSON.stringify(d).includes("PRIVATE"),false);
 const invalid=DIAG.publicReport({schema:d.schema,code:"PRIVATE_FACE",stage:"PRIVATE_STAGE",confidence:"PRIVATE_CONFIDENCE"});
 assert.equal(invalid.code,"unresolved");
 assert.equal(invalid.stage,"unknown");
 assert.equal(invalid.confidence,"unverified");
});

test("précontrôle raccordé : garde le refus, conserve audio non testé et expose sous-cause",async()=>{
 const info={...hevc(),W:1080,H:1920,ns:180,ptsUs:[],key:[],so:[],sz:[]};
 const options={
  file,getEnvironment:environment,probe:async()=>info,
  validate:()=>{throw Error("PRIVATE_PATH.mov")},
  diagnose:i=>DIAG.inspect(i,deps),
  audioPlan:()=>{throw Error("audio should not be called")}
 };
 const result=await PREFLIGHT.inspect(options);
 assert.equal(result.status,"hevc-profile-or-timeline-incompatible");
 assert.equal(result.readyForExportAttempt,false);
 assert.equal(result.audio,"not-tested");
 assert.equal(result.diagnostic.code,"pilot-limit-exceeded");
 const payload=JSON.parse(PREFLIGHT.serialiser(result));
 assert.deepEqual(payload.diagnostic,{code:"pilot-limit-exceeded",stage:"pilot-limits",confidence:"confirmed-by-metadata"});
 assert.ok(!JSON.stringify(payload).includes("PRIVATE_PATH"));
 assert.ok(!JSON.stringify(payload).includes(file.name));
});

test("erreur non diagnostiquée : aucune fausse précision",async()=>{
 const r=await PREFLIGHT.inspect({
  file,getEnvironment:environment,probe:async()=>hevc(),
  validate:()=>{throw Error("PRIVATE_ERROR")},
  diagnose:()=>{throw Error("PRIVATE_SECONDARY")}
 });
 assert.equal(r.status,"hevc-profile-or-timeline-incompatible");
 assert.equal(r.diagnostic,null);
 const p=JSON.parse(PREFLIGHT.serialiser(r));
 assert.equal(p.diagnostic,null);
 assert.equal(JSON.stringify(p).includes("PRIVATE"),false);
});

test("un diagnostic malveillant n'est ni recopié ni pris pour preuve",async()=>{
 const r=await PREFLIGHT.inspect({
  file,getEnvironment:environment,probe:async()=>hevc(),
  validate:()=>{throw Error("metadata fails")},
  diagnose:()=>({schema:"retoucheproai.nova.hevc-refusal-diagnostic.v1",
   code:"timeline-duplicate-pts",stage:"timeline",confidence:"confirmed-by-metadata",
   videoExportAllowed:true,secret:"PRIVATE_PERSON"})
 });
 const p=JSON.parse(PREFLIGHT.serialiser(r));
 assert.deepEqual(p.diagnostic,{code:"timeline-duplicate-pts",stage:"timeline",confidence:"confirmed-by-metadata"});
 assert.equal(p.readyForExportAttempt,false);
 assert.equal(p.audio,"not-tested");
 assert.ok(!JSON.stringify(p).includes("PRIVATE_PERSON"));
});
