/* NOVA × SmallMotion v1 — advisory-only bridge from two local RGBA frames.
 * Same-repository detector reference:
 * research/3d-smallmotion/smallmotion-local.js (blob f3a6d35a306c30da45f02567adb0eadc71ecd685).
 * This is NOT optical-flow proof, depth, gestures, segmentation or AI training.
 * Never modifies frames and never authorizes video restoration/export changes.
 */
var NOVA_SMALLMOTION=(()=>{
"use strict";
const reportStatuses=new Set(["cancelled","abstain_engine_unavailable",
 "abstain_engine_error","abstain_unverified_result","abstain_invalid_regions"]);
const statuses=new Set([
 "local_motion_candidate","no_supported_local_motion","abstain_texture",
 "abstain_matches","abstain_cut_or_flash"
]);
function validFrame(frame){
 return !!frame&&Number.isSafeInteger(frame.width)&&
  Number.isSafeInteger(frame.height)&&frame.width>=64&&frame.height>=64&&
  frame.width<=320&&frame.height<=240&&
  (frame.data instanceof Uint8Array||frame.data instanceof Uint8ClampedArray)&&
  frame.data.length===frame.width*frame.height*4;
}
function invalid(status,dimensions=[0,0],times=[0,0],elapsed=null){
 return Object.freeze({
  version:1,provenance:"smallmotion_local_2frame_v1",status,
  action:"no_automatic_change",confidence:"not_calibrated",
  method:"local_2d_block_matching",frames:2,
  frameTimesSeconds:times,analysisDimensions:dimensions,
  candidates:[],processorMs:elapsed,
  privacy:{uploaded:false,stored:false,rawPixelsInReport:false},
  qualification:"Hypothèses 2D locales seulement; aucun geste, contact, profondeur, identité ou mouvement indépendant prouvé."
 });
}
function frameTimes(value){
 if(!Array.isArray(value)||value.length!==2||
    !value.every(x=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=12)||
    value[1]<=value[0])throw new TypeError("Deux temps d'image croissants (0 à 12 s) requis");
 return value.map(x=>Math.round(x*10000)/10000);
}
function analyser(a,b,{engine,frameTimesSeconds=[0,0.1167],clock,signal}={}){
 const times=frameTimes(frameTimesSeconds);
 if(!validFrame(a)||!validFrame(b)||a.width!==b.width||a.height!==b.height)
  throw new TypeError("Deux images RGBA locales 64..320 × 64..240 identiques requises");
 const dim=[a.width,a.height];
 if(signal?.aborted)return invalid("cancelled",dim,times);
 const provider=engine||globalThis.RetoucheLocalMotion;
 if(!provider||typeof provider.analyze!=="function")
  return invalid("abstain_engine_unavailable",dim,times);
 const now=typeof clock==="function"?clock:()=>performance.now();
 const t0=now();
 let result;
 try{result=provider.analyze(a,b)}catch{
  return invalid("abstain_engine_error",dim,times);
 }
 const t1=now(),elapsed=Number.isFinite(t1-t0)&&t1>=t0?
  Math.min(60000,Math.round(t1-t0)):null;
 if(signal?.aborted)return invalid("cancelled",dim,times,elapsed);
 if(!result||!statuses.has(result.status))
  return invalid("abstain_unverified_result",dim,times,elapsed);
 const source=result.candidates;
 if(!Array.isArray(source)||source.length>4)
  return invalid("abstain_invalid_regions",dim,times,elapsed);
 const candidates=[];
 for(const c of source){
  const box=c?.box;
  if(!Array.isArray(box)||box.length!==4||
     !box.every(Number.isSafeInteger)||!Number.isSafeInteger(c.support)||
     c.support<3)return invalid("abstain_invalid_regions",dim,times,elapsed);
  const [x,y,w,h]=box;
  if(x<0||y<0||w<10||h<10||x+w>a.width||y+h>a.height||
    w*h>a.width*a.height*.17)
   return invalid("abstain_invalid_regions",dim,times,elapsed);
  candidates.push({box:[x,y,w,h],support:c.support});
 }
 if(result.status!=="local_motion_candidate"&&candidates.length||
    result.status==="local_motion_candidate"&&!candidates.length)
  return invalid("abstain_invalid_regions",dim,times,elapsed);
 return Object.freeze({
  ...invalid(result.status,dim,times,elapsed),
  candidates
 });
}
function serialiser(report){
 if(!report||report.provenance!=="smallmotion_local_2frame_v1"||
    report.action!=="no_automatic_change"||
    report.confidence!=="not_calibrated")throw new TypeError("Rapport SmallMotion non reconnu");
 // Copy only whitelisted technical fields; never serialize arbitrary input objects.
 const safe={
  version:report.version,provenance:report.provenance,status:report.status,
  action:report.action,confidence:report.confidence,method:report.method,
  frames:report.frames,frameTimesSeconds:report.frameTimesSeconds,
  analysisDimensions:Array.isArray(report.analysisDimensions)?[...report.analysisDimensions]:null,
  candidates:Array.isArray(report.candidates)?report.candidates.map(c=>({
   box:Array.isArray(c?.box)?[...c.box]:null,support:c?.support
  })):null,
  processorMs:report.processorMs,
  privacy:{uploaded:false,stored:false,rawPixelsInReport:false},
  qualification:"Diagnostic géométrique local uniquement, aucune modification automatique."
 };
 if(!validReport(safe))throw new TypeError("Rapport SmallMotion invalide");
 return JSON.stringify(safe,null,2)+"\n";
}
function validReport(x){
 const d=x?.analysisDimensions,t=x?.frameTimesSeconds;
 if(!statuses.has(x?.status)&&!reportStatuses.has(x?.status))return false;
 if(x?.method!=="local_2d_block_matching")return false;
 if(x?.status==="local_motion_candidate"?!x.candidates?.length:x?.candidates?.length!==0)return false;
 if(x?.version!==1||!Array.isArray(d)||d.length!==2||
    !d.every(Number.isSafeInteger)||d[0]<64||d[1]<64||d[0]>320||d[1]>240||
    !Array.isArray(t)||t.length!==2||!t.every(Number.isFinite)||
    t[0]<0||t[1]>12||t[1]<=t[0]||
    x.frames!==2||!Array.isArray(x.candidates)||x.candidates.length>4||
    (x.processorMs!==null&&(!Number.isSafeInteger(x.processorMs)||x.processorMs<0)))
  return false;
 return x.candidates.every(c=>Array.isArray(c.box)&&c.box.length===4&&
    c.box.every(Number.isSafeInteger)&&Number.isSafeInteger(c.support)&&c.support>=3&&
    c.box[0]>=0&&c.box[1]>=0&&c.box[2]>=10&&c.box[3]>=10&&
    c.box[0]+c.box[2]<=d[0]&&c.box[1]+c.box[3]<=d[1]&&
    c.box[2]*c.box[3]<=d[0]*d[1]*.17);
}
return Object.freeze({analyser,serialiser});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_SMALLMOTION;
