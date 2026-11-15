'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P20 = require('../p20_temporal_evidence.js');

// Entirely fictional, synthetic numeric tests: no private media and no file names in reports.
function fixture() {
  const fps = 60;
  const frames = Array.from({length:480}, (_,i) => ({
    t: +(i/fps).toFixed(7), generated_control_pose:true,pixel_frame_generated:false,
    blink:i>=90&&i<99, gaze_camera:true,
    lip_contact:i>=93&&i<210, mouth_smoke:i>=306&&i<411
  }));
  return {schema:'retouche-cinema-p19-procedural-micromotion-v1',source:'fictional_synthetic_no_person',
    privately_trained:false,source_video_accessed:false,photographic_frames_generated:0,
    fps,duration_s:8,sample_count:480,frames};
}
const fakeP15 = {validateProject:d=>d};
function ev(label, channel, start_s, end_s, extra={}) {
 return {label,channel,start_s,end_s,evidence:'visible',review_status:'adjudicated',
   annotator_id:'a',reviewed_by:['a','b'],...extra};
}
function doc(events) { return {source_type:'private_authorized_video',media_scope:'private_local',allow_network:false,
 export_media:false,ready_for_training:false,file_name:'PRIVATE_FILENAME_NEVER_EMIT.mov',events}; }
const run=(events,opts={})=>P20.compare(doc(events),fixture(),fakeP15,{localEvaluationAllowed:true,...opts});

