import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {ROD_MESH,FILTER_MESH,FILTER_NODE,FILTER_MATERIAL,
 createCappedCylinder,auditCigaretteCylinder,buildSyntheticFilmSceneV20}
 from './film-cigarette-cylinder-v20.mjs';
import {buildSyntheticFilmSceneV19} from './film-finger-mesh-v19.mjs';
import {inspectContinuousTopology} from './film-continuous-v14.mjs';
import {readSyntheticGLB} from './film-viewer-v03.mjs';

const female='Une femme adulte fume trois taffes de cigarette.';
const left='Un homme adulte fume deux taffes de cigarette de la main gauche.';
const cup="Une femme brune s'assoit dans le salon, boit un café, pose sa tasse, puis parle.";

test('vrai cylindre fermé : côtés circulaires, bouchons et triangle manifold',()=>{
 const mesh=createCappedCylinder();
 const audit=inspectContinuousTopology(mesh.positions,mesh.normals,mesh.indices);
 assert.equal(audit.isClosedOrientedManifold,true);
 assert.equal(audit.degenerateTriangles,0);
 assert.equal(audit.badNormals,0);
 assert.ok(audit.vertices>=60&&audit.vertices<110);
 assert.ok(audit.triangles>=100&&audit.triangles<200);
 assert.throws(()=>createCappedCylinder({radialSegments:4}),/Précision/);
});
test('les capuchons empêchent un cylindre ouvert de passer l’audit',()=>{
 const mesh=createCappedCylinder();
 const audit=inspectContinuousTopology(mesh.positions,mesh.normals,mesh.indices.slice(0,-3));
 assert.equal(audit.isClosedOrientedManifold,false);
 assert.ok(audit.boundaryOrNonManifoldEdges>0);
});
test('la tige de cigarette, son filtre et ses matériaux sont distincts en GLB',()=>{
 const out=buildSyntheticFilmSceneV20(female,generator),scene=readSyntheticGLB(out.glb);
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.20');
 assert.equal(out.status,'apercu_partiel_glb_anime');
 assert.equal(scene.doc.nodes.filter(n=>n.name===FILTER_NODE).length,1);
 assert.equal(scene.doc.nodes.filter(n=>n.name==='cigarette_tige').length,1);
 assert.equal(scene.doc.meshes.filter(m=>m.name===ROD_MESH).length,1);
 assert.equal(scene.doc.meshes.filter(m=>m.name===FILTER_MESH).length,1);
 assert.equal(scene.doc.materials.filter(m=>m.name===FILTER_MATERIAL).length,1);
 assert.equal(out.cylinderAudit.cylinderCount,1);
 assert.equal(out.cylinderAudit.filterCount,1);
 assert.equal(out.cylinderAudit.sampleCount,12);
 assert.equal(out.cylinderAudit.physicallyBurning,false);
 assert.ok(out.cylinderAudit.sampledCoaxialCenterDriftM<=.05);
 assert.ok(out.cylinderAudit.maxCenterSeparationM<=.12);
 assert.equal(out.fingersMeshAudit.segments,10);
 assert.equal(out.gripAudit.fingerCount,5);
 assert.equal(out.actionAudit.episodesVerified,3);
 assert.equal(out.mediaUploaded,false);
 assert.equal(out.renderedFilm,false);
});
test('cigarette cylindrique fonctionne dans la main gauche',()=>{
 const out=buildSyntheticFilmSceneV20(left,generator);
 assert.equal(out.cylinderAudit.sampleCount,8);
 assert.equal(out.gripAudit.smokingHand,'gauche');
 assert.ok(out.lipAudit.peakApproachGapM<=.022);
});
test('les anciennes versions de la tige sphérique restent inchangées',()=>{
 const old=buildSyntheticFilmSceneV19(female,generator),scene=readSyntheticGLB(old.glb);
 assert.ok(!scene.doc.meshes.some(m=>m.name===ROD_MESH));
 assert.equal(old.cylinderAudit,undefined);
});
test('le moteur de tasse conserve son GLB unique et aucun filtre ajouté',()=>{
 const out=buildSyntheticFilmSceneV20(cup,generator),scene=readSyntheticGLB(out.glb);
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.15');
 assert.equal(out.cylinderAudit,undefined);
 assert.equal(scene.doc.nodes.filter(n=>n.name===FILTER_NODE).length,0);
});
test('un film basé sur une référence privée n’est jamais généré par ce pilote',()=>{
 const out=buildSyntheticFilmSceneV20({
  prompt:female,references:[{kind:'video',rightsConfirmed:true,likenessConsent:true}]
 },generator);
 assert.equal(out.status,'scenario_seulement');
 assert.equal(out.glb,null);
 assert.equal(out.cylinderAudit,undefined);
});
test('une séparation illégitime du filtre dans le GLB est refusée',()=>{
 const out=buildSyntheticFilmSceneV20(female,generator),bytes=out.glb.slice();
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const len=dv.getUint32(12,true);
 const raw=new TextDecoder().decode(bytes.subarray(20,20+len));
 const before='"name":"'+FILTER_NODE+'","translation":[0.02,-0.059,0.053]';
 const after='"name":"'+FILTER_NODE+'","translation":[9.02,-0.059,0.053]';
 assert.equal(before.length,after.length);
 assert.ok(raw.includes(before));
 bytes.set(new TextEncoder().encode(raw.replace(before,after)),20);
 assert.throws(()=>auditCigaretteCylinder(bytes,out.timeline),/Le filtre ne reste pas/);
});
test('le maillage cylindre GLB réellement exporté ne tolère pas des indices brisés',()=>{
 const out=buildSyntheticFilmSceneV20(female,generator),bytes=out.glb.slice(),
  doc=readSyntheticGLB(bytes).doc,mesh=doc.meshes.find(m=>m.name===ROD_MESH);
 const accessor=doc.accessors[mesh.primitives[0].indices],
  view=doc.bufferViews[accessor.bufferView],
  dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),
  start=20+dv.getUint32(12,true)+8+view.byteOffset+(accessor.byteOffset||0);
 dv.setUint16(start,dv.getUint16(start+2,true),true);
 assert.throws(()=>auditCigaretteCylinder(bytes,out.timeline),/Indice triangulaire|Cylindre triangulé/);
});
