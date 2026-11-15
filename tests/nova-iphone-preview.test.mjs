import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
import crypto from "node:crypto";
const root=path.resolve(fileURLToPath(new URL("../",import.meta.url))),run=promisify(execFile);
test("NOVA 0.24 : aperçu HTTPS empaquetable sans réseau ni média privé",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-iphone-preview-"));
 try{
  await run(process.execPath,[path.join(root,"outils/build-nova-iphone-preview.mjs"),dir],{timeout:30000});
  const m=JSON.parse(await fs.readFile(path.join(dir,"asset-manifest.json"),"utf8"));
  assert.equal(m.publication,"none");
  assert.equal(m.version,"0.34");
  assert.equal(m.privateMediaIncluded,false);
  assert.ok(m.files.length>=20);
  const names=m.files.map(x=>x.path);
  assert.ok(names.includes("experiences/nova.html"));
  assert.ok(names.includes("experiences/nova-iphone-report.js"));
  assert.ok(names.includes("experiences/nova-smallmotion-bridge.js"));
  assert.ok(names.includes("experiences/nova-smallmotion-ui.js"));
  assert.ok(names.includes("experiences/nova-real-preflight.js"));
  assert.ok(names.includes("experiences/nova-real-preflight-ui.js"));
  assert.ok(names.includes("experiences/vendor/smallmotion/smallmotion-local.js"));
  assert.ok(names.includes("experiences/vendor/hevc/wasm/hevc-decode.wasm"));
  assert.ok(names.includes("experiences/vendor/hevc/LICENSE.txt"));
  assert.deepEqual(names.filter(x=>/\.(mov|mp4|png|jpg|jpeg)$/i.test(x)),
   ["experiences/nova-smallmotion-synthetic.mp4","experiences/nova-test-synthetic.mov"],
   "seules les deux mires générées par FFmpeg sont acceptées");
  const fixture=m.files.find(x=>x.path==="experiences/nova-test-synthetic.mov");
  assert.equal(fixture.origin,"ffmpeg-synthetic-only");
  assert.ok(fixture.bytes<100000);
  const {stdout}=await run("ffprobe",["-v","error",
   "-show_entries","stream=codec_name,codec_tag_string,width,height,color_primaries,color_transfer,color_space",
   "-of","json",path.join(dir,fixture.path)],{timeout:10000});
  const streams=JSON.parse(stdout).streams||[];
  assert.ok(streams.some(x=>x.codec_name==="hevc"&&x.width===160&&x.height===90&&
   x.color_primaries==="bt709"&&x.color_transfer==="bt709"&&x.color_space==="bt709"));
  assert.ok(streams.some(x=>x.codec_name==="aac"),"le clip doit conserver un son AAC");
  const motion=m.files.find(x=>x.path==="experiences/nova-smallmotion-synthetic.mp4");
  assert.equal(motion.origin,"ffmpeg-synthetic-only");
  assert.ok(motion.bytes<250000);
  const {stdout:motionProbe}=await run("ffprobe",["-v","error",
   "-show_entries","stream=codec_name,width,height,pix_fmt",
   "-of","json",path.join(dir,motion.path)],{timeout:10000});
  const ms=JSON.parse(motionProbe).streams||[];
  assert.ok(ms.some(x=>x.codec_name==="h264"&&x.width===160&&x.height===120&&
    x.pix_fmt==="yuv420p"));
  assert.equal(m.deployment,"manual-only-distinct-host");
  assert.equal(m.csp,"sha256-inline-allowlist");
  const headers=await fs.readFile(path.join(dir,"_headers"),"utf8");
  assert.ok(headers.startsWith("/*\n  Content-Security-Policy: "));
  assert.match(headers,/X-Robots-Tag: noindex, nofollow, noarchive/);
  assert.match(headers,/Cache-Control: no-store/);
  assert.match(headers,/frame-ancestors 'none'/);
  assert.match(headers,/script-src 'self' 'sha256-[a-zA-Z0-9+/=]+' 'wasm-unsafe-eval'/);
  const original=await fs.readFile(path.join(dir,"experiences/nova.html"),"utf8");
  const inline=[...original.matchAll(/<script(?!\s+src=)[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
  assert.equal(inline.length,1);
  const signature=crypto.createHash("sha256").update(inline[0]).digest("base64");
  assert.ok(headers.includes("'sha256-"+signature+"'"),"CSP liée au script inline exact");
  assert.equal(await fs.readFile(path.join(dir,"robots.txt"),"utf8"),
    "User-agent: *\nDisallow: /\n");

  for(const file of m.files){
   const data=await fs.readFile(path.join(dir,file.path));
   assert.equal(file.bytes,data.length);
   assert.equal(file.sha256,crypto.createHash("sha256").update(data).digest("hex"));
  }
  const html=await fs.readFile(path.join(dir,"experiences/nova.html"),"utf8");
  assert.match(html,/Tester Safari sur cette vidéo/);
  assert.match(html,/Tester Safari sans vidéo personnelle/);
  assert.match(html,/SmallMotion · mouvement local/);
  assert.match(html,/Tester SmallMotion sans vidéo personnelle/);
  assert.match(html,/Précontrôle d\x27une vidéo réelle/);
  assert.match(html,/nova-real-preflight.js/);
  assert.match(html,/nova-smallmotion-bridge.js/);
  assert.ok(html.includes('src="./vendor/smallmotion/smallmotion-local.js"'));
  assert.match(html,/nova-iphone-report.js/);
  assert.doesNotMatch(html,/<script src="https?:\/\//);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});

test("NOVA 0.24 : consignes Safari et lien de coordination traçables",async()=>{
 const doc=await fs.readFile(path.join(root,"experiences","NOVA_IPHONE_TEST.md"),"utf8");
 assert.match(doc,/^# NOVA 0\.24/m);
 assert.match(doc,/Tester Safari sans vidéo personnelle/);
 assert.match(doc,/coordination-retoucheproai-v1/);
 assert.ok(!doc.includes(String.raw`\n3.`),"numérotation Markdown réelle requise");
 assert.ok(!doc.includes(String.raw`\nLe rapport`),"retours ligne réels requis");
 assert.match(doc,/aucun essai sur un iPhone réel certifié/);
});
