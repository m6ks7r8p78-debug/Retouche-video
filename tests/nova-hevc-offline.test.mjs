/* NOVA 0.18 : preuve d'exécution du WASM réellement versionné sur GitHub.
 * Pas d'installation npm, pas d'appel CDN, aucune vidéo privée.
 * La référence FFmpeg sur un bitstream HEVC synthétique est pixel-exacte.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import crypto from "node:crypto";
import {createRequire} from "node:module";
import {fileURLToPath,pathToFileURL} from "node:url";
import {verify} from "../outils/nova-hevc-assets.mjs";
const run=promisify(execFile),require=createRequire(import.meta.url);
const root=path.resolve(fileURLToPath(new URL("../",import.meta.url)));
const vendor=path.join(root,"experiences/vendor/hevc");
test("NOVA 0.18 : le WASM HEVC versionné décode hors npm et égale FFmpeg",async(t)=>{
 const manifest=await verify();
 assert.equal(manifest.assets.length,4);
 const wasm=fsSync.readFileSync(path.join(vendor,"wasm/hevc-decode.wasm"));
 assert.ok(WebAssembly.validate(wasm),"binaire WASM du dépôt invalide");
 const glue=require(path.join(vendor,"wasm/hevc-decode.js"));
 assert.equal(typeof glue,"function");
 const originalGlobal=globalThis.HEVCDecoderModule,originalFetch=globalThis.fetch;
 // Le glue Emscripten MIT expose locateFile, pas wasmBinary comme option.
 // En Node, locateFile est résolu par fs.readFileSync depuis le dépôt.
 globalThis.HEVCDecoderModule=options=>glue({...options,
  locateFile:()=>path.join(vendor,"wasm/hevc-decode.wasm")});
 globalThis.fetch=()=>{throw new Error("Interdiction réseau dans ce test HEVC local")};
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),"nova-hevc-offline-"));
 try{
  const source=path.join(temp,"source.h265");
  await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-f","lavfi","-i","testsrc2=size=160x90:rate=15:duration=1.2",
   "-c:v","libx265","-preset","ultrafast","-threads","1",
   "-x265-params","pools=none:frame-threads=1:log-level=error:bframes=2",
   "-pix_fmt","yuv420p","-f","hevc","-y",source],{timeout:60000});
  const {stdout:raw}=await run("ffmpeg",["-hide_banner","-loglevel","error",
   "-i",source,"-pix_fmt","yuv420p","-f","rawvideo","-"],
   {encoding:null,maxBuffer:8*1024*1024});
  const expected=crypto.createHash("sha256").update(raw).digest("hex");
  const sourceBytes=new Uint8Array(await fs.readFile(source));
  const {HEVCDecoder}=await import(pathToFileURL(path.join(vendor,"decoder-entry.js")).href);
  const decoder=await HEVCDecoder.create();
  let frames=0,digest=crypto.createHash("sha256");
  try{
   const decoded=decoder.decode(sourceBytes);
   assert.ok(decoded.frames.length>=15);
   for(const frame of decoded.frames){
    assert.equal(frame.bitDepth,8);
    assert.deepEqual([frame.width,frame.height],[160,90]);
    for(const plane of [frame.y,frame.cb,frame.cr])digest.update(Buffer.from(plane));
    frames++;
   }
  }finally{decoder.destroy()}
  assert.equal(frames,raw.length/(160*90*3/2));
  assert.equal(digest.digest("hex"),expected,
   "les YUV du moteur embarqué doivent être identiques à FFmpeg");
  t.diagnostic("HEVC Git hors npm : "+frames+" images YUV bit-exactes");
 }finally{
  globalThis.HEVCDecoderModule=originalGlobal;
  globalThis.fetch=originalFetch;
  await fs.rm(temp,{recursive:true,force:true});
 }
});
