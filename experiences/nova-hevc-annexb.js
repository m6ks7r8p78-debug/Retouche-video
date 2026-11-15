/* NOVA 0.17 — conversion strictement locale HEVC MP4/MOV (hvcC) -> Annex B.
 * Pilote pour un décodeur WebAssembly indépendant du moteur natif.
 * Les octets d'échantillons sont copiés sans changer leur ordre de décodage.
 * Aucun décodeur, CDN ni média n'est chargé par ce module.
 */
var NOVA_HEVC_ANNEXB=(()=>{
"use strict";
const startCode=new Uint8Array([0,0,0,1]);
const refuse=s=>{throw new Error("HEVC Annex B : "+s)};
function configuration(desc){
 if(!(desc instanceof Uint8Array)||desc.length<23||desc[0]!==1)
   refuse("hvcC absent ou tronqué");
 const bytes=(desc[21]&3)+1, count=desc[22];
 if(!count||count>64)refuse("table hvcC absente ou excessive");
 const nals=[];let off=23;const types=new Set();
 for(let i=0;i<count;i++){
  if(off+3>desc.length)refuse("table hvcC tronquée");
  const type=desc[off++]&63,n=(desc[off++]<<8)|desc[off++];
  if(!n||n>256)refuse("quantité de NAL HEVC invalide");
  for(let j=0;j<n;j++){
   if(off+2>desc.length)refuse("longueur hvcC tronquée");
   const size=(desc[off++]<<8)|desc[off++];
   if(size<2||off+size>desc.length)refuse("NAL hvcC hors limites");
   if(type===32||type===33||type===34){
    if(((desc[off]>>1)&63)!==type)refuse("type NAL hvcC incohérent");
    nals.push(desc.slice(off,off+size));types.add(type);
   }
   off+=size;
  }
 }
 if(off!==desc.length)refuse("données supplémentaires hvcC ambiguës");
 if(![32,33,34].every(x=>types.has(x)))refuse("VPS/SPS/PPS incomplets");
 return Object.freeze({lengthBytes:bytes,parameterSets:nals});
}
function decouper(sample,lengthBytes){
 if(!(sample instanceof Uint8Array)||![1,2,3,4].includes(lengthBytes))
  refuse("échantillon ou longueur de préfixe invalide");
 const out=[];let off=0;
 while(off<sample.length){
  if(off+lengthBytes>sample.length)refuse("préfixe NAL tronqué");
  let size=0;for(let j=0;j<lengthBytes;j++)size=size*256+sample[off++];
  if(size<2||size>sample.length-off)refuse("NAL hors limites");
  if(out.length>=1024)refuse("trop de NAL dans un échantillon");
  out.push(sample.subarray(off,off+size));off+=size;
 }
 if(!out.length)refuse("échantillon vide");
 return out;
}
async function extraire(file,info,{maxBytes=16*1024*1024,maxSamples=90,signal}={}){
 if(!file||typeof file.slice!=="function"||!Number.isSafeInteger(file.size)||
    !info||!/^(hvc1|hev1)\./.test(info.codec||""))
  refuse("source MOV/MP4 HEVC requise");
 if(!Number.isInteger(info.ns)||info.ns<1||info.ns>maxSamples||
    !Array.isArray(info.so)||!Array.isArray(info.sz)||
    info.so.length!==info.ns||info.sz.length!==info.ns)
  refuse("quantité d'échantillons hors pilote");
 const cfg=configuration(info.desc),chunks=[],maxParts=1+maxSamples*64;
 let size=0;
 const add=bytes=>{
  size+=4+bytes.length;
  if(size>maxBytes||chunks.length>=maxParts)refuse("budget mémoire dépassé");
  chunks.push(bytes);
 };
 for(const n of cfg.parameterSets)add(n);
 for(let i=0;i<info.ns;i++){
  if(signal?.aborted)refuse("opération annulée");
  const offset=info.so[i],len=info.sz[i];
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(len)||len<1||
      offset<0||offset+len>file.size||offset+len>Number.MAX_SAFE_INTEGER)
   refuse("échantillon hors fichier");
  const bytes=new Uint8Array(await file.slice(offset,offset+len).arrayBuffer());
  if(bytes.length!==len)refuse("échantillon tronqué");
  for(const nal of decouper(bytes,cfg.lengthBytes))add(nal);
 }
 const out=new Uint8Array(size);let at=0;
 for(const x of chunks){out.set(startCode,at);at+=4;out.set(x,at);at+=x.length}
 return Object.freeze({bytes:out,samples:info.ns,nals:chunks.length,
  lengthBytes:cfg.lengthBytes,source:"local-hvcC-annexB",size:out.length});
}
return Object.freeze({configuration,decouper,extraire});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_HEVC_ANNEXB;
