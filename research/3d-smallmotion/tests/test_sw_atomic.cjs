'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const path=require('node:path');
const moduleDir=path.resolve(__dirname,'..');
const root=fs.existsSync(path.resolve(moduleDir,'../..','sw.js'))?path.resolve(moduleDir,'../..'):moduleDir;
const src=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const C=src.match(/const C="([^"]+)"/)[1];
const F=JSON.parse(src.match(/F=(\[[^\]]+\])/)[1]);
const must=['smallmotion-local.js','smallmotion-resource-guard.js','smallmotion-worker-runner.js','smallmotion-director-local.js','smallmotion-app-bootstrap.js','smallmotion-worker.js'].map(n=>'research/3d-smallmotion/'+n);
assert.equal(C,'retouche-v83');
for (const n of must)assert.ok(F.includes(n),'offline manifest missing: '+n);
assert.equal(new Set(F).size,F.length,'duplicate cache entries');
let checks=0,failOnce=false,skip=0,claimed=0,offline=false;
const records=new Map([['retouche-v82',new Map([['index.html','OLD APP']])],['retouche-modeles-v1',new Map([['model','MODEL']])],['radar-app',new Map([['index','RADAR']])]]);
const normal=(x)=>String(x.url||x).replace(/^https?:\/\/[^/]+\//,'').replace(/^\.\//,'');
const cache=(name)=>({
 async addAll(arr){const values=arr.map(x=>normal(x)); if(failOnce){failOnce=false;throw Error('asset_http_404');}
   const m=records.get(name);for(const u of values)m.set(u,'cached:'+u);},
 async match(q){return records.get(name).get(normal(q))||undefined},
 async put(q,r){records.get(name).set(normal(q),r)},
 async add(q){records.get(name).set(normal(q),'cached:'+normal(q))}
});
const handlers={};
const ctx={self:{addEventListener:(n,cb)=>handlers[n]=cb,skipWaiting:()=>{skip++},clients:{claim:async()=>{claimed++}}},
 caches:{keys:async()=>[...records.keys()],delete:async k=>records.delete(k),open:async n=>{if(!records.has(n))records.set(n,new Map());return cache(n)}},
 Request:class{constructor(url){this.url=url}},URL,location:{origin:'https://example.test'},
 fetch:async()=>{if(offline)throw Error('offline');return 'NETWORK'}};
vm.runInNewContext(src,ctx);
async function event(type,q){let promise;const e={request:q,waitUntil:p=>{promise=p},respondWith:p=>{promise=p}};handlers[type](e);return promise}
(async()=>{
 // Failed atomic addAll does not activate the new SW or delete the old.
 failOnce=true;await assert.rejects(event('install'),/asset_http_404/);checks++;
 assert.equal(skip,0);assert.ok(records.has('retouche-v82'));checks++;
 await event('install');assert.equal(skip,1);checks++;
 for(const asset of must)assert.equal(records.get(C).get(asset),'cached:'+asset);checks+=must.length;
 await event('activate');assert.equal(claimed,1);checks++;
 assert.equal(records.has('retouche-v82'),false);checks++;
 assert.ok(records.has('retouche-modeles-v1')&&records.has('radar-app'));checks++;
 offline=true;
 for(const asset of must){const response=await event('fetch',{method:'GET',url:'https://example.test/'+asset,mode:'same-origin'});assert.equal(response,'cached:'+asset);checks++;}
 // Other origins and sibling apps are never intercepted.
 assert.equal(await event('fetch',{method:'GET',url:'https://other.test/any',mode:'same-origin'}),undefined);checks++;
 assert.equal(await event('fetch',{method:'GET',url:'https://example.test/radar/app.js',mode:'same-origin'}),undefined);checks++;
 console.log('SW atomic offline cache and scope:',checks,'checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});