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
return Object.freeze({decoder});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_HEVC_LAB;
