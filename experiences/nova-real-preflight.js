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
const nativeReasons=new Set(["not-evaluated","module-missing","source-contract-unverified",
 "decoder-unavailable","encoder-unavailable","aac-analysis-unavailable",
 "aac-copy-unavailable","native-ready"]);
const blockingCodes=new Set(["coded-pixels-over-limit","source-frames-over-limit",
 "duration-over-limit","coded-dimensions-not-even"]);
const advisoryCodes=new Set(["source-rate-above-output-rate"]);
const codes=new Set(["ready-for-export-attempt","not-video","file-budget",
 "browser-unavailable","insecure-context","container-unreadable",
 "unsupported-video-codec","hevc-profile-or-timeline-incompatible",
 "resource-budget","audio-not-preservable","analysis-unavailable","cancelled",
 "ready-for-native-hd-attempt","native-hd-unavailable"]);
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
  source:source(file),audio:"not-tested",nativeReason:"not-evaluated",
  estimatedMiB:null,
  exportProposal:null,blockers:[],advisories:[],
  privacy:{mediaUploaded:false,rawMediaInReport:false,filenameInReport:false,
   automaticSharing:false,mediaModified:false},
  limitation:"Précontrôle technique local uniquement : ni preuve de qualité, ni test de lecture finale, ni garantie d'export."};
}
function finish(base,status){
 return Object.freeze({...base,status,readyForExportAttempt:status==="ready-for-export-attempt"||
  status==="ready-for-native-hd-attempt"});
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
  // Le chemin HD natif WebCodecs ne dépend pas de WebAssembly.
  // Vérifier WebAssembly uniquement avant le repli HEVC historique.
  if(!env.videoEncoder||!env.videoFrame)
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
   // Ces bornes appartiennent au seul pilote HEVC WebAssembly.
   r.blockers=knownLimits(info);
   if(r.source.estimatedSourceFps!==null&&
       r.source.estimatedSourceFps>MAX_OUTPUT_FPS+0.2)
    r.advisories.push("source-rate-above-output-rate");
  }
  if(!["hevc","h264"].includes(r.source.codec))
   return finish(r,"unsupported-video-codec");
  // Le moteur HD natif accepte aussi H.264, même lorsque les petites vidéos
  // n'ont pas dépassé les anciennes limites HEVC WebAssembly.
  // Ne jamais déclarer une sortie possible avant vérification codec et AAC.
  const hd=globalThis.NOVA_NATIVE_HD;
  if(r.source.codec==="h264"&&!hd)r.nativeReason="module-missing";
  if(hd&&(r.source.codec==="h264"||r.blockers.some(
   x=>x==="coded-pixels-over-limit"||x==="source-frames-over-limit"))){
   // Seuls des codes de phase génériques peuvent sortir du navigateur.
   // Ni message d'exception natif, ni nom de média, ni données de piste.
   let phase="source-contract-unverified";
   try{
    const p=hd.analyse(info,file.size);
    if(stopped())return finish(r,"cancelled");
    phase="decoder-unavailable";
    await hd.configDecoder(info);
    phase="encoder-unavailable";
    await hd.configEncoder(p);
    if(stopped())return finish(r,"cancelled");
    phase="aac-analysis-unavailable";
    const aud=audioPlan||globalThis.NOVA_AAC_COPY?.planifier;
    if(typeof aud!=="function")throw new Error("AAC-planifier unavailable");
    const a=await aud(file,{durationSeconds:p.durationSeconds,signal});
    if(stopped())return finish(r,"cancelled");
    if(a?.mode==="aac-copy"&&a.packets?.length>0){
     r.nativeReason="native-ready";
     r.audio="aac-copy-verified";
     r.blockers=[];r.advisories=[];
     r.exportProposal={width:p.width,height:p.height,
      fps:Math.round(p.sourceFps),frames:p.sourceFrames};
     return finish(r,"ready-for-native-hd-attempt");
    }
    r.nativeReason="aac-copy-unavailable";
    if(r.source.codec==="h264")return finish(r,"audio-not-preservable");
   }catch{
    if(stopped())return finish(r,"cancelled");
    r.nativeReason=phase;
    // Aucune promotion HD si les codecs/couleurs/AAC ne sont pas validés.
   }
  }
  // Il n'existe pas de précontrôle HEVC WASM valable pour une source H.264.
  // Le code indique une indisponibilité du moteur HD, pas du format lui-même.
  if(r.source.codec==="h264")return finish(r,"native-hd-unavailable");
  if(!env.webAssembly)return finish(r,"browser-unavailable");
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
  report.readyForExportAttempt!==(
   report.status==="ready-for-export-attempt"||report.status==="ready-for-native-hd-attempt"))
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
  nativeReason:nativeReasons.has(report.nativeReason)?report.nativeReason:"not-evaluated",
  estimatedMiB:small(report.estimatedMiB),
  blockers:Array.isArray(report.blockers)?[...new Set(report.blockers.filter(
   x=>blockingCodes.has(x)))].slice(0,4):[],
  advisories:Array.isArray(report.advisories)?[...new Set(report.advisories.filter(
   x=>advisoryCodes.has(x)))].slice(0,2):[],
  pilotLimits:{codedPixelAreaMax:MAX_CODED_PIXELS,sourceFramesMax:MAX_SOURCE_FRAMES,
   maxDurationMs:MAX_SECONDS_US/1000,outputFpsMax:MAX_OUTPUT_FPS},
  exportProposal:p&&[p.width,p.height,p.fps,p.frames].every(Number.isSafeInteger)&&
    p.width>=2&&p.height>=2&&p.width*p.height<=
     (report.status==="ready-for-native-hd-attempt"?2200000:640*640)&&
    p.fps>=5&&p.fps<=(report.status==="ready-for-native-hd-attempt"?61:15)&&
    p.frames>=1&&p.frames<=(report.status==="ready-for-native-hd-attempt"?360:180)?
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
