import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {FINGERS,fingerClosureAt,auditFingerAndSeat,buildSyntheticFilmSceneV09} from './film-fingers-v09.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
const female="Une femme brune s'assoit dans le salon, boit un café, pose sa tasse, puis parle.";
const male="Un homme brun s'assoit, boit du thé, pose sa tasse, puis parle.";

test('la fermeture des doigts suit la prise, le transport et le dépôt sans saut brutal',()=>{
 const timeline=[
  {intent:'s_asseoir',start:.2,end:2},
  {intent:'boire',start:2.2,end:5.2},
  {intent:'poser_objet',start:5.4,end:6.85}
 ];
 assert.equal(fingerClosureAt(2.2,timeline),0);
 assert.ok(fingerClosureAt(2.6,timeline)>.02);
 assert.ok(fingerClosureAt(3.1,timeline)>.99);
 assert.ok(fingerClosureAt(5.4,timeline)>.99);
 assert.ok(fingerClosureAt(5.96,timeline)<.01);
 assert.equal(fingerClosureAt(8,timeline),0);
});
test('v0.9 exporte un personnage unique avec cinq doigts visibles articulés',()=>{
 const out=buildSyntheticFilmSceneV09(female,generator);
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.9');
 assert.equal(out.status,'apercu_partiel_glb_anime');
 const scene=readSyntheticGLB(out.glb);
 const names=scene.doc.nodes.map(n=>n.name);
 for(const f of FINGERS){
   const pivot=names.indexOf('film_doigt_'+f.name+'_pivot');
   const distal=names.indexOf('film_doigt_'+f.name+'_articulation');
   const prox=names.indexOf('film_doigt_'+f.name+'_proximal');
   const tip=names.indexOf('film_doigt_'+f.name+'_bout');
   assert.ok(pivot>=0&&distal>=0&&prox>=0&&tip>=0);
   assert.ok(scene.doc.nodes[prox].mesh>=0);
   assert.ok(scene.doc.nodes[tip].mesh>=0);
   for(const id of [pivot,distal])
     assert.ok(scene.clips[0].tracks.some(t=>t.node===id&&t.path==='rotation'));
 }
 assert.equal(names.filter(x=>x==='tasse_unique_mobile').length,1);
 assert.equal(out.mediaUploaded,false);
 assert.equal(out.photorealistic,false);
});
test('l’audit inspecte les phalanges et la proximité du bassin avec le siège',()=>{
 const out=buildSyntheticFilmSceneV09(female,generator);
 const a=out.handSeatAudit;
 assert.equal(a.schema,'retoucheproai.film-hand-seat-audit.v0.9');
 assert.equal(a.fingerCount,5);
 assert.equal(a.hingeCount,10);
 assert.equal(a.physicallyGrasped,false);
 assert.equal(a.fingerCollisionVerified,false);
 assert.equal(a.bodyBalanceVerified,false);
 assert.ok(a.proximitySamples>100);
 assert.ok(a.fingertipCupDistanceRangeM.max<.26);
 assert.ok(a.maxAngularStepRadians<.22);
 assert.ok(a.closureAtPickup>=.98);
 assert.ok(a.closureAfterDeposit<=.02);
 assert.ok(Math.abs(a.seatedPelvisSurfaceClearanceM)<.03);
 assert.ok(a.standingPelvisSurfaceClearanceM>.05);
 assert.equal(out.motionAudit.physicalContactVerified,false);
});
test('l’acteur masculin original reste compatible et le siège ne traverse plus le bassin grossièrement',()=>{
 const out=buildSyntheticFilmSceneV09(male,generator);
 const a=out.handSeatAudit;
 assert.equal(a.hingeCount,10);
 assert.ok(Math.abs(a.seatedPelvisSurfaceClearanceM)<.03);
 assert.ok(a.maxAngularStepRadians<.22);
 const scene=readSyntheticGLB(out.glb),names=scene.doc.nodes.map(n=>n.name);
 const sit=out.timeline.find(t=>t.intent==='s_asseoir');
 const seat=names.indexOf('chaise_assise'),pelvis=names.indexOf('bassin');
 const pose=sampleSyntheticPose(scene,sit.end);
 const lowerPelvis=pose.world[pelvis].translation[1]-pose.world[pelvis].scale[1];
 const topSeat=pose.world[seat].translation[1]+pose.world[seat].scale[1];
 assert.ok(Math.abs(lowerPelvis-topSeat)<.03);
});
test('l’audit refuse un saut brutal injecté dans une articulation',()=>{
 const result=buildSyntheticFilmSceneV09(female,generator);
 const bytes=result.glb.slice(),doc=readSyntheticGLB(bytes).doc;
 const pivot=doc.nodes.findIndex(n=>n.name==='film_doigt_index_pivot');
 const anim=doc.animations.find(a=>a.name==='film_scene_v03');
 const channel=anim.channels.find(a=>a.target.node===pivot&&a.target.path==='rotation');
 assert.ok(channel);
 const accessor=doc.accessors[anim.samplers[channel.sampler].output];
 const view=doc.bufferViews[accessor.bufferView];
 const binary=20+new DataView(bytes.buffer).getUint32(12,true)+8;
 const at=binary+view.byteOffset+(accessor.byteOffset||0)+
   Math.floor(accessor.count/2)*16;
 const dv=new DataView(bytes.buffer);
 dv.setFloat32(at,1,true);
 dv.setFloat32(at+12,0,true);
 assert.throws(()=>auditFingerAndSeat(bytes,result.timeline),/Saut angulaire/);
});
test('l’audit ne s’exécute pas sur scénario incomplet, références réelles ou fréquence invalide',()=>{
 const blocked=buildSyntheticFilmSceneV09({
  prompt:female,
  references:[{kind:'photo',rightsConfirmed:true,likenessConsent:true}]
 },generator);
 assert.equal(blocked.status,'scenario_seulement');
 assert.equal(blocked.glb,null);
 assert.equal(blocked.handSeatAudit,undefined);
 const good=buildSyntheticFilmSceneV09(female,generator);
 assert.throws(()=>auditFingerAndSeat(good.glb,good.timeline,{sampleHz:300}),/Fréquence/);
});
