import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {createWristMorphTargets,morphWeightAt,auditMorphWrist,buildSyntheticFilmSceneV15} from './film-morph-v15.mjs';
import {buildSyntheticFilmSceneV14,createContinuousWristMesh} from './film-continuous-v14.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
import {inspectSyntheticMesh} from './film-webgl-v04.mjs';
const female="Une femme brune s'assoit dans le salon, boit un café, pose sa tasse, puis parle.";
const male="Un homme brun s'assoit, boit du thé, pose sa tasse, puis parle.";

test('deux zones indépendantes déforment un même tube sans ouvrir ses extrémités',()=>{
 const tube=createContinuousWristMesh(),targets=createWristMorphTargets(tube);
 assert.equal(targets.length,2);
 for(const target of targets){
  assert.equal(target.positions.length,tube.positions.length);
  assert.ok(target.positions.every(Number.isFinite));
  assert.ok(target.positions.some(x=>Math.abs(x)>.002));
  for(let i=0;i<tube.radialSegments*3;i++){
   assert.equal(target.positions[i],0);
   assert.equal(target.positions[(tube.ringCount-1)*tube.radialSegments*3+i],0);
  }
  assert.deepEqual(target.positions.slice(-6),[0,0,0,0,0,0]);
 }
 assert.notDeepEqual(targets[0].positions,targets[1].positions);
});
test('poids morph : neutres au départ, flexion progressive pendant la prise',()=>{
 const timeline=[{intent:'boire',start:2,end:5},{intent:'poser_objet',start:5.2,end:6.2}];
 assert.deepEqual(morphWeightAt(0,timeline),[0,0]);
 assert.ok(morphWeightAt(3.3,timeline)[0]>.5);
 assert.ok(morphWeightAt(3.3,timeline)[1]>.1);
 assert.ok(morphWeightAt(6.2,timeline).every(x=>x===0));
 assert.throws(()=>morphWeightAt(NaN,timeline),/invalide/);
});
test('v0.15 exporte 2 cibles glTF valides et une animation SCALAR de poids',()=>{
 const out=buildSyntheticFilmSceneV15(female,generator);
 assert.equal(out.status,'apercu_partiel_glb_anime');
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.15');
 const scene=readSyntheticGLB(out.glb),id=scene.doc.nodes.findIndex(n=>n.name==='film_manchon_continu_poignet_paume');
 assert.ok(id>=0);
 const node=scene.doc.nodes[id],primitive=scene.doc.meshes[node.mesh].primitives[0];
 assert.equal(primitive.targets.length,2);
 assert.deepEqual(node.weights,[0,0]);
 assert.equal(scene.doc.nodes.filter(n=>n.name.startsWith('film_liaison_poignet_paume_')).length,0);
 const track=scene.clips[0].tracks.find(t=>t.node===id&&t.path==='weights');
 assert.ok(track&&track.times.length>100);
 assert.equal(track.values.length,track.times.length);
 const decoded=inspectSyntheticMesh(out.glb,scene).geometries[node.mesh];
 assert.equal(decoded.morph.length,2);
 assert.equal(decoded.morph[0].length,decoded.positions.length);
 assert.equal(scene.doc.nodes.filter(n=>n.name==='tasse_unique_mobile').length,1);
 assert.equal(out.mediaUploaded,false);
 assert.equal(out.renderedFilm,false);
});
test('les sommets bougent réellement selon les deux poids de morph pendant la boisson',()=>{
 const out=buildSyntheticFilmSceneV15(female,generator),scene=readSyntheticGLB(out.glb);
 const id=scene.doc.nodes.findIndex(n=>n.name==='film_manchon_continu_poignet_paume');
 const drink=out.timeline.find(t=>t.intent==='boire');
 const before=sampleSyntheticPose(scene,0).world[id].weights;
 const whileDrinking=sampleSyntheticPose(scene,drink.start+1.4).world[id].weights;
 assert.deepEqual(before,[0,0]);
 assert.ok(whileDrinking[0]>.4);
 assert.ok(whileDrinking[1]>.05);
 const a=out.morphAudit;
 assert.equal(a.schema,'retoucheproai.film-morph-wrist-audit.v0.15');
 assert.equal(a.targetCount,2);
 assert.equal(a.boneSkinning,false);
 assert.equal(a.physicallyDeformedSkin,false);
 assert.equal(a.exactMeshCollisionVerified,false);
 assert.ok(a.changedVertexSamples>500);
 assert.ok(a.maxCoordinateDisplacementM>.002);
 assert.ok(a.maxSampledCupPenetrationM<=.005);
 assert.ok(a.maxWeightStep<=.18);
});
test('un autre personnage adulte reste compatible',()=>{
 const out=buildSyntheticFilmSceneV15(male,generator);
 assert.equal(out.morphAudit.targetCount,2);
 assert.ok(out.morphAudit.maxSampledCupPenetrationM<=.005);
 assert.equal(out.volumeAudit.maxSampledPalmCupPenetrationM,0);
});
test('les anciennes versions gardent leur maillage rigide inchangé',()=>{
 const out=buildSyntheticFilmSceneV14(female,generator),scene=readSyntheticGLB(out.glb);
 const id=scene.doc.nodes.findIndex(n=>n.name==='film_manchon_continu_poignet_paume');
 assert.equal(scene.doc.meshes[scene.doc.nodes[id].mesh].primitives[0].targets,undefined);
 assert.equal(out.morphAudit,undefined);
});
test('médias réels hors du pilote : aucune cible morph ni aucun audit inventé',()=>{
 const out=buildSyntheticFilmSceneV15({prompt:female,
  references:[{kind:'video',rightsConfirmed:true,likenessConsent:true}]},generator);
 assert.equal(out.status,'scenario_seulement');
 assert.equal(out.glb,null);
 assert.equal(out.morphAudit,undefined);
});
test('le décodeur refuse la corruption des poids morph dans le GLB',()=>{
 const out=buildSyntheticFilmSceneV15(female,generator),glb=out.glb.slice();
 const scene=readSyntheticGLB(glb),doc=scene.doc,idx=doc.nodes.findIndex(n=>n.name==='film_manchon_continu_poignet_paume');
 const animation=doc.animations[0],channel=animation.channels.find(c=>c.target.node===idx&&c.target.path==='weights');
 assert.ok(channel);
 const acc=doc.accessors[animation.samplers[channel.sampler].output];
 const view=doc.bufferViews[acc.bufferView];
 const dv=new DataView(glb.buffer,glb.byteOffset,glb.byteLength);
 const offset=20+dv.getUint32(12,true)+8+view.byteOffset+(acc.byteOffset||0);
 dv.setFloat32(offset+Math.floor(acc.count/2)*4,5,true);
 assert.throws(()=>auditMorphWrist(glb,out.timeline),/Temps ou valeurs|incompatible/);
});
test('le décodeur refuse une cible morph de coordonnées non finies',()=>{
 const out=buildSyntheticFilmSceneV15(female,generator),glb=out.glb.slice();
 const doc=readSyntheticGLB(glb).doc,idx=doc.nodes.findIndex(n=>n.name==='film_manchon_continu_poignet_paume');
 const target=doc.meshes[doc.nodes[idx].mesh].primitives[0].targets[0];
 const view=doc.bufferViews[doc.accessors[target.POSITION].bufferView],dv=new DataView(glb.buffer);
 const offset=20+dv.getUint32(12,true)+8+view.byteOffset;
 dv.setFloat32(offset,NaN,true);
 assert.throws(()=>auditMorphWrist(glb,out.timeline),/non finie|non conformes/);
});
