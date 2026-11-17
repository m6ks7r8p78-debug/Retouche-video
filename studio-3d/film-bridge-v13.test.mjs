import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {buildSyntheticFilmSceneV13,auditBridge,PATH,RADII,alignUp} from './film-bridge-v13.mjs';
import {buildSyntheticFilmSceneV12} from './film-volume-v12.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
const female="Une femme brune s'assoit dans le salon, boit un café, pose sa tasse, puis parle.";
const male="Un homme brun s'assoit, boit du thé, pose sa tasse, puis parle.";

test('cinq volumes orientés raccordent le poignet à la paume dans le GLB final',()=>{
 const out=buildSyntheticFilmSceneV13(female,generator);
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.13');
 assert.equal(out.status,'apercu_partiel_glb_anime');
 const scene=readSyntheticGLB(out.glb),names=scene.doc.nodes.map(n=>n.name);
 const wrist=names.indexOf('poignet_droite');
 for(let i=0;i<RADII.length;i++){
  const id=names.indexOf('film_liaison_poignet_paume_'+i);
  assert.ok(id>=0);
  assert.ok(scene.doc.nodes[id].mesh>=0);
  assert.equal(names.filter(n=>n==='film_liaison_poignet_paume_'+i).length,1);
  assert.ok(scene.doc.nodes[wrist].children.includes(id));
  assert.ok(Math.abs(scene.doc.nodes[id].scale[0]-RADII[i])<.000001);
 }
 assert.equal(PATH.length,RADII.length+1);
 assert.equal(names.filter(n=>n==='tasse_unique_mobile').length,1);
 assert.equal(out.mediaUploaded,false);
 assert.equal(out.renderedFilm,false);
});
test('aucune discontinuité du raccord ni pénétration grossière dans la tasse',()=>{
 const out=buildSyntheticFilmSceneV13(female,generator),a=out.bridgeAudit;
 assert.equal(a.schema,'retoucheproai.film-wrist-bridge-audit.v0.13');
 assert.equal(a.segments,5);
 assert.equal(a.physicallyConnected,false);
 assert.equal(a.exactMeshCollisionVerified,false);
 assert.ok(a.poses>=20);
 assert.ok(a.maxProjectedSeamGapM<=.003);
 assert.ok(a.maxSampledCupPenetrationM<=.004);
 assert.ok(a.minSampledForearmBridgeOverlapM>=.03);
 assert.ok(a.minSampledBridgePalmOverlapM>=.03);
 assert.equal(out.volumeAudit.maxSampledPalmCupPenetrationM,0);
 assert.ok(out.handleAudit.nearHandleFraction>=.95);
});
test('les volumes solidaires du poignet restent raccordés pendant la prise et le dépôt',()=>{
 const out=buildSyntheticFilmSceneV13(female,generator),scene=readSyntheticGLB(out.glb);
 const names=scene.doc.nodes.map(n=>n.name),id=names.indexOf('film_liaison_poignet_paume_3');
 const wrist=names.indexOf('poignet_droite');
 const drink=out.timeline.find(t=>t.intent==='boire');
 const place=out.timeline.find(t=>t.intent==='poser_objet');
 const poses=[drink.start+.2,drink.start+1.35,place.start+.3,place.end];
 const relative=[];
 for(const t of poses){
  const pose=sampleSyntheticPose(scene,t);
  const m=pose.world[wrist].matrix;
  const v=scene.doc.nodes[id].translation;
  const expected=[m[12]+m[0]*v[0]+m[4]*v[1]+m[8]*v[2],
   m[13]+m[1]*v[0]+m[5]*v[1]+m[9]*v[2],
   m[14]+m[2]*v[0]+m[6]*v[1]+m[10]*v[2]];
  assert.ok(Math.hypot(...expected.map((x,i)=>x-pose.world[id].translation[i]))<.00001);
  relative.push(expected);
 }
 assert.ok(Math.hypot(...relative[0].map((n,i)=>n-relative[1][i]))>.01);
});
test('avatar masculin : même continuité de l’avant-bras à la paume',()=>{
 const out=buildSyntheticFilmSceneV13(male,generator);
 assert.ok(out.bridgeAudit.maxProjectedSeamGapM<=.003);
 assert.ok(out.bridgeAudit.maxSampledCupPenetrationM<=.004);
 assert.equal(out.volumeAudit.maxSampledPalmCupPenetrationM,0);
});
test('la v0.12 conserve ses sorties et n’hérite pas des volumes v0.13',()=>{
 const out=buildSyntheticFilmSceneV12(female,generator),scene=readSyntheticGLB(out.glb);
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.12');
 assert.equal(out.bridgeAudit,undefined);
 assert.equal(scene.doc.nodes.filter(n=>n.name.startsWith('film_liaison_poignet_paume_')).length,0);
});
test('un scénario avec médias réels ne génère aucun faux raccord',()=>{
 const out=buildSyntheticFilmSceneV13({prompt:female,
  references:[{kind:'video',rightsConfirmed:true,likenessConsent:true}]},generator);
 assert.equal(out.status,'scenario_seulement');
 assert.equal(out.glb,null);
 assert.equal(out.bridgeAudit,undefined);
});
test('l’audit refuse les fréquences invalides et les directions nulles',()=>{
 const out=buildSyntheticFilmSceneV13(female,generator);
 assert.throws(()=>auditBridge(out.glb,out.timeline,{sampleHz:300}),/Cadence/);
 assert.throws(()=>alignUp([0,0,0]),/nulle/);
});
test('injection GLB : décaler le maillon central doit rompre la continuité',()=>{
 const out=buildSyntheticFilmSceneV13(female,generator),bytes=out.glb.slice();
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),jl=dv.getUint32(12,true);
 const source=new TextDecoder().decode(bytes.subarray(20,20+jl));
 const original='"name":"film_liaison_poignet_paume_2","translation":[0.0775,';
 const corrupted='"name":"film_liaison_poignet_paume_2","translation":[3.0775,';
 assert.ok(source.includes(original));
 assert.equal(original.length,corrupted.length);
 bytes.set(new TextEncoder().encode(source.replace(original,corrupted)),20);
 assert.throws(()=>auditBridge(bytes,out.timeline),/Discontinuité/);
});
