import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {radialEllipsoidGap,gripInspectionTime,cameraForGrip,inspectGripSurface}
 from './film-inspection-v10.mjs';
import {buildSyntheticFilmSceneV10} from './film-scene-v10.mjs';
import {readSyntheticGLB,sampleSyntheticPose,projectedObjects} from './film-viewer-v03.mjs';

const prompt="Une femme brune s'assoit dans le salon, boit un café, pose sa tasse, puis parle.";
const matrix=(sx,sy,sz)=>({
 matrix:[sx,0,0,0, 0,sy,0,0, 0,0,sz,0, 0,0,0,1]
});
test('la distance radiale de surface donne 0 sur le sphéroïde et détecte un écart',()=>{
 assert.ok(radialEllipsoidGap([.1,0,0],matrix(.1,.12,.08))<1e-9);
 assert.ok(Math.abs(radialEllipsoidGap([.2,0,0],matrix(.1,.12,.08))-.1)<1e-9);
 assert.ok(Math.abs(radialEllipsoidGap([0,.14,0],matrix(.1,.12,.08))-.02)<1e-9);
 assert.throws(()=>radialEllipsoidGap([0,0,0],matrix(0,.1,.1)),/dégénérée/);
});
test('v0.10 : rapport de surface mesuré depuis le GLB, sans revendiquer de prise physique',()=>{
 const out=buildSyntheticFilmSceneV10(prompt,generator);
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.10');
 assert.equal(out.status,'apercu_partiel_glb_anime');
 const a=out.surfaceAudit;
 assert.equal(a.schema,'retoucheproai.film-grip-surface-audit.v0.10');
 assert.equal(a.physicalGripVerified,false);
 assert.equal(a.collisionVerified,false);
 assert.equal(a.forceOrFrictionSimulated,false);
 assert.equal(a.sampleHz,30);
 assert.ok(a.poseSamples>50&&a.tipSamples===a.poseSamples*5);
 assert.ok(Number.isFinite(a.minRadialSurfaceGapM));
 assert.ok(Number.isFinite(a.meanRadialSurfaceGapM));
 assert.ok(a.maxRadialSurfaceGapM>=a.minRadialSurfaceGapM);
 assert.equal(a.perFinger.length,5);
 assert.ok(out.warnings.some(x=>x.includes('aucun contact physique')));
});
test('la caméra d’inspection se centre sur la vraie position animée de la tasse',()=>{
 const out=buildSyntheticFilmSceneV10(prompt,generator);
 const scene=readSyntheticGLB(out.glb);
 const time=gripInspectionTime(out.timeline);
 const pose=sampleSyntheticPose(scene,time);
 const cup=scene.doc.nodes.findIndex(n=>n.name==='tasse_corps_table');
 assert.ok(cup>=0);
 const focus=cameraForGrip(scene,pose,{yaw:.7,pitch:.12});
 assert.equal(focus.distance,.77);
 assert.equal(focus.yaw,.7);
 assert.ok(Math.abs(focus.target[0]-pose.world[cup].translation[0])<1e-9);
 assert.ok(Math.abs(focus.target[2]-pose.world[cup].translation[2])<1e-9);
 const full=projectedObjects(scene,pose,{width:390,height:290});
 const detail=projectedObjects(scene,pose,{width:390,height:290,...focus});
 const fullCup=full.find(x=>x.name==='tasse_corps_table');
 const detailCup=detail.find(x=>x.name==='tasse_corps_table');
 assert.ok(fullCup&&detailCup);
 assert.ok(detailCup.rx>fullCup.rx*3,'Le gros plan Canvas doit grossir la tasse.');
 assert.ok(Math.abs(detailCup.x-195)<5,'La tasse doit être recentrée.');
});
test('les variations du mouvement gardent le suivi de la tasse dans l’inspection',()=>{
 const out=buildSyntheticFilmSceneV10(prompt,generator),scene=readSyntheticGLB(out.glb);
 const drink=out.timeline.find(x=>x.intent==='boire');
 const a=cameraForGrip(scene,sampleSyntheticPose(scene,drink.start+1),{yaw:.3,pitch:.1});
 const b=cameraForGrip(scene,sampleSyntheticPose(scene,drink.start+1.8),{yaw:.3,pitch:.1});
 assert.ok(a.target.every(Number.isFinite));
 assert.ok(b.target.every(Number.isFinite));
 assert.ok(Math.hypot(...a.target.map((n,i)=>n-b.target[i]))>.015);
});
test('les mauvaises références et les échantillonnages excessifs sont refusés',()=>{
 const out=buildSyntheticFilmSceneV10(prompt,generator);
 assert.throws(()=>inspectGripSurface(out.glb,out.timeline,{sampleHz:300}),/Fréquence/);
 assert.throws(()=>gripInspectionTime([]),/absent/);
 const blocked=buildSyntheticFilmSceneV10({prompt,references:[{kind:'video',rightsConfirmed:true,likenessConsent:true}]},generator);
 assert.equal(blocked.status,'scenario_seulement');
 assert.equal(blocked.surfaceAudit,undefined);
 assert.equal(blocked.glb,null);
});
