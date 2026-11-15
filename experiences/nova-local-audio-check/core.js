/* NOVA local A/V audio trial P63 — use EXISTING NOVA_AAC_NATIVE.planifier
 * on a file explicitly selected in the browser by the user.
 * No upload, no media export. Never put source data/filename in JSON report.
 */
var NOVA_LOCAL_AUDIO_CHECK=(()=>{
"use strict";
const SCHEMA="retoucheproai.nova.local-audio-rescue-check.v1";
const MAX_BYTES=16*1048576,MAX_SECONDS=12.2;
const CODES=Object.freeze({
 no_file:"missing_local_video",
 budget:"source_outside_conservative_budget",
 cancelled:"cancelled",
 no_api:"nova_native_audio_module_missing",
 decode:"source_audio_decode_unavailable",
 duration:"audio_video_duration_incompatible",
 unsupported:"aac_encoder_unavailable",
 pcm:"decoded_audio_not_usable",
 packets:"encoded_audio_not_verified",
 descriptor:"aac_description_unusable",
 encoder_runtime:"aac_encoder_runtime_failed",
 timing:"aac_timing_not_verified",
 unknown:"local_audio_validation_failed",
 success:"local_source_aac_reencode_chunks_verified",
});
const base=(status,values={})=>Object.freeze({
 schema:SCHEMA,
 status,
 evidence:"real_file_processed_locally_by_user_opt_in",
 technical_scope:"WebAudio_source_decode_plus_WebCodecs_AAC_LC_chunks_only",
 source_filename_recorded:false,
 source_media_uploaded:false,
 no_network_requests_by_test_code:true,
 original_file_modified:false,
 audio_samples_or_chunks_in_report:false,
 final_mp4_created:false,
 video_frames_processed:false,
 audio_video_sync_verified:false,
 physical_iphone_independently_certified:false,
 report_shared_automatically:false,
 ...values,
});
function classify(error){
 const msg=String(error?.message||"");
 if(/annulée/.test(msg))return CODES.cancelled;
 if(/durée audio|couverture audio|durée vidéo|horodatages|non alignée/.test(msg))return CODES.duration;
 if(/décodage de la piste audio|décodeur audio|piste audio décodée/.test(msg))return CODES.decode;
 if(/tampon PCM|configuration ASC|fréquence ASC|multicanale/.test(msg))return CODES.pcm;
 if(/AudioEncoder|encodeur AAC-LC|AudioData indisponible|test du codec AAC|codec AAC/.test(msg))
  return CODES.unsupported;
 if(/paquet AAC|configuration AAC native|aucun paquet|AAC brut|saturé/.test(msg))
  return CODES.packets;
 return CODES.unknown;
}
/*
 * P66: phase-by-phase checks use the actual existing NOVA native APIs.
 * Native.decode() runs only once; planifier receives decoded PCM through
 * its existing decoder injection parameter. PCM never enters JSON.
 * We do not pass exceptions through: they might carry private data.
 */
function phaseFailure(e,phase){
 const msg=String(e?.message||"");
 if(/annulée|annulé/.test(msg))return CODES.cancelled;
 if(phase==="source_decode"){
  if(/durée audio|durée vidéo|couverture audio|non alignée/.test(msg))return CODES.duration;
  if(/tampon PCM|multicanale|canal audio tronqué/.test(msg))return CODES.pcm;
  return CODES.decode;
 }
 if(phase==="aac_capability")return CODES.unsupported;
 if(/ASC|AudioSpecificConfig|ES_Descriptor|descripteur MPEG-4|description AAC|DecoderConfig|configuration AAC|codec AAC Safari/i.test(msg))
  return CODES.descriptor;
 if(/durée audio|horodatages|non alignée|non continus|couverture audio/.test(msg))
  return CODES.timing;
 if(/paquet AAC|aucun paquet|AAC brut|taille AAC|saturé/.test(msg))
  return CODES.packets;
 if(/AudioEncoder|AudioData|encodeur AAC|encodage AAC/.test(msg))
  return CODES.encoder_runtime;
 return CODES.encoder_runtime;
}
function response(status,phase,verified){
 return base(status,{diagnostic_phase:phase,last_verified_stage:verified});
}
function verifyPlan(out,durationSeconds,{strictDesc=false}={}){
 if(out?.mode!=="aac-native-encode"||!Array.isArray(out.packets)||
  out.packets.length<1||out.packets.length>2000||
  !Number.isSafeInteger(out.sampleRate)||out.sampleRate<8000||out.sampleRate>192000||
  ![1,2].includes(out.channels))return null;
 if(strictDesc&&(!(out.asc instanceof Uint8Array)||out.asc.length<2||out.asc.length>32))
  return {error:CODES.descriptor};
 let total=0,first=null,last=null;
 for(const p of out.packets){
  if(!(p.bytes instanceof Uint8Array)||p.bytes.length<1||p.bytes.length>65536||
   !Number.isSafeInteger(p.timestamp)||p.timestamp<0||
   !Number.isSafeInteger(p.duration)||p.duration<1)
   return null;
  total+=p.bytes.length;
  if(total>4*1048576)return null;
  if(first===null)first=p.timestamp;
  if(last!==null&&p.timestamp<=last)return {error:CODES.timing};
  last=p.timestamp;
 }
 if(first!==0||
    out.packets.at(-1).timestamp+out.packets.at(-1).duration<
       Math.round(durationSeconds*1e6)-90000)
  return {error:CODES.timing};
 return {count:out.packets.length,total,rate:out.sampleRate,channels:out.channels};
}
async function check(file,{durationSeconds,signal,native=globalThis.NOVA_AAC_NATIVE}={}){
 if(signal?.aborted)return response(CODES.cancelled,"before_media","none");
 if(!file||typeof file.arrayBuffer!=="function"||
  !Number.isSafeInteger(file.size)||file.size<=0)
  return response(CODES.no_file,"source_selection","none");
 if(file.size>MAX_BYTES||!Number.isFinite(durationSeconds)||durationSeconds<=0||
    durationSeconds>MAX_SECONDS)
  return response(CODES.budget,"source_budget","none");
 if(!native||typeof native.planifier!=="function")
  return response(CODES.no_api,"native_module","none");
 let out=null,pcm=null;
 const staged=typeof native.decode==="function"&&typeof native.capability==="function";
 let lastVerified="source_budget";
 try{
  if(staged){
   try{
    pcm=await native.decode(file,{durationSeconds,signal});
   }catch(e){
    return response(phaseFailure(e,"source_decode"),"source_decode",lastVerified);
   }
   if(signal?.aborted)return response(CODES.cancelled,"source_decode",lastVerified);
   if(!pcm||![1,2].includes(pcm.channels)||!Number.isSafeInteger(pcm.sampleRate)||
      !Number.isSafeInteger(pcm.frames)||pcm.frames<=0||
      pcm.frames/pcm.sampleRate>MAX_SECONDS+.15||
      !Array.isArray(pcm.samples)||pcm.samples.length!==pcm.channels||
      pcm.samples.some(s=>!(s instanceof Float32Array)||s.length!==pcm.frames))
    return response(CODES.pcm,"decoded_pcm_validation",lastVerified);
   lastVerified="source_decode";
   try{
    await native.capability({SampleRate:pcm.sampleRate,channels:pcm.channels});
   }catch(e){
    return response(phaseFailure(e,"aac_capability"),"aac_capability",lastVerified);
   }
   if(signal?.aborted)return response(CODES.cancelled,"aac_capability",lastVerified);
   lastVerified="aac_capability";
  }
  try{
   // Legacy test doubles use the 2-argument API. The real NOVA module
   // supports an injected decoder and will not read the file again.
   out=staged?
    await native.planifier(file,{durationSeconds,signal},{decoder:async()=>pcm}):
    await native.planifier(file,{durationSeconds,signal});
  }catch(e){
   return response(staged?phaseFailure(e,"aac_encode"):classify(e),
       staged?"aac_encode":"combined_legacy",lastVerified);
  }
  if(signal?.aborted)return response(CODES.cancelled,"aac_encode",lastVerified);
  lastVerified="aac_encode";
  const valid=verifyPlan(out,durationSeconds,{strictDesc:staged});
  if(!valid||valid.error)
   return response(valid?.error||CODES.packets,"encoded_packet_validation",lastVerified);
  return base(CODES.success,{
   diagnostic_phase:"completed",last_verified_stage:"encoded_packet_validation",
   aac_lc_reencoded_chunk_count:valid.count,
   aac_lc_reencoded_byte_count:valid.total,
   encoded_sample_rate_hz:valid.rate,
   encoded_channels:valid.channels,
   source_audio_format_identified:false,
   decoded_track_may_have_timing_edits:true,
   next_required_check:"mux_full_mp4_then_listen_and_verify_sync_locally",
  });
 }catch{
  // Any unclassified JS exception remains a coarse phase code. Never pass
  // raw messages from MediaError, VideoFrame, WebAudio or AudioEncoder.
  return response(CODES.unknown,"unexpected_diagnostic_error",lastVerified);
 }finally{
  out=null;pcm=null;
 }
}

return Object.freeze({SCHEMA,MAX_BYTES,MAX_SECONDS,CODES,classify,phaseFailure,verifyPlan,check});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_LOCAL_AUDIO_CHECK;
