/* Temporal quality zoning — synthetic decision tests, not proof of visual quality. */
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const S=require("../directeur-scenes.js");
const pt=(t,p50=.5,noise=.7,sharp=45)=>({t,p50,noise,sharp,p2:.04,p98:.95});
test("source stable: one temporal zone, not a fabricated scene cut",()=>{
 const r=S.analyser({duree:20,echantillons:[2,5,8,11,14,17].map(t=>pt(t))});
 assert.equal(r.zones.length,1);assert.equal(r.zones[0].debut,0);
 assert.equal(r.zones[0].fin,20);assert.equal(r.variation,false);
});
test("quality transition: weak light and increased noise, two approximate zones",()=>{
 const E=[pt(1,.55,.6,40),pt(2,.50,.8,38),pt(3,.54,.9,42),
   pt(6,.1,4.2,14),pt(8,.12,4.7,15),pt(10,.11,4.8,18)];
 const r=S.analyser({duree:12,echantillons:E});
 assert.equal(r.zones.length,2);
 assert.equal(r.zones[1].etat.lumiere,"sombre");
 assert.equal(r.zones[1].etat.bruit,"marque");
 assert.equal(r.zones[1].prioriteLocale,true);
 assert.equal(r.zones[1].confiance,"limitee");
 assert.ok(r.zones[0].fin===r.zones[1].debut);
 assert.ok(r.avertissements.some(s=>s.includes("changement d'éclairage")));
});
test("single abnormal sample => low confidence, never definitive",()=>{
 const r=S.analyser({duree:5,echantillons:[pt(.2),pt(1),pt(2,.08,5,10),pt(3),pt(4)]});
 assert.ok(r.zones.some(x=>x.confiance==="faible"));
 assert.ok(r.zones.every(x=>x.precision.includes("approximatives")));
});
test("no temporal samples => honest global fallback",()=>{
 const r=S.analyser({duree:40,echantillons:[]});
 assert.deepEqual(r.zones,[]);
 assert.ok(r.avertissements.length);
});
test("input validation rejects bogus duration",()=>{
 assert.throws(()=>S.analyser({duree:0,echantillons:[]}),/Durée/);
 assert.throws(()=>S.analyser({duree:NaN,echantillons:[]}),/Durée/);
});
test("missing measurements discarded, no fictitious scene",()=>{
 const r=S.analyser({duree:9,echantillons:[{t:1,p50:.1},pt(6)]});
 assert.equal(r.echantillons,1);
 assert.equal(r.zones.length,1);
});
test("sampling positions unsorted => sorted, bounded, input untouched",()=>{
 const e=[pt(9),pt(2),pt(6)];
 const before=structuredClone(e),r=S.analyser({duree:10,echantillons:e});
 assert.equal(r.zones.length,1);assert.deepEqual(e,before);
 assert.ok(r.zones.every(x=>x.fin<=10&&x.debut>=0));
});
test("slight exposure changes do not trigger phantom cuts",()=>{
 const e=[pt(1,.34),pt(2,.24),pt(3,.17),pt(4,.23),pt(5,.33)];
 const r=S.analyser({duree:6,echantillons:e});
 assert.equal(r.zones.length,1);
});
test("zones require actual source samples, not audio or metadata inferred",()=>{
 const r=S.analyser({duree:5,echantillons:[{t:1,audio:{floor:-20}}, {t:2,shake:10}]});
 assert.equal(r.echantillons,0);assert.deepEqual(r.zones,[]);
});