test('P19 synthetic provenance and timestamps accepted',()=>assert.equal(P20.validateGenerated(fixture()).frames.length,480));
test('photographic frame claims are rejected',()=>{const x=fixture();x.photographic_frames_generated=480;assert.throws(()=>P20.validateGenerated(x),/provenance/)});
test('altered generated frames are rejected',()=>{const x=fixture();x.frames[44].pixel_frame_generated=true;assert.throws(()=>P20.validateGenerated(x),/provenance/)});
test('unsupported timestamps rejected',()=>{const x=fixture();x.frames[44].t=20;assert.throws(()=>P20.validateGenerated(x),/timing/)});
test('no comparison runs without caller local authorization',()=>assert.throws(()=>P20.compare(doc([]),fixture(),fakeP15),/authorization/));
test('cannot accept external or exportable source scope',()=>assert.throws(()=>P20.compare({...doc([]),allow_network:true},fixture(),fakeP15,{localEvaluationAllowed:true}),/Local-only/));
test('timeline bins P19 blink intervals',()=>assert.deepEqual(P20.intervals(fixture(),'blink'),[{start_s:1.5,end_s:1.65}]));
test('gaze camera is an uninterrupted procedural state, not measured attention',()=>assert.deepEqual(P20.intervals(fixture(),'gaze_camera'),[{start_s:0,end_s:8}]));
test('one-to-one temporal overlap stays candidate-only',()=>{const r=run([ev('lip_seal_on_filter','lips',1.55,3.45)]);assert.equal(r.coverage[0].temporal_overlaps,1);assert.equal(r.status,'human_review_required');assert.equal(r.human_naturalness_verified,false)});
test('non-matching annotated time remains unverified',()=>{const r=run([ev('lip_seal_on_filter','lips',6,7)]);assert.equal(r.coverage[0].temporal_overlaps,0)});
test('manual offset shifts annotation without modifying generated commands',()=>{let a=run([ev('blink','face',1.1,1.22)]);let b=run([ev('blink','face',1.1,1.22)],{alignmentOffsetS:.4});assert.equal(a.coverage[0].temporal_overlaps,0);assert.equal(b.coverage[0].temporal_overlaps,1)});
test('P15 lip licking is flagged as absent P19 control',()=>{let r=run([ev('lip_lick_lower','lips',5,5.3)]);assert.equal(r.missing_controls[0].label,'lip_lick_lower')});
test('P15 lip biting is flagged as absent P19 control',()=>{let r=run([ev('lower_lip_bite','lips',4.2,4.5)]);assert.equal(r.missing_controls[0].reason,'no_equivalent_p19_control')});
test('uncertain and unreviewed behavior cannot become comparison evidence',()=>{let r=run([ev('blink','face',1.5,1.6,{evidence:'uncertain'}),ev('gaze_camera','face',0,7,{review_status:'review_1'})]);assert.equal(r.adjudicated_visible_events,0);assert.equal(r.excluded_unadjudicated_or_uncertain_events,2)});
test('no filename, note, reviewer, landmarks or footage exported in report',()=>{let r=run([ev('blink','face',1.5,1.6,{notes:'secret phrase',xy:[.5,.5]})]);let str=JSON.stringify(r);for(const secret of ['PRIVATE_FILENAME_NEVER_EMIT','secret phrase','annotator_id','reviewed_by','"xy"'])assert.ok(!str.includes(secret),secret);assert.equal(r.network_used,false);assert.equal(r.training_authorized_by_this_comparison,false)});
test('rejected alignment exceeds manual range',()=>assert.throws(()=>run([],{alignmentOffsetS:4}),/alignment/));
test('unavailable SmallMotion is not fabricated',()=>assert.equal(P20.inspectSmallMotion(null).status,'not_connected'));
test('two-frame SmallMotion candidate cannot infer lip, contact or 3D',()=>{let s=P20.inspectSmallMotion({provenance:'smallmotion_local_2frame_v1',status:'local_motion_candidate',action:'no_automatic_change',frames:2,candidates:[{box:[1,2,10,12],support:5}]});assert.equal(s.status,'2d_motion_candidate_only');assert.deepEqual(s.semantic_events,[]);assert.equal(s.contact_verified,false);assert.equal(s['3d_verified'],false)});
test('SmallMotion cannot be promoted to intentional automatic edits',()=>assert.throws(()=>P20.inspectSmallMotion({provenance:'smallmotion_local_2frame_v1',status:'local_motion_candidate',action:'edit',frames:2,candidates:[{}]}),/Untrusted/));
test('SmallMotion status rejects unknown and incomplete candidate',()=>{assert.throws(()=>P20.inspectSmallMotion({provenance:'smallmotion_local_2frame_v1',status:'invented_intent',action:'no_automatic_change'}));assert.throws(()=>P20.inspectSmallMotion({provenance:'smallmotion_local_2frame_v1',status:'local_motion_candidate',action:'no_automatic_change',frames:1,candidates:[]}))});

// In GitHub Actions these use the real checked-in P15 and P19 implementation.
// Locally the standalone unit tests above work without a complete repository checkout.
const p15Path=path.resolve(__dirname,'../../p15/behavior_ontology.js');
const p19Path=path.resolve(__dirname,'../../p19/src/p19_micro_motion_generator.js');
test('real P15 annotation validator + real P19 480 frames integration',
  {skip:!(fs.existsSync(p15Path)&&fs.existsSync(p19Path))},()=>{
  const P15=require(p15Path),P19=require(p19Path);
  const d={...P15.build('fictional_test_source.mov',8), events:[
    ev('lip_seal_on_filter','lips',1.55,3.48),ev('mouth_smoke_flow','smoke',5.1,6.85),
    ev('lip_lick_lower','lips',7.1,7.25)
  ]};
  const g=P19.generate();
  const r=P20.compare(d,g,P15,{localEvaluationAllowed:true});
  assert.equal(r.adjudicated_visible_events,3);
  assert.ok(r.coverage.some(x=>x.label==='lip_seal_on_filter'&&x.temporal_overlaps===1));
  assert.ok(r.coverage.some(x=>x.label==='mouth_smoke_flow'&&x.temporal_overlaps===1));
  assert.deepEqual(r.missing_controls.map(x=>x.label),['lip_lick_lower']);
  assert.equal(r.generated_photographic_frames,0);
});
