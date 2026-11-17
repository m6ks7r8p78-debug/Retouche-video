import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {MESH_NAME,createTaperedPhalanx,auditTaperedFingerMeshes,
 buildSyntheticFilmSceneV19} from './film-finger-mesh-v19.mjs';
import {buildSyntheticFilmSceneV18} from './film-handgrip-v18.mjs';
import {inspectContinuousTopology} from './film-continuous-v14.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
const female='Une femme adulte fume trois taffes de cigarette.';
const male='Un homme adulte fume deux taffes de cigarette de la main gauche.';
const coffee="Une femme brune s'assoit dans le salon, boit un café, pose sa tasse, puis parle.";

test('phalange effilée : mesh triangulé fermé et normales non dégénérées',()=>{
 const m=createTaperedPhalanx();
 const a=inspectContinuousTopology(m.positions,m.normals,m.indices);
 assert.equal(a.isClosedOrientedManifold,true);
 assert.equal(a.badNormals,0);
 assert.equal(a.boundaryOrNonManifoldEdges,0);
 assert.equal(a.degenerateTriangles,0);
 assert.ok(a.vertices>120&&a.vertices<500);
 assert.ok(a.triangles>200&&a.triangles<900);
 assert.throws(()=>createTaperedPhalanx({radialSegments:6}),/Précision/);
});
test('une phalange cassée perd la continuité et ne peut passer l’audit de topologie',()=>{
 const m=createTaperedPhalanx();
 const a=inspectContinuousTopology(m.positions,m.normals,m.indices.slice(3));
 assert.equal(a.isClosedOrientedManifold,false);
 assert.ok(a.boundaryOrNonManifoldEdges>0);
 const norms=m.normals.slice();
 norms[0]=NaN;
 assert.ok(inspectContinuousTopology(m.positions,norms,m.indices).badNormals>0);
});
test('v0.19 : dix maillons des cinq doigts réutilisent UN seul maillage GLB',()=>{
 const out=buildSyntheticFilmSceneV19(female,generator),a=out.fingersMeshAudit,
  scene=readSyntheticGLB(out.glb);
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.19');
 assert.equal(out.status,'apercu_partiel_glb_anime');
 assert.equal(a.fingers,5);
 assert.equal(a.segments,10);
 assert.equal(a.sharedMeshCount,1);
 assert.equal(a.watertightSharedMesh,true);
 assert.equal(a.anatomicallyRigged,false);
 assert.equal(a.physicallySimulated,false);
 assert.equal(a.exactFingerCollisionVerified,false);
 assert.equal(scene.doc.meshes.filter(m=>m.name===MESH_NAME).length,1);
 assert.equal(out.gripAudit.episodesVerified,3);
 assert.ok(out.lipAudit.peakApproachGapM<=.022);
 assert.equal(out.mediaUploaded,false);
 assert.equal(out.renderedFilm,false);
});
test('l’animation du majeur et de l’index est conservée avec la nouvelle topologie',()=>{
 const out=buildSyntheticFilmSceneV19(female,generator),scene=readSyntheticGLB(out.glb);
 const names=scene.doc.nodes.map(n=>n.name),
  id=names.indexOf('film_pince_index_bout'),
  other=names.indexOf('film_pince_majeur_bout');
 const t=out.timeline[0].start;
 const start=sampleSyntheticPose(scene,t,'film_actions_v16'),
  inhale=sampleSyntheticPose(scene,t+2.3,'film_actions_v16');
 assert.equal(scene.doc.nodes[id].mesh,scene.doc.nodes[other].mesh);
 assert.ok(Math.hypot(...start.world[id].translation.map((v,i)=>v-inhale.world[id].translation[i]))>.01);
 assert.equal(out.gripAudit.minimumOpposingFingerDistanceM>.02,true);
});
test('main gauche : même maillage partagé et même géométrie de préhension',()=>{
 const out=buildSyntheticFilmSceneV19(male,generator);
 assert.equal(out.fingersMeshAudit.segments,10);
 assert.equal(out.gripAudit.smokingHand,'gauche');
 assert.equal(out.gripAudit.episodesVerified,2);
});
test('les scènes tasse et les versions précédentes ne changent pas',()=>{
 const coffeeOut=buildSyntheticFilmSceneV19(coffee,generator);
 assert.equal(coffeeOut.schema,'retoucheproai.film-motion-preview.v0.15');
 const smokingOld=buildSyntheticFilmSceneV18(female,generator),
  scene=readSyntheticGLB(smokingOld.glb);
 assert.equal(smokingOld.schema,'retoucheproai.film-motion-preview.v0.18');
 assert.ok(!scene.doc.meshes.some(m=>m.name===MESH_NAME));
});
test('le GLB reste strictement synthétique et le refus de médias privés demeure',()=>{
 const out=buildSyntheticFilmSceneV19({
  prompt:female,references:[{kind:'video',rightsConfirmed:true,likenessConsent:true}]
 },generator);
 assert.equal(out.status,'scenario_seulement');
 assert.equal(out.glb,null);
 assert.equal(out.fingersMeshAudit,undefined);
});
test('indices de triangles altérés dans le GLB exporté : refus',()=>{
 const out=buildSyntheticFilmSceneV19(female,generator),bytes=out.glb.slice();
 const doc=readSyntheticGLB(bytes).doc,meshId=doc.meshes.findIndex(m=>m.name===MESH_NAME);
 const acc=doc.accessors[doc.meshes[meshId].primitives[0].indices],
  view=doc.bufferViews[acc.bufferView],dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const binOffset=20+dv.getUint32(12,true)+8+view.byteOffset+(acc.byteOffset||0);
 dv.setUint16(binOffset,dv.getUint16(binOffset+2,true),true);
 assert.throws(()=>auditTaperedFingerMeshes(bytes),/ouverte ou dégénérée|Indice triangulaire/);
});
