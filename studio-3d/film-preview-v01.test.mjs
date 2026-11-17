import test from 'node:test';
import assert from 'node:assert/strict';
import generator from './generateur.js';
import { buildSyntheticActorPreview } from './film-preview-v01.mjs';

test('un seul personnage original permet un véritable GLB procédural',()=>{
 const p=buildSyntheticActorPreview('Une femme blonde marche dans la rue et sourit.',generator);
 assert.equal(p.status,'apercu_glb_synthetique');
 assert.ok(p.glb instanceof Uint8Array);
 assert.equal(String.fromCharCode(...p.glb.slice(0,4)),'glTF');
 assert.ok(p.glb.byteLength>200);
 assert.equal(p.renderedFilm,false);
 assert.equal(p.generatedModel.photorealistic,false);
});
test('une scène à deux personnages refuse le faux rendu complet',()=>{
 const p=buildSyntheticActorPreview('Une femme parle avec un homme dans le salon.',generator);
 assert.equal(p.status,'scenario_seulement');
 assert.equal(p.glb,null);
});
test('une photo de référence ne devient pas un modèle réel par magie',()=>{
 const p=buildSyntheticActorPreview({prompt:'Une femme marche.',references:[{kind:'photo',rightsConfirmed:true,likenessConsent:true}]},generator);
 assert.equal(p.status,'scenario_seulement');
 assert.equal(p.mediaUploaded,false);
});
test('gestes non animés signalés explicitement',()=>{
 const p=buildSyntheticActorPreview('Une femme boit un café dans son salon.',generator);
 assert.equal(p.status,'apercu_glb_synthetique');
 assert.ok(p.pendingActions.includes('boire'));
 assert.equal(p.renderedFilm,false);
});
