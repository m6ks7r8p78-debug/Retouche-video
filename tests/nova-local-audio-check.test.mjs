import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import CHECK from "../experiences/nova-local-audio-check/core.js";
const here=path.dirname(url.fileURLToPath(import.meta.url));
const uiRoot=path.resolve(here,"../experiences/nova-local-audio-check");
const file={name:"PRIVATE_TOUR_PERSON.mov",size:154000,
 arrayBuffer:async()=>{throw Error("Mock native must read file itself")}};
function packet(n){
 const p=Array.from({length:n},(_,i)=>({bytes:new Uint8Array([4,5,6,7,8,9,10]),
  timestamp:Math.round(i*1024*1e6/48000),
  duration:Math.round(1024*1e6/48000)}));
 return p;
}
const goodNative={planifier:async(_f,{durationSeconds})=>{
 assert.ok(durationSeconds<=12.2);
 return {mode:"aac-native-encode",packets:packet(48),sampleRate:48000,channels:2};
}};
test("valid source produces whitelist only and no personal filename",async()=>{
 const x=await CHECK.check(file,{durationSeconds:1,native:goodNative});
 assert.equal(x.status,"local_source_aac_reencode_chunks_verified");
 assert.equal(x.aac_lc_reencoded_chunk_count,48);
 assert.equal(x.aac_lc_reencoded_byte_count,336);
 assert.equal(x.source_audio_format_identified,false);
 assert.equal(x.final_mp4_created,false);
 assert.equal(x.audio_video_sync_verified,false);
 assert.equal(x.real_video_imported,undefined);
 assert.equal(x.source_media_uploaded,false);
 assert.equal(x.audio_samples_or_chunks_in_report,false);
 assert.ok(!JSON.stringify(x).includes("PRIVATE_TOUR_PERSON"));
});
test("report is not a certificate of Safari or valid export",async()=>{
 const x=await CHECK.check(file,{durationSeconds:1,native:goodNative});
 assert.equal(x.physical_iphone_independently_certified,false);
 assert.equal(x.original_file_modified,false);
 assert.equal(x.final_mp4_created,false);
 assert.equal(x.video_frames_processed,false);
 assert.equal(x.audio_video_sync_verified,false);
 assert.equal(x.report_shared_automatically,false);
});
test("source file object remains untouched",async()=>{
 const before={...file};
 await CHECK.check(file,{durationSeconds:1,native:goodNative});
 assert.deepEqual(file,before);
});
test("no input rejected with minimal report",async()=>{
 const x=await CHECK.check(null,{durationSeconds:1,native:goodNative});
 assert.equal(x.status,CHECK.CODES.no_file);
});
test("zero byte file refused",async()=>{
 const x=await CHECK.check({size:0,arrayBuffer(){},name:"foo.mov"},
  {durationSeconds:1,native:goodNative});
 assert.equal(x.status,CHECK.CODES.no_file);
});
test("invalid unsafe size refused",async()=>{
 const x=await CHECK.check({size:-9,arrayBuffer(){}},{durationSeconds:1,native:goodNative});
 assert.equal(x.status,CHECK.CODES.no_file);
});
test("size greater than 16 MiB blocked before native reads anything",async()=>{
 const x=await CHECK.check({...file,size:16*1048576+1},{
  durationSeconds:1,native:{planifier:async()=>{throw Error("SHOULD_NOT_RUN")}}});
 assert.equal(x.status,CHECK.CODES.budget);
});
test("too long / unavailable duration blocked",async()=>{
 for(const durationSeconds of [0,12.201,NaN,Infinity,-2]){
  const x=await CHECK.check(file,{durationSeconds,native:goodNative});
  assert.equal(x.status,CHECK.CODES.budget,String(durationSeconds));
 }
});
test("missing native module never fabricates source success",async()=>{
 const x=await CHECK.check(file,{durationSeconds:1,native:null});
 assert.equal(x.status,CHECK.CODES.no_api);
});
test("already aborted never opens media",async()=>{
 const ctrl=new AbortController();ctrl.abort();
 const x=await CHECK.check(file,{durationSeconds:1,signal:ctrl.signal,native:goodNative});
 assert.equal(x.status,CHECK.CODES.cancelled);
});
test("abort during native decode never yields success",async()=>{
 const ctrl=new AbortController();
 const x=await CHECK.check(file,{durationSeconds:1,signal:ctrl.signal,
  native:{planifier:async()=>{ctrl.abort();return {mode:"aac-native-encode",packets:packet(48),sampleRate:48000,channels:2}}}});
 assert.equal(x.status,CHECK.CODES.cancelled);
});
test("decodeAudioData failure is classified, never reveals private errors",async()=>{
 const x=await CHECK.check(file,{durationSeconds:1,native:{
  planifier:async()=>{throw Error("Audio natif NOVA : décodage de la piste audio locale indisponible [PRIVATE_MOV_NAME]")}
 }});
 assert.equal(x.status,CHECK.CODES.decode);
 assert.ok(!JSON.stringify(x).includes("PRIVATE_MOV_NAME"));
});
test("AudioEncoder unsupported is informative and private",async()=>{
 const x=await CHECK.check(file,{durationSeconds:1,native:{
  planifier:async()=>{throw Error("Audio natif NOVA : encodeur AAC-LC non pris en charge")}
 }});
 assert.equal(x.status,CHECK.CODES.unsupported);
});
test("audio/video length mismatch has distinct result",async()=>{
 const x=await CHECK.check(file,{durationSeconds:1,native:{
  planifier:async()=>{throw Error("Audio natif NOVA : durée audio décodée différente de la vidéo")}
 }});
 assert.equal(x.status,CHECK.CODES.duration);
});
test("incompatible PCM gets distinct status",async()=>{
 const x=await CHECK.check(file,{durationSeconds:1,native:{
  planifier:async()=>{throw Error("Audio natif NOVA : tampon PCM natif invalide")}
 }});
 assert.equal(x.status,CHECK.CODES.pcm);
});
test("arbitrary exception gets generic safe result",async()=>{
 const x=await CHECK.check(file,{durationSeconds:1,native:{
  planifier:async()=>{throw Error("user@email.com PRIVATE ACCESS TOKEN")}
 }});
 assert.equal(x.status,CHECK.CODES.unknown);
 assert.ok(!JSON.stringify(x).includes("PRIVATE ACCESS TOKEN"));
});
test("unverified native plan rejected without copying media bytes",async()=>{
 const x=await CHECK.check(file,{durationSeconds:1,native:{planifier:async()=>({mode:"aac-native-encode",packets:[]})}});
 assert.equal(x.status,CHECK.CODES.packets);
});
test("AAC packet bytes and timestamps validated",async()=>{
 const p=packet(48);p[9].timestamp=p[8].timestamp;
 const x=await CHECK.check(file,{durationSeconds:1,native:{
  planifier:async()=>({mode:"aac-native-encode",packets:p,sampleRate:48000,channels:2})
 }});
 assert.equal(x.status,CHECK.CODES.packets);
});
test("raw AAC arrays never carried into JSON",async()=>{
 const x=await CHECK.check(file,{durationSeconds:1,native:goodNative});
 assert.ok(!JSON.stringify(x).includes('"bytes"'));
 assert.ok(!JSON.stringify(x).includes('"packets"'));
 assert.ok(!JSON.stringify(x).includes("PRIVATE_TOUR_PERSON"));
});
test("bad sample rate blocked",async()=>{
 const x=await CHECK.check(file,{durationSeconds:1,native:{
  planifier:async()=>({mode:"aac-native-encode",packets:packet(48),
   sampleRate:NaN,channels:2})
 }});
 assert.equal(x.status,CHECK.CODES.packets);
});
test("bad AAC channel count blocked",async()=>{
 const x=await CHECK.check(file,{durationSeconds:1,native:{
  planifier:async()=>({mode:"aac-native-encode",packets:packet(48),
   sampleRate:48000,channels:9})
 }});
 assert.equal(x.status,CHECK.CODES.packets);
});
test("static CSP forbids all network and allows only local blobs",()=>{
 const html=fs.readFileSync(path.join(uiRoot,"index.html"),"utf8");
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/media-src blob:/);
 assert.match(html,/form-action 'none'/);
 assert.doesNotMatch(html,/https?:\/\/|<iframe\b|<form\b/);
});
test("video only selected by user and report is generated on click",()=>{
 const html=fs.readFileSync(path.join(uiRoot,"index.html"),"utf8");
 const ui=fs.readFileSync(path.join(uiRoot,"ui.js"),"utf8");
 assert.match(html,/type="file"/);
 assert.match(ui,/start\.addEventListener\("click"/);
 assert.match(ui,/input\.addEventListener\("change"/);
 assert.doesNotMatch(ui,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie/);
 assert.doesNotMatch(ui,/getUserMedia|mediaDevices/);
});
