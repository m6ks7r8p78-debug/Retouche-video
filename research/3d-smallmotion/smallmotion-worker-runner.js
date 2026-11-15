/* RetoucheProAI: worker-first, locally bounded 2-frame execution.
  Main thread decodes two video frames. CPU block matching runs off-thread
  whenever same-origin Worker is available. Only RGBA samples are transferred;
  the original video and filename never enter the worker. No remote fallback.
  A worker crash/timeout abstains rather than silently rerunning on main UI. */
(function(root){
'use strict';
const DEFAULT_WORKER='research/3d-smallmotion/smallmotion-worker.js';
const MAX_MS=1800;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const aborted=()=>{const e=new Error('Analyse annulée');e.name='AbortError';return e;};
let serial=0;
function valid(a,b){return a&&b&&Number.isInteger(a.width)&&Number.isInteger(a.height)&&a.width>=64&&a.height>=64&&a.width<=320&&a.height<=240&&
 a.width===b.width&&a.height===b.height&&a.data instanceof Uint8ClampedArray&&b.data instanceof Uint8ClampedArray&&a.data.length===a.width*a.height*4&&b.data.length===b.width*b.height*4;}
function abstention(reason){return {status:reason,candidates:[],confidence:'insuffisante'};}
async function run(a,b,{signal,analyzer,workerURL=(root.RetoucheMotionWorkerURL||DEFAULT_WORKER),WorkerCtor=(typeof root.Worker==='function'?root.Worker:null),timeoutMs=MAX_MS}={}){
  if(!valid(a,b))throw Error('invalid_rgba_frames');
  if(signal?.aborted)throw aborted();
  if(typeof analyzer!=='function')throw Error('analyzer_missing');
  const t0=performance.now();
  const cpuFallback=async reason=>{
    // Yield once so a spinner / cancellation can be presented before a
    // bounded (<= 320x240, 2 frames) synchronous legacy calculation.
    await new Promise(resolve=>setTimeout(resolve,0));
    if(signal?.aborted)throw aborted();
    const s=performance.now(),result=analyzer(a,b);
    return {result,elapsedMs:performance.now()-t0,computeMs:performance.now()-s,
      processingPath:'main_thread_fallback',fallbackReason:reason,transferredBytes:0};
  };
  if(typeof WorkerCtor!=='function')return cpuFallback('worker_unavailable');
  let worker;
  try{worker=new WorkerCtor(workerURL)}catch(_){return cpuFallback('worker_constructor_blocked');}
  if(!worker || typeof worker.postMessage!=='function'||typeof worker.terminate!=='function'){
    try{worker?.terminate?.()}catch(_){}return cpuFallback('worker_invalid');
  }
  const id=++serial;
  // Copy before transfer: preserve the originals for a safe fallback when
  // postMessage itself is unsupported. Original ImageData is never detached.
  const ca=new Uint8ClampedArray(a.data),cb=new Uint8ClampedArray(b.data);
  return new Promise((resolve,reject)=>{
    let settled=false,timeout=null;
    const cleanup=()=>{if(timeout!==null)clearTimeout(timeout);signal?.removeEventListener('abort',onAbort);
      try{worker.onmessage=null;worker.onerror=null;worker.terminate()}catch(_){}};
    const finish=(value,error)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve(value)};
    const onAbort=()=>finish(null,aborted());
    if(signal?.aborted){finish(null,aborted());return;}
    signal?.addEventListener('abort',onAbort,{once:true});
    worker.onmessage=e=>{
      const msg=e?.data;if(!msg||msg.id!==id)return;
      const ms=performance.now()-t0;
      if(!msg.ok||!msg.result){finish({result:abstention('abstain_worker_error'),elapsedMs:ms,computeMs:null,processingPath:'worker_error',transferredBytes:a.width*a.height*8});return;}
      finish({result:msg.result,elapsedMs:ms,computeMs:finite(msg.computeMs)?msg.computeMs:null,
        processingPath:'worker',transferredBytes:a.width*a.height*8});
    };
    worker.onerror=()=>finish({result:abstention('abstain_worker_error'),elapsedMs:performance.now()-t0,computeMs:null,processingPath:'worker_error',transferredBytes:a.width*a.height*8});
    timeout=setTimeout(()=>finish({result:abstention('abstain_worker_timeout'),elapsedMs:performance.now()-t0,computeMs:null,processingPath:'worker_timeout',transferredBytes:a.width*a.height*8}),
      Math.min(4000,Math.max(200,timeoutMs)));
    try{worker.postMessage({id,op:'analyze',a:{width:a.width,height:a.height,data:ca},b:{width:b.width,height:b.height,data:cb}},[ca.buffer,cb.buffer]);}
    catch(_){if(settled)return;settled=true;cleanup();cpuFallback('worker_transfer_failed').then(resolve,reject);}
  });
}
const api=Object.freeze({run,valid,DEFAULT_WORKER});
root.RetoucheMotionWorkerRunner=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);