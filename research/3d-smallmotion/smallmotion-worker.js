/* RetoucheProAI SmallMotion dedicated worker. No DOM, storage or networking.
   Receives only two bounded RGBA images, NOT the media file or name.
   In a hosted same-origin Worker importScripts loads the existing detector.
   In the standalone offline demo this file is concatenated after the detector
   in a blob: URL, and the import is deliberately skipped. */
(function(root){
'use strict';
const BUILD='smallmotion-pwa-bundle-v1';
if(!root.RetoucheLocalMotion && typeof root.importScripts==='function')root.importScripts('smallmotion-local.js');
function receive(payload){
  if(!payload || payload.op!=='analyze' || !Number.isSafeInteger(payload.id) || payload.id<1) throw Error('invalid_job');
  const {a,b}=payload;
  if(!a||!b||!Number.isInteger(a.width)||!Number.isInteger(a.height)||a.width<64||a.height<64||a.width>320||a.height>240||a.width!==b.width||a.height!==b.height||
    !(a.data instanceof Uint8ClampedArray)||!(b.data instanceof Uint8ClampedArray)||a.data.length!==a.width*a.height*4||b.data.length!==b.width*b.height*4)throw Error('invalid_rgba_frames');
  if(!root.RetoucheLocalMotion || root.RetoucheLocalMotion.build!==BUILD)throw Error('detector_version_mismatch');
  const t0=performance.now();
  const result=root.RetoucheLocalMotion.analyze(a,b);
  return {id:payload.id,build:BUILD,ok:true,result,computeMs:Math.max(0,performance.now()-t0)};
}
root.onmessage=event=>{
  const id=event?.data?.id;
  try{root.postMessage(receive(event.data))}
  catch(e){root.postMessage({id,build:BUILD,ok:false,error:e?.message==='detector_version_mismatch'?'detector_version_mismatch':'worker_rejected_evidence'})}
};
})(typeof self!=='undefined'?self:globalThis);