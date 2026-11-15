import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import CHECK from "../experiences/nova-local-audio-check/core.js";
import NATIVE from "../experiences/nova-aac-native.js";

const here=path.dirname(url.fileURLToPath(import.meta.url));
const root=path.resolve(here,"../experiences/nova-local-audio-check");
const privateFile={name:"PRIVATE_PERSON_X___LOCATION.mov",size:100000,
  arrayBuffer:async()=>{throw Error("PRIVATE_FILE_BYTES_SHOULD_NOT_BE_REREAD");}};
const makePCM=()=>({
 sampleRate:48000,channels:2,frames:48000,durationSeconds:1,
 samples:[new Float32Array(48000),new Float32Array(48000)]
});
const makePackets=()=>Array.from({length:47},(_,i)=>({
 bytes:new Uint8Array([1,2,3,4,5,6]),timestamp:Math.round(i*1024*1e6/48000),
 duration:Math.round(1024*1e6/48000)
}));
const goodPlan=()=>({mode:"aac-native-encode",sampleRate:48000,channels:2,
 asc:NATIVE.asc(48000,2),packets:makePackets()});
const phaseNative=(overrides={})=>({
 decode:async()=>makePCM(),
 capability:async()=>({codec:"mp4a.40.2",sampleRate:48000,numberOfChannels:2}),
 planifier:async()=>goodPlan(),
 ...overrides
});
const stage=(native=phaseNative())=>CHECK.check(privateFile,{durationSeconds:1,native});
function safeReport(r){
 assert.equal(r.source_media_uploaded,false);
 assert.equal(r.original_file_modified,false);
 assert.equal(r.final_mp4_created,false);
 assert.equal(r.audio_video_sync_verified,false);
 assert.equal(r.physical_iphone_independently_certified,false);
 assert.equal(r.audio_samples_or_chunks_in_report,false);
 assert.equal(r.report_shared_automatically,false);
 const s=JSON.stringify(r);
 for(const unsafe of ["PRIVATE_PERSON_X","PRIVATE_FILE_BYTES",'"samples":',"Float32Array",
                        "ArrayBuffer","stacktrace","error_message"])
  assert.ok(!s.includes(unsafe),unsafe);
}

test("separate decode, capability and encode phases and never re-read file",async()=>{
 let decodes=0,capabilities=0,encodes=0;
 let decoded;
 const native=phaseNative({
  decode:async(file)=>{
   assert.equal(file,privateFile);
   decodes++;
   decoded=makePCM();
   return decoded;
  },
  capability:async({SampleRate,channels})=>{
   capabilities++;
   assert.equal(SampleRate,48000);assert.equal(channels,2);
   return {codec:"mp4a.40.2"};
  },
  planifier:async(file,opts,{decoder})=>{
   encodes++;
   assert.equal(file,privateFile);
   assert.equal(opts.durationSeconds,1);
   assert.equal(await decoder(file,opts),decoded);
   return goodPlan();
  }
 });
 const r=await stage(native);
 assert.equal(r.status,CHECK.CODES.success);
 assert.equal(r.diagnostic_phase,"completed");
 assert.equal(r.last_verified_stage,"encoded_packet_validation");
 assert.deepEqual([decodes,capabilities,encodes],[1,1,1]);
 assert.equal(r.aac_lc_reencoded_chunk_count,47);
 safeReport(r);
});

test("decode rejected produces exact phase, does not probe codec or export",async()=>{
 let called=false;
 const r=await stage(phaseNative({
  decode:async()=>{throw Error("Decoder failed PRIVATE_PERSON_X")},
  capability:async()=>{called=true;throw Error("unexpected")},
  planifier:async()=>{called=true;throw Error("unexpected")}
 }));
 assert.equal(called,false);
 assert.equal(r.status,CHECK.CODES.decode);
 assert.equal(r.diagnostic_phase,"source_decode");
 assert.equal(r.last_verified_stage,"source_budget");
 safeReport(r);
});

test("decode mismatched duration stays distinct from codec problem",async()=>{
 const r=await stage(phaseNative({
  decode:async()=>{throw Error("Audio natif NOVA : durée audio décodée différente de la vidéo")}
 }));
 assert.equal(r.status,CHECK.CODES.duration);
 assert.equal(r.diagnostic_phase,"source_decode");
 safeReport(r);
});

test("bad decoded PCM rejected before AAC capability",async()=>{
 let touched=false;
 const r=await stage(phaseNative({
  decode:async()=>({...makePCM(),samples:[new Float32Array(13)]}),
  capability:async()=>{touched=true}
 }));
 assert.equal(touched,false);
 assert.equal(r.status,CHECK.CODES.pcm);
 assert.equal(r.diagnostic_phase,"decoded_pcm_validation");
 safeReport(r);
});

test("unsupported sample rate for AAC is separated from decoding",async()=>{
 const r=await stage(phaseNative({
  capability:async()=>{throw Error("Audio natif NOVA : encodeur AAC-LC non pris en charge")}
 }));
 assert.equal(r.status,CHECK.CODES.unsupported);
 assert.equal(r.diagnostic_phase,"aac_capability");
 assert.equal(r.last_verified_stage,"source_decode");
 safeReport(r);
});

test("unclassified capability rejection does not disclose Safari details",async()=>{
 const r=await stage(phaseNative({
  capability:async()=>{throw Error("AudioEncoder hardware: PRIVATE_PERSON_X")}
 }));
 assert.equal(r.status,CHECK.CODES.unsupported);
 assert.equal(r.diagnostic_phase,"aac_capability");
 safeReport(r);
});

