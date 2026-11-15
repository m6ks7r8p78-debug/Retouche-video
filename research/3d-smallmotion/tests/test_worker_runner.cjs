'use strict';
const assert=require('node:assert/strict');
const {run,valid}=require('../smallmotion-worker-runner.js');
const detector=require('../smallmotion-local.js');
const w=160,h=120;
function pair(seed=4,object=true){
 let state=seed+1;const rnd=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state>>>24};
 const base=new Uint8Array(w*h),patch=new Uint8Array(24*20);
 for(let i=0;i<base.length;i++)base[i]=rnd();for(let i=0;i<patch.length;i++)patch[i]=rnd();
 return [0,1].map(t=>{const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 let v=base[y*w+(x-t+w)%w];const ox=x-65,oy=y-(45+t*4);
 if(object&&ox>=0&&ox<24&&oy>=0&&oy<20)v=patch[oy*24+ox];const k=(y*w+x)*4;data[k]=data[k+1]=data[k+2]=v;data[k+3]=255;
 }return {width:w,height:h,data}});
}
class SuccessWorker {
 constructor(){this.terminated=false;this.onmessage=null;this.onerror=null;SuccessWorker.total++;}
 postMessage(payload,transfer){
  assert.equal(transfer.length,2);assert.equal(payload.a.width,w);assert.equal(payload.a.data.length,w*h*4);
  setTimeout(()=>this.onmessage?.({data:{id:payload.id,ok:true,result:detector.analyze(payload.a,payload.b),computeMs:20}}),10);
 }
 terminate(){this.terminated=true;SuccessWorker.terminated++;}
}
SuccessWorker.total=0;SuccessWorker.terminated=0;
class HungWorker{constructor(){this.terminated=false;}postMessage(){}terminate(){this.terminated=true;HungWorker.lastTerminated=true;}}
class ErrorWorker{constructor(){}postMessage(x){setTimeout(()=>this.onmessage?.({data:{id:x.id,ok:false,error:'internal'}}),1)}terminate(){}}
async function main(){
 let checks=0;const ok=(label,val)=>{assert.ok(val,label);checks++};
 const [a,b]=pair();ok('valid',valid(a,b));
 ok('invalid',!valid(a,{...b,width:161}));
 const main=detector.analyze(a,b);
 const work=await run(a,b,{WorkerCtor:SuccessWorker,analyzer:detector.analyze});
 ok('worker mode',work.processingPath==='worker');
 ok('identical status',main.status===work.result.status);
 ok('identical region',JSON.stringify(main.candidates)===JSON.stringify(work.result.candidates));
 ok('worker metric',work.computeMs===20&&work.elapsedMs>=0);
 ok('transfer budget',work.transferredBytes===w*h*8);
 ok('input not detached',a.data.length===w*h*4&&b.data.length===w*h*4);
 ok('terminated',SuccessWorker.terminated===1);
 const fallback=await run(a,b,{WorkerCtor:null,analyzer:detector.analyze});
 ok('missing Worker falls back',fallback.processingPath==='main_thread_fallback');
 ok('same result fallback',JSON.stringify(fallback.result)===JSON.stringify(main));
 ok('fallback reason',fallback.fallbackReason==='worker_unavailable');
 const crash=await run(a,b,{WorkerCtor:ErrorWorker,analyzer:detector.analyze});
 ok('runtime failure fail-closed',crash.result.status==='abstain_worker_error'&&!crash.result.candidates.length);
 const hung=await run(a,b,{WorkerCtor:HungWorker,analyzer:detector.analyze,timeoutMs:200});
 ok('watchdog fails closed',hung.processingPath==='worker_timeout'&&hung.result.status==='abstain_worker_timeout');
 ok('watchdog terminates',HungWorker.lastTerminated===true);
 const ctrl=new AbortController();ctrl.abort();
 await assert.rejects(()=>run(a,b,{signal:ctrl.signal,WorkerCtor:SuccessWorker,analyzer:detector.analyze}),{name:'AbortError'});checks++;
 const ctrl2=new AbortController();const pending=run(a,b,{signal:ctrl2.signal,WorkerCtor:HungWorker,analyzer:detector.analyze});ctrl2.abort();await assert.rejects(()=>pending,{name:'AbortError'});checks++;
 class DeniedWorker{constructor(){throw Error('CSP blocked')}}
 const deny=await run(a,b,{WorkerCtor:DeniedWorker,analyzer:detector.analyze});
 ok('CSP fallback',deny.processingPath==='main_thread_fallback'&&deny.fallbackReason==='worker_constructor_blocked');
 class TransferDeniedWorker{postMessage(){throw Error('no transfer')}terminate(){}}
 const tx=await run(a,b,{WorkerCtor:TransferDeniedWorker,analyzer:detector.analyze});
 ok('transfer fallback',tx.fallbackReason==='worker_transfer_failed'&&tx.result.status===main.status);
 ok('no data retention',a.data.length===w*h*4);
 console.log('Worker runner:',checks,'checks passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});