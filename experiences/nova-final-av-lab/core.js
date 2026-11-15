/* NOVA final audiovisual local experiment — strictly browser-only opt-in.
 * Reuses NOVA_NATIVE_HD.exporter unmodified (which guards source PTS,
 * dimensions, color, AAC, mux output and final MP4 audio track).
 * This adapter never uploads, saves or auto-plays any user media.
 */
var NOVA_LOCAL_AV_GATE=(()=>{
"use strict";
const SCHEMA="retoucheproai.nova.final-av-local-gate.v1";
const LIMIT_BYTES=16*1048576,MAX_SECONDS=12,MAX_FRAMES=360;
const statuses=Object.freeze({
 waiting:"no_media_selected",
 rejected:"media_outside_trial_budget",
 processing:"running_local_conversion",
 assembled:"mp4_audio_video_structure_checked_manual_review_pending",
 reviewed:"user_reviewed_audio_and_video",
 failed:"local_av_export_failed",
 cancelled:"local_av_export_cancelled",
 playback:"output_preview_unavailable"
});
function validateFile(f){
 if(!f||typeof f.slice!=="function"||!Number.isSafeInteger(f.size)||
    f.size<=0||f.size>LIMIT_BYTES)return false;
 const mime=String(f.type||"");
 const ext=String(f.name||"");
 return /^(video\/(mp4|quicktime|x-m4v)|application\/octet-stream)$/i.test(mime)||
   /\.(mp4|mov|m4v)$/i.test(ext);
}
function stageOf(e,phase){
 const message=String(e?.message||"");
 if(/annul[ée]/i.test(message))return "cancelled";
 if(/AAC|piste audio|\bson\b|AudioEncoder|AudioData|Web Audio/i.test(message))
  return "aac_track_not_verified";
 if(/color|couleur|HDR|P3|plage|matrice|BT.?709|colr|SPS|VUI|gamut/i.test(message))
  return "source_color_not_eligible";
 if(/mémoire|budget|octet|taille|limite/i.test(message))
  return "memory_or_size_guard";
 if(/PTS|cadence|durée|temps|image décodée|chronologie|horodat/i.test(message))
  return "source_timeline_not_eligible";
 if(/codec|H\.?264|HEVC|VideoDecoder|VideoEncoder|décodage|encodage/i.test(message))
  return "video_codec_not_available";
 if(/MP4|mux|paquet|piste|métadonn/i.test(message))
  return "final_mp4_not_verified";
 const phases=new Set(["source","audio","video","complete"]);
 return phases.has(phase)?"failed_during_"+phase:"processing_failed";
}
function validOutput(out){
 if(!out||!(out.blob instanceof Blob)||out.blob.type!=="video/mp4"||
    out.blob.size<1024||out.blob.size>32*1048576||
    out.mode!=="native-hd-classical"||!["aac-copy","aac-native-encode"].includes(out.audioMode)||
    !Number.isSafeInteger(out.sourceFrames)||out.sourceFrames<1||
    out.sourceFrames>MAX_FRAMES||out.outputFrames!==out.sourceFrames||
    !Number.isSafeInteger(out.originalWidth)||out.originalWidth<2||
    !Number.isSafeInteger(out.originalHeight)||out.originalHeight<2||
    out.originalWidth*out.originalHeight>2200000||
    !Number.isFinite(out.durationSeconds)||out.durationSeconds<=0||
    out.durationSeconds>MAX_SECONDS||
    !Number.isFinite(out.sourceFps)||out.sourceFps<=0||out.sourceFps>60.5)
  return false;
 return true;
}
function report(state,{out=null,phase="none",errorCode="none",manuallyObserved={}}={}){
 const valid=validOutput(out);
 const assembled=valid&&(state===statuses.assembled||state===statuses.reviewed);
 const checked=state===statuses.reviewed&&
  manuallyObserved.video_visible===true&&
  manuallyObserved.audio_audible===true;
 return Object.freeze({
  schema:SCHEMA,status:state===statuses.reviewed&&!checked?statuses.assembled:state,
  proof_kind:"local_real_source_browser_run_user_supplied_report",
  source_selected_voluntarily:true,
  source_name_included:false,source_bytes_included:false,
  local_file_uploaded:false,automatic_network_requests:false,
  original_changed:false,automatic_download:false,
  restored_video_generated_by_engine:assembled,
  output_mp4_structure_checked_by_existing_nova_engine:assembled,
  output_video_frames:assembled?out.outputFrames:null,
  source_video_frames:assembled?out.sourceFrames:null,
  output_resolution:assembled?
   {width:out.originalWidth,height:out.originalHeight}:null,
  output_duration_s:assembled?Math.round(out.durationSeconds*1000)/1000:null,
  audio_mode:assembled?out.audioMode:null,
  user_reported_image_visible:checked,
  user_reported_audio_audible:checked,
  user_reported_sync_plausible:checked&&manuallyObserved.sync_plausible===true,
  playback_review_is_self_report:true,
  physical_iphone_independently_certified:false,
  independent_audio_video_sync_verified:false,
  source_hevc_hdr_quality_certified:false,
  export_to_social_platform_tested:false,
  stage:new Set(["source","audio","video","complete","none"]).has(phase)?phase:"none",
  error_code:typeof errorCode==="string"&&
    /^(none|aac_track_not_verified|source_color_not_eligible|memory_or_size_guard|source_timeline_not_eligible|video_codec_not_available|final_mp4_not_verified|processing_failed|failed_during_(source|audio|video|complete)|cancelled)$/.test(errorCode)?
     errorCode:"processing_failed",
  report_shared_automatically:false
 });
}
return Object.freeze({SCHEMA,LIMIT_BYTES,MAX_SECONDS,statuses,validateFile,
 stageOf,validOutput,report});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_LOCAL_AV_GATE;
