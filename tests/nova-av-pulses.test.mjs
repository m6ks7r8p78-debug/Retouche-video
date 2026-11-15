import test from "node:test";
import assert from "node:assert/strict";
import {impulsionsPCM,impulsionsVideo,comparerImpulsions} from "./nova-av-pulses.mjs";

test("NOVA impulsions : PCM détecte deux événements localisés",()=>{
 const rate=8000,b=Buffer.alloc(rate*2*4);
 for(let i=0;i<rate*2;i++){
  const t=i/rate;
  if((t>=.39&&t<.45)||(t>=1.19&&t<1.25))
   b.writeFloatLE(.7*Math.sin(2*Math.PI*600*t),i*4);
 }
 const events=impulsionsPCM(b,{sampleRate:rate});
 assert.equal(events.length,2);
 assert.ok(Math.abs(events[0]-.39)<.02);
 assert.ok(Math.abs(events[1]-1.19)<.02);
});
test("NOVA impulsions : flashes vidéo discriminent le fond sombre",()=>{
 const b=Buffer.alloc(8*8*30,3);
 b.fill(255,6*64,7*64);b.fill(255,18*64,19*64);
 assert.deepEqual(impulsionsVideo(b),[.4,1.2]);
});
test("NOVA impulsions : mesure l'écart ajouté et la dérive",()=>{
 const r=comparerImpulsions({sourceAudio:[.39,1.19],sourceVideo:[.4,1.2],
   outputAudio:[.4,1.2],outputVideo:[.4,1.2]});
 assert.ok(r.offsetMs<20);
 assert.ok(r.driftMs<20);
 assert.match(r.qualification,/pas validation/);
});
test("NOVA impulsions : blocage si latence ajoutée ou dérive",()=>{
 const base={sourceAudio:[.39,1.19],sourceVideo:[.4,1.2],
   outputVideo:[.4,1.2],toleranceMs:80};
 assert.throws(()=>comparerImpulsions({...base,outputAudio:[.59,1.39]}),/Décalage/);
 assert.throws(()=>comparerImpulsions({...base,outputAudio:[.39,1.49]}),/Dérive/);
});
test("NOVA impulsions : signaux absents refusés, jamais succès fictif",()=>{
 assert.throws(()=>impulsionsPCM(Buffer.alloc(8000*4),{sampleRate:8000}),/absent/);
 assert.throws(()=>impulsionsVideo(Buffer.alloc(30*64,3)),/Flashs/);
 assert.throws(()=>comparerImpulsions({sourceAudio:[.1],sourceVideo:[.1,.9],
  outputAudio:[.1,.9],outputVideo:[.1,.9]}),/Deux repères/);
});
