import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {solveSpatialHandTarget,buildSyntheticFilmSceneV17,
 auditCigaretteLipApproach} from './film-ik-v17.mjs';
import {buildSyntheticFilmSceneV16} from './film-actions-v16.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';

const female='Une femme adulte brune fume trois taffes de cigarette dans le salon.';
const left='Un homme adulte fume deux taffes de cigarette de la main gauche.';
const cafe="Une femme brune s'assoit dans le salon, boit un café, pose sa tasse, puis parle.";
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));

test('solveur spatial : limite de portée et entrée invalide refusées',()=>{
 assert.throws(()=>solveSpatialHandTarget({
  shoulder:[.29,1.51,0],target:[12,15,0],upperLength:.41,
  lowerOffset:[0,-.41,0],tipLocal:[.02,-.03,.053],wristAngle:-.22
 }),/hors de portée/);
 assert.throws(()=>solveSpatialHandTarget({
  shoulder:[.29,1.51,0],target:[0,1.7,.17],upperLength:NaN,
  lowerOffset:[0,-.41,0],tipLocal:[.02,-.03,.053],wristAngle:-.22
 }),/invalides/);
});
test('la solution analytique utilise le plan 3D sans allonger les segments du bras',()=>{
 const result=solveSpatialHandTarget({
  shoulder:[.292,1.51,0],target:[0,1.731,.178],
  upperLength:.41,lowerOffset:[0,-.41,0],tipLocal:[.02,-.03,.053],
  wristAngle:-.22,referenceAngles:[-1.14,-2.03]
 });
 assert.ok(result.shoulderYaw>.1&&result.shoulderYaw<1);
 assert.equal(result.shoulderQuaternion.length,4);
 assert.ok(Math.abs(Math.hypot(...result.shoulderQuaternion)-1)<.00001);
 assert.ok(result.geometricReachM<result.armReachMaxM);
 assert.ok(result.geometricReachM>result.armReachMinM);
 assert.equal(result.approachType,'targeted_articulated_3d_not_physical_contact');
});
test('trois inhalations suivent une cible liée à la bouche dans le GLB final',()=>{
 const out=buildSyntheticFilmSceneV17(female,generator);
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.17');
 assert.equal(out.status,'apercu_partiel_glb_anime');
 assert.equal(out.lipAudit.episodes.length,3);
 assert.equal(out.lipAudit.sampleCount,9);
 assert.ok(out.lipAudit.peakApproachGapM<=.022);
 assert.ok(out.lipAudit.peakWristSpeedMps<=5);
 assert.equal(out.lipAudit.exactSurfaceContactVerified,false);
 assert.equal(out.lipAudit.fluidOrCombustionPhysicsVerified,false);
 assert.equal(out.actionAudit.episodesVerified,3);
 assert.equal(out.mediaUploaded,false);
 assert.equal(out.renderedFilm,false);
});
test('le GLB garde une seule cigarette, un filtre et une cible sur la bouche',()=>{
 const out=buildSyntheticFilmSceneV17(female,generator);
 const scene=readSyntheticGLB(out.glb);
 const names=scene.doc.nodes.map(n=>n.name);
 for(const name of ['film_cigarette_filtre_contact','film_bouche_cible','cigarette_tige','cigarette_braise']){
  assert.equal(names.filter(n=>n===name).length,1);
 }
 const wrist=names.indexOf('poignet_droite'),filter=names.indexOf('film_cigarette_filtre_contact'),
  mouth=names.indexOf('bouche_pivot'),target=names.indexOf('film_bouche_cible');
 assert.ok(scene.doc.nodes[wrist].children.includes(filter));
 assert.ok(scene.doc.nodes[mouth].children.includes(target));
 assert.equal(scene.doc.nodes[filter].mesh,undefined);
 assert.equal(scene.doc.nodes[target].mesh,undefined);
 assert.equal(out.retargeting.length,6);
 assert.equal(scene.doc.nodes.filter(n=>n.name==='tasse_unique_mobile').length,0);
});
test('un élément erroné du GLB ne peut pas être validé comme contact',()=>{
 const out=buildSyntheticFilmSceneV17(female,generator);
 const corrupted=out.glb.slice();
 const dv=new DataView(corrupted.buffer,corrupted.byteOffset,corrupted.byteLength);
 const len=dv.getUint32(12,true);
 const raw=new TextDecoder().decode(corrupted.subarray(20,20+len));
 const expected='"name":"film_cigarette_filtre_contact","translation":[0.02,-0.03,0.053]';
 const broken='"name":"film_cigarette_filtre_contact","translation":[3.02,-0.03,0.053]';
 assert.ok(raw.includes(expected));
 assert.equal(expected.length,broken.length);
 corrupted.set(new TextEncoder().encode(raw.replace(expected,broken)),20);
 assert.throws(()=>auditCigaretteLipApproach(corrupted,out.timeline),/manque les lèvres/);
});
test('la cigarette revient à distance de la bouche après chaque cycle',()=>{
 const out=buildSyntheticFilmSceneV17(female,generator);
 const scene=readSyntheticGLB(out.glb);
 const names=scene.doc.nodes.map(n=>n.name),filter=names.indexOf('film_cigarette_filtre_contact'),
  lip=names.indexOf('film_bouche_cible');
 for(const ep of out.timeline){
  const near=sampleSyntheticPose(scene,ep.start+4.8*.48,'film_actions_v16');
  const far=sampleSyntheticPose(scene,ep.end,'film_actions_v16');
  const nearGap=distance(near.world[filter].translation,near.world[lip].translation);
  const farGap=distance(far.world[filter].translation,far.world[lip].translation);
  assert.ok(nearGap<.022,'Filtre proche de la cible au moment de l’inhalation.');
  assert.ok(farGap>nearGap+.05,'La main quitte réellement les lèvres.');
 }
});
test('main gauche : même solveur avec miroir latéral, sans déplacer la cible',()=>{
 const out=buildSyntheticFilmSceneV17(left,generator);
 assert.equal(out.lipAudit.episodes.length,2);
 assert.ok(out.lipAudit.peakApproachGapM<=.022);
 const names=readSyntheticGLB(out.glb).doc.nodes.map(n=>n.name);
 assert.equal(names.filter(n=>n==='film_cigarette_filtre_contact').length,1);
 assert.equal(out.retargeting[0].handSide,'gauche');
});
test('le moteur tasse de v0.15 et le constructeur v0.16 restent inchangés',()=>{
 const cup=buildSyntheticFilmSceneV17(cafe,generator);
 assert.equal(cup.schema,'retoucheproai.film-motion-preview.v0.15');
 assert.equal(cup.lipAudit,undefined);
 const previous=buildSyntheticFilmSceneV16(female,generator);
 assert.equal(previous.schema,'retoucheproai.film-motion-preview.v0.16');
 assert.equal(previous.lipAudit,undefined);
 assert.equal(readSyntheticGLB(previous.glb).doc.nodes.filter(n=>n.name==='film_bouche_cible').length,0);
});
test('référence privée ou demande ambiguë : aucun contact fictif',()=>{
 for(const request of [
  {prompt:female,references:[{kind:'video',rightsConfirmed:true,likenessConsent:true}]},
  'Une femme tient une cigarette dans la main, elle ne fume pas.'
 ]){
  const out=buildSyntheticFilmSceneV17(request,generator);
  assert.equal(out.status,'scenario_seulement');
  assert.equal(out.glb,null);
  assert.equal(out.lipAudit,undefined);
 }
});
