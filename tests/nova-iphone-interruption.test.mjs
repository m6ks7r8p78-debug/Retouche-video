import test from "node:test";
import assert from "node:assert/strict";
import LAB from "../experiences/nova-iphone-interruption.js";
test("NOVA 0.28 : reçu local pour pagehide, jamais une preuve d'iPhone réel",()=>{
 const receipt=LAB.create({sourceKind:"synthetic-generated",workflow:"three-synthetic-runs",
  trigger:"pagehide",elapsedMs:123.7});
 assert.equal(receipt.status,"cancelled");
 assert.equal(receipt.elapsedMs,124);
 assert.equal(receipt.trigger,"pagehide");
 assert.equal(receipt.sourceKind,"synthetic-generated");
 assert.equal(receipt.physicalIphoneCertified,false);
 assert.equal(receipt.nativeMemoryReleased,false);
 assert.equal(receipt.mediaUploaded,false);
 assert.equal(receipt.fileNameIncluded,false);
 assert.equal(receipt.automaticSharing,false);
});
test("NOVA 0.28 : reçu interruption rejette tout champ libre ou provenance privée",()=>{
 const msg="private-video-name-157.mov GPS 43.7 iPhone15";
 const receipt=LAB.create({sourceKind:msg,workflow:msg,trigger:msg,elapsedMs:-1});
 const injected={...receipt,secret:msg,trigger:msg,
  fileName:msg,deviceID:msg,limitation:msg,sourceKind:msg,
  workflow:msg,physicalIphoneCertified:true,nativeMemoryReleased:true,
  mediaUploaded:true};
 const text=LAB.serialize(injected);
 assert.equal(text.includes(msg),false);
 const r=JSON.parse(text);
 assert.equal(r.trigger,"unknown");
 assert.equal(r.sourceKind,"unknown");
 assert.equal(r.workflow,"unknown");
 assert.equal(r.nativeMemoryReleased,false);
 assert.equal(r.physicalIphoneCertified,false);
 assert.equal(r.mediaUploaded,false);
 assert.equal(r.elapsedMs,null);
});
test("NOVA 0.28 : motifs explicites et compteurs invalides sont bornés",()=>{
 for(const trigger of ["user","visibility-hidden","pagehide"]){
  const j=JSON.parse(LAB.serialize(LAB.create({sourceKind:"local-user-file",
   trigger,workflow:"single-export",elapsedMs:0})));
  assert.equal(j.trigger,trigger);
  assert.equal(j.elapsedMs,0);
 }
 assert.equal(LAB.create({elapsedMs:NaN}).elapsedMs,null);
 assert.throws(()=>LAB.serialize({schema:"false"}),/invalide/);
});
