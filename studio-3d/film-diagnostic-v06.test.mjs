import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFrameCadence,makeLocalDiagnostic,sampleCadence} from './film-diagnostic-v06.mjs';

test('Cadence stable 60 Hz analyse quantiles et FPS, sans horloge système',()=>{
 const times=Array.from({length:91},(_,i)=>i*(1000/60));
 const m=analyzeFrameCadence(times);
 assert.equal(m.frameSamples,90);
 assert.ok(m.effectiveFps>=59.9&&m.effectiveFps<=60.1);
 assert.ok(m.p95FrameMs>=16.66&&m.p95FrameMs<=16.68);
 assert.equal(m.slowFramesOver50ms,0);
});
test('Cadence lente : repère correctement les gels',()=>{
 const m=analyzeFrameCadence([10,26,42,58,175,191]);
 assert.equal(m.slowFramesOver50ms,1);
 assert.ok(m.p95FrameMs>50);
 assert.ok(m.effectiveFps<60);
});
test('Les échantillons malformés et inversés sont rejetés',()=>{
 for(const t of [[1,2],[1,4,3],[1,1,2],[1,NaN,3],new Array(601).fill(1)]){
  assert.throws(()=>analyzeFrameCadence(t));
 }
});
test('Le rapport ne contient aucune donnée utilisateur ni affirmation de test physique',()=>{
 const cadence=analyzeFrameCadence([0,16,33,50,68]);
 const r=makeLocalDiagnostic({backend:'webgl2',canvasWidth:712,canvasHeight:580,
  dpr:2,glbBytes:134520,metrics:cadence,webglError:0,webglContextLosses:1,contextRestorations:1});
 const fields=JSON.stringify(r);
 for(const forbidden of ['userAgent:','prompt:', 'longitude:', 'latitude:', 'videoBytes:', 'photoBytes:']){
  assert.equal(fields.includes(forbidden),false);
 }
 assert.equal(r.privacy.sentToServer,false);
 assert.equal(r.validation.physicalIPhoneCertified,false);
 assert.equal(r.validation.memoryMeasured,false);
 assert.equal(r.validation.thermalsMeasured,false);
 assert.equal(r.cadence.frameSamples,4);
 assert.equal(r.gpu.contextRestorations,1);
});
test('Défauts de mesures et identifiants backend invalides sont refusés',()=>{
 const valid={backend:'webgl2',canvasWidth:400,canvasHeight:300,dpr:2,glbBytes:100,metrics:null};
 assert.throws(()=>makeLocalDiagnostic({...valid,backend:'webgpu'}));
 assert.throws(()=>makeLocalDiagnostic({...valid,dpr:NaN}));
 assert.throws(()=>makeLocalDiagnostic({...valid,canvasHeight:-12}));
 assert.throws(()=>makeLocalDiagnostic({...valid,glbBytes:30000000}));
});
test('Le banc est injectable et exécute exactement les images programmées',async()=>{
 let i=0,rendered=0;
 const m=await sampleCadence({nextFrame:async()=>i++*17,draw:()=>rendered++,frames:15});
 assert.equal(rendered,15);
 assert.equal(m.frameSamples,14);
 assert.equal(m.effectiveFps,58.8);
});
test('Le banc arrête proprement les scènes annulées',async()=>{
 let i=0;
 await assert.rejects(()=>sampleCadence({nextFrame:async()=>i++*16,draw:()=>{},frames:15,isActive:()=>i<4}),/interrompu/);
 assert.equal(i,4);
});
