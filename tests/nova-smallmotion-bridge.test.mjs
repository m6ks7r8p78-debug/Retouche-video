import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import BRIDGE from "../experiences/nova-smallmotion-bridge.js";
const require=createRequire(import.meta.url);
const ENGINE=require("../experiences/vendor/smallmotion/smallmotion-local.js");
const W=160,H=120;
function make(seed=0,{shift=1,object=false,blank=false,flash=false}={}){
 let state=seed+1;
 function rand(){state=(Math.imul(state,1664525)+1013904223)>>>0;return state>>>24}
 const base=new Uint8Array(W*H);
 for(let i=0;i<base.length;i++)base[i]=blank?80:rand();
 const obj=new Uint8Array(24*20);for(let i=0;i<obj.length;i++)obj[i]=rand();
 const frames=[];
 for(let frame=0;frame<2;frame++){
  const data=new Uint8ClampedArray(W*H*4);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const xx=(x-frame*shift+W)%W;let v=base[y*W+xx];
   const ox=x-66,oy=y-(45+frame*(object?4:0));
   if(object&&ox>=0&&ox<24&&oy>=0&&oy<20)v=obj[oy*24+ox];
   if(flash&&frame===1)v=Math.max(0,v-90);
   const k=4*(y*W+x);data[k]=data[k+1]=data[k+2]=v;data[k+3]=255;
  }
  frames.push({width:W,height:H,data});
 }
 return frames;
}
function analyze(a,b,extra={}){return BRIDGE.analyser(a,b,{engine:ENGINE,clock:()=>40,...extra})}
test("NOVA × SmallMotion : détecteur réellement réutilisé et report consultatif",()=>{
 for(const seed of [1,5,10]){
  const [a,b]=make(seed,{object:true});
  const originalA=Buffer.from(a.data).toString("hex");
  const originalB=Buffer.from(b.data).toString("hex");
  const r=analyze(a,b);
  assert.equal(r.status,"local_motion_candidate");
  assert.ok(r.candidates.length>0);
  assert.equal(r.action,"no_automatic_change");
  assert.equal(r.confidence,"not_calibrated");
  assert.equal(r.provenance,"smallmotion_local_2frame_v1");
  assert.equal(r.frames,2);
  assert.deepEqual(r.analysisDimensions,[W,H]);
  assert.equal(r.privacy.uploaded,false);
  assert.equal(r.privacy.rawPixelsInReport,false);
  assert.equal(Buffer.from(a.data).toString("hex"),originalA);
  assert.equal(Buffer.from(b.data).toString("hex"),originalB);
  const parsed=JSON.parse(BRIDGE.serialiser(r));
  assert.ok(parsed.candidates.every(x=>x.box.length===4&&x.support>=3));
  assert.ok(!JSON.stringify(parsed).includes("data"));
 }
});
test("NOVA × SmallMotion : scène statique, flash et défaut de texture s'abstiennent",()=>{
 for(const [options,allowed] of [
  [{shift:1},["no_supported_local_motion"]],
  [{blank:true},["abstain_texture"]],
  [{flash:true},["abstain_cut_or_flash","abstain_matches"]]
 ]){
  const r=analyze(...make(1,options));
  assert.ok(allowed.includes(r.status),r.status);
  assert.deepEqual(r.candidates,[]);
  assert.equal(r.action,"no_automatic_change");
 }
});
test("NOVA × SmallMotion : garde-fou tailles, temps et annulation",()=>{
 const [a,b]=make(1);
 assert.throws(()=>analyze(a,{...b,width:161}),/identiques/);
 assert.throws(()=>analyze({...a,width:50},b),/64..320/);
 assert.throws(()=>analyze(a,b,{frameTimesSeconds:[1,1]}),/temps/);
 assert.throws(()=>analyze(a,b,{frameTimesSeconds:[0,13]}),/temps/);
 const c=new AbortController();c.abort();
 const r=analyze(a,b,{signal:c.signal});
 assert.equal(r.status,"cancelled");
 assert.equal(r.action,"no_automatic_change");
});
test("NOVA × SmallMotion : une erreur de fournisseur ne devient jamais correction",()=>{
 const [a,b]=make(1);
 const r=analyze(a,b,{engine:{analyze(){throw Error("PRIVATE-FILENAME-CLIENT.mp4")}}});
 assert.equal(r.status,"abstain_engine_error");
 assert.ok(!BRIDGE.serialiser(r).includes("PRIVATE-FILENAME"));
 assert.deepEqual(r.candidates,[]);
});
test("NOVA × SmallMotion : refuse geometry invalide, statut inconnu et sortie incohérente",()=>{
 const [a,b]=make(1);
 for(const simulated of [
  {status:"local_motion_candidate",candidates:[{box:[150,100,40,30],support:3}]},
  {status:"local_motion_candidate",candidates:[]},
  {status:"no_supported_local_motion",candidates:[{box:[10,10,20,20],support:3}]},
  {status:"local_motion_candidate",candidates:[{box:[1.2,10,20,20],support:3}]},
  {status:"local_motion_candidate",candidates:new Array(5).fill({box:[10,10,20,20],support:3})},
  {status:"unverified-NEW",candidates:[]}
 ]){
  const r=analyze(a,b,{engine:{analyze(){return simulated}}});
  assert.match(r.status,/^abstain_/);
  assert.deepEqual(r.candidates,[]);
 }
});
test("NOVA × SmallMotion : serialisation rejette un rapport trafiqué et toute fuite de données",()=>{
 const r=analyze(...make(1,{object:true}));
 assert.throws(()=>BRIDGE.serialiser({status:"foo"}),/non reconnu/);
 const poisoned={...r,candidates:[{...r.candidates[0],rawPixels:"PRIVATE_MEDIA_BYTES"}],
  deviceId:"PRIVATE_USER_DEVICE",filename:"PRIVATE_FILENAME.mov"};
 const str=BRIDGE.serialiser(poisoned);
 assert.ok(!str.includes("PRIVATE_"));
 const invalid={...r,status:"private-file-name.mp4"};
 assert.throws(()=>BRIDGE.serialiser(invalid),/invalide|non reconnu/);
});

test("NOVA SmallMotion : distingue la mire synthétique du média local sans exposer le nom",()=>{
 const [a,b]=make(8,{object:true});
 const report=BRIDGE.analyser(a,b,{engine:ENGINE,synthetic:true,clock:()=>0});
 assert.equal(report.sourceKind,"synthetic-generated");
 const data=JSON.parse(BRIDGE.serialiser(report));
 assert.equal(data.sourceKind,"synthetic-generated");
 assert.equal(data.action,"no_automatic_change");
 const local=analyze(a,b);
 assert.equal(local.sourceKind,"local-user-file");
 assert.equal(JSON.parse(BRIDGE.serialiser(local)).sourceKind,"local-user-file");
 assert.throws(()=>BRIDGE.serialiser({...report,sourceKind:"PRIVATE-FILENAME.mov"}),/invalide/);
});
