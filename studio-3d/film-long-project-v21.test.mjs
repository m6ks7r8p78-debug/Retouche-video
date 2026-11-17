import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {createLongFilmProject,serializeLongFilmProject,parseLongFilmProject,
 locateFilmFrame,nextFilmChunk,filmProjectFingerprint} from './film-long-project-v21.mjs';
import {createFilmCheckpoint,processNextFilmChunk,runFilmProject} from './film-long-runtime-v21.mjs';
const prompt='Une femme adulte fume une taffe de cigarette.';
const make=(seconds=60)=>createLongFilmProject({title:'Banc synthétique',targetDurationSeconds:seconds,
 fps:24,chunkFrames:48,scenes:Array.from({length:seconds/5},(_,i)=>({id:'s'+i,prompt,frameCount:120}))});
function sink({failAt=-1,controller}={}){
 const frames=[],commits=[],aborts=[];let pending=[],begins=0,active=0,maxActive=0;
 return {frames,commits,aborts,get begins(){return begins;},get maxActive(){return maxActive;},
 async beginChunk(){begins++;pending=[];},
 async writeFrame(frame){active++;maxActive=Math.max(maxActive,active);
  try{await Promise.resolve();if(frame.frame===failAt)throw Error('Écriture interrompue');
   pending.push(frame.frame);if(controller&&pending.length===3)controller.abort();
  }finally{active--;}
 },
 async commitChunk({transactionId}){frames.push(...pending);commits.push(transactionId);pending=[];},
 async abortChunk(){pending=[];aborts.push(true);}};
}
for(const seconds of [1800,3600])test('chronologie exacte et blocs bornés sur '+seconds+' secondes',()=>{
 const p=make(seconds);assert.equal(p.totalFrames,seconds*24);assert.equal(p.unplannedFrames,0);
 let cursor=0,count=0;
 for(let c=nextFilmChunk(p,cursor);c;c=nextFilmChunk(p,cursor)){
  assert.equal(c.startFrame,cursor);assert.ok(c.frameCount<=48);
  assert.ok(c.endFrame<=p.scenes[c.sceneIndex].endFrame);
  cursor=c.endFrame;count++;
 }
 assert.equal(cursor,p.totalFrames);assert.equal(count,p.scenes.length*3);
 assert.equal(locateFilmFrame(p,120).scene.id,'s1');
 assert.equal(locateFilmFrame(p,p.totalFrames-1).localFrame,119);
 assert.throws(()=>locateFilmFrame(p,p.totalFrames),/hors/);
 assert.equal(p.renderedFilm,false);
});
test('aller-retour du scénario : détails, dialogues et identifiants de personnage préservés',async()=>{
 const p=createLongFilmProject({title:'Détails',description:'Un film très détaillé.\n'+('été ☕ '.repeat(2000)),
 characters:[{id:'alice',description:'Voix calme, manteau vert, même apparence.'}],
 scenes:[{id:'cuisine',prompt:'Alice entre dans la cuisine.',notes:'Main gauche sur la tasse. Caméra fixe.',
 dialogue:'Alice : « Bonjour. »',characterIds:['alice'],frameCount:240}]});
 const parsed=parseLongFilmProject(serializeLongFilmProject(p));assert.deepEqual(parsed,p);
 assert.equal(await filmProjectFingerprint(p),await filmProjectFingerprint(parsed));
 assert.ok(Object.isFrozen(p.scenes[0]));
 assert.equal(parsed.unplannedFrames,3600*24-240);
});
test('durées invalides, doublons, personnages inconnus et budgets refusés',()=>{
 for(const frameCount of [0,-1,1.5,NaN,Infinity,86401])
  assert.throws(()=>createLongFilmProject({scenes:[{id:'s',prompt,frameCount}]}));
 assert.throws(()=>createLongFilmProject({scenes:[{id:'s',prompt,frameCount:1},{id:'s',prompt,frameCount:1}]}),/dupliquée/);
 assert.throws(()=>createLongFilmProject({scenes:[{id:'s',prompt,frameCount:1,characterIds:['absent']}]}),/inconnus/);
 assert.throws(()=>createLongFilmProject({chunkFrames:721,scenes:[{id:'s',prompt,frameCount:1}]}),/bloc/);
 assert.throws(()=>parseLongFilmProject('{"schema":"inconnu"}'),/incompatible/);
});
test('vraies poses GLB, livraison séquentielle, reprise sans image manquante ni dupliquée',async()=>{
 const project=make(10),consumer=sink();let checkpoint=await createFilmCheckpoint(project);
 const first=await processNextFilmChunk({project,checkpoint,generator,sink:consumer});
 checkpoint=JSON.parse(JSON.stringify(first.checkpoint));
 let result=first;
 while(!result.done){result=await processNextFilmChunk({project,checkpoint,generator,sink:consumer});checkpoint=result.checkpoint;}
 assert.deepEqual(consumer.frames,Array.from({length:240},(_,i)=>i));
 assert.equal(consumer.maxActive,1);assert.equal(consumer.commits.length,6);
 const finished=await processNextFilmChunk({project,checkpoint,generator,sink:consumer});
 assert.equal(finished.done,true);assert.equal(consumer.begins,6);
 assert.equal(result.renderedFilm,false);
});
test('échec du consommateur : bloc annulé, checkpoint précédent réutilisable',async()=>{
 const project=make(5),checkpoint=await createFilmCheckpoint(project),broken=sink({failAt:10});
 await assert.rejects(processNextFilmChunk({project,checkpoint,generator,sink:broken}),/interrompue/);
 assert.deepEqual(broken.frames,[]);assert.equal(broken.aborts.length,1);assert.equal(checkpoint.nextFrame,0);
 const good=sink();const result=await processNextFilmChunk({project,checkpoint,generator,sink:good});
 assert.equal(result.checkpoint.nextFrame,48);assert.equal(good.frames[0],0);
});
test('annulation pendant un bloc : ni validation ni avancement',async()=>{
 const project=make(5),checkpoint=await createFilmCheckpoint(project),controller=new AbortController();
 const consumer=sink({controller});
 await assert.rejects(processNextFilmChunk({project,checkpoint,generator,sink:consumer,signal:controller.signal}),{name:'AbortError'});
 assert.deepEqual(consumer.commits,[]);assert.equal(consumer.aborts.length,1);
 const pre=sink();await assert.rejects(processNextFilmChunk({project,checkpoint,generator,sink:pre,signal:controller.signal}),{name:'AbortError'});
 assert.equal(pre.begins,0);
});
test('reprise refusée après modification même textuelle du scénario',async()=>{
 const project=make(5),checkpoint=await createFilmCheckpoint(project);
 const changed=createLongFilmProject({...project,description:'Nouvelle intention'});
 await assert.rejects(processNextFilmChunk({project:changed,checkpoint,generator,sink:sink()}),/Reprise incompatible/);
});
test('aucune scène allongée par répétition, aucun dialogue ou personnage persistant simulé',async()=>{
 for(const change of [{frameCount:240},{dialogue:'Bonjour'},{notes:'Caméra aérienne'}]){
  const project=createLongFilmProject({scenes:[{id:'s',prompt,frameCount:120,...change}]}),consumer=sink();
  await assert.rejects(processNextFilmChunk({project,checkpoint:await createFilmCheckpoint(project),generator,sink:consumer}),/aucune boucle|non disponible/);
  assert.equal(consumer.begins,0);
 }
});

