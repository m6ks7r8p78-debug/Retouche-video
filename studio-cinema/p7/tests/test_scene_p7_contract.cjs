const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');const test=require('node:test');
const {evaluateP7}=require('../scene_p7_contract.js');
const sample=JSON.parse(fs.readFileSync(path.join(__dirname,'..','annotations_fictives.json'),'utf8'));
function clone(){return structuredClone(sample)}
test('P7 honest review of synthetic source',()=>{const r=evaluateP7(clone());assert.equal(r.status,'review_required');assert.ok(r.reasons.includes('cheek_inhalation_not_demonstrated'))});
test('P7 no training/biometric claims',()=>{const r=evaluateP7(clone());assert.equal(r.identity_verified,false);assert.equal(r.training_on_private_videos,false)});
test('early smoke is flagged',()=>{const d=clone();d.keyframes[5].smoke='mouth_plume';d.keyframes[5].smoke_xy=[.53,.55];assert.ok(evaluateP7(d).reasons.includes('mouth_smoke_before_exhale'))});
test('lip contact mismatch is flagged',()=>{const d=clone();d.keyframes[5].filter_xy=[.1,.1];assert.ok(evaluateP7(d).reasons.includes('filter_lip_contact_spatial_mismatch'))});
test('gaze mismatch is flagged',()=>{const d=clone();d.keyframes.forEach(f=>f.gaze_camera=false);assert.ok(evaluateP7(d).reasons.includes('camera_gaze_not_sustained'))});
test('no real identity / private input allowed',()=>{const d=clone();d.source_type='private_video';assert.throws(()=>evaluateP7(d))});
test('invalid point rejected',()=>{const d=clone();d.keyframes[0].filter_xy=[2,-2];assert.throws(()=>evaluateP7(d))});
test('temporal durations preserved',()=>assert.equal(evaluateP7(clone()).total_duration_s,6.93));
