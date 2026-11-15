import test from 'node:test';
import assert from 'node:assert/strict';
import { planFilm } from './film-project-v01.mjs';
const prompt='Une femme brune assise dans son salon boit un café, puis pose sa tasse. Un homme entre et ils ont une conversation.';
test('extraction chronologique des intentions et non-rendu',()=>{
 const p=planFilm(prompt);
 assert.deepEqual(p.scenes[0].steps.map(s=>s.intent),['s_asseoir','boire','poser_objet','entrer','parler']);
 assert.equal(p.renderAvailable,false);
 assert.equal(p.mediaUploaded,false);
 assert.equal(p.characters.length,2);
});
test('accord apparence nécessaire pour une personne réelle',()=>{
 assert.throws(()=>planFilm({prompt,references:[{kind:'photo',rightsConfirmed:true}]}),/accord de reproduction/);
});
test('droits sur le média nécessaires',()=>{
 assert.throws(()=>planFilm({prompt,references:[{kind:'video',rightsConfirmed:false,likenessConsent:true}]}),/droits d'utilisation/);
});
test('accord de voix distinct',()=>{
 assert.throws(()=>planFilm({prompt,references:[{kind:'video',rightsConfirmed:true,likenessConsent:true,cloneVoice:true}]}),/consentement vocal/);
});
test('une référence autorisée reste seulement déclarative',()=>{
 const p=planFilm({prompt,references:[{kind:'photo',rightsConfirmed:true,likenessConsent:true}]});
 assert.equal(p.references.length,1);
 assert.equal(p.mediaUploaded,false);
});
test('ne pas confondre négation et geste fumer',()=>{
 assert.equal(planFilm('Une femme ne fume pas dans un salon.').scenes[0].steps.some(s=>s.intent==='fumer'),false);
});
test('deux scènes explicitement séparées',()=>{
 const p=planFilm('Une femme marche dans la rue.\n\nUn homme entre dans un salon.');
 assert.equal(p.scenes.length,2);
 assert.equal(p.scenes[1].setting,'salon');
});
test('prototype personnages adultes seulement',()=>{
 assert.throws(()=>planFilm('Un enfant joue dans la rue.'),/personnages adultes/);
});
