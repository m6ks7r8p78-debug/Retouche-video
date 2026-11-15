'use strict';const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../p18_motion_continuity.js');const P16=require('../../p16/presence_director.js');const P2=require('../../p2/cinema-render-plan.js');const P17=require('../../p17/acting_clip_bridge.js');const X=require('../../p17/cross_lab_handoff.js');
function make(){const samples=[];for(let i=0;i<=150;i++){
 const t=i/30;let phase,progress;if(t<1){phase='approach';progress=t;}
 else if(t<1.3){phase='contact';progress=1;}
 else if(t<2.4){phase='inhale';progress=1;}
 else if(t<3){phase='release';progress=1-(t-2.4)/.6;}
 else if(t<3.6){phase='pause';progress=0;}
 else{phase='exhale';progress=0;}
 const filter=[.48,.5+.28*(1-progress)],hand=[.43,.53+.28*(1-progress)];
 samples.push({t:+t.toFixed(5),phase,mouth_xy:[.48,.5],filter_xy:filter,hand_xy:hand,
 lip_contact:phase==='contact'||phase==='inhale',lip_shape:phase==='inhale'?'sealed':phase==='exhale'?'rounded':'relaxed',
 gaze_camera:i%17!==0,blink:i===29||i===90,cheek_motion:phase==='inhale'?'subtle_visible':'unknown',
 mouth_smoke:phase==='exhale',smoke_origin_xy:phase==='exhale'?[.49,.49]:null});}
 return {source_type:'synthetic_manual',recorded_from_pixels:false,samples};}
const scene=(which='smoking')=>P17.planProject({fictional_adult:true,scene:which,duration_s:15,maxClipSeconds:5,strengths:{sensualite:3,dominance:3,elegance:4,charme:3,mystere:1}},P16,P2);
test('smooth full-body-referenced cigarette path is candidate, never proved',()=>{const a=M.auditMeasured(make());assert.equal(a.status,'candidate_only');assert.equal(a.human_realism_proven,false);assert.equal(a.sample_count,151)});
test('native sample rate measured 30 not 60',()=>assert.equal(M.auditMeasured(make()).measured_sample_rate_hz,30));
test('no frame generation pretended',()=>assert.equal(M.auditMeasured(make()).generated_original_frames,0));
test('one-frame teleport flagged',()=>{let p=make();p.samples[15].filter_xy=[.48,.5];assert.ok(M.auditMeasured(p).issue_codes.includes('cigarette_position_jump'))});
test('hand teleport flagged',()=>{let p=make();p.samples[22].hand_xy=[.9,.9];assert.ok(M.auditMeasured(p).issue_codes.includes('hand_position_jump'))});
test('hand-filter split flagged',()=>{let p=make();p.samples[40].hand_xy=[.98,.2];assert.ok(M.auditMeasured(p).issue_codes.includes('hand_filter_attachment_unstable'))});
test('filter not touching lips is caught',()=>{let p=make();p.samples[42].filter_xy=[.7,.7];assert.ok(M.auditMeasured(p).issue_codes.includes('contact_not_aligned'))});
test('lip contact missing during inhale flagged',()=>{let p=make();p.samples[50].lip_contact=false;assert.ok(M.auditMeasured(p).issue_codes.includes('contact_not_aligned'))});
test('smoke during inhale flagged',()=>{let p=make();p.samples[55].mouth_smoke=true;assert.ok(M.auditMeasured(p).issue_codes.includes('mouth_smoke_outside_exhale'))});
test('smoke cannot start off mouth',()=>{let p=make();p.samples[110].smoke_origin_xy=[.99,.99];assert.ok(M.auditMeasured(p).issue_codes.includes('smoke_not_from_mouth'))});
test('insufficient cheek motion triggers review',()=>{let p=make();p.samples[50].cheek_motion='unknown';assert.ok(M.auditMeasured(p).issue_codes.includes('cheek_details_unverified'))});
test('missing blink flagged for long take',()=>{let p=make();p.samples.forEach(x=>x.blink=false);assert.ok(M.auditMeasured(p).issue_codes.includes('eye_blink_not_visible'))});
test('invalid coordinates rejected',()=>{let p=make();p.samples[5].mouth_xy=[-5,2];assert.throws(()=>M.auditMeasured(p))});
test('timestamps must be strictly increasing',()=>{let p=make();p.samples[4].t=p.samples[3].t;assert.throws(()=>M.auditMeasured(p))});
test('refuses embedded pixels',()=>{let p=make();p.recorded_from_pixels=true;assert.throws(()=>M.auditMeasured(p))});
test('reject untrusted provenance',()=>{let p=make();p.source_type='verified_human_motion';assert.throws(()=>M.auditMeasured(p))});
test('missing phase causes review',()=>{let p=make();p.samples.forEach(x=>{if(x.phase==='pause')x.phase='release'});assert.ok(M.auditMeasured(p).issue_codes.includes('missing_pause'))});
test('if no exhale, report missing smoke',()=>{let p=make();p.samples.forEach(x=>{x.mouth_smoke=false;x.smoke_origin_xy=null});assert.ok(M.auditMeasured(p).issue_codes.includes('mouth_smoke_not_visible'))});
test('cross-clip direction consistency on smoking and coffee',()=>{for(const n of ['smoking','coffee'])assert.equal(M.auditCrossClip(scene(n),P2,P17).continuity_issues.length,0)});
test('cross-clip continuity receives conflicts honestly',()=>{const v=M.auditCrossClip(scene(),P2,P17);assert.equal(v.render_authorized,false);assert.equal(v.clips_checked,3)});
test('tampered project clip caught by P17 validator',()=>{let p=scene();p.clips[1].start_seconds=99;assert.throws(()=>M.auditCrossClip(p,P2,P17))});
test('unavailable external modules cannot be enabled',()=>{const p=scene();const h=X.buildHandoff(p);assert.equal(M.auditExternalAvailability(h).video_generator,'not_connected');h.modules_available_in_this_bundle.nova=true;assert.throws(()=>M.auditExternalAvailability(h))});
