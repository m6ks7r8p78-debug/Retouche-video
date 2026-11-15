import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import PROBE from "../experiences/nova-safari-aac-probe/core.js";
const here=path.dirname(url.fileURLToPath(import.meta.url));
const folder=path.resolve(here,"../experiences/nova-safari-aac-probe");
class Data {
 constructor(opts){
  assert.equal(opts.format,"f32-planar");
  assert.equal(opts.sampleRate,48000);
  assert.equal(opts.numberOfChannels,2);
  assert.equal(opts.numberOfFrames,1024);
  assert.equal(opts.data.length,2048);
  this.timestamp=opts.timestamp;
  this.closed=false;
 }
 close(){this.closed=true}
}
class Encoder {
 static async isConfigSupported(config){
  return {supported:config.codec==="mp4a.40.2"&&
   config.sampleRate===48000&&config.aac?.format==="aac"};
 }
 constructor({output,error}){this.output=output;this.error=error}
 configure(c){this.config=c}
 encode(data){
  assert.equal(data.closed,false);
  this.output({timestamp:data.timestamp,byteLength:8,copyTo:b=>b.set([1,2,3,4,5,6,7,8])});
 }
 async flush(){}
 close(){this.closed=true}
}
const api=(overrides={})=>({
 isSecureContext:true,AudioEncoder:Encoder,AudioData:Data,
 VideoDecoder:class {static async isConfigSupported(){return {supported:true}}},
 ...overrides,
});
test("NOVA probe uses real synthetic PCM data and verifies actual AAC emitted chunks",async()=>{
 const r=await PROBE.run({api:api()});
 assert.equal(r.status,"native-aac-encoded-synthetic");
 assert.equal(r.actual_aac_chunks_produced,24);
 assert.equal(r.actual_aac_bytes_produced,192);
 assert.equal(r.hevc_config_probe,"reported-supported-config-only");
 assert.equal(r.hevc_stream_decode_tested,false);
 assert.equal(r.mp4_source_audio_decode_tested,false);
});
test("does not overclaim personal media, exported video, or physical Safari",async()=>{
 const r=await PROBE.run({api:api()});
 assert.equal(r.real_video_imported,false);
 assert.equal(r.video_export_tested,false);
 assert.equal(r.original_audio_copied,false);
 assert.equal(r.physical_safari_independently_certified,false);
 assert.equal(r.report_sent_automatically,false);
 assert.equal(r.no_personal_data_collected,true);
 const s=JSON.stringify(r);
 assert.ok(!/userAgent|filename|deviceId|IPAddress|geolocation|microphone|timestamp/i.test(s));
});
test("insecure contexts fail closed even if AAC is present",async()=>{
 const r=await PROBE.run({api:api({isSecureContext:false})});
 assert.equal(r.status,"insecure-context");
 assert.equal(r.actual_aac_chunks_produced,0);
});
test("AudioEncoder absent is clear unsupported evidence",async()=>{
 const r=await PROBE.run({api:api({AudioEncoder:undefined})});
 assert.equal(r.status,"webcodecs-unavailable");
});
test("AudioData absent never claims AAC emitted",async()=>{
 const r=await PROBE.run({api:api({AudioData:undefined})});
 assert.equal(r.status,"webcodecs-unavailable");
});
test("AAC codec rejected by isConfigSupported",async()=>{
 class Unsupported extends Encoder {
  static async isConfigSupported(){return {supported:false}}
 }
 assert.equal((await PROBE.run({api:api({AudioEncoder:Unsupported})})).status,"codec-unsupported");
});
test("AAC codec support API throws, never inferred success",async()=>{
 class Unsupported extends Encoder {
  static async isConfigSupported(){throw Error("not supported")}
 }
 assert.equal((await PROBE.run({api:api({AudioEncoder:Unsupported})})).status,"codec-unsupported");
});
test("configure failure is rejected without leaking browser internals",async()=>{
 class Failed extends Encoder{configure(){throw Error("private_device_info")}}
 const r=await PROBE.run({api:api({AudioEncoder:Failed})});
 assert.equal(r.status,"codec-supported-but-encode-failed");
 assert.ok(!JSON.stringify(r).includes("private_device_info"));
});
test("encoder outputs no AAC: never invent a success",async()=>{
 class Silent extends Encoder {encode(){}}
 const r=await PROBE.run({api:api({AudioEncoder:Silent})});
 assert.equal(r.status,"codec-supported-but-encode-failed");
});
test("out of order AAC chunks are rejected",async()=>{
 class Reversed extends Encoder{
  encode(input){this.output({timestamp:0,byteLength:8,copyTo:b=>b.fill(1)})}
 }
 const r=await PROBE.run({api:api({AudioEncoder:Reversed})});
 assert.equal(r.status,"codec-supported-but-encode-failed");
});
test("ADTS headers rejected when raw AAC expected",async()=>{
 class WithADTS extends Encoder{
  encode(input){this.output({timestamp:input.timestamp,byteLength:8,
   copyTo:b=>b.set([0xff,0xf1,3,4,5,6,7,8])})}
 }
 const r=await PROBE.run({api:api({AudioEncoder:WithADTS})});
 assert.equal(r.status,"codec-supported-but-encode-failed");
});
test("malformed chunk bytes must fail closed",async()=>{
 class Empty extends Encoder{
  encode(input){this.output({timestamp:input.timestamp,byteLength:0,copyTo:b=>{}})}
 }
 assert.equal((await PROBE.run({api:api({AudioEncoder:Empty})})).status,"codec-supported-but-encode-failed");
});
test("HEVC probe unknown does not block successful synthetic AAC",async()=>{
 const r=await PROBE.run({api:api({VideoDecoder:undefined})});
 assert.equal(r.hevc_config_probe,"api-unavailable");
 assert.equal(r.status,"native-aac-encoded-synthetic");
});
test("HEVC API refusal clearly reported without decode claim",async()=>{
 class NoHEVC{static async isConfigSupported(){return {supported:false}}}
 const r=await PROBE.run({api:api({VideoDecoder:NoHEVC})});
 assert.equal(r.hevc_config_probe,"not-reported-supported");
 assert.equal(r.hevc_stream_decode_tested,false);
});
test("HEVC probe exceptions are not a success",async()=>{
 class InvalidHEVC{static async isConfigSupported(){throw Error("unsupported")}}
 const r=await PROBE.run({api:api({VideoDecoder:InvalidHEVC})});
 assert.equal(r.hevc_config_probe,"probe-error");
 assert.equal(r.status,"native-aac-encoded-synthetic");
});
test("already cancelled, never starts encoding",async()=>{
 const controller=new AbortController();controller.abort();
 const r=await PROBE.run({api:api(),signal:controller.signal});
 assert.equal(r.status,"cancelled");
 assert.equal(r.actual_aac_chunks_produced,0);
});
test("cancellation during encoding closes encoder without success",async()=>{
 const controller=new AbortController();
 class Cancel extends Encoder {encode(input){controller.abort()}}
 const r=await PROBE.run({api:api({AudioEncoder:Cancel}),signal:controller.signal});
 assert.equal(r.status,"cancelled");
});
test("all code and HTML are local only, no microphone or media import",()=>{
 const html=fs.readFileSync(path.join(folder,"index.html"),"utf8");
 const ui=fs.readFileSync(path.join(folder,"ui.js"),"utf8");
 const core=fs.readFileSync(path.join(folder,"core.js"),"utf8");
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/media-src 'none'/);
 assert.match(html,/ni ton micro/i);
 assert.doesNotMatch(html,/<input\b|<video\b|<form\b/);
 assert.doesNotMatch(ui,/\bfetch\s*\(|XMLHttpRequest|indexedDB|localStorage|sessionStorage|mediaDevices|getUserMedia/);
 assert.doesNotMatch(core,/\bfetch\s*\(|XMLHttpRequest|indexedDB|localStorage|sessionStorage|mediaDevices|getUserMedia/);
});
test("generated output is bounded to 24 chunks and never contains PCM arrays",async()=>{
 const r=await PROBE.run({api:api()});
 assert.equal(Object.keys(r).length,17);
 assert.equal(r.actual_aac_chunks_produced,24);
 assert.ok(!JSON.stringify(r).includes("Float32Array"));
});
