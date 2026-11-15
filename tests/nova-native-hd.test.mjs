import test from "node:test";
import assert from "node:assert/strict";
import HD from "../experiences/nova-native-hd.js";
function make({w=1920,h=1088,frames=195,us=6500000,codec="hvc1.1.6.L120"}={}){
 const pts=Array.from({length:frames},(_,i)=>Math.round(i*us/frames));
 return {codec,W:w,H:h,dw:h,dh:w,ns:frames,durationUs:us,
  ptsUs:pts,key:pts.map((_,i)=>i===0||i%60===0),
  so:pts.map((_,i)=>1000+i*80),sz:pts.map(()=>80),
  mat:[0,1,-1,0,h,0],color:{kind:"nclx",primaries:1,transfer:1,
   matrix:1,fullRange:false}};
}
test("NOVA HD : une vraie taille iPhone verticale 1088x1920 avec 195 images à 30ips passe le plan",()=>{
 const x=make();
 const p=HD.analyse(x,4815517,{testCodec:true});
 assert.equal(p.width,1088);assert.equal(p.height,1920);
 assert.equal(p.sourceFrames,195);assert.equal(p.sourceFps,30);
 assert.equal(p.rotated,true);
 assert.equal(p.ptsUs.length,195);
 assert.equal(HD.plannedMemory(p,4815517)<170,true);
});
test("NOVA HD : dépassements graves restent bornés, sans ignorer la qualité",()=>{
 for(const x of [
  make({w:3840,h:2160}),make({frames:361,us:11000000}),
  make({us:13000000}),make({w:1921,h:1088}),
  {...make(),color:{kind:"nclx",primaries:9,transfer:16,matrix:9,fullRange:false}},
  {...make(),ptsUs:make().ptsUs.map(()=>0)},
  {...make(),ptsUs:make().ptsUs.map((x,i)=>i?x+1000000:0)}
 ]){
  assert.throws(()=>HD.analyse(x,4815517,{testCodec:true}));
 }
});
test("NOVA HD : sélectionne le codec H264 HD réellement annoncé, sans le supposer",async()=>{
 const p=HD.analyse(make(),4815517,{testCodec:true});
 const queries=[];
 const Enc={isConfigSupported:async cfg=>{
  queries.push(cfg);
  return {supported:cfg.codec==="avc1.4d4028"};
 }};
 const config=await HD.configEncoder(p,Enc);
 assert.equal(config.codec,"avc1.4d4028");
 assert.equal(config.width,1088);assert.equal(config.height,1920);
 assert.ok(config.bitrate>=8000000);
 assert.equal(queries.length,2);
 await assert.rejects(()=>HD.configEncoder(p,{isConfigSupported:async()=>({supported:false})}),
  /indisponible/);
});
test("NOVA HD : décodeur HEVC natif doit annoncer sa compatibilité",async()=>{
 const info=make();
 const d={isConfigSupported:async cfg=>{
  assert.equal(cfg.codec,info.codec);assert.equal(cfg.codedWidth,info.W);
  return {supported:true};
 }};
 const result=await HD.configDecoder(info,d);
 assert.equal(result.hardwareAcceleration,"prefer-hardware");
 await assert.rejects(()=>HD.configDecoder(info,{isConfigSupported:async()=>({supported:false})}),/indisponible/);
});
test("NOVA HD : aucune exportation ne part si l'analyseur source ou les moteurs manquent",async()=>{
 const ff={type:"video/quicktime",size:4815517,slice(){}};
 await assert.rejects(()=>HD.exporter({file:ff,moteur:null,arbitre:null,probe:async()=>make()}),
  /moteur/);
 await assert.rejects(()=>HD.exporter({file:ff,moteur:{restituer(){}},arbitre:{arbitrer(){}},
  probe:async()=>null}),/métadonnées/);
});
