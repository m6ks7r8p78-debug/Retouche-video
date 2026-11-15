/* NOVA Safari AAC capability laboratory — isolated, synthetic signal only.
 * Tests WebCodecs support and actual AAC-LC encoded chunk emission.
 * No camera/microphone, no file access, no remote requests, no video export.
 * Results must NOT be used to approve real-file encoding or AAC priming.
 */
var NOVA_SAFARI_CODEC_PROBE=(()=>{
"use strict";
const VERSION="retoucheproai.nova.safari-aac-lab.v1";
const CFG=Object.freeze({codec:"mp4a.40.2",sampleRate:48000,
 numberOfChannels:2,bitrate:160000,aac:{format:"aac"}});
const SAFE_STATUSES=new Set(["insecure-context","codec-unsupported",
 "webcodecs-unavailable","native-aac-encoded-synthetic",
 "codec-supported-but-encode-failed","cancelled"]);
function makeResult({status,packetCount=0,totalBytes=0,hevc="not-tested"}){
 if(!SAFE_STATUSES.has(status))throw new Error("Invalid probe status");
 return Object.freeze({
  schema:VERSION,
  status,
  test_kind:"generated_half_second_synthetic_pcm_only",
  codec_requested:"mp4a.40.2",
  sample_rate:48000,channels:2,
  actual_aac_chunks_produced:packetCount,
  actual_aac_bytes_produced:totalBytes,
  hevc_config_probe:hevc,
  hevc_stream_decode_tested:false,
  mp4_source_audio_decode_tested:false,
  real_video_imported:false,
  original_audio_copied:false,
  video_export_tested:false,
  physical_safari_independently_certified:false,
  no_personal_data_collected:true,
  report_sent_automatically:false,
 });
}
async function inspectHEVC(api){
 const decoder=api.VideoDecoder;
 if(typeof decoder!=="function"||typeof decoder.isConfigSupported!=="function")
  return "api-unavailable";
 // Capability check only. HEVC decoding needs its own valid bitstream test.
 try{
  const cfg={codec:"hvc1.1.6.L93.B0",codedWidth:320,codedHeight:180};
  const r=await decoder.isConfigSupported(cfg);
  return r&&r.supported===true?"reported-supported-config-only":"not-reported-supported";
 }catch{return "probe-error"}
}
function pcmForBlock(block,frames){
 const output=new Float32Array(frames*2);
 for(let c=0;c<2;c++)
  for(let i=0;i<frames;i++){
   const t=(block*1024+i)/48000;
   output[c*frames+i]=.09*Math.sin(2*Math.PI*(c?660:440)*t);
  }
 return output;
}
async function run({api=globalThis,signal}={}){
 const hevc=await inspectHEVC(api);
 if(signal?.aborted)return makeResult({status:"cancelled",hevc});
 if(api.isSecureContext!==true)return makeResult({status:"insecure-context",hevc});
 const Encoder=api.AudioEncoder,Data=api.AudioData;
 if(typeof Encoder!=="function"||typeof Encoder.isConfigSupported!=="function"||
    typeof Data!=="function")
  return makeResult({status:"webcodecs-unavailable",hevc});
 let supported;
 try{supported=await Encoder.isConfigSupported({...CFG,aac:{format:"aac"}})}
 catch{return makeResult({status:"codec-unsupported",hevc})}
 if(supported?.supported!==true)return makeResult({status:"codec-unsupported",hevc});
 if(signal?.aborted)return makeResult({status:"cancelled",hevc});
 let encoder=null,outputBytes=0,outputCount=0,error=false,first=null,last=null;
 try{
  encoder=new Encoder({
   output:chunk=>{
    try{
     if(!chunk||!Number.isSafeInteger(chunk.byteLength)||
         chunk.byteLength<1||chunk.byteLength>8192||outputCount>=80)
      throw Error("Invalid AAC chunk");
     if(!Number.isSafeInteger(chunk.timestamp)||chunk.timestamp<0)
      throw Error("Invalid AAC timestamp");
     const bytes=new Uint8Array(chunk.byteLength);
     chunk.copyTo(bytes);
     if(bytes.length>1&&bytes[0]===0xff&&(bytes[1]&0xf0)===0xf0)
      throw Error("Unexpected ADTS header");
     if(first===null)first=chunk.timestamp;
     if(last!==null&&chunk.timestamp<=last)throw Error("Out of order AAC");
     last=chunk.timestamp;
     outputBytes+=bytes.length;
     outputCount++;
     if(outputBytes>128000)throw Error("AAC size exceeded");
    }catch{error=true}
   },error:()=>{error=true}
  });
  encoder.configure({...CFG,aac:{format:"aac"}});
  // Exactly 24 blocks * 1024 samples = 0.512 seconds of ORIGINAL synthetic tone.
  for(let block=0;block<24;block++){
   if(signal?.aborted)return makeResult({status:"cancelled",hevc});
   const frames=1024;
   const input=new Data({format:"f32-planar",sampleRate:48000,
    numberOfFrames:frames,numberOfChannels:2,
    timestamp:Math.round(block*1024*1e6/48000),
    data:pcmForBlock(block,frames)});
   try{encoder.encode(input)}finally{input.close()}
  }
  await encoder.flush();
  if(signal?.aborted)return makeResult({status:"cancelled",hevc});
  if(error||outputCount<10||outputCount>80||outputBytes<32||first!==0||
      last===null||last<100000)
   return makeResult({status:"codec-supported-but-encode-failed",hevc});
  return makeResult({status:"native-aac-encoded-synthetic",
    packetCount:outputCount,totalBytes:outputBytes,hevc});
 }catch{
  return makeResult({status:"codec-supported-but-encode-failed",hevc});
 }finally{
  try{encoder?.close()}catch{}
 }
}
return Object.freeze({VERSION,CFG,makeResult,inspectHEVC,run});
})();
if(typeof module!=="undefined"&&module.exports)
 module.exports=NOVA_SAFARI_CODEC_PROBE;
