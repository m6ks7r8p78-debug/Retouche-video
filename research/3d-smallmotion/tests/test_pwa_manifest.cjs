'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const MODULE=path.resolve(__dirname,'..');
const ROOT=fs.existsSync(path.resolve(MODULE,'../..','sw.js'))?path.resolve(MODULE,'../..'):MODULE;
const SRC=fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
const arr=name=>JSON.parse(SRC.match(new RegExp(name+'=(\\[[^\\]]+\\])'))[1]);
const F=arr('F'),LOURDS=arr('LOURDS'),C=SRC.match(/const C="([^"]+)"/)[1],H=SRC.match(/const H="([^"]+)"/)[1];
const NAMES=['smallmotion-local.js','smallmotion-resource-guard.js','smallmotion-worker-runner.js','smallmotion-director-local.js','smallmotion-app-bootstrap.js','smallmotion-worker.js'];
const TARGETS=NAMES.map(n=>'research/3d-smallmotion/'+n);
assert.equal(C,'retouche-v86','must bump app cache generation to install all modules together');
assert.equal(new Set(F).size,F.length,'duplicate SW precache paths');
for(const file of TARGETS){assert(F.includes(file),`SW precache missing: ${file}`);}
const js=n=>fs.readFileSync(path.join(MODULE,n),'utf8');
const marker='smallmotion-pwa-bundle-v1';
for(const name of ['smallmotion-local.js','smallmotion-worker.js','smallmotion-worker-runner.js'])assert(js(name).includes(marker),name+' mismatched version');
assert(js('smallmotion-worker.js').includes("importScripts('smallmotion-local.js')"));
assert(js('smallmotion-worker-runner.js').includes('abstain_worker_version_mismatch'));
if(fs.existsSync(path.join(ROOT,'index.html'))){
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 const ordered=NAMES.slice(0,5).map(f=>`<script defer src="research/3d-smallmotion/${f}"></script>`);
 const offsets=ordered.map(tag=>html.indexOf(tag));assert(offsets.every(n=>n>=0));assert(offsets.every((n,i)=>i===0||n>offsets[i-1]));
}
if(process.env.SMW_SKIP_FULL_HASH!=='1'){
 let hash=crypto.createHash('sha256');
 for(const file of [...F,...LOURDS])if(file!=='./'){
  assert(fs.existsSync(path.join(ROOT,file)),`missing source asset ${file}`);
  hash.update(file);hash.update(fs.readFileSync(path.join(ROOT,file)));
 }
 assert.equal(H,hash.digest('hex').slice(0,16),'SW manifest SHA invalid; run node tests/sw.test.mjs --maj and commit the result');
}
console.log('SmallMotion PWA manifest: complete, ordered, versioned, fingerprint '+(process.env.SMW_SKIP_FULL_HASH==='1'?'skipped locally':'verified'));