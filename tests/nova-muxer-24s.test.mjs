import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source=fs.readFileSync(new URL("../mp4-muxer.js",import.meta.url),"utf8");
const MP4=vm.runInNewContext(source+";Mp4Muxer");
function setup({seconds=20,windowed,fastStart="in-memory",editMediaTime=0,
  rollDistance}={}){
 const audio={codec:"aac",sampleRate:48000,numberOfChannels:1,
  editMediaTime,editDurationSeconds:seconds,
  ...(windowed!==undefined?{windowed24Seconds:windowed}:{}),
  ...(rollDistance!==undefined?{rollDistance}:{}),
 };
 return new MP4.Muxer({target:new MP4.ArrayBufferTarget(),fastStart,
  video:{codec:"avc",width:320,height:180},audio});
}
test("Muxer AAC héritage: 13 s restent interdits sans profil explicite",()=>{
 assert.throws(()=>setup({seconds:13}),/Unsupported AAC priming edit list/);
 assert.doesNotThrow(()=>setup({seconds:12}));
});
test("Muxer AAC fenêtres: 20 et 24 s acceptés uniquement en MP4 progressif",()=>{
 assert.doesNotThrow(()=>setup({seconds:20,windowed:true}));
 assert.doesNotThrow(()=>setup({seconds:24,windowed:true}));
 assert.throws(()=>setup({seconds:24.1,windowed:true}),/Unsupported windowed AAC/);
 assert.throws(()=>setup({seconds:25,windowed:true}),/Unsupported windowed AAC/);
 assert.throws(()=>setup({seconds:20,windowed:false}),/Unsupported windowed AAC/);
 assert.throws(()=>setup({seconds:20,windowed:true,fastStart:"fragmented"}),/Unsupported windowed AAC/);
});
test("Muxer fenêtres conserve la sécurité du priming (roll obligatoire si trim)",()=>{
 assert.throws(()=>setup({seconds:20,windowed:true,editMediaTime:1024}),
   /Unsupported AAC priming edit list/);
 assert.doesNotThrow(()=>setup({seconds:20,windowed:true,editMediaTime:1024,
   rollDistance:-1}));
});
