import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import {compileActionPlanV16} from './film-action-plan-v16.mjs';
import {buildSyntheticFilmSceneV16,auditRepeatedSmoking} from './film-actions-v16.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';

const request='Une femme adulte brune fume trois taffes de cigarette dans le salon.';
const cup="Une femme brune s'assoit dans le salon, boit un café, pose sa tasse, puis parle.";

test('planificateur : reconnaît trois répétitions et les phases à exécuter',()=>{
 const p=compileActionPlanV16(request);
 assert.equal(p.eligible,true);
 assert.equal(p.repetitionCount,3);
 assert.equal(p.episodes.length,3);
 assert.deepEqual(p.episodes.map(x=>x.repeatIndex),[1,2,3]);
 assert.equal(p.episodes[0].resource,'cigarette_unique');
 assert.equal(p.episodes[0].phaseLabels.length,4);
 assert.equal(p.source,'analyse textuelle locale heuristique');
 assert.equal(p.mediaUploaded,false);
});
test('comptes français et numériques : un à cinq cycles, jamais de sixième imaginé',()=>{
 for(const [text,count] of [['une femme fume une taffe',1],
  ['une femme fume deux taffes',2],['une femme fume 3 taffes',3],
  ['une femme fume quatre bouffées',4],['une femme fume 5 puffs',5]]){
  const plan=compileActionPlanV16(text);
  assert.equal(plan.eligible,true,text);
  assert.equal(plan.repetitionCount,count,text);
 }
 assert.throws(()=>compileActionPlanV16('une femme fume 6 taffes'),/une à cinq/);
 assert.throws(()=>compileActionPlanV16('une femme fume 2 taffes puis 3 taffes'),/contradictoire/);
});
test('une cigarette tenue sans fumer ne déclenche aucun geste inventé',()=>{
 for(const prompt of [
  'Une femme tient une cigarette dans sa main, sans fumer.',
  'Une femme tient une cigarette dans la main, elle ne fume pas.',
  'Une femme regarde une cigarette posée sur la table.'
 ]){
  const plan=compileActionPlanV16(prompt);
  assert.equal(plan.eligible,false,prompt);
  const output=buildSyntheticFilmSceneV16(prompt,generator);
  assert.equal(output.status,'scenario_seulement',prompt);
  assert.equal(output.glb,null);
 }
});
test('le pilote refuse les mélanges non synchronisés et les références privées',()=>{
 const mixed=buildSyntheticFilmSceneV16('Une femme boit du café puis fume trois taffes',generator);
 assert.equal(mixed.status,'scenario_seulement');
 assert.equal(mixed.glb,null);
 assert.match(mixed.reason,/mixte/);
 const privateMedia=buildSyntheticFilmSceneV16({prompt:request,
  references:[{kind:'video',rightsConfirmed:true,likenessConsent:true}]},generator);
 assert.equal(privateMedia.status,'scenario_seulement');
 assert.equal(privateMedia.mediaUploaded,false);
 assert.equal(privateMedia.glb,null);
});
test('un scénario de boisson déjà valide reste sur le moteur de tasse v0.15',()=>{
 const out=buildSyntheticFilmSceneV16(cup,generator);
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.15');
 assert.equal(out.status,'apercu_partiel_glb_anime');
 assert.equal(out.actionAudit,undefined);
 assert.equal(out.mediaUploaded,false);
});
test('trois cycles produisent UN GLB animé, UNE cigarette et une fumée répétée',()=>{
 const out=buildSyntheticFilmSceneV16(request,generator);
 assert.equal(out.schema,'retoucheproai.film-motion-preview.v0.16');
 assert.equal(out.status,'apercu_partiel_glb_anime');
 assert.equal(out.actionAudit.episodesVerified,3);
 assert.equal(out.actionAudit.cigaretteCount,1);
 assert.equal(out.renderedFilm,false);
 assert.equal(out.mediaUploaded,false);
 assert.equal(out.containsAudio,false);
 const scene=readSyntheticGLB(out.glb);
 assert.equal(scene.clips.length,1);
 assert.equal(scene.clips[0].name,'film_actions_v16');
 assert.equal(scene.doc.nodes.filter(x=>x.name==='cigarette_tige').length,1);
 assert.equal(scene.doc.nodes.filter(x=>x.name==='fumee_volute_1').length,1);
 assert.equal(out.timeline.length,3);
 assert.ok(out.duration>10&&out.duration<20);
 assert.ok(scene.clips[0].tracks.length>=6);
});
test('trois gestes sont séparés, chronologiques, et chaque inspiration modifie les poses',()=>{
 const out=buildSyntheticFilmSceneV16(request,generator),scene=readSyntheticGLB(out.glb);
 assert.deepEqual(out.timeline.map(x=>x.order),[1,2,3]);
 const ids=scene.doc.nodes.map(n=>n.name),wrist=ids.indexOf('poignet_droite'),
  puff=ids.indexOf('fumee_volute_1');
 for(let i=0;i<out.timeline.length;i++){
  const phase=out.timeline[i];
  assert.equal(phase.phases.length,4);
  if(i>0)assert.ok(phase.start>out.timeline[i-1].end);
  const atStart=sampleSyntheticPose(scene,phase.start,'film_actions_v16'),
   inhaling=sampleSyntheticPose(scene,phase.start+2.2,'film_actions_v16'),
   exhaling=sampleSyntheticPose(scene,phase.start+3.75,'film_actions_v16'),
   ending=sampleSyntheticPose(scene,phase.end,'film_actions_v16');
  const diff=Math.hypot(...atStart.world[wrist].translation.map((v,k)=>
   v-inhaling.world[wrist].translation[k]));
  assert.ok(diff>.04);
  assert.ok(exhaling.world[puff].scale[0]>.03);
  assert.ok(ending.world[puff].scale[0]<.003);
  assert.ok(Math.abs(ending.world[wrist].translation[1]-atStart.world[wrist].translation[1])<.004);
 }
});
test('l’audit fournit des distances honnêtes sans déclarer le contact des lèvres',()=>{
 const out=buildSyntheticFilmSceneV16(request,generator);
 const a=auditRepeatedSmoking(out.glb,out.timeline);
 assert.equal(a.episodesVerified,3);
 assert.equal(a.lipContactVerified,false);
 assert.equal(a.combustionSimulation,false);
 assert.equal(a.fullyNaturalMovementVerified,false);
 assert.equal(a.findings.length,3);
 assert.ok(a.findings.every(f=>Number.isFinite(f.mouthToCigaretteTipDistanceM)));
 assert.ok(a.findings.every(f=>f.smokePeakScale>.025&&f.wristReturnGapM<.004));
});
test('un seul cycle reste autonome et un autre genre de personnage est pris en charge',()=>{
 const out=buildSyntheticFilmSceneV16('Un homme adulte fume une taffe de cigarette',generator);
 assert.equal(out.status,'apercu_partiel_glb_anime');
 assert.equal(out.actionAudit.episodesVerified,1);
 assert.equal(out.timeline.length,1);
});
test('la lecture refuse une chronologie d’audit dont un cycle est omis',()=>{
 const out=buildSyntheticFilmSceneV16(request,generator);
 assert.throws(()=>auditRepeatedSmoking(out.glb,[{start:1,end:0,order:1}]),
  /conformes|Cycle/);
});
