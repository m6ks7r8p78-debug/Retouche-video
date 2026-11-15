/* NOVA 0.25 — précontrôle de compatibilité pour vidéo réelle, LECTURE SEULE.
 * Réutilise le parseur MP4, le contrôle couleur/PTS HEVC, budget et AAC existants.
 * Aucun export, aucune modification des trames, aucun téléversement, pas de noms privés.
 * "admissible" signifie seulement qu'un ESSAI d'export peut être proposé, jamais garanti.
 */
var NOVA_REAL_PREFLIGHT=(()=>{
"use strict";
const MAX_BYTES=60*1048576;
const codes=new Set(["ready-for-export-attempt","not-video","file-budget",
 "browser-unavailable","insecure-context","container-unreadable",
 "unsupported-video-codec","hevc-profile-or-timeline-incompatible",
 "resource-budget","audio-not-preservable","analysis-unavailable","cancelled"]);
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const count=x=>Number.isSafeInteger(x)&&x>=0?x:null;
const small=x=>finite(x)&&x>=0&&x<=160?Math.round(x*10)/10:null;
function source(file){return {
 bytes:count(file?.size),videoCategory:"unverified",
 codec:"unknown",width:null,height:null,durationMs:null,frames:null
}}
function state(file){
 return {schema:"retoucheproai.nova.real-preflight.v1",version:1,
  status:"analysis-unavailable",readyForExportAttempt:false,
  source:source(file),audio:"not-tested",estimatedMiB:null,
  exportProposal:null,
  privacy:{mediaUploaded:false,rawMediaInReport:false,filenameInReport:false,
   automaticSharing:false,mediaModified:false},
  limitation:"Précontrôle technique local uniquement : ni preuve de qualité, ni test de lecture finale, ni garantie d'export."};
}
function finish(base,status){
 return Object.freeze({...base,status,readyForExportAttempt:status==="ready-for-export-attempt"});
}
function category(info){
 const c=info?.codec;
 return typeof c==="string"&&/^(hvc1|hev1)\./.test(c)?"hevc":
        typeof c==="string"&&/^avc[13]\./.test(c)?"h264":"other-or-unknown";
}
async function inspect({file,signal,probe,validate,audioPlan,guard,plan,
 getEnvironment}={}){
 const r=state(file);
 const stopped=()=>signal?.aborted===true;
 if(stopped())return finish(r,"cancelled");
 try{
  if(!file||typeof file.slice!=="function"||!Number.isSafeInteger(file.size)||
     file.size<1||file.size>MAX_BYTES)
   return finish(r,"file-budget");
  const isVideo=(globalThis.NOVA_IPHONE_REPORT?.videoFile||
    (f=>!!f&&(f.type?.startsWith("video/")===true||(!f.type&&/\.(mov|mp4|m4v)$/i.test(f.name||"")))));
  if(!isVideo(file))return finish(r,"not-video");
  r.source.videoCategory="local-video";
  const env=typeof getEnvironment==="function"?getEnvironment():
    (globalThis.NOVA_IPHONE_REPORT?.environment?.()||{
     secureContext:globalThis.isSecureContext===true,
     videoEncoder:typeof globalThis.VideoEncoder==="function",
     videoFrame:typeof globalThis.VideoFrame==="function",
     webAssembly:typeof globalThis.WebAssembly==="object"
    });
  if(!env?.secureContext)return finish(r,"insecure-context");
  if(!env.videoEncoder||!env.videoFrame||!env.webAssembly)
   return finish(r,"browser-unavailable");
  const demux=probe||globalThis.NOVA_DEMUX?.analyser;
  if(typeof demux!=="function")return finish(r,"analysis-unavailable");
  let info;
  try{info=await demux(file)}
  catch{return finish(r,stopped()?"cancelled":"container-unreadable")}
  if(stopped())return finish(r,"cancelled");
  if(!info)return finish(r,"container-unreadable");
  r.source.codec=category(info);
  r.source.width=count(info.dw);
  r.source.height=count(info.dh);
  r.source.durationMs=finite(info.durationUs)&&info.durationUs>=0?
    Math.round(info.durationUs/1000):null;
  r.source.frames=count(info.ns);
  if(r.source.codec!=="hevc")return finish(r,"unsupported-video-codec");
  const validateFn=validate||globalThis.NOVA_HEVC_RENDER?.metadata;
  if(typeof validateFn!=="function")return finish(r,"analysis-unavailable");
  let meta;
  try{meta=await validateFn(info)}
  catch{return finish(r,stopped()?"cancelled":"hevc-profile-or-timeline-incompatible")}
  if(stopped())return finish(r,"cancelled");
  if(!meta||!finite(meta.durationSeconds)||!Number.isSafeInteger(meta.width)||
     !Number.isSafeInteger(meta.height))return finish(r,"hevc-profile-or-timeline-incompatible");
  const planFn=plan||globalThis.NOVA_EXPORT?.plan;
  const budgetFn=guard||globalThis.NOVA_GUARD?.exigerBudget;
  if(typeof planFn!=="function"||typeof budgetFn!=="function")
   return finish(r,"analysis-unavailable");
  let settings,memory;
  try{
   settings=planFn({duration:meta.durationSeconds,width:meta.width,
    height:meta.height,bytes:file.size});
   memory=budgetFn({sourceBytes:file.size,
    sourceWidth:meta.encodedWidth??info.W,
    sourceHeight:meta.encodedHeight??info.H,
    outputWidth:settings.width,outputHeight:settings.height,
    durationSeconds:meta.durationSeconds,withAudio:true});
  }catch{return finish(r,stopped()?"cancelled":"resource-budget")}
  if(stopped())return finish(r,"cancelled");
  r.estimatedMiB=small(memory?.mebibytes);
  if(!Number.isSafeInteger(settings.width)||!Number.isSafeInteger(settings.height)||
     !Number.isSafeInteger(settings.frames)||settings.fps!==15||
     settings.frames<1||settings.frames>180||memory?.admissible!==true)
   return finish(r,"resource-budget");
  r.exportProposal={width:settings.width,height:settings.height,
   fps:settings.fps,frames:settings.frames};
  const audioFn=audioPlan||globalThis.NOVA_AAC_COPY?.planifier;
  if(typeof audioFn!=="function")return finish(r,"analysis-unavailable");
  let audio;
  try{audio=await audioFn(file,{durationSeconds:meta.durationSeconds,signal})}
  catch{return finish(r,stopped()?"cancelled":"audio-not-preservable")}
  if(stopped())return finish(r,"cancelled");
  if(audio?.mode!=="aac-copy"||!Array.isArray(audio.packets)||
     audio.packets.length===0)return finish(r,"audio-not-preservable");
  r.audio="aac-copy-verified";
  return finish(r,"ready-for-export-attempt");
 }catch{return finish(r,stopped()?"cancelled":"analysis-unavailable")}
}
function serialiser(report){
 if(!report||report.schema!=="retoucheproai.nova.real-preflight.v1"||
  report.version!==1||!codes.has(report.status)||
  report.readyForExportAttempt!==(report.status==="ready-for-export-attempt"))
  throw new TypeError("Rapport de précontrôle inconnu");
 const r=report.source||{},p=report.exportProposal;
 const safe={
  schema:"retoucheproai.nova.real-preflight.v1",version:1,
  status:report.status,
  readyForExportAttempt:report.readyForExportAttempt,
  source:{bytes:count(r.bytes),
   videoCategory:r.videoCategory==="local-video"?"local-video":"unverified",
   codec:["hevc","h264","other-or-unknown","unknown"].includes(r.codec)?r.codec:"unknown",
   width:count(r.width),height:count(r.height),
   durationMs:count(r.durationMs),frames:count(r.frames)},
  audio:report.audio==="aac-copy-verified"?"aac-copy-verified":"not-tested",
  estimatedMiB:small(report.estimatedMiB),
  exportProposal:p&&[p.width,p.height,p.fps,p.frames].every(Number.isSafeInteger)&&
    p.width>=2&&p.height>=2&&p.width<=640&&p.height<=640&&p.fps===15&&
    p.frames>=1&&p.frames<=180?
    {width:p.width,height:p.height,fps:p.fps,frames:p.frames}:null,
  privacy:{mediaUploaded:false,rawMediaInReport:false,filenameInReport:false,
   automaticSharing:false,mediaModified:false},
  limitation:"Précontrôle technique local uniquement : ni preuve de qualité, ni test de lecture finale, ni garantie d'export."
 };
 // Ne jamais sérialiser un objet externe : copier UNIQUEMENT la liste blanche.
 const json=JSON.stringify(safe,null,2)+"\n";
 if(json.length>3500)throw new RangeError("rapport trop volumineux");
 return json;
}
return Object.freeze({inspect,serialiser});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_REAL_PREFLIGHT;
