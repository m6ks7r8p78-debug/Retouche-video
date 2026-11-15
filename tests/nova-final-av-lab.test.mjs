import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import G from "../experiences/nova-final-av-lab/core.js";
const root=path.resolve(path.dirname(url.fileURLToPath(import.meta.url)),"../experiences/nova-final-av-lab");
const movie=Object.freeze({name:"PRIVATE_PERSON_HEVC_REEL_2026.mov",
 type:"video/quicktime",size:90000,slice(){}});
const result=()=>({
 blob:new Blob([new Uint8Array(5000)],{type:"video/mp4"}),
 mode:"native-hd-classical",audioMode:"aac-native-encode",
 sourceFrames:195,outputFrames:195,
 originalWidth:1088,originalHeight:1920,
 durationSeconds:6.5,sourceFps:30
});
test("accepts opt-in short genuine MOV metadata only",()=>{
 assert.equal(G.validateFile(movie),true);
 assert.equal(G.validateFile({...movie,name:"a.mp4",type:"video/mp4"}),true);
});
test("rejects missing input before any access",()=>{
 assert.equal(G.validateFile(null),false);
 assert.equal(G.validateFile({size:15,type:"video/mp4"}),false);
});
test("does not accept invalid oversize file",()=>{
 assert.equal(G.validateFile({...movie,size:16*1048576+1}),false);
 assert.equal(G.validateFile({...movie,size:-1}),false);
 assert.equal(G.validateFile({...movie,size:NaN}),false);
});
test("does not accept plain JSON and non-video file types",()=>{
 assert.equal(G.validateFile({...movie,name:"notes.json",type:"application/json"}),false);
 assert.equal(G.validateFile({...movie,name:"audio.wav",type:"audio/wav"}),false);
});
test("supports iPhone MOV and MP4 local streams",()=>{
 assert.equal(G.validateFile({...movie,name:"clip.MOV",type:"application/octet-stream"}),true);
});
test("validates MP4 with AAC and one-to-one original frame count",()=>{
 assert.equal(G.validOutput(result()),true);
});
test("rejects output Blob with no or wrong video MIME",()=>{
 assert.equal(G.validOutput({...result(),blob:new Blob([new Uint8Array(10)],{type:"video/mp4"})}),false);
 assert.equal(G.validOutput({...result(),blob:new Blob([new Uint8Array(5000)],{type:"text/plain"})}),false);
});
test("forbids missing audio qualification and silent video",()=>{
 assert.equal(G.validOutput({...result(),audioMode:"silent"}),false);
 assert.equal(G.validOutput({...result(),audioMode:null}),false);
});
test("forbids dropped frames or invented frames",()=>{
 assert.equal(G.validOutput({...result(),outputFrames:194}),false);
 assert.equal(G.validOutput({...result(),outputFrames:196}),false);
});
test("forbids resolution growth or over-limit HD",()=>{
 assert.equal(G.validOutput({...result(),originalWidth:2160,originalHeight:3840}),false);
});
test("forbids clip durations outside lab budget",()=>{
 assert.equal(G.validOutput({...result(),durationSeconds:14}),false);
 assert.equal(G.validOutput({...result(),durationSeconds:0}),false);
});
test("not a physical Safari or audiovisual sync certification",()=>{
 const r=G.report(G.statuses.assembled,{out:result(),phase:"complete"});
 assert.equal(r.output_mp4_structure_checked_by_existing_nova_engine,true);
 assert.equal(r.physical_iphone_independently_certified,false);
 assert.equal(r.independent_audio_video_sync_verified,false);
 assert.equal(r.user_reported_audio_audible,false);
 assert.equal(r.user_reported_image_visible,false);
 assert.equal(r.status,G.statuses.assembled);
});
test("user cannot claim audio playback merely from generated MP4",()=>{
 const r=G.report(G.statuses.reviewed,{out:result(),phase:"complete"});
 assert.equal(r.user_reported_audio_audible,false);
 assert.equal(r.user_reported_image_visible,false);
 assert.equal(r.physical_iphone_independently_certified,false);
});
test("an explicit manual video + audio review has a separate status",()=>{
 const r=G.report(G.statuses.reviewed,{
  out:result(),phase:"complete",manuallyObserved:{
   video_visible:true,audio_audible:true,sync_plausible:false
  }});
 assert.equal(r.user_reported_audio_audible,true);
 assert.equal(r.user_reported_image_visible,true);
 assert.equal(r.user_reported_sync_plausible,false);
 assert.equal(r.physical_iphone_independently_certified,false);
});
test("manual reported sync remains unverified independently",()=>{
 const r=G.report(G.statuses.reviewed,{
  out:result(),phase:"complete",manuallyObserved:{
   video_visible:true,audio_audible:true,sync_plausible:true
  }});
 assert.equal(r.user_reported_sync_plausible,true);
 assert.equal(r.independent_audio_video_sync_verified,false);
});
test("all reports redact private file names, media and identifiers",()=>{
 for(const status of [G.statuses.failed,G.statuses.assembled,G.statuses.reviewed]){
  const r=G.report(status,{out:status===G.statuses.failed?null:result(),
   phase:"audio",errorCode:"aac_track_not_verified",
   manuallyObserved:{video_visible:true,audio_audible:true}});
  const text=JSON.stringify(r);
  for(const forbidden of ["PRIVATE_PERSON_HEVC","bytes:","Uint8Array","gps","userAgent",
    "PRIVATE_PERSON","arrayBuffer","source_path"])assert.ok(!text.includes(forbidden),forbidden);
  assert.equal(r.local_file_uploaded,false);
  assert.equal(r.automatic_network_requests,false);
  assert.equal(r.automatic_download,false);
  assert.equal(r.original_changed,false);
  assert.equal(r.report_shared_automatically,false);
 }
});
test("untrusted error messages are never emitted",()=>{
 const s=G.stageOf(new Error("device serial=PRIVATE_PERSON.mov"),"audio");
 assert.ok(/failed_during_audio|processing_failed/.test(s));
 const r=G.report(G.statuses.failed,{phase:"audio",errorCode:s});
 assert.ok(!JSON.stringify(r).includes("PRIVATE_PERSON.mov"));
});
test("AAC failure has a safe categorical code",()=>{
 assert.equal(G.stageOf(Error("piste audio AAC du MP4 final non vérifiable"),"complete"),
   "aac_track_not_verified");
});
test("HDR and wide-gamut are fail-closed",()=>{
 assert.equal(G.stageOf(Error("gamut HDR/P3 non représentable"),"source"),
  "source_color_not_eligible");
});
test("timeline and memory problems are distinct",()=>{
 assert.equal(G.stageOf(Error("PTS source hors durée"),"video"),
  "source_timeline_not_eligible");
 assert.equal(G.stageOf(Error("budget mémoire dépassé"),"video"),
  "memory_or_size_guard");
});
test("script dependencies include production NOVA HD only and no network upload",()=>{
 const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
 const ui=fs.readFileSync(path.join(root,"ui.js"),"utf8");
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/media-src blob:/);
 assert.match(html,/nova-aac-native.js/);
 assert.match(html,/nova-native-hd.js/);
 assert.match(html,/mp4-muxer.js/);
 assert.match(ui,/NOVA_NATIVE_HD\.exporter/);
 assert.doesNotMatch(ui,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|indexedDB|getUserMedia/);
 assert.match(ui,/video-visible/);
 assert.match(ui,/audio-audible/);
 assert.match(ui,/save\.hidden=true/);
});
test("do not disclose source duration or filename in a failed report",()=>{
 const r=G.report(G.statuses.failed,{phase:"video",errorCode:"processing_failed"});
 assert.equal(r.output_video_frames,null);
 assert.equal(r.output_resolution,null);
 assert.equal(r.output_duration_s,null);
 assert.equal(r.source_name_included,false);
});
test("report codes cannot be injected",()=>{
 const r=G.report(G.statuses.failed,{
  phase:"SECRET stage",errorCode:"https://evil.example/?video=PRIVATE_PERSON.mov"});
 assert.equal(r.stage,"none");
 assert.equal(r.error_code,"processing_failed");
});
