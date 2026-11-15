import test from "node:test";
import assert from "node:assert/strict";
import T from "../experiences/nova-timeline.js";

test("chronologie : les horodatages sont strictement croissants et continus",()=>{
 const p=T.calculer(2.4,15);
 assert.equal(p.count,36);
 assert.equal(p.entries[0].timestamp,0);
 assert.equal(p.entries[0].keyFrame,true);
 assert.equal(p.entries[30].keyFrame,true);
 assert.equal(p.entries.at(-1).timestamp+p.entries.at(-1).duration,p.durationUs);
 for(let i=1;i<p.entries.length;i++){
  assert.ok(p.entries[i].timestamp>p.entries[i-1].timestamp);
  assert.equal(p.entries[i-1].timestamp+p.entries[i-1].duration,p.entries[i].timestamp);
  assert.ok(p.entries[i].seekSeconds>p.entries[i-1].seekSeconds);
 }
});
test("chronologie : durées fractionnaires produisent des échantillons sans rupture",()=>{
 const p=T.calculer(1.23,15);
 assert.equal(p.count,18);
 assert.equal(p.durationUs,1200000);
 assert.equal(p.entries.at(-1).timestamp+p.entries.at(-1).duration,1200000);
});
test("chronologie : rejette clips trop longs et paramètres invalides",()=>{
 assert.throws(()=>T.calculer(-1,15),/invalides/);
 assert.throws(()=>T.calculer(12.2,15,30),/autorisé/);
 assert.throws(()=>T.calculer(0.01,15),/autorisé/);
});
test("position : respecte une tolérance stricte et trace l'écart",()=>{
 assert.equal(T.validerPosition(.099,.1,1).ok,true);
 const x=T.validerPosition(.3,.1,1);
 assert.equal(x.ok,false);
 assert.ok(x.distance>.1);
 assert.throws(()=>T.validerPosition(NaN,.1,1),/invalides/);
});
test("audio : exige une longueur proche de la sortie, sans couper les fins",()=>{
 const ok=T.verifierAudio(57600,48000,1.2);
 assert.equal(ok.ok,true);assert.equal(ok.targetFrames,57600);
 assert.equal(T.verifierAudio(56000,48000,1.2).ok,true);
 const short=T.verifierAudio(45000,48000,1.2);
 assert.equal(short.ok,false);assert.ok(short.missingSeconds>.12);
 assert.throws(()=>T.verifierAudio(0,48000,1.2),/invalide/);
});