import {planLongFilmOutline} from './film-long-project-v21.mjs';
test('plan détaillé : aucune perte du préambule ou des scènes et répartition entière provisoire',()=>{
 const description='Personnage principal : Alice, manteau vert.\nScène 1 :\nElle entre.\nScène 2 :\nElle dit « Bonjour ».\nScène 3 :\nElle repart.\nScène 4 :\nFin.\nScène 5 :\nÉpilogue.\nScène 6 :\nDernier plan.\nScène 7 :\nGénérique.';
 const p=planLongFilmOutline({description,targetDurationSeconds:1800});
 assert.equal(p.description,description);assert.equal(p.scenes.length,7);
 assert.equal(p.totalFrames,43200);assert.equal(p.unplannedFrames,0);
 assert.match(p.scenes[1].prompt,/Bonjour/);
 assert.equal(p.scenes.reduce((sum,s)=>sum+s.frameCount,0),43200);
 assert.throws(()=>planLongFilmOutline({description:'   '}),/Décrivez/);
});

test('enchaînement automatique : sauvegarde et progression après chaque validation, reprise exacte',async()=>{
 const project=make(10),consumer=sink(),saved=[],progress=[];
 const first=await processNextFilmChunk({project,checkpoint:await createFilmCheckpoint(project),generator,sink:consumer});
 const result=await runFilmProject({project,checkpoint:first.checkpoint,generator,sink:consumer,
  async saveCheckpoint(checkpoint){
   assert.equal(consumer.frames.at(-1),checkpoint.nextFrame-1);
   saved.push(JSON.parse(JSON.stringify(checkpoint)));
  },onProgress(state){assert.equal(state.checkpoint.nextFrame,saved.at(-1).nextFrame);progress.push(state);}});
 assert.deepEqual(consumer.frames,Array.from({length:240},(_,i)=>i));
 assert.deepEqual(saved.map(c=>c.nextFrame),[96,120,168,216,240]);
 assert.equal(result.processedFrames,192);assert.equal(result.completedChunks,5);
 assert.equal(progress.at(-1).completedFrames,240);assert.equal(result.renderedFilm,false);
 const end=await runFilmProject({project,checkpoint:result.checkpoint,generator,sink:consumer,
  saveCheckpoint(){assert.fail('Aucun bloc supplémentaire à sauvegarder');}});
 assert.equal(end.processedFrames,0);assert.equal(consumer.begins,6);
});
test('sauvegarde échouée : ne pas commencer le bloc suivant ou annoncer une progression',async()=>{
 const project=make(5),consumer=sink();
 await assert.rejects(runFilmProject({project,generator,sink:consumer,
  saveCheckpoint(){throw Error('Quota dépassé');},onProgress(){assert.fail('Progression non sauvegardée');}}),/Quota/);
 assert.equal(consumer.begins,1);assert.equal(consumer.commits.length,1);
 assert.equal(consumer.frames.length,48);
});
test('annulation entre blocs : checkpoint validé conservé et reprise au bon endroit',async()=>{
 const project=make(5),consumer=sink(),controller=new AbortController();let saved;
 await assert.rejects(runFilmProject({project,generator,sink:consumer,signal:controller.signal,
  saveCheckpoint(checkpoint){saved=checkpoint;controller.abort();}}),{name:'AbortError'});
 assert.equal(saved.nextFrame,48);assert.equal(consumer.begins,1);
 await runFilmProject({project,checkpoint:saved,generator,sink:consumer,saveCheckpoint(){}});
 assert.deepEqual(consumer.frames,Array.from({length:120},(_,i)=>i));
});
test('un événement navigateur peut interrompre un consommateur synchrone dans un bloc',async()=>{
 const project=make(5),controller=new AbortController();let frames=0,aborts=0;
 const consumer={beginChunk(){},writeFrame(){frames++;if(frames===1)setTimeout(()=>controller.abort(),0);},
  commitChunk(){assert.fail('Bloc interrompu');},abortChunk(){aborts++;}};
 await assert.rejects(processNextFilmChunk({project,checkpoint:await createFilmCheckpoint(project),
  generator,sink:consumer,signal:controller.signal}),{name:'AbortError'});
 assert.ok(frames>0&&frames<48);assert.equal(aborts,1);
});