test("old ASC Safari error now classified as descriptor, not generic failure",async()=>{
 const r=await stage(phaseNative({
  planifier:async()=>{throw Error("Audio natif NOVA : ASC natif AAC invalide")}
 }));
 assert.equal(r.status,CHECK.CODES.descriptor);
 assert.equal(r.diagnostic_phase,"aac_encode");
 assert.equal(r.last_verified_stage,"aac_capability");
 safeReport(r);
});

test("WebKit invalid ES descriptor status is safely classified",async()=>{
 const r=await stage(phaseNative({
  planifier:async()=>{throw Error("Audio natif NOVA : ES_Descriptor natif inattendu")}
 }));
 assert.equal(r.status,CHECK.CODES.descriptor);
 safeReport(r);
});

test("encoder runtime failures now distinguished from decode and remain private",async()=>{
 const r=await stage(phaseNative({
  planifier:async()=>{throw Error("Audio natif NOVA : encodeur AAC natif interrompu ou indisponible - PRIVATE_PERSON_X")}
 }));
 assert.equal(r.status,CHECK.CODES.encoder_runtime);
 assert.equal(r.diagnostic_phase,"aac_encode");
 assert.equal(r.last_verified_stage,"aac_capability");
 safeReport(r);
});

test("timestamp and duration failures return a timing code",async()=>{
 const r=await stage(phaseNative({
  planifier:async()=>{throw Error("Audio natif NOVA : horodatages AAC réencodés non continus")}
 }));
 assert.equal(r.status,CHECK.CODES.timing);
 assert.equal(r.diagnostic_phase,"aac_encode");
 safeReport(r);
});

test("missing decoderConfig ASC after encoding is explicit not a success",async()=>{
 const out=goodPlan();
 delete out.asc;
 const r=await stage(phaseNative({planifier:async()=>out}));
 assert.equal(r.status,CHECK.CODES.descriptor);
 assert.equal(r.diagnostic_phase,"encoded_packet_validation");
 safeReport(r);
});

test("bad output packet triggers fail closed after encoding",async()=>{
 const out=goodPlan();
 out.packets[0].bytes=new Uint8Array();
 const r=await stage(phaseNative({planifier:async()=>out}));
 assert.equal(r.status,CHECK.CODES.packets);
 assert.equal(r.diagnostic_phase,"encoded_packet_validation");
 safeReport(r);
});

test("truncated AAC timeline triggers specific timing warning",async()=>{
 const out=goodPlan();
 out.packets=out.packets.slice(0,7);
 const r=await stage(phaseNative({planifier:async()=>out}));
 assert.equal(r.status,CHECK.CODES.timing);
 assert.equal(r.diagnostic_phase,"encoded_packet_validation");
 safeReport(r);
});

test("cancellation after capability does not create a false success",async()=>{
 const controller=new AbortController();
 const r=await CHECK.check(privateFile,{durationSeconds:1,signal:controller.signal,
  native:phaseNative({capability:async()=>{controller.abort()}})});
 assert.equal(r.status,CHECK.CODES.cancelled);
 safeReport(r);
});

test("actual NOVA AAC native module WebKit ES descriptor extraction works with staged check",async()=>{
 const mono=[3,128,128,128,34,0,0,0,4,128,128,128,20,64,20,0,24,0,0,0,0,0,
  0,0,0,0,5,128,128,128,2,17,136,6,128,128,128,1,2];
 const desc=new Uint8Array(mono);
 desc[32]=0x90;
 class Encoded {
  static async isConfigSupported(c){return {supported:c.codec==="mp4a.40.2"}}
  constructor({output}){this.output=output;this.state="configured";this.encodeQueueSize=0}
  configure(){}
  encode(data){
   this.output({
    timestamp:data.timestamp,duration:Math.round(data.numberOfFrames*1e6/48000),
    byteLength:8,copyTo:to=>to.set([1,2,3,4,5,6,7,8])
   },{decoderConfig:{codec:"mp4a.40.2",sampleRate:48000,numberOfChannels:2,description:desc}});
  }
  async flush(){}
  close(){this.state="closed"}
 }
 class PCMData {
  constructor({format,sampleRate,numberOfChannels,numberOfFrames,timestamp,data}){
   assert.equal(format,"f32-planar");
   assert.equal(sampleRate,48000);
   assert.equal(numberOfChannels,2);
   assert.equal(data.length,numberOfChannels*numberOfFrames);
   this.timestamp=timestamp;this.numberOfFrames=numberOfFrames;
  }
  close(){}
 }
 let decoded=0,internalFixtureError="";
 const native=phaseNative({
  decode:async()=>{decoded++;return makePCM()},
  capability:({SampleRate,channels})=>NATIVE.capability({
   AudioEncoderClass:Encoded,SampleRate,channels
  }),
  planifier:async(f,o,{decoder})=>{
   try{
    return await NATIVE.planifier(f,o,{
     EncoderClass:Encoded,DataClass:PCMData,decoder
    });
   }catch(e){internalFixtureError=String(e?.message||"unknown mock failure");throw e}
  }
 });
 const r=await stage(native);
 assert.equal(r.status,CHECK.CODES.success,internalFixtureError);
 assert.equal(r.diagnostic_phase,"completed");
 assert.equal(decoded,1,"the original audio must be decoded exactly once");
 assert.ok(r.aac_lc_reencoded_chunk_count>=46);
 safeReport(r);
});

test("screen and code retain no automatic network and never create MP4",()=>{
 const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
 const ui=fs.readFileSync(path.join(root,"ui.js"),"utf8");
 const code=fs.readFileSync(path.join(root,"core.js"),"utf8");
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/media-src blob:/);
 assert.doesNotMatch(ui,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|indexedDB/);
 assert.doesNotMatch(code,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|indexedDB/);
 assert.match(ui,/aac_description_unusable/);
 assert.match(ui,/aac_encoder_runtime_failed/);
 assert.match(ui,/diagnostic_phase/);
});
