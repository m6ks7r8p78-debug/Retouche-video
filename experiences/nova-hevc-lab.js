/* NOVA 0.17 — banc de décodage HEVC WASM isolé : aucune activation automatique.
 * Le décodeur est fourni par l'appelant et doit être hébergé localement.
 * Garde-fous : SDR 8 bits, FullHD non permis, 90 images, durée courte.
 * Ne fournit pas encore la conversion couleur / export MP4 de production.
 */
var NOVA_HEVC_LAB=(()=>{
"use strict";
async function decoder(file,{HEVCDecoder,wasmUrl,wasmBinaryUrl,maxSamples=90}={}){
 if(!globalThis.NOVA_DEMUX||!globalThis.NOVA_PTS||!globalThis.NOVA_HEVC_ANNEXB)
  throw new Error("Modules MOV/PTS/HEVC du laboratoire absents");
 if(!HEVCDecoder||typeof HEVCDecoder.create!=="function")
  throw new Error("Décodeur WASM local non installé : aucun appel à un CDN");
 const info=await NOVA_DEMUX.analyser(file);
 if(!info||!/^(hvc1|hev1)\./.test(info.codec))
  throw new Error("Source HEVC MOV/MP4 requise");
 NOVA_DEMUX.exigerPresentationFidele(info);
 if(info.W*info.H>640*360||info.ns>maxSamples||info.ns<1)
  throw new Error("Budget HEVC WASM pilote : 640×360 et 90 images maximum");
 const plan=NOVA_PTS.planifier(info);
 // Un décodage avec skip/preroll non représentable n'est pas publié comme fidèle.
 if(plan.sorted.length!==plan.nonnegative.length||
    plan.sorted[0].ptsUs!==0)
  throw new Error("Preroll/décalage PTS HEVC non couvert par le pilote WASM");
 const bitstream=await NOVA_HEVC_ANNEXB.extraire(file,info,{maxSamples});
 const dec=await HEVCDecoder.create({wasmUrl,wasmBinaryUrl});
 try{
  const decoded=dec.decode(bitstream.bytes);
  if(decoded.frames.length!==plan.nonnegative.length)
   throw new Error("Nombre de trames HEVC décodées différent des PTS du MOV");
  if(!decoded.frames.every(x=>x.width===info.W&&x.height===info.H&&x.bitDepth===8))
   throw new Error("Dimensions ou profondeur HEVC WASM non représentables");
  const stamped=decoded.frames.map((frame,i)=>({frame,ptsUs:plan.nonnegative[i].ptsUs}));
  return {stamped,info:{width:info.dw,height:info.dh,encodedWidth:info.W,
    encodedHeight:info.H,codec:info.codec,frames:stamped.length,mode:"HEVC WASM laboratoire"},
    annexBBytes:bitstream.size};
 }finally{dec.destroy()}
}

/* Les frames sont livrées une par une sans être conservées par NOVA.
 * Une frame émise est provisoire jusqu'à la vérification finale du compte.
 * Le callback peut analyser les plans YUV, mais ne doit pas publier un
 * export avant que cette fonction ait terminé sans erreur.
 */
async function decoderFlux(file,{HEVCDecoder,wasmUrl,wasmBinaryUrl,maxSamples=90,
  maxBytes=16*1024*1024,maxPacketBytes=2*1024*1024,
  maxWasmHeapBytes=384*1024*1024,onFrame,signal}={}){
 if(!globalThis.NOVA_DEMUX||!globalThis.NOVA_PTS||!globalThis.NOVA_HEVC_ANNEXB)
  throw new Error("Modules MOV/PTS/HEVC du laboratoire absents");
 if(!HEVCDecoder||typeof HEVCDecoder.create!=="function"||
    typeof onFrame!=="function")
  throw new Error("Décodeur WASM local et callback onFrame requis");
 if(!Number.isSafeInteger(maxWasmHeapBytes)||maxWasmHeapBytes<1024)
  throw new Error("Budget de capacité du tas HEVC WASM invalide");
 const info=await NOVA_DEMUX.analyser(file);
 if(!info||!/^(hvc1|hev1)\./.test(info.codec))
  throw new Error("Source MOV/MP4 HEVC requise");
 NOVA_DEMUX.exigerPresentationFidele(info);
 if(info.W*info.H>640*360||info.ns<1||info.ns>maxSamples)
  throw new Error("Budget HEVC WASM pilote : 640×360 et 90 images maximum");
 const plan=NOVA_PTS.planifier(info);
 if(plan.sorted.length!==plan.nonnegative.length||plan.sorted[0].ptsUs!==0)
  throw new Error("Preroll/décalage PTS HEVC non couvert par le pilote WASM");
 const dec=await HEVCDecoder.create({wasmUrl,wasmBinaryUrl});
 let count=0,peakChunkBytes=0,annexBBytes=0,peakFrameBytes=0;
 let inbandParameterSets=0,peakDrainedFrames=0;
 const now=()=>typeof performance!=="undefined"&&
  typeof performance.now==="function"?performance.now():Date.now();
 const began=now();
 // HEAPU8.buffer.byteLength : capacité du tas allouée par le runtime
 // Emscripten, PAS la quantité utilisée, ni le pic mémoire du processus.
 const wasmHeapBytes=()=>{
  const n=dec?._m?.HEAPU8?.buffer?.byteLength;
  return Number.isSafeInteger(n)&&n>0?n:null;
 };
 const jsHeapBytes=()=>{
  const n=typeof performance!=="undefined"?performance.memory?.usedJSHeapSize:null;
  return Number.isSafeInteger(n)&&n>0?n:null;
 };
 let wasmHeapStartBytes=null,wasmHeapPeakBytes=null,wasmHeapEndBytes=null;
 let jsHeapStartBytes=null,jsHeapPeakBytes=null,jsHeapEndBytes=null;
 function mesurer(){
  const w=wasmHeapBytes(),j=jsHeapBytes();
  if(w!==null){
   if(wasmHeapStartBytes===null)wasmHeapStartBytes=w;
   wasmHeapEndBytes=w;
   wasmHeapPeakBytes=Math.max(wasmHeapPeakBytes??0,w);
   if(w>maxWasmHeapBytes)
    throw new Error("Capacité du tas HEVC WASM supérieure au budget pilote");
  }
  if(j!==null){
   if(jsHeapStartBytes===null)jsHeapStartBytes=j;
   jsHeapEndBytes=j;
   jsHeapPeakBytes=Math.max(jsHeapPeakBytes??0,j);
  }
 }

 async function consume(frames){
  for(const frame of frames){
   if(signal?.aborted)throw new Error("Décodage HEVC interrompu");
   if(count>=plan.nonnegative.length)
    throw new Error("Trames HEVC excédentaires, PTS non représentables");
   if(frame.width!==info.W||frame.height!==info.H||frame.bitDepth!==8)
    throw new Error("Dimensions ou profondeur HEVC WASM non représentables");
   const expectedY=frame.width*frame.height;
   const expectedC=frame.chromaWidth*frame.chromaHeight;
   if(frame.y.length!==expectedY||frame.cb.length!==expectedC||
      frame.cr.length!==expectedC||frame.chromaWidth*2!==frame.width||
      frame.chromaHeight*2!==frame.height)
    throw new Error("Plans YUV420 HEVC incohérents");
   peakFrameBytes=Math.max(peakFrameBytes,2*(expectedY+2*expectedC));
   await onFrame(Object.freeze({frame,ptsUs:plan.nonnegative[count].ptsUs,index:count,
     provisional:true}));
   count++;
  }
 }
 try{
  mesurer();
  for await(const chunk of NOVA_HEVC_ANNEXB.flux(file,info,{
    maxSamples,maxBytes,maxPacketBytes,signal
  })){
   if(signal?.aborted)throw new Error("Décodage HEVC interrompu");
   peakChunkBytes=Math.max(peakChunkBytes,chunk.bytes.byteLength);
   annexBBytes=chunk.totalBytes;
   inbandParameterSets+=chunk.inbandParameters||0;
   dec.feed(chunk.bytes);
   mesurer();
   const drained=dec.drain();
   peakDrainedFrames=Math.max(peakDrainedFrames,drained.length);
   await consume(drained);
   mesurer();
  }
  const flushed=dec.flush();
  peakDrainedFrames=Math.max(peakDrainedFrames,flushed.length);
  await consume(flushed);
  mesurer();
  if(count!==plan.nonnegative.length)
   throw new Error("Images HEVC manquantes, PTS non représentables");
  return Object.freeze({frames:count,annexBBytes,peakChunkBytes,peakFrameBytes,
   peakDrainedFrames,inbandParameterSets,
   wasmHeapStartBytes,wasmHeapPeakBytes,wasmHeapEndBytes,
   jsHeapStartBytes,jsHeapPeakBytes,jsHeapEndBytes,
   pipelineElapsedMs:Math.max(0,now()-began),
   memorySemantics:"wasm-capacity-not-used; js-heap-optional-not-total-rss",
   firstPTS:plan.nonnegative[0].ptsUs,lastPTS:plan.nonnegative.at(-1).ptsUs,
   width:info.W,height:info.H,mode:"HEVC WASM flux expérimental"});
 }finally{dec.destroy()}
}
return Object.freeze({decoder,decoderFlux});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_HEVC_LAB;
