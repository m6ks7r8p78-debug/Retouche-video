/* Retouche Cinema P17 — cross-lab capability handoff.
 * NOVA, CameraGuard/MultiMotion, and SmallMotion/PWA features are optional,
 * separately validated experimental branches, NOT bundled runtime dependencies.
 * Never fabricates quality, rendering, synchronization or identity proof.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RetoucheP17CrossLab=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION='retouche-cinema-p17-crosslab-v1';
const SOURCES=Object.freeze({
  nova:{branch:'chatgpt-studio-nova-v01',pr:3,features:['audio_timeline_audit','HEVC_SDR_BT709_conversion','AAC_H264_MP4_export'],activation:'separate_test_required'},
  camera:{branch:'lab-3d-v43-camera-evidence',features:['camera_motion_similarity_2d','motion_abstention'],activation:'separate_test_required'},
  pwa:{branch:'lab-3d-smallmotion-pwa-safe-update-v1',pr:26,features:['service_worker_wait_for_idle_clients','preserve_active_edits'],activation:'separate_test_required'}
});
function ok(x,m){if(!x)throw new Error(m)}
function exportRequirements(p,{fps=60,format='9:16'}={}){
  ok(p?.storyboard_only===true&&p?.rendered_video===null&&p?.model_engine==='not_connected','Projet P17 de fiction non rendu requis');
  ok([24,30,45,60].includes(fps),'Cadence non autorisée');
  ok(['16:9','9:16'].includes(format),'Format incorrect');
  const clips=p.clips.map(c=>({id:c.clip_id,start_s:c.start_seconds,duration_s:c.duration_seconds,
    source_generated_unique_frames:0,encoded_fps_target:fps,
    audio_alignment_status:'not_measured',color_space_status:'not_measured',camera_motion_status:'not_measured',
    can_export_without_render:false}));
  return {schema:VERSION,kind:'requirements_only',profile:'iPhone_H264_AAC_SDR_BT709',fps_target:fps,format,
    color_conformance:'NOVA requires independent color/codec audit',audio_synchronization:'NOVA requires independent AV-sync audit',
    image_originality:'0 generated frames; target fps does not establish novel motion',
    pwa_update_policy:{skipWaiting_on_install:false,wait_for_active_clients:true,source:'SmallMotion PR #26 (policy only)'},
    modules_available_in_this_bundle:{nova:false,camera:false,pwa_service_worker:false,video_generator:false},
    modules_researched:SOURCES,clips,remote_upload:false,source_media_attached:false,
    export_video_now:false};
}
function inspectMotionReport(report){
  if(report==null)return {status:'not_executed',source:'CameraGuard',can_confirm_contact:false};
  ok(report&&typeof report==='object'&&!Array.isArray(report),'Motion report malformed');
  ok(['synthetic','real_unvalidated'].includes(report.origin),'CameraGuard source must remain unvalidated');
  ok(['measured_2d_only','abstained','failed'].includes(report.status),'No 3D or anatomical claims');
  ok(report.identity_proven!==true&&report.hand_contact_proven!==true,'No identity or contact proof');
  return {status:report.status,source:'CameraGuard',can_confirm_contact:false,
    validated_on_real_humans:false,notes:'2D camera compensation can abstain; does not recognize hands or lips'};
}
function inspectNovaAudit(audit){
  if(audit==null)return {status:'not_executed',source:'NOVA'};
  ok(audit&&typeof audit==='object'&&!Array.isArray(audit),'Invalid NOVA report');
  ok(audit.executed===true&&audit.provenance==='nova_runtime','NOVA audit must be executed, not inferred');
  ok(typeof audit.av_sync_verified==='boolean'&&typeof audit.bt709_verified==='boolean','Missing AV/color findings');
  return {status:(audit.av_sync_verified&&audit.bt709_verified)?'technical_checks_passed':'requires_review',
    source:'NOVA',av_sync_verified:audit.av_sync_verified,bt709_verified:audit.bt709_verified,
    lip_sync_verified:false,notes:'AV container synchronization does not prove animated lips match dialogue'};
}
function runNovaDecision(novaDecision,source,candidates,options={}){
  ok(novaDecision&&typeof novaDecision.arbitrer==='function','NOVA_DECISION provider not connected');
  // Calls the real injected NOVA decision module if supplied; does not clone or simulate it.
  const result=novaDecision.arbitrer(source,candidates,{autoriserGeneration:options.autoriserGeneration===true});
  ok(result&&typeof result.choisi==='string'&&result.validationHumaineObligatoire===true,'Unexpected NOVA decision result');
  return {source:'NOVA_DECISION (injected)',execution:'real_provider_call',decision:result,
    real_world_fidelity_proven:false,model_generated_frames:0};
}
function buildHandoff(p,settings={},evidence={}){
  const out=exportRequirements(p,settings);
  const motion=inspectMotionReport(evidence.motion);
  const nova=inspectNovaAudit(evidence.nova);
  return {...out,motion_audit:motion,nova_audit:nova,
    needs_human_review:(p.issue_count>0)||(motion.status==='abstained')||(nova.status==='requires_review'),
    consent:{remote_transfer_approved:false,training_allowed:false,media_bytes_included:false}};
}
return {VERSION,SOURCES,exportRequirements,inspectMotionReport,inspectNovaAudit,runNovaDecision,buildHandoff};
});
