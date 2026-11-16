import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {sampleDirections,ellipsoid,surfacePoint,signedRadialGap,
 compareSampledEllipsoids,auditFingerVolumes,buildSyntheticFilmSceneV12}
 from './film-volume-v12.mjs';
import {buildSyntheticFilmSceneV11} from './film-grip-v11.mjs';
import {readSyntheticGLB} from './film-viewer-v03.mjs';

const female="Une femme brune s'assoit dans le salon, boit un café, pose sa tasse, puis parle.";
const male="Un homme brun s'assoit, boit du thé, pose sa tasse, puis parle.";
function shape(radius,center=[0,0,0]){
 return ellipsoid([radius,0,0,0,0,radius,0,0,0,0,radius,0,...center,1]);
}
test('sphères élémentaires : profondeur connue, contact tangent et absence de collision',()=>{
 const a=shape(.1),overlap=shape(.1,[.15,0,0]);
 const t=compareSampledEllipsoids(a,overlap);
 assert.ok(Math.abs(t.maxSampledPenetrationM-.05)<.00001);
 assert.ok(t.insideSurfaceSamples>0);
 assert.ok(compareSampledEllipsoids(a,shape(.1,[.2,0,0])).maxSampledPenetrationM<.00001);
 assert.equal(compareSampledEllipsoids(a,shape(.1,[.5,0,0])).maxSampledPenetrationM,0);
});
test('le test volumique couvre des surfaces, non uniquement le centre des doigts',()=>{
 const a=shape(.04),b=shape(.04,[.063,0,0]);
 assert.ok(compareSampledEllipsoids(a,b).maxSampledPenetrationM>.015);
 assert.ok(signedRadialGap([0,0,0],a)<0);
 assert.ok(Math.abs(signedRadialGap([.04,0,0],a))<1e-8);
 assert.deepEqual(surfacePoint(a,[1,0,0]),[.04,0,0]);
 assert.equal(sampleDirections().length,38);
});
test('volumes hors limites ou transformées dégénérées : refus',()=>{
 assert.throws(()=>sampleDirections(5),/Précision/);
 assert.throws(()=>ellipsoid(new Array(16).fill(0)),/dégénéré/);
 assert.throws(()=>surfacePoint(shape(.1),[.7,.7,0]),/non normalisée/);
 assert.throws(()=>signedRadialGap([0,NaN,0],shape(.1)),/invalide/);
});
test('v0.12 : l’audit final mesure paume, dix phalanges, tasse et douze segments',()=>{
 const out=buildSyntheticFilmSceneV12(female,generator);
 assert.equal(out.status,'apercu_partiel_glb_anime');
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.12');
 const a=out.volumeAudit;
 assert.equal(a.schema,'retoucheproai.film-volume-overlap-audit.v0.12');
 assert.equal(a.exactTriangleCollisionVerified,false);
 assert.equal(a.physicsOrGripForceSimulated,false);
 assert.equal(a.sampleDirectionsPerEllipsoid,38);
 assert.equal(a.shapeCount,11);
 assert.equal(a.ringSegmentCount,12);
 assert.ok(a.poseSamples>20);
 assert.equal(a.volumes.length,11);
 assert.equal(a.volumes[0].name,'paume');
 assert.equal(a.maxSampledPalmCupPenetrationM,0);
 assert.ok(a.maxSampledCupPenetrationM<.012);
 assert.ok(a.maxSampledHandlePenetrationM<.035);
 assert.equal(a.handlePairComparisons,a.poseSamples*11*12);
 assert.equal(out.handleAudit.physicalContactVerified,false);
 assert.equal(out.mediaUploaded,false);
 assert.equal(out.renderedFilm,false);
 const scene=readSyntheticGLB(out.glb);
 assert.equal(scene.doc.nodes.filter(n=>n.name==='tasse_unique_mobile').length,1);
});
test('l’ancien défaut massif de paume dans la tasse est désormais détecté et refusé',()=>{
 const old=buildSyntheticFilmSceneV11(female,generator);
 assert.throws(()=>auditFingerVolumes(old.glb,old.timeline),/Chevauchement volumique paume/);
 const fixed=buildSyntheticFilmSceneV12(female,generator);
 const originalPalm=readSyntheticGLB(old.glb).doc.nodes.find(n=>n.name==='main_droite');
 const correctedPalm=readSyntheticGLB(fixed.glb).doc.nodes.find(n=>n.name==='main_droite');
 assert.ok(correctedPalm.translation[0]>originalPalm.translation[0]+.1);
 assert.ok(correctedPalm.scale[0]<originalPalm.scale[0]);
});
test('le pilote fonctionne avec un avatar masculin synthétique, sans photos',()=>{
 const out=buildSyntheticFilmSceneV12(male,generator);
 assert.ok(out.volumeAudit.maxSampledPalmCupPenetrationM<=.003);
 assert.ok(out.volumeAudit.maxSampledCupPenetrationM<=.012);
 assert.ok(out.volumeAudit.maxSampledHandlePenetrationM<=.035);
});
test('les références réelles ne produisent ni GLB ni mesure privée',()=>{
 const out=buildSyntheticFilmSceneV12({
  prompt:female,references:[{kind:'video',rightsConfirmed:true,likenessConsent:true}]
 },generator);
 assert.equal(out.status,'scenario_seulement');
 assert.equal(out.glb,null);
 assert.equal(out.volumeAudit,undefined);
 const good=buildSyntheticFilmSceneV12(female,generator);
 assert.throws(()=>auditFingerVolumes(good.glb,good.timeline,{sampleHz:60}),/Cadence/);
 assert.throws(()=>auditFingerVolumes(good.glb,[]),/Chronologie/);
});
test('injection GLB : replacer la paume en profondeur dans la tasse doit être rejeté',()=>{
 const out=buildSyntheticFilmSceneV12(female,generator);
 const bytes=out.glb.slice(),jsonLength=new DataView(bytes.buffer).getUint32(12,true);
 const source=new TextDecoder().decode(bytes.subarray(20,20+jsonLength));
 const before='"name":"main_droite","translation":[0.15,';
 const after='"name":"main_droite","translation":[0.00,';
 assert.ok(source.includes(before),'Ancrage de paume GLB attendu');
 assert.equal(before.length,after.length);
 const changed=source.replace(before,after);
 bytes.set(new TextEncoder().encode(changed),20);
 assert.throws(()=>auditFingerVolumes(bytes,out.timeline),/Chevauchement volumique paume/);
});
