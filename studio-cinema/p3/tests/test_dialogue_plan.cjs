const t=require('node:test'),assert=require('node:assert/strict');
const {buildProject}=require('../p1-for-tests.js');const {makeRenderManifest,validateRenderManifest}=require('../p2-for-tests.js');
const {buildDialoguePlan,validateDialoguePlan}=require('../dialogue-plan.js');
function sample(){const p=buildProject({description:'Une femme adulte entre dans un café. Puis elle téléphone à une amie. Film de 6 secondes.',mode:'text'});p.shots=p.shots.slice(0,2);p.shots.forEach(s=>{s.duration_seconds=3});p.shots[0].dialogue='Bonjour.';p.shots[1].dialogue='Allô.';const m=makeRenderManifest(p);return {p,m}}
t('P3 validate normal text-only dialogue plan',()=>{const {p,m}=sample();const d=buildDialoguePlan(p,m);assert.equal(d.lines.length,2);assert.ok(validateDialoguePlan(d,m));assert.equal(d.lines[0].speaker_id,'character_01');assert.equal(d.consent.voice_cloning_allowed,false)});
t('P3 no dialogue is a valid silent plan',()=>{const {p,m}=sample();p.shots.forEach(s=>s.dialogue='');const d=buildDialoguePlan(p,m);assert.equal(d.lines.length,0);assert.ok(validateDialoguePlan(d,m))});
t('P3 refuses stale shot durations',()=>{const {p,m}=sample();p.shots[0].duration_seconds=4;assert.throws(()=>buildDialoguePlan(p,m),/Durée/)});
t('P3 refuses cast tampering',()=>{const {p,m}=sample();p.shots[0].character_ids=[];assert.throws(()=>buildDialoguePlan(p,m),/Personnage/)});
t('P3 requires speaker identity for two-person scenes',()=>{const {p,m}=sample();p.shots[0].character_ids.push('character_02');m.shots[0].character_ids.push('character_02');assert.throws(()=>buildDialoguePlan(p,m),/Choisir/)});
t('P3 accepts explicit speaker identity',()=>{const {p,m}=sample();p.shots[0].character_ids.push('character_02');m.shots[0].character_ids.push('character_02');p.shots[0].dialogue_speaker_id='character_01';const d=buildDialoguePlan(p,m);assert.equal(d.lines[0].speaker_id,'character_01')});
t('P3 refuses dialogue too long for a shot',()=>{const {p,m}=sample();p.shots[0].dialogue='Bonjour '.repeat(18);assert.throws(()=>buildDialoguePlan(p,m),/Allonger/)});
t('P3 forbids fake audio render status',()=>{const {p,m}=sample();const d=buildDialoguePlan(p,m);d.rendered_audio='ready';assert.throws(()=>validateDialoguePlan(d,m),/Faux/)});
t('P3 forbids missing approval safeguards',()=>{const {p,m}=sample();const d=buildDialoguePlan(p,m);d.consent.voice_cloning_allowed=true;assert.throws(()=>validateDialoguePlan(d,m),/Autorisation/)});
t('P3 rejects a voice outside the shot cast',()=>{const {p,m}=sample();const d=buildDialoguePlan(p,m);d.lines[0].speaker_id='character_999';assert.throws(()=>validateDialoguePlan(d,m),/Voix/)});
t('P3 rejects a line spilling over shot boundary',()=>{const {p,m}=sample();const d=buildDialoguePlan(p,m);d.lines[0].end_seconds=7;assert.throws(()=>validateDialoguePlan(d,m),/hors plan/)});
t('P3 refuses duplicate shot ids',()=>{const {p,m}=sample();p.shots[1].id=p.shots[0].id;assert.throws(()=>buildDialoguePlan(p,m),/identité|dupliqués/)});
