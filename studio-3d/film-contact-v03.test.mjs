import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {buildSyntheticFilmSceneV03,reachCup} from './film-contact-v03.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
const prompt="Une femme brune s'assoit dans le salon, boit un café, pose sa tasse, puis parle.";
const index=(scene,name)=>scene.doc.nodes.findIndex(n=>n.name===name);
test('calcul de portée analytique du bras au moment de saisir la tasse',()=>{
 const r=reachCup(.79);
 assert.ok(Math.abs(r.shoulder)<Math.PI);
 assert.ok(Math.abs(r.elbow)<Math.PI);
 assert.throws(()=>reachCup(.3),/hors de portée/);
});
test('GLB v0.3 contient une seule tasse géométrique persistante avec piste de translation',()=>{
 const out=buildSyntheticFilmSceneV03(prompt,generator);
 assert.equal(out.status,'apercu_partiel_glb_anime');
 assert.equal(out.renderedFilm,false);
 const scene=readSyntheticGLB(out.glb);
 const unique=index(scene,'tasse_unique_mobile');
 assert.ok(unique>0);
 assert.ok(scene.doc.nodes[unique].children.length>1);
 assert.deepEqual(scene.doc.nodes[index(scene,'tasse_sur_table_groupe')].children,[]);
 assert.deepEqual(scene.doc.nodes[index(scene,'tasse_en_main_groupe')].children,[]);
 assert.ok(scene.clips[0].tracks.some(t=>t.node===unique&&t.path==='translation'));
 assert.equal(scene.clips[0].name,'film_scene_v03');
});
test('mesure des positions de la tasse et du point de prise à 20 Hz',()=>{
 const out=buildSyntheticFilmSceneV03(prompt,generator);
 assert.ok(out.contactAudit.sampleCount>35);
 assert.equal(out.contactAudit.actualCollisionVerified,false);
 assert.ok(Number.isFinite(out.contactAudit.maxGapMeters));
 assert.ok(out.contactAudit.maxGapMeters<.18);
 const scene=readSyntheticGLB(out.glb);
 const cup=index(scene,'tasse_unique_mobile');
 const hand=index(scene,'tasse_en_main_groupe');
 const pick=out.timeline.find(x=>x.intent==='boire').start+.90;
 const place=out.timeline.find(x=>x.intent==='poser_objet').start+.55;
 for(const t of [pick,place]){
  const pose=sampleSyntheticPose(scene,t);
  const distance=Math.hypot(...pose.world[hand].translation.map((v,i)=>v-pose.world[cup].translation[i]));
  assert.ok(distance<.02,'ancrage au raccord '+t+' : '+distance);
 }
});
test('ne revendique aucune physique ni vidéo et conserve la protection des références réelles',()=>{
 const o=buildSyntheticFilmSceneV03(prompt,generator);
 assert.ok(o.warnings.some(s=>s.includes('collisions non prouvés')));
 assert.equal(o.mediaUploaded,false);
 assert.equal(o.photorealistic,false);
 assert.equal(o.containsAudio,false);
 const blocked=buildSyntheticFilmSceneV03({
  prompt,references:[{kind:'video',rightsConfirmed:true,likenessConsent:true}]
 },generator);
 assert.equal(blocked.status,'scenario_seulement');
 assert.equal(blocked.glb,null);
});

test('la géométrie de prise s’adapte aussi à un personnage masculin adulte',()=>{
 const out=buildSyntheticFilmSceneV03(
  "Un homme brun s'assoit dans un salon, boit du thé, pose sa tasse, puis parle.",generator);
 const scene=readSyntheticGLB(out.glb);
 const cup=index(scene,'tasse_unique_mobile');
 const hand=index(scene,'tasse_en_main_groupe');
 const at=out.timeline.find(x=>x.intent==='boire').start+.90;
 const pose=sampleSyntheticPose(scene,at);
 const delta=Math.hypot(...pose.world[hand].translation.map((v,i)=>v-pose.world[cup].translation[i]));
 assert.ok(delta<.02);
 assert.equal(out.photorealistic,false);
});
