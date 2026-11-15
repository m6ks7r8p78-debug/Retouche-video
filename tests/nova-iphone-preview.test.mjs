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
test("NOVA 0.23 : aperçu HTTPS empaquetable sans réseau ni média privé",async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"nova-iphone-preview-"));
 try{
  await run(process.execPath,[path.join(root,"outils/build-nova-iphone-preview.mjs"),dir],{timeout:30000});
  const m=JSON.parse(await fs.readFile(path.join(dir,"asset-manifest.json"),"utf8"));
  assert.equal(m.publication,"none");
  assert.equal(m.privateMediaIncluded,false);
  assert.ok(m.files.length>=20);
  const names=m.files.map(x=>x.path);
  assert.ok(names.includes("experiences/nova.html"));
  assert.ok(names.includes("experiences/nova-iphone-report.js"));
  assert.ok(names.includes("experiences/vendor/hevc/wasm/hevc-decode.wasm"));
  assert.ok(names.includes("experiences/vendor/hevc/LICENSE.txt"));
  assert.ok(!names.some(x=>/\.(mov|mp4|png|jpg|jpeg)$/i.test(x)),
   "aucun média privé dans le paquet");
  for(const file of m.files){
   const data=await fs.readFile(path.join(dir,file.path));
   assert.equal(file.bytes,data.length);
   assert.equal(file.sha256,crypto.createHash("sha256").update(data).digest("hex"));
  }
  const html=await fs.readFile(path.join(dir,"experiences/nova.html"),"utf8");
  assert.match(html,/Tester Safari sur cette vidéo/);
  assert.match(html,/nova-iphone-report.js/);
  assert.doesNotMatch(html,/<script src="https?:\/\//);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
