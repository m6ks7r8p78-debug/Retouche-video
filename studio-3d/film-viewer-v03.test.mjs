import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {buildSyntheticFilmSequence} from './film-sequence-v02.mjs';
import {readSyntheticGLB,sampleSyntheticPose,projectedObjects,paintSyntheticScene} from './film-viewer-v03.mjs';

const make=()=>buildSyntheticFilmSequence("Une femme brune s'assoit, boit un café, pose sa tasse, puis parle.",generator);
test('le visualiseur lit le vrai GLB de la scène et la chronologie',()=>{
  const output=make();
  const scene=readSyntheticGLB(output.glb);
  assert.equal(scene.doc.extras.synthetic,true);
  assert.equal(scene.clips[0].name,'film_scene_v02');
  assert.equal(scene.byteLength,output.glb.byteLength);
  assert.ok(scene.doc.nodes.some(n=>n.name==='tasse_corps_main'));
});
test('les poses échantillonnées varient avec les gestes et restent finies',()=>{
 const scene=readSyntheticGLB(make().glb);
 const before=sampleSyntheticPose(scene,0);
 const during=sampleSyntheticPose(scene,3.1);
 const end=sampleSyntheticPose(scene,500);
 assert.ok(before.world.length>30);
 assert.ok(end.time<500);
 assert.ok(before.world.every(w=>w&&w.translation.every(Number.isFinite)&&w.rotation.every(Number.isFinite)));
 assert.notDeepEqual(before.world,during.world);
 assert.equal(end.duration,scene.clips[0].duration);
});
test('la projection produit des formes visibles pour les objets 3D',()=>{
 const scene=readSyntheticGLB(make().glb);
 const pose=sampleSyntheticPose(scene,4.0);
 const objects=projectedObjects(scene,pose,{width:420,height:320,yaw:.4});
 assert.ok(objects.length>25);
 assert.ok(objects.every(o=>Number.isFinite(o.x)&&Number.isFinite(o.rx)&&o.rx>0));
 let drawn=0;
 const context={
   clearRect(){},fillRect(){},beginPath(){},
   ellipse(){ drawn++; },fill(){},
   set fillStyle(s){ assert.ok(typeof s==='string'); }
 };
 const count=paintSyntheticScene(context,scene,pose,420,320,{yaw:.2,pitch:.1});
 assert.equal(count,drawn);
});
test('GLB tronqué, déclaré trop gros ou altéré est refusé',()=>{
 const bytes=make().glb;
 assert.throws(()=>readSyntheticGLB(bytes.slice(0,30)),/GLB|Bloc/);
 const bad=bytes.slice();
 bad[0]=0;
 assert.throws(()=>readSyntheticGLB(bad),/Entête/);
 const wrong=bytes.slice();
 const dv=new DataView(wrong.buffer);
 dv.setUint32(8,999999,true);
 assert.throws(()=>readSyntheticGLB(wrong),/Entête/);
});
test('la projection ne téléverse aucun média ni ne génère de film',()=>{
 const output=make();
 assert.equal(output.renderedFilm,false);
 assert.equal(output.mediaUploaded,false);
 const viewer=readSyntheticGLB(output.glb);
 assert.equal(viewer.doc.extras.notPhotorealistic,true);
});
