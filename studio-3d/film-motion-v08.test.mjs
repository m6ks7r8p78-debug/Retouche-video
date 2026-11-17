import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {buildSyntheticFilmSceneV08,auditCupMovement} from './film-motion-v08.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';

const coffee="Une femme brune s'assoit dans le salon, boit un café, pose sa tasse, puis parle.";
const tea="Un homme brun s'assoit, boit du thé, pose sa tasse, puis parle.";
const index=(scene,name)=>scene.doc.nodes.findIndex(n=>n.name===name);
test('v0.8: audit indépendant à 120 Hz des transferts d’une tasse persistante',()=>{
 const result=buildSyntheticFilmSceneV08(coffee,generator);
 assert.equal(result.status,'apercu_partiel_glb_anime');
 assert.equal(result.schema,'retoucheproai.film-motion-preview.v0.8');
 const m=result.motionAudit;
 assert.equal(m.schema,'retoucheproai.film-motion-audit.v0.8');
 assert.equal(m.synthetic,true);
 assert.equal(m.physicalContactVerified,false);
 assert.equal(m.fingerCollisionVerified,false);
 assert.equal(m.transfers.length,2);
 assert.ok(m.framesAudited>1000);
 assert.ok(m.maxGripGapM<=.025);
 assert.ok(m.maxSpeedMps<=6);
 assert.ok(m.initialFinalCupGapM<.025);
 assert.ok(m.transfers.every(x=>x.displacementAcross10msM<.04));
});
test('inclinaison douce du récipient pendant boire, verticale sur la table',()=>{
 const result=buildSyntheticFilmSceneV08(coffee,generator);
 const scene=readSyntheticGLB(result.glb);
 const cup=index(scene,'tasse_unique_mobile');
 const orientation=scene.clips.find(c=>c.name==='film_scene_v03').tracks
   .find(t=>t.node===cup&&t.path==='rotation');
 assert.ok(orientation&&orientation.values.length>40);
 const drinking=result.timeline.find(t=>t.intent==='boire');
 const get=t=>{
  const q=sampleSyntheticPose(scene,t).world[cup].rotation;
  return Math.abs(2*Math.atan2(q[0],q[3]));
 };
 assert.ok(get(drinking.start+.2)<.005);
 assert.ok(get(drinking.start+1.7)>.13);
 assert.ok(get(drinking.end)<.005);
 assert.ok(get(result.duration)<.005);
});
test('le contrôle couvre aussi un personnage masculin adulte stylisé',()=>{
 const result=buildSyntheticFilmSceneV08(tea,generator);
 assert.equal(result.motionAudit.transfers.length,2);
 assert.equal(result.motionAudit.physicalContactVerified,false);
 assert.equal(result.mediaUploaded,false);
 assert.equal(result.renderedFilm,false);
});
test('le refus de scénario ne génère aucun audit trompeur',()=>{
 const out=buildSyntheticFilmSceneV08({prompt:coffee,references:[{kind:'video',rightsConfirmed:true,likenessConsent:true}]},generator);
 assert.equal(out.status,'scenario_seulement');
 assert.equal(out.glb,null);
 assert.equal(out.motionAudit,undefined);
});
test('injection d’un téléport dans les échantillons GLB : rejet contrôlé',()=>{
 const out=buildSyntheticFilmSceneV08(coffee,generator);
 const glb=out.glb.slice(),doc=readSyntheticGLB(glb).doc;
 const cup=doc.nodes.findIndex(n=>n.name==='tasse_unique_mobile');
 const anim=doc.animations.find(a=>a.name==='film_scene_v03');
 const channel=anim.channels.find(c=>c.target.node===cup&&c.target.path==='translation');
 assert.ok(channel);
 const acc=doc.accessors[anim.samplers[channel.sampler].output];
 const view=doc.bufferViews[acc.bufferView];
 const dv=new DataView(glb.buffer,glb.byteOffset,glb.byteLength);
 const binary=20+dv.getUint32(12,true)+8,mid=Math.floor(acc.count/2);
 dv.setFloat32(binary+view.byteOffset+(acc.byteOffset||0)+mid*12,100,true);
 assert.throws(()=>auditCupMovement(glb,out.timeline),/trop rapide|saut/);
});
test('l’audit interdit les fréquences extrêmes et les métadonnées absentes',()=>{
 const out=buildSyntheticFilmSceneV08(coffee,generator);
 assert.throws(()=>auditCupMovement(out.glb,out.timeline,{sampleHz:15}),/Échantillonnage/);
 assert.throws(()=>auditCupMovement(out.glb,[]),/Chronologie/);
});
