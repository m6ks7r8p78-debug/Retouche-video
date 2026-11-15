/* Banc 8K : création d'un MP4 réel dans GitHub Actions, séparée de Safari.
 * L'échelle 8K n'implique pas de qualité native : vérification dimensions, flux et audio.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dimensions8k,argumentsFFmpeg,convertir } from "../outils/export-8k.mjs";

test("8K UHD horizontal, vertical, paysage très large, et budget de pixels",()=>{
 assert.deepEqual([dimensions8k(1920,1080).largeur,dimensions8k(1920,1080).hauteur],[7680,4320]);
 assert.deepEqual([dimensions8k(1080,1920).largeur,dimensions8k(1080,1920).hauteur],[4320,7680]);
 for(const [w,h] of [[3840,3840],[3000,2000],[5000,1200],[7680,4320]])
  {const d=dimensions8k(w,h);assert.ok(d.largeur*d.hauteur<=7680*4320);
    assert.ok(d.largeur<=7680&&d.hauteur<=7680);}
 assert.throws(()=>dimensions8k(0,100),/Dimensions/);
});
test("source/destination distinctes et options sûres validées",()=>{
 assert.throws(()=>argumentsFFmpeg({entree:"a.mp4",sortie:"a.mp4",largeur:7680,hauteur:4320}),/distinctes/);
 assert.throws(()=>argumentsFFmpeg({entree:"a",sortie:"b",largeur:7680,hauteur:7680}),/Résolution/);
 assert.throws(()=>argumentsFFmpeg({entree:"a",sortie:"b",largeur:7680,hauteur:4320,preset:"nonsense"}),/Préréglage/);
 const v=argumentsFFmpeg({entree:"in.mp4",sortie:"out.mp4",largeur:7680,hauteur:4320});
 assert.ok(v.includes("6.2"));assert.ok(v.includes("0:a?"));
});
test("vraie conversion d'une courte vidéo avec son en 7680x4320 et flux AAC",()=>{
 const root=mkdtempSync(join(tmpdir(),"retouche-8k-"));
 try{
  const input=join(root,"in.mp4"),output=join(root,"out.mp4");
  execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y",
    "-f","lavfi","-i","color=c=gray:s=320x180:r=1:d=1",
    "-f","lavfi","-i","sine=frequency=440:sample_rate=44100:duration=1",
    "-t","1","-c:v","libx264","-preset","ultrafast","-c:a","aac",input],{timeout:30000});
  const result=convertir(input,output,{preset:"ultrafast",crf:28,timeoutMs:60000});
  assert.deepEqual([result.cible.largeur,result.cible.hauteur],[7680,4320]);
  const info=JSON.parse(execFileSync("ffprobe",["-v","error","-show_entries",
    "stream=codec_name,codec_type,width,height","-of","json",output],{timeout:10000}).toString());
  const video=info.streams.find(x=>x.codec_type==="video"),
    audio=info.streams.find(x=>x.codec_type==="audio");
  assert.equal(video.codec_name,"h264");assert.equal(video.width,7680);assert.equal(video.height,4320);
  assert.equal(audio?.codec_name,"aac");
  console.log("MP4 expérimental 8K vérifié par ffprobe : 7680×4320, H.264, AAC");
 }finally{rmSync(root,{recursive:true,force:true})}
},{timeout:90000});
