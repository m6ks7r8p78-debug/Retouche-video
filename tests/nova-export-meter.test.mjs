import test from "node:test";
import assert from "node:assert/strict";
import M from "../experiences/nova-export-meter.js";
test("NOVA 0.22 : mesure phases A/V complètes et octets réellement collectés",()=>{
 let time=10,heap=2000;
 const m=M.create({maxEncodedBytes:2048,clock:()=>time,readJsHeap:()=>heap});
 time=14;m.stage("audio");
 m.add("audio",100);heap=3000;
 time=24;m.stage("video");
 m.frame({queue:4,bufferBytes:640});m.add("video",400);
 m.frame({queue:2,bufferBytes:800});
 time=40;m.stage("video-flush");
 time=44;m.stage("aac-copy");
 m.add("audio",100);
 time=50;m.stage("mux");
 time=55;m.stage("verify");
 time=70;m.stage("complete");
 const s=m.snapshot();
 assert.equal(s.completed,true);assert.equal(s.elapsedMs,60);
 assert.equal(s.stagesMs.preflight,4);assert.equal(s.stagesMs.audio,10);
 assert.equal(s.stagesMs.video,16);assert.equal(s.stagesMs["video-flush"],4);
 assert.equal(s.stagesMs["aac-copy"],6);
 assert.equal(s.stagesMs.mux,5);assert.equal(s.stagesMs.verify,15);
 assert.equal(s.encodedPayloadBytes,600);
 assert.equal(s.encodedAudioBytes,200);assert.equal(s.encodedVideoBytes,400);
 assert.equal(s.frames,2);assert.equal(s.peakVideoEncodeQueue,4);
 assert.equal(s.peakFrameCopyBytes,800);assert.equal(s.jsHeapPeakBytes,3000);
 assert.equal(s.checkpoints.length,7);
 assert.match(s.qualification,/excludes.*WASM heap/);
});
test("NOVA 0.22 : budget encodé refuse AVANT dépassement et comptage",()=>{
 const m=M.create({maxEncodedBytes:1024,clock:()=>0});
 m.add("video",850);
 assert.throws(()=>m.add("audio",200),/dépassent le plafond mémoire/);
 assert.equal(m.snapshot().encodedPayloadBytes,850);
 assert.equal(m.snapshot().encodedAudioBytes,0);
 assert.equal(m.snapshot().completed,false);
});
test("NOVA 0.22 : paramètres invalides et horloges/ordres non monotones refusés",()=>{
 for(const v of [0,512,24*1048576+1,NaN,1.2])
  assert.throws(()=>M.create({maxEncodedBytes:v}),/limite encodée invalide/);
 let t=10;const m=M.create({clock:()=>t,readJsHeap:()=>null});
 assert.throws(()=>m.stage("completeXYZ"),/ordre des phases/);
 assert.throws(()=>m.add("audio",-1),/taille/);
 assert.throws(()=>m.frame({queue:-2}),/statistiques/);
 m.stage("audio");
 assert.throws(()=>m.stage("audioXYZ"),/ordre/);
 t=9;assert.throws(()=>m.stage("video"),/horloge non monotone/);
 t=11;m.stage("video");
 assert.throws(()=>m.stage("audio"),/ordre/);
 m.stage("complete");
 assert.throws(()=>m.stage("complete"),/après clôture/);
 assert.throws(()=>m.add("video",1),/après clôture/);
});

test("NOVA 0.22 : vérifie le MP4 final séparément des payloads",()=>{
 const m=M.create({maxEncodedBytes:2048,clock:()=>1,readJsHeap:()=>null});
 m.add("video",900);
 assert.throws(()=>m.finalSize(2050),/MP4 final dépasse/);
 assert.equal(m.snapshot().finalMp4Bytes,null);
 m.finalSize(1400);
 m.stage("complete");
 assert.equal(m.snapshot().finalMp4Bytes,1400);
 assert.equal(m.snapshot().jsHeapPeakBytes,null);
});
