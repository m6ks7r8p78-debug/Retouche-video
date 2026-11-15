/* NOVA 0.25 — précontrôle de compatibilité pour vidéo réelle, LECTURE SEULE.
 * Réutilise le parseur MP4, le contrôle couleur/PTS HEVC, budget et AAC existants.
 * Aucun export, aucune modification des trames, aucun téléversement, pas de noms privés.
 * "admissible" signifie seulement qu'un ESSAI d'export peut être proposé, jamais garanti.
 */
var NOVA_REAL_PREFLIGHT=(()=>{
"use strict";
const MAX_BYTES=60*1048576;
// Bornes de NOVA_HEVC_RENDER.metadata : restituées sans les relever.
const MAX_CODED_PIXELS=640*360, MAX_SOURCE_FRAMES=90, MAX_SECONDS_US=12000000;
const MAX_OUTPUT_FPS=15;
const blockingCodes=new Set(["coded-pixels-over-limit","source-frames-over-limit",
 "duration-over-limit","coded-dimensions-not-even"]);
const advisoryCodes=new Set(["source-rate-above-output-rate","h264-opfs-required"]);
const diagnosticCodes=new Set([
 "unresolved","not-hevc-pilot","pilot-limit-exceeded","pixel-aspect-unsupported",
 "color-metadata-unsupported","color-metadata-missing","sps-vui-unverified",
 "sps-vui-check-unavailable","sps-vui-unsupported","timeline-data-unavailable",
 "timeline-duplicate-pts","timeline-negative-preroll","timeline-start-nonzero",
 "timeline-end-inconsistent","timeline-first-keyframe-missing",
 "timeline-check-unavailable","timeline-check-inconclusive",
 "independent-checks-inconclusive"
]);
const diagnosticStages=new Set(["codec","pilot-limits","presentation","color",
 "sps-vui","timeline","unknown"]);
const codes=new Set(["ready-for-export-attempt","not-video","file-budget",
 "browser-unavailable","insecure-context","container-unreadable",
 "unsupported-video-codec","hevc-profile-or-timeline-incompatible",
 "resource-budget","audio-not-preservable","analysis-unavailable","cancelled",
 "h264-unsafe-metadata","h264-pilot-limit","h264-unsafe-color",
 "h264-timeline-incompatible","h264-decoder-unavailable","h264-encoder-unavailable",
 "h264-opfs-unavailable"]);
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const count=x=>Number.isSafeInteger(x)&&x>=0?x:null;
const small=x=>finite(x)&&x>=0&&x<=160?Math.round(x*10)/10:null;
const approxFps=(n,d)=>Number.isSafeInteger(n)&&n>0&&finite(d)&&d>0?
 Math.round((n*1000000/d)*10)/10:null;
function knownLimits(info){
 const result=[];
 const w=count(info?.W),h=count(info?.H),n=count(info?.ns),d=info?.durationUs;
 // Les dimensions de codage (non celles de l'aperçu orienté) gouvernent le coût.
 if(w!==null&&h!==null&&w*h>MAX_CODED_PIXELS)
  result.push("coded-pixels-over-limit");
 if(n!==null&&n>MAX_SOURCE_FRAMES)
  result.push("source-frames-over-limit");
 if(finite(d)&&d>MAX_SECONDS_US)
  result.push("duration-over-limit");
 if(w!==null&&h!==null&&(w%2||h%2))
  result.push("coded-dimensions-not-even");
 return result;
}
function source(file){return {
 bytes:count(file?.size),videoCategory:"unverified",
 codec:"unknown",width:null,height:null,durationMs:null,frames:null,
 estimatedSourceFps:null
}}
function state(file){
 return {schema:"retoucheproai.nova.real-preflight.v1",version:1,
  status:"analysis-unavailable",readyForExportAttempt:false,
  source:source(file),audio:"not-tested",estimatedMiB:null,
  exportProposal:null,blockers:[],advisories:[],diagnostic:null,
  sourceEngine:"unverified",
  privacy:{mediaUploaded:false,rawMediaInReport:false,filenameInReport:false,
   automaticSharing:false,mediaModified:false},
  limitation:"Précontrôle technique local uniquement : ni preuve de qualité, ni test de lecture finale, ni garantie d'export."};
}
function finish(base,status){
 return Object.freeze({...base,status,readyForExportAttempt:status==="ready-for-export-attempt"});
}
function diagnosticPublic(d){
 if(!d||d.schema!=="retoucheproai.nova.hevc-refusal-diagnostic.v1"||
    !diagnosticCodes.has(d.code)||!diagnosticStages.has(d.stage))return null;
 return {code:d.code,stage:d.stage,
  confidence:d.confidence==="confirmed-by-metadata"?"confirmed-by-metadata":"unverified"};
}
function diagnoseFailure(report,info,diagnose){
 const fn=diagnose||globalThis.NOVA_HEVC_REFUSAL_DIAG?.inspect;
 if(typeof fn!=="function")return;
 try{
  const safe=diagnosticPublic(fn(info));
  report.diagnostic=safe?{schema:"retoucheproai.nova.hevc-refusal-diagnostic.v1",...safe}:null;
 }catch{report.diagnostic=null}
}
function category(info){
 const c=info?.codec;
 return typeof c==="string"&&/^(hvc1|hev1)\./.test(c)?"hevc":
        typeof c==="string"&&/^avc[13]\./.test(c)?"h264":"other-or-unknown";
}
async function inspect({file,signal,probe,validate,audioPlan,guard,plan,
 getEnvironment,diagnose,h264Inspect}={}){
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
  r.source.estimatedSourceFps=approxFps(info.ns,info.durationUs);
  if(r.source.codec==="hevc"){
   r.blockers=knownLimits(info);
   if(r.source.estimatedSourceFps!==null&&
       r.source.estimatedSourceFps>MAX_OUTPUT_FPS+0.2)
    r.advisories.push("source-rate-above-output-rate");
  }
  if(r.source.codec==="h264"){
   const fn=h264Inspect||globalThis.NOVA_H264_PATH?.inspect;
   if(typeof fn!=="function")return finish(r,"unsupported-video-codec");
   let h264;
   try{h264=await fn({file,info,signal,plan,guard,audioPlan})}
   catch{return finish(r,stopped()?"cancelled":"analysis-unavailable")}
   if(stopped())return finish(r,"cancelled");
   if(h264?.schema!=="retoucheproai.nova.h264-path.v1"||
      !codes.has(h264.status))return finish(r,"analysis-unavailable");
   r.sourceEngine="webcodecs-h264-native-pts";
   r.estimatedMiB=small(h264.estimatedMiB);
   if(h264.status==="ready-for-export-attempt"){
    if(h264.audio!=="aac-copy-verified"||!h264.proposal)
     return finish(r,"audio-not-preservable");
    r.audio="aac-copy-verified";
    r.exportProposal=h264.proposal;
    if(info.durationUs>24000000)r.advisories.push("h264-opfs-required");
   }
   if(r.source.estimatedSourceFps!==null&&
       r.source.estimatedSourceFps>MAX_OUTPUT_FPS+0.2)
    r.advisories.push("source-rate-above-output-rate");
   return finish(r,h264.status);
  }
  if(r.source.codec!=="hevc")return finish(r,"unsupported-video-codec");
  r.sourceEngine="wasm-hevc";
  const validateFn=validate||globalThis.NOVA_HEVC_RENDER?.metadata;
  if(typeof validateFn!=="function")return finish(r,"analysis-unavailable");
  let meta;
  try{meta=await validateFn(info)}
  catch{
   if(stopped())return finish(r,"cancelled");
   diagnoseFailure(r,info,diagnose);
   return finish(r,"hevc-profile-or-timeline-incompatible");
  }
  if(stopped())return finish(r,"cancelled");
  if(!meta||!finite(meta.durationSeconds)||!Number.isSafeInteger(meta.width)||
     !Number.isSafeInteger(meta.height)){
   diagnoseFailure(r,info,diagnose);
   return finish(r,"hevc-profile-or-timeline-incompatible");
  }
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
   durationMs:count(r.durationMs),frames:count(r.frames),
   estimatedSourceFps:finite(r.estimatedSourceFps)&&r.estimatedSourceFps>0&&
    r.estimatedSourceFps<1000?Math.round(r.estimatedSourceFps*10)/10:null},
  audio:report.audio==="aac-copy-verified"?"aac-copy-verified":"not-tested",
  estimatedMiB:small(report.estimatedMiB),
  sourceEngine:report.sourceEngine==="webcodecs-h264-native-pts"?
   "webcodecs-h264-native-pts":report.sourceEngine==="wasm-hevc"?
   "wasm-hevc":"unverified",
  diagnostic:diagnosticPublic(report.diagnostic),
  blockers:Array.isArray(report.blockers)?[...new Set(report.blockers.filter(
   x=>blockingCodes.has(x)))].slice(0,4):[],
  advisories:Array.isArray(report.advisories)?[...new Set(report.advisories.filter(
   x=>advisoryCodes.has(x)))].slice(0,2):[],
  pilotLimits:{codedPixelAreaMax:r.codec==="h264"?1920*1080:MAX_CODED_PIXELS,
   sourceFramesMax:r.codec==="h264"?5000:MAX_SOURCE_FRAMES,
   maxDurationMs:r.codec==="h264"?48000:MAX_SECONDS_US/1000,
   outputFpsMax:MAX_OUTPUT_FPS,
   outputSideMax:640},
  exportProposal:p&&[p.width,p.height,p.fps,p.frames].every(Number.isSafeInteger)&&
    p.width>=2&&p.height>=2&&p.width<=640&&p.height<=640&&p.fps===15&&
    p.frames>=1&&p.frames<=(r.codec==="h264"?720:180)?
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
