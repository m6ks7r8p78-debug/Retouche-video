const test=require('node:test'),assert=require('node:assert/strict');
const {P11Core:c}=require('../p11_ui_core.js');
const task={video_id:'V003',start_s:0,end_s:3,split:'train',scene_group:3};
function dossier(){return {schema:'retouche-cinema-p11-private-review-dossier-v1',tasks:[task],probes:[{video_id:'V003',split:'train',scene_group:3,observations:[]}]}}
test('valid dossier',()=>assert.equal(c.importData(dossier()).tasks.length,1));
test('mismatched video rejected',()=>{let x=dossier();x.probes[0].video_id='V004';assert.throws(()=>c.importData(x))});
test('duplicate dossier rejected',()=>{let x=dossier();x.tasks.push({...task});x.probes.push({...x.probes[0]});assert.throws(()=>c.importData(x))});
test('wrong schema rejected',()=>{let x=dossier();x.schema='other';assert.throws(()=>c.importData(x))});
const base={videoId:'V003',start:1,end:1.3,channel:'levres',phase:'contact',visibility:'observe',note:'test observation',reviewerId:'R1'};
test('valid manual observation',()=>assert.equal(c.addObservation(base).manual,true));
test('bad event time rejected',()=>assert.throws(()=>c.addObservation({...base,start:2,end:1})));
test('wrong channel rejected',()=>assert.throws(()=>c.addObservation({...base,channel:'biometric_identity'})));
test('reviewer required',()=>assert.throws(()=>c.addObservation({...base,reviewerId:''})));
test('no fictitious independent reviewer',()=>{let a=c.addObservation(base),x=c.exportReview({task,reviewerId:'R1',observations:[a]});assert.equal(x.independent_human_review_confirmed,false);assert.equal(x.training_eligible,false)});
test('no private frames exported',()=>{let a=c.addObservation(base),x=c.exportReview({task,reviewerId:'R1',observations:[a]});assert.equal(x.source_pixels_or_audio_exported,false)});
test('mixed reviewers cannot be exported together',()=>{let a=c.addObservation(base);assert.throws(()=>c.exportReview({task,reviewerId:'R2',observations:[a]}))});
