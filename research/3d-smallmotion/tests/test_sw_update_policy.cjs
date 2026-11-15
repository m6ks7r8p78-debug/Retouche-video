'use strict';
/* Deterministic mock checks the SW never forces an upgrade while two clients
   keep unexported projects open. The actual browser scheduling is tested in
   test_pwa_update_two_clients.py on a GitHub-hosted Linux runner. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const moduleRoot=path.resolve(__dirname,'..');
const root=fs.existsSync(path.resolve(moduleRoot,'../../sw.js'))?path.resolve(moduleRoot,'../..'):moduleRoot;
const src=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const C=src.match(/const C="([^"]+)"/)[1];
assert.equal(C,'retouche-v87');
assert.ok(!src.includes('self.skipWaiting('),'never take over running tabs');
const originalClients=new Map([['editor',{fileOpen:true,exportPending:true}],['second',{fileOpen:true,exportPending:false}]]);
const cachesMap=new Map([
 ['retouche-v86',new Map([['index.html','v83'],['research/3d-smallmotion/smallmotion-worker.js','old_worker']])],
 ['retouche-modeles-v1',new Map([['weights','preserve']])],
 ['radar-cache',new Map([['test','preserve']])]
]);
const handler={},observed={skips:0,claims:0},normal=x=>String(x.url||x).replace(/^\.\//,'');
const state={
 self:{addEventListener:(type,fn)=>handler[type]=fn,skipWaiting:()=>{observed.skips++},clients:{claim:async()=>{observed.claims++}}},
 caches:{keys:async()=>[...cachesMap.keys()],delete:async name=>cachesMap.delete(name),
  open:async name=>{if(!cachesMap.has(name))cachesMap.set(name,new Map());const m=cachesMap.get(name);
   return {addAll:async rs=>rs.forEach(r=>m.set(normal(r),'new:'+normal(r))),match:async r=>m.get(normal(r)),put:async(r,v)=>m.set(normal(r),v),add:async r=>m.set(normal(r),'new:'+normal(r))}}},
 location:{origin:'https://example.test'},Request:class{constructor(url){this.url=url}},URL,
 fetch:async()=>{throw Error('This unit test should not require the network')}
};
vm.runInNewContext(src,state);
async function invoke(type){let pending;handler[type]({waitUntil:p=>pending=p});await pending;}
(async()=>{
 await invoke('install');
 assert.equal(observed.skips,0);
 assert.ok(cachesMap.has('retouche-v86') && cachesMap.has('retouche-v87'));
 assert.equal(originalClients.get('editor').exportPending,true);
 assert.equal(cachesMap.get('retouche-v86').get('index.html'),'v83');
 // The browser will not fire activate until all clients using v83 are gone.
 originalClients.delete('second');
 assert.equal(originalClients.size,1);
 assert.ok(cachesMap.has('retouche-v86'));
 originalClients.delete('editor');
 assert.equal(originalClients.size,0);
 await invoke('activate');
 assert.equal(observed.claims,1);
 assert.equal(cachesMap.has('retouche-v86'),false);
 assert.equal(cachesMap.has('retouche-v87'),true);
 assert.equal(cachesMap.get('retouche-modeles-v1').get('weights'),'preserve');
 assert.ok(cachesMap.has('radar-cache'));
 console.log('Service Worker safe update policy: 12 assertions passed');
})().catch(error=>{console.error(error);process.exitCode=1});