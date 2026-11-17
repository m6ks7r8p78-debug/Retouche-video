import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {
 WRIST_MESH,createContinuousWristMesh,inspectContinuousTopology,
 auditContinuousWrist,buildSyntheticFilmSceneV14
} from './film-continuous-v14.mjs';
import {buildSyntheticFilmSceneV13} from './film-bridge-v13.mjs';
import {buildSyntheticFilmSceneV12} from './film-volume-v12.mjs';
import {readSyntheticGLB,sampleSyntheticPose,projectedObjects} from './film-viewer-v03.mjs';
import {inspectSyntheticMesh} from './film-webgl-v04.mjs';

const female="Une femme brune s'assoit dans le salon, boit un café, pose sa tasse, puis parle.";
const male="Un homme brun s'assoit, boit du thé, pose sa tasse, puis parle.";

test('tube fermé triangulé : arêtes opposées, normales valides et aucune face dégénérée',()=>{
 const tube=createContinuousWristMesh();
 const a=inspectContinuousTopology(tube.positions,tube.normals,tube.indices);
 assert.equal(a.isClosedOrientedManifold,true);
 assert.equal(a.boundaryOrNonManifoldEdges,0);
 assert.equal(a.badNormals,0);
 assert.equal(a.degenerateTriangles,0);
 assert.ok(a.vertices>200);
 assert.ok(a.triangles>300);
 assert.equal(tube.radialSegments,16);
});
test('contrôle de topologie : triangle supprimé, indices corrompus ou normale invalides',()=>{
 const tube=createContinuousWristMesh();
 assert.ok(inspectContinuousTopology(tube.positions,tube.normals,tube.indices.slice(3))
  .boundaryOrNonManifoldEdges>0);
 const bad=tube.indices.slice();
 bad[0]=bad[1];
 assert.throws(()=>inspectContinuousTopology(tube.positions,tube.normals,bad),/Indice triangulaire/);
 const norms=tube.normals.slice();norms[2]=5;
 assert.ok(inspectContinuousTopology(tube.positions,norms,tube.indices).badNormals>0);
 assert.throws(()=>createContinuousWristMesh({radialSegments:4}),/Précision/);
});
test('v0.14 : un seul maillage continu exporté, attaché au poignet, sans cinq sphères',()=>{
 const out=buildSyntheticFilmSceneV14(female,generator);
 assert.equal(out.status,'apercu_partiel_glb_anime');
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.14');
 const scene=readSyntheticGLB(out.glb);
 const nodes=scene.doc.nodes;
 const seams=nodes.filter(n=>n.name===WRIST_MESH);
 assert.equal(seams.length,1);
 assert.equal(nodes.filter(n=>n.name.startsWith('film_liaison_poignet_paume_')).length,0);
 const mesh=scene.doc.meshes[seams[0].mesh];
 assert.equal(mesh.name,WRIST_MESH);
 assert.equal(mesh.primitives[0].material,0);
 assert.equal(nodes.filter(n=>n.name==='tasse_unique_mobile').length,1);
 const wrist=nodes.find(n=>n.name==='poignet_droite');
 assert.ok(wrist.children.includes(nodes.indexOf(seams[0])));
 assert.equal(scene.doc.asset.version,'2.0');
 assert.equal(scene.doc.extras.synthetic,true);
 assert.equal(out.renderedFilm,false);
 assert.equal(out.mediaUploaded,false);
});
test('les véritables triangles exportés sont décodables par le moteur WebGL2',()=>{
 const out=buildSyntheticFilmSceneV14(female,generator),scene=readSyntheticGLB(out.glb);
 const decoded=inspectSyntheticMesh(out.glb,scene);
 const node=scene.doc.nodes.find(n=>n.name===WRIST_MESH),geo=decoded.geometries[node.mesh];
 const topology=inspectContinuousTopology(geo.positions,geo.normals,geo.indices);
 assert.equal(topology.isClosedOrientedManifold,true);
 assert.equal(topology.triangles,out.continuousAudit.triangles);
 assert.equal(topology.vertices,out.continuousAudit.vertices);
 assert.ok(geo.positions.length>0&&geo.indices.length>0);
 assert.ok(decoded.drawNodes>20);
});
test('audit suit le poignet sans pénétration mesurée excessive dans la tasse',()=>{
 const out=buildSyntheticFilmSceneV14(female,generator),audit=out.continuousAudit;
 assert.equal(audit.schema,'retoucheproai.film-continuous-wrist-audit.v0.14');
 assert.equal(audit.skinned,false);
 assert.equal(audit.exactTriangleCollisionVerified,false);
 assert.equal(audit.physicallyConnected,false);
 assert.equal(audit.boundaryOrNonManifoldEdges,0);
 assert.equal(audit.degenerateTriangles,0);
 assert.equal(audit.badNormals,0);
 assert.ok(audit.poseSamples>20);
 assert.ok(audit.maxSampledCupPenetrationM<=.005);
 assert.ok(audit.maxWristAttachmentDriftM<=.0001);
 assert.equal(out.volumeAudit.maxSampledPalmCupPenetrationM,0);
 assert.ok(out.handleAudit.nearHandleFraction>=.95);
});
test('maillage continu suit la main dans plusieurs poses et reste visible en secours 2D',()=>{
 const out=buildSyntheticFilmSceneV14(female,generator),scene=readSyntheticGLB(out.glb);
 const node=scene.doc.nodes.findIndex(n=>n.name===WRIST_MESH),wrist=scene.doc.nodes.findIndex(n=>n.name==='poignet_droite');
 const drink=out.timeline.find(t=>t.intent==='boire'),place=out.timeline.find(t=>t.intent==='poser_objet');
 let first=null,moved=false;
 for(const t of [0,drink.start+1,drink.start+1.6,place.start+.1]){
  const pose=sampleSyntheticPose(scene,t);
  const hand=pose.world[node].translation,anchor=pose.world[wrist].translation;
  assert.ok(Math.hypot(...hand.map((x,i)=>x-anchor[i]))<.0001);
  if(first&&Math.hypot(...hand.map((x,i)=>x-first[i]))>.01)moved=true;
  first??=hand;
  const fallback=projectedObjects(scene,pose,{width:390,height:290,target:hand,distance:.77});
  const cuff=fallback.find(x=>x.name===WRIST_MESH);
  assert.ok(cuff&&cuff.rx<150&&cuff.ry<150,'Secours 2D ne doit pas projeter une sphère unité énorme.');
 }
 assert.equal(moved,true);
});
test('la même continuité est conservée pour un autre avatar adulte stylisé',()=>{
 const out=buildSyntheticFilmSceneV14(male,generator);
 assert.equal(out.continuousAudit.boundaryOrNonManifoldEdges,0);
 assert.ok(out.continuousAudit.maxSampledCupPenetrationM<=.005);
 assert.ok(out.continuousAudit.maxWristAttachmentDriftM<=.0001);
});
test('les versions v0.12/v0.13 ne récupèrent pas le nouveau maillage',()=>{
 for(const builder of [buildSyntheticFilmSceneV12,buildSyntheticFilmSceneV13]){
  const out=builder(female,generator),scene=readSyntheticGLB(out.glb);
  assert.ok(!scene.doc.nodes.some(n=>n.name===WRIST_MESH));
  assert.equal(out.continuousAudit,undefined);
 }
});
test('un scénario réel non autorisé n’obtient ni maillage ni audit trompeur',()=>{
 const out=buildSyntheticFilmSceneV14({
  prompt:female,references:[{kind:'video',rightsConfirmed:true,likenessConsent:true}]
 },generator);
 assert.equal(out.status,'scenario_seulement');
 assert.equal(out.glb,null);
 assert.equal(out.continuousAudit,undefined);
});
test('audit rejette l’échantillonnage excessif et un triangle GLB volontairement corrompu',()=>{
 const out=buildSyntheticFilmSceneV14(female,generator);
 assert.throws(()=>auditContinuousWrist(out.glb,out.timeline,{sampleHz:100}),/Cadence/);
 const glb=out.glb.slice(),scene=readSyntheticGLB(glb),doc=scene.doc;
 const node=doc.nodes.find(n=>n.name===WRIST_MESH);
 const acc=doc.accessors[doc.meshes[node.mesh].primitives[0].indices];
 const view=doc.bufferViews[acc.bufferView];
 const dv=new DataView(glb.buffer,glb.byteOffset,glb.byteLength);
 const offset=20+dv.getUint32(12,true)+8+view.byteOffset+(acc.byteOffset||0);
 const next=dv.getUint16(offset+2,true);
 dv.setUint16(offset,next,true);
 assert.throws(()=>auditContinuousWrist(glb,out.timeline),/Indice triangulaire|Surface de raccord/);
});
