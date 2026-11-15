/* RetoucheProAI · local-only resource policy for TWO sampled frames.
   These are UX budgets, not a thermal/battery/memory measurement.
   Capturing duration includes playback, frame scheduling and decoding; it is
   deliberately NOT called isolated decoder latency. */
(function(root){
 'use strict';
 const LIMITS=Object.freeze({maxProcessorMs:500,maxCaptureMs:6000,slowProcessorMs:80,
  maxFrameWidth:160,maxFrameHeight:120,reducedFrameWidth:128,reducedFrameHeight:96});
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 function assess({captureMs,processorMs,width,height,profile='full',visibility='visible',workerTransferBytes=0}={}) {
   const ok=[captureMs,processorMs].every(v=>finite(v)&&v>=0)
     && Number.isInteger(width)&&Number.isInteger(height)&&width>=64&&height>=64
     && width<=LIMITS.maxFrameWidth&&height<=LIMITS.maxFrameHeight;
   const validTransfer=Number.isInteger(workerTransferBytes)&&(workerTransferBytes===0||(ok&&workerTransferBytes===width*height*8));
   const estimatedCpuOwnedBytes=ok&&validTransfer?Math.ceil(width*height*14+workerTransferBytes):null;
   // Two RGBA snapshots (8 bytes/pixel), one 2D canvas (4 bytes/pixel),
   // two Uint8 grayscale work arrays (2 bytes/pixel). Allocations in native
   // video decoder, GPU buffers and browser internals are NOT observable.
   // Transient Worker transfer copies (2 RGBA frames) are counted separately.
   let state='within_budget',reason='within_local_budget',nextProfile=profile==='reduced'?'reduced':'full';
   if(!ok||!validTransfer){state='abstain';reason='invalid_resource_measurement';nextProfile='reduced';}
   else if(visibility==='hidden'){state='abstain';reason='page_hidden';nextProfile='reduced';}
   else if(processorMs>LIMITS.maxProcessorMs || captureMs>LIMITS.maxCaptureMs){
      state='abstain';reason='budget_exceeded';nextProfile='reduced';
   }else if(processorMs>LIMITS.slowProcessorMs){
      state='slow';reason='processor_slow_in_this_environment';nextProfile='reduced';
   }
   return Object.freeze({state,reason,profile:profile==='reduced'?'reduced':'full',nextProfile,
     captureMs:finite(captureMs)?+captureMs.toFixed(2):null,
     processorMs:finite(processorMs)?+processorMs.toFixed(2):null,
     estimatedCpuOwnedBytes,workerTransferBytes:validTransfer?workerTransferBytes:null,
     dimensions:ok?[width,height]:null,
     nativeVideoDecoderBytes:null,deviceTemperatureC:null,batteryConsumption:null,
     note:'Capture = attente + lecture + décodage éventuel ; RAM estimée = tableaux JS/canvas et copies de transfert Worker. Ni température, ni énergie, ni RAM totale mesurées.'});
 }
 const api=Object.freeze({assess,LIMITS});root.RetoucheMotionResourceGuard=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);