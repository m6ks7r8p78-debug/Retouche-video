import test from "node:test";
import assert from "node:assert/strict";
import GUARD from "../experiences/nova-guard.js";

const typical={sourceBytes:1_000_000,sourceWidth:320,sourceHeight:180,
  outputWidth:320,outputHeight:180,durationSeconds:2.4};
test("NOVA 0.6 : budget chiffré et suffisamment prudent",()=>{
 const r=GUARD.exigerBudget(typical);
 assert.ok(r.admissible);
 assert.ok(r.bytes>typical.sourceBytes);
 assert.match(r.qualification,/non télémétrie/);
 assert.equal(r.detail.pcm>0,true);
 assert.equal(GUARD.estimerMemoire({...typical,withAudio:false}).detail.pcm,0);
});
test("NOVA 0.6 : fail-closed sur gros buffers de décodage Full HD",()=>{
 const excessive={...typical,sourceBytes:60*1048576,sourceWidth:1920,
  sourceHeight:1080,outputWidth:640,outputHeight:360,durationSeconds:12};
 assert.equal(GUARD.estimerMemoire(excessive).admissible,false);
 assert.throws(()=>GUARD.exigerBudget(excessive),/Risque mémoire élevé/);
});
test("NOVA 0.6 : banc de capacité 1080p / 4K / 8K sans lever les limites produit",()=>{
 const base={...typical,sourceBytes:2_000_000,durationSeconds:3};
 const results=[1920,3840,7680].map(w=>GUARD.estimerMemoire({
   ...base,sourceWidth:w,sourceHeight:w*9/16,outputWidth:w,outputHeight:w*9/16
 }));
 assert.ok(results[0].bytes<results[1].bytes&&results[1].bytes<results[2].bytes);
 assert.equal(results[1].admissible,false);
 assert.equal(results[2].admissible,false);
});
test("NOVA 0.6 : refuse paramètres de capacité aberrants",()=>{
 assert.throws(()=>GUARD.estimerMemoire({...typical,sourceWidth:-1}),/invalides/);
 assert.throws(()=>GUARD.estimerMemoire({...typical,durationSeconds:NaN}),/invalides/);
 assert.throws(()=>GUARD.estimerMemoire({...typical,channels:0}),/invalides/);
});
test("NOVA 0.6 : audit des premiers PTS sans inventer des images",()=>{
 const ok=GUARD.auditerPTS({ptsUs:[0,33333,100000,133333],durationSeconds:.2,fps:15});
 assert.equal(ok.debutFidele,true);
 assert.equal(ok.maxGapUs,66667);
 assert.equal(ok.sourceFrames,4);
 const absent=GUARD.auditerPTS({ptsUs:[150000,200000],durationSeconds:.3,fps:15});
 assert.equal(absent.debutFidele,false);
 assert.throws(()=>GUARD.exigerDebutFidele(absent),/première image trop tardive/);
});
test("NOVA 0.6 : identifie les sauts temporels et rejette PTS invalides",()=>{
 const audit=GUARD.auditerPTS({ptsUs:[0,33000,900000],durationSeconds:1.0,fps:15});
 assert.equal(audit.avertissementLongIntervalle,true);
 assert.throws(()=>GUARD.auditerPTS({ptsUs:[0,0],durationSeconds:1,fps:15}),/dupliqué/);
 assert.throws(()=>GUARD.auditerPTS({ptsUs:[NaN],durationSeconds:1,fps:15}),/invalide/);
});
class FakeEncoder extends EventTarget{
 constructor(size){super();this.state="configured";this.encodeQueueSize=size}
 drain(size){this.encodeQueueSize=size;this.dispatchEvent(new Event("dequeue"))}
}
test("NOVA 0.6 : régulation attend dequeue au lieu de flush intermédiaire",async()=>{
 const e=new FakeEncoder(9);
 const pending=GUARD.attendreEncodeur(e,{maxQueue:3,timeoutMs:500});
 e.drain(4);
 e.drain(3);
 await pending;
 assert.equal(e.encodeQueueSize,3);
});
test("NOVA 0.6 : saturation et annulation échouent explicitement",async()=>{
 const e=new FakeEncoder(8);
 await assert.rejects(GUARD.attendreEncodeur(e,{maxQueue:2,timeoutMs:15}),/saturée/);
 const c=new AbortController(),q=GUARD.attendreEncodeur(e,{signal:c.signal});
 c.abort();
 await assert.rejects(q,/annulé/);
 e.state="closed";
 await assert.rejects(GUARD.attendreEncodeur(e),/fermé/);
});
