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
async function check(file,{durationSeconds,signal,native=globalThis.NOVA_AAC_NATIVE}={}){
 if(signal?.aborted)return base(CODES.cancelled);
 if(!file||typeof file.arrayBuffer!=="function"||!Number.isSafeInteger(file.size)||file.size<=0)
  return base(CODES.no_file);
 if(file.size>MAX_BYTES||!Number.isFinite(durationSeconds)||
    durationSeconds<=0||durationSeconds>MAX_SECONDS)
  return base(CODES.budget);
 if(!native||typeof native.planifier!=="function")
  return base(CODES.no_api);
 let out=null;
 try{
  out=await native.planifier(file,{durationSeconds,signal});
  if(signal?.aborted)return base(CODES.cancelled);
  if(out?.mode!=="aac-native-encode"||!Array.isArray(out.packets)||
     out.packets.length<1||out.packets.length>2000||
     !Number.isSafeInteger(out.sampleRate)||out.sampleRate<8000||out.sampleRate>192000||
     ![1,2].includes(out.channels))
   return base(CODES.packets);
  let totalBytes=0,first=null,last=null;
  for(const p of out.packets){
   if(!(p.bytes instanceof Uint8Array)||p.bytes.length<1||p.bytes.length>65536||
      !Number.isSafeInteger(p.timestamp)||p.timestamp<0||
      !Number.isSafeInteger(p.duration)||p.duration<1)
    return base(CODES.packets);
   totalBytes+=p.bytes.length;
   if(totalBytes>4*1048576)return base(CODES.packets);
   if(first===null)first=p.timestamp;
   if(last!==null&&p.timestamp<=last)return base(CODES.packets);
   last=p.timestamp;
  }
  if(first!==0||out.packets.at(-1).timestamp+out.packets.at(-1).duration<
     Math.round(durationSeconds*1e6)-90000)return base(CODES.packets);
  return base(CODES.success,{
   aac_lc_reencoded_chunk_count:out.packets.length,
   aac_lc_reencoded_byte_count:totalBytes,
   encoded_sample_rate_hz:out.sampleRate,
   encoded_channels:out.channels,
   source_audio_format_identified:false,
   decoded_track_may_have_timing_edits:true,
   next_required_check:"mux_full_mp4_then_listen_and_verify_sync_locally",
  });
 }catch(e){
  return base(classify(e));
 }finally{
  // The packet buffers are never put in the report or written anywhere.
  // Reclaiming memory is managed by the JS runtime after this function.
  out=null;
 }
}
return Object.freeze({SCHEMA,MAX_BYTES,MAX_SECONDS,CODES,classify,check});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_LOCAL_AUDIO_CHECK;
