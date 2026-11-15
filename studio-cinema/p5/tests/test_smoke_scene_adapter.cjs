'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const path=require('node:path');
const P2=require(path.resolve(__dirname,'../../p2/cinema-render-plan.js'));
const P5=require('../smoke_scene_adapter.js');
const project={schema_version:'cinema-p1.0',mode:'text',has_rights_confirmed:true,format:'16:9',
  characters:[{id:'character_01',description:'femme adulte fictive en veste sombre',identity_source:'fictional'}],
  props:[{id:'cigarette_01',label:'cigarette unique'}],
  shots:[{id:'shot_01',action:'Une femme adulte fictive fume en regardant par la fenêtre.',duration_seconds:8,
    dialogue:'',location:'salon',camera:'plan moyen',character_ids:['character_01'],prop_ids:['cigarette_01']}]};
const plan=()=>P2.makeRenderManifest(project,{maxClipSeconds:4});
const apply=(p=plan(),o={shotIds:['shot_01'],adultFictionalConfirmed:true})=>P5.augmentSmokeManifest(p,o);
test('public fictional choreography is P2 schema valid',()=>assert.equal(P2.validateRenderManifest(apply()),true));
test('instructions include cigarette, mouth, exhale and drift',()=>{const p=apply(); assert.match(p.clips[0].prompt,/index et majeur/);assert.match(p.clips[0].prompt,/bouche/);assert.match(p.clips[0].prompt,/fumée/)});
test('never enables remote engine',()=>{const p=apply(); assert.equal(p.model_engine,'not_connected');assert.equal(p.consent.remote_transfer_approved,false)});
test('clip seed remains identical',()=>assert.equal(apply().clips[0].seed,plan().clips[0].seed));
test('does not modify input',()=>{const p=plan(),b=JSON.stringify(p);apply(p);assert.equal(JSON.stringify(p),b)});
test('stable outputs deterministic',()=>assert.deepEqual(apply(),apply()));
test('must confirm fictional adult',()=>assert.throws(()=>apply(plan(),{shotIds:['shot_01']})));
test('cannot use unknown shot',()=>assert.throws(()=>apply(plan(),{shotIds:['shot_02'],adultFictionalConfirmed:true})));
test('duplicate shot rejected',()=>assert.throws(()=>apply(plan(),{shotIds:['shot_01','shot_01'],adultFictionalConfirmed:true})));
test('real person is rejected',()=>{const p=plan();p.characters[0].fictional=false;assert.throws(()=>apply(p))});
test('remote consent tampering rejected',()=>{const p=plan();p.consent.remote_transfer_approved=true;assert.throws(()=>apply(p))});
test('reference media tampering rejected',()=>{const p=plan();p.consent.reference_media_included=true;assert.throws(()=>apply(p))});
test('cannot rewrite rendered clip',()=>{const p=plan();p.clips[0].status='completed';assert.throws(()=>apply(p))});
test('invalid schema rejected',()=>{const p=plan();p.schema_version='unexpected';assert.throws(()=>apply(p))});
test('no impossible accuracy claim',()=>assert.ok(!P5.rules.join(' ').includes('garantie de réalisme')));
