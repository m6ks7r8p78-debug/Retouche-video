/* Node worker_threads exercises the exact classic Worker source and its
   importScripts('smallmotion-local.js') path, without a browser or network.
   This is NOT a proof of deployment CSP compatibility in Safari. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {Worker}=require('node:worker_threads');
const root=path.resolve(__dirname,'..');
const script=String.raw`
const {parentPort,workerData}=require('node:worker_threads');
const {readFileSync}=require('node:fs');
const vm=require('node:vm'),path=require('node:path');
globalThis.self=globalThis;
globalThis.postMessage=x=>parentPort.postMessage(x);
globalThis.importScripts=(name)=>{
 if(name!=='smallmotion-local.js')throw Error('unexpected_import');
 vm.runInThisContext(readFileSync(path.join(workerData.root,name),'utf8'),{filename:name});
};
vm.runInThisContext(readFileSync(path.join(workerData.root,'smallmotion-worker.js'),'utf8'),{filename:'smallmotion-worker.js'});
parentPort.on('message',data=>globalThis.onmessage({data}));
`;
const w=160,h=120;
let n=0;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n>>>24};
const make=()=>{const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4){let x=random();data[i]=data[i+1]=data[i+2]=x;data[i+3]=255;}return {width:w,height:h,data}};
async function test(){
 const a=make(),b={width:w,height:h,data:new Uint8ClampedArray(a.data)};
 const expected=require('../smallmotion-local.js').analyze(a,b);
 const thread=new Worker(script,{eval:true,workerData:{root}});
 const result=await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('worker import timed out')),2500);
  thread.on('message',msg=>{clearTimeout(timeout);resolve(msg)});
  thread.on('error',reject);
  thread.postMessage({op:'analyze',id:1,a,b},[a.data.buffer,b.data.buffer]);
 });
 assert.equal(result.ok,true);assert.equal(result.id,1);
 assert.equal(JSON.stringify(result.result),JSON.stringify(expected));
 assert.equal(a.data.length,0,'transferred buffer detached from caller');
 assert.ok(result.computeMs>=0);
 await thread.terminate();
 console.log('Worker source + same-directory importScripts: full detector parity passed');
}
test().catch(e=>{console.error(e);process.exitCode=1});