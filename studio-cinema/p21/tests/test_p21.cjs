'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const P15=require('../../p15/behavior_ontology.js');
const P19=require('../../p19/src/p19_micro_motion_generator.js');
const P20=require('../../p20/p20_temporal_evidence.js');
const P21=require('../p21_gesture_layer.js');
const make=(fps=60)=>P21.generate(P19,{fps});
const ev=(label,channel,start_s,end_s,extra={})=>({
  id:'',label,channel,start_s,end_s,evidence:'visible',
  review_status:'adjudicated',annotator_id:'reviewer_A',
  reviewed_by:['reviewer_A','reviewer_B'],confidence:.8,...extra
});
const doc=events=>({...P15.build('PRIVATE_FILE_NEVER_EXPORTED.mov',8),events});
const compare=(events,opts={})=>P21.compare(doc(events),make(),P15,P20,{localEvaluationAllowed:true,...opts});

test('P21 creates 480 controls at 60 Hz from the real P19',()=>{
  const a=make();assert.equal(a.frames.length,480);
  assert.equal(a.fps,60);assert.equal(a.p21_schema,P21.VERSION);
});
test('P21 also creates 360 controls at 45 Hz',()=>assert.equal(make(45).frames.length,360));
test('source P19 frames and original fields are unmodified',()=>{
  const g=P19.generate(),a=make();
  for(let i=0;i<g.frames.length;i++)for(const k of Object.keys(g.frames[i]))
    assert.deepEqual(a.frames[i][k],g.frames[i][k],k);
});
test('original P19 trajectory auditor still passes',()=>assert.equal(P19.auditTrajectories(make()).status,'synthetic_controls_candidate'));
test('P20 original 4-control validator still accepts P21 extended output',()=>assert.equal(P20.validateGenerated(make()).frames.length,480));
test('P21 QA accepts its own authentic trajectory',()=>{
  const a=P21.validate(make(),P20);
  assert.equal(a.status,'synthetic_controls_candidate');assert.equal(a.issue_count,0);
});
test('each added gesture creates measurable temporal sample coverage',()=>{
  const a=P21.validate(make(),P20);
  for(const count of Object.values(a.generated_event_sample_counts))assert.ok(count>=3);
});
test('P21 produces a lower-lip bite only in pause phase',()=>assert.ok(make().frames.filter(x=>x.p21_lower_lip_bite).every(x=>x.phase==='pause')));
test('lip lick and visible tongue occur only after exhale',()=>{
  const a=make().frames.filter(x=>x.p21_lip_lick_lower||x.p21_tongue_visible);
  assert.ok(a.length>3&&a.every(x=>x.phase==='smoke_drift'));
});
test('tongue retract only after exhale',()=>assert.ok(make().frames.filter(x=>x.p21_tongue_retract).every(x=>x.phase==='smoke_drift')));
test('no kiss/filter lip contact during new gestures',()=>{
  assert.ok(make().frames.every(x=>!x.lip_contact||!(x.p21_lower_lip_bite||x.p21_lip_lick_lower||x.p21_tongue_visible)));
});
test('smoke exhale never combines with P21 bite/lick/tongue',()=>{
  assert.ok(make().frames.every(x=>!x.mouth_smoke||!(x.p21_lower_lip_bite||x.p21_lip_lick_lower||x.p21_tongue_visible)));
});
test('tongue vector is hidden when visibility is false',()=>{
  assert.ok(make().frames.every(x=>x.p21_tongue_visible||x.p21_tongue_tip_xy===null));
});
test('tongue tip stays in small normalized face neighborhood',()=>{
  assert.ok(make().frames.filter(x=>x.p21_tongue_visible).every(x=>Math.hypot(x.mouth_xy[0]-x.p21_tongue_tip_xy[0],x.mouth_xy[1]-x.p21_tongue_tip_xy[1])<.025));
});
test('tongue tip speed stays under exploratory budget, not a biological limit',()=>{
  assert.ok(P21.validate(make(),P20).max_tongue_tip_speed_norm_per_s<.45);
});
test('gesture intervals are ordered and nonempty for each supported P15 label',()=>{
  for(const label of Object.keys(P21.LABELS)){
    const xs=P21.intervals(make(),label);
    assert.ok(xs.length>0&&xs.every(x=>x.end_s>x.start_s));
  }
});
test('P21 deterministic seed yields repeatable gestures',()=>assert.deepEqual(make().frames[442],make().frames[442]));
test('P21 refuses arbitrary uploaded media and identity fields',()=>{
  assert.throws(()=>P21.generate(P19,{media:'private.mov'}),/Only fps/);
  assert.throws(()=>P21.generate(P19,{identity:'real-person'}),/Only fps/);
});
test('P21 rejects source modules that have no P19 audit provider',()=>assert.throws(()=>P21.generate({generate:()=>({})}),/Real P19/));
test('P21 rejects unapproved P19 frame rates and seeds',()=>{
  assert.throws(()=>P21.generate(P19,{fps:120}));
  assert.throws(()=>P21.generate(P19,{seed:-5}));
});
test('private source access or photorealism claim makes P21 invalid',()=>{
  const g=make();g.source_video_accessed=true;
  assert.throws(()=>P21.validate(g,P20),/provenance/);
});
test('tampered lip-lick flag is detected and cannot be compared',()=>{
  const g=make();g.frames[435].p21_lip_lick_lower=false;
  assert.equal(P21.validate(g,P20).status,'review_required');
  assert.throws(()=>P21.compare(doc([]),g,P15,P20,{localEvaluationAllowed:true}),/self audit/);
});
test('tampered tip coordinates are detected',()=>{
  const g=make(),i=g.frames.findIndex(f=>f.p21_tongue_tip_xy);
  g.frames[i].p21_tongue_tip_xy=[1,1];
  assert.ok(P21.validate(g,P20).issues.some(e=>e.code==='control_modified'));
});
test('tampered human verification flag is rejected',()=>{
  const g=make();g.frames[1].p21_generated_semantics={source:'fictional_procedural',human_gesture_verified:true};
  assert.ok(P21.validate(g,P20).issues.some(e=>e.code==='provenance_modified'));
});
test('comparison needs explicit local authorization',()=>{
  assert.throws(()=>P21.compare(doc([]),make(),P15,P20),/authorization/);
});
test('comparison requires real P15 and P20 contracts',()=>{
  assert.throws(()=>P21.compare(doc([]),make(),null,P20,{localEvaluationAllowed:true}),/P15/);
  assert.throws(()=>P21.compare(doc([]),make(),P15,null,{localEvaluationAllowed:true}),/P20/);
});
test('P21 comparison refuses network-enabled source',()=>{
  const d=doc([ev('tongue_visible','lips',7.2,7.45)]);d.allow_network=true;
  assert.throws(()=>P21.compare(d,make(),P15,P20,{localEvaluationAllowed:true}),/Privacy gates|Local-only/);
});
test('P21 comparison refuses training-flagged source',()=>{
  const d=doc([]);d.ready_for_training=true;
  assert.throws(()=>P21.compare(d,make(),P15,P20,{localEvaluationAllowed:true}));
});
test('P21 comparison matches lower lip bite when manually aligned',()=>{
  const r=compare([ev('lower_lip_bite','lips',4.75,4.90)]);
  assert.equal(r.coverage.find(x=>x.label==='lower_lip_bite').temporal_overlaps,1);
  assert.ok(r.covered_by_p21_labels.includes('lower_lip_bite'));
});
test('P21 comparison matches tongue lick and retract without claiming anatomy',()=>{
  const r=compare([ev('lip_lick_lower','lips',7.25,7.45),
    ev('tongue_visible','lips',7.25,7.5),ev('tongue_retract','lips',7.56,7.6)]);
  assert.equal(r.coverage.length,3);
  assert.ok(r.coverage.every(x=>x.temporal_overlaps===1));
  assert.equal(r.human_naturalness_verified,false);
  assert.equal(r.temporal_matches_are_not_anatomical_proof,true);
});
test('P21 keeps unsupported upper-lip lick in gap report',()=>{
  const r=compare([ev('lip_lick_upper','lips',7.2,7.45)]);
  assert.equal(r.missing_controls.length,1);
  assert.equal(r.missing_controls[0].label,'lip_lick_upper');
});
test('P21 comparison reuses original P20 four control types',()=>{
  const r=compare([ev('blink','face',2.62,2.7),ev('lower_lip_bite','lips',4.75,4.9)]);
  assert.deepEqual(r.coverage.map(x=>x.label),['blink','lower_lip_bite']);
});
test('P21 comparison does not count uncertain, unadjudicated or audible-only evidence',()=>{
  const r=compare([ev('tongue_visible','lips',7.2,7.4,{evidence:'uncertain'}),
    ev('lip_lick_lower','lips',7.2,7.4,{review_status:'review_1'})]);
  assert.equal(r.adjudicated_visible_events,0);
  assert.equal(r.coverage.length,0);
});
test('same P21 generated interval cannot be matched to two annotations',()=>{
  const r=compare([ev('tongue_visible','lips',7.18,7.38),
    ev('tongue_visible','lips',7.39,7.55)]);
  const c=r.coverage.find(x=>x.label==='tongue_visible');
  assert.equal(c.synthetic_intervals,1);assert.equal(c.temporal_overlaps,1);
});
test('alignment beyond 2s is prohibited',()=>assert.throws(()=>compare([],{alignmentOffsetS:3}),/alignment/));
test('P21 report keeps private filename, IDs, notes, XY coordinates out',()=>{
  const r=compare([ev('tongue_visible','lips',7.2,7.5,{notes:'TOPSECRET_PERSON',xy:[.3,.7]})]);
  const s=JSON.stringify(r);
  for(const secret of ['PRIVATE_FILE_NEVER_EXPORTED','TOPSECRET_PERSON','reviewer_A','"xy"'])
    assert.ok(!s.includes(secret),secret);
  assert.equal(r.media_bytes_exported,false);
  assert.equal(r.training_authorized_by_this_comparison,false);
  assert.equal(r.generated_photographic_frames,0);
});
test('not counted as video frames rendered or real subject training',()=>{
  const g=make();assert.equal(g.p21_video_frames_created,0);
  assert.equal(g.p21_training_performed,false);
  assert.equal(g.p21_human_naturalness_verified,false);
});
