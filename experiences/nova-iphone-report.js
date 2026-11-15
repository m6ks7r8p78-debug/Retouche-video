/* NOVA 0.24 — banc Safari local, export JSON volontaire, aucun serveur.
 * Le rapport est une liste blanche : ni nom, ni chemin, ni octets privés,
 * ni PTS individuels, ni userAgent, ni empreinte d'appareil.
 * Ne prouve jamais un essai iPhone tant que l'utilisateur ne l'exécute pas.
 */
var NOVA_IPHONE_REPORT=(()=>{
"use strict";
const VERSION="NOVA 0.24";
function finiteNumber(v){return typeof v==="number"&&Number.isFinite(v)}
function count(v){return Number.isSafeInteger(v)&&v>=0?v:null}
function rounded(v){return finiteNumber(v)&&v>=0?Math.round(v):null}
function safeMode(v,allowed){return allowed.includes(v)?v:"unknown"}
// Sur l'iPhone, le sélecteur Fichiers peut fournir un MOV avec MIME vide.
 // L'extension ne sert qu'au choix local, jamais à une empreinte de rapport.
function videoFile(file){
 return !!file&&(file.type?.startsWith("video/")===true||
  (!file.type&&/\.(mov|mp4|m4v)$/i.test(file.name||"")));
}
function environment(){
 const n=globalThis.navigator||{};
 return Object.freeze({
  secureContext:globalThis.isSecureContext===true,
  videoEncoder:typeof globalThis.VideoEncoder==="function",
  videoDecoder:typeof globalThis.VideoDecoder==="function",
  videoFrame:typeof globalThis.VideoFrame==="function",
  webAssembly:typeof globalThis.WebAssembly==="object",
  worker:typeof globalThis.Worker==="function",
  audioEncoder:typeof globalThis.AudioEncoder==="function",
  standalone:!!n.standalone||
   (typeof matchMedia==="function"&&matchMedia("(display-mode: standalone)").matches)
 });
}
function classify(message,aborted){
 if(aborted)return "cancelled";
 const s=String(message||"");
 if(/VUI|couleur|colr|BT.?709|HDR|SPS|gamut|full.range|primaires|P3/i.test(s))
  return "color-or-bitstream-rejected";
 if(/AAC|audio|son|piste/i.test(s))return "audio-preservation-rejected";
 if(/mémoire|budget|plafond|taille|Mo|échantillons|RAM/i.test(s))return "resource-budget-rejected";
 if(/WebCodecs|H.264|VideoEncoder|WASM|support|décodeur|module|sécure|HTTPS/i.test(s))
  return "codec-or-browser-unavailable";
 if(/PTS|durée|preroll|chronolog|horodat|timestamp/i.test(s))
  return "timeline-rejected";
 return "export-failed";
}
function sourceSummary(file,info){
 return {
  mimeCategory:videoFile(file)?"video":"unknown",
  inputBytes:count(file?.size),
  containerVideo:info&&/^(hev1|hvc1)\./.test(info.codec||"")?"hevc":"other-or-unknown",
  width:count(info?.dw),height:count(info?.dh),
  sampleCount:count(info?.ns),
  durationMs:finiteNumber(info?.durationUs)?rounded(info.durationUs/1000):null,
  color:info?.color?{
   primaries:count(info.color.primaries),transfer:count(info.color.transfer),
   matrix:count(info.color.matrix),
   explicitFullRange:info.color.kind==="nclx"?info.color.fullRange:null
  }:null
 };
}
function exportSummary(result){
 const p=result?.pipelineAudit, h=result?.hevcDiagnostics;
 const stageKeys=["preflight","audio","video","video-flush","aac-copy","mux","verify"];
 const stages={};
 for(const key of stageKeys)stages[key]=rounded(p?.stagesMs?.[key]);
 return {
  mode:safeMode(result?.sourceMode,["hevc-wasm"]),
  audio:safeMode(result?.audioMode,["aac-copy","aac-encode","silent"]),
  outputWidth:count(result?.plan?.width),
  outputHeight:count(result?.plan?.height),
  outputFps:count(result?.plan?.fps),
  outputFrames:count(result?.plan?.frames),
  outputBytes:count(result?.blob?.size),
  observedDurationMs:finiteNumber(result?.validation?.duration)?
   rounded(result.validation.duration*1000):null,
  colorVerified:result?.colorAudit?.kind==="nclx"&&
   result.colorAudit.primaries===1&&result.colorAudit.transfer===1&&
   result.colorAudit.matrix===1&&result.colorAudit.fullRange===false,
  timingMs:stages,
  pipelineElapsedMs:rounded(p?.elapsedMs),
  wasmPipelineMs:rounded(h?.pipelineElapsedMs),
  wasmHeapCapacityPeakBytes:count(h?.wasmHeapPeakBytes),
  jsHeapObservedPeakBytes:count(p?.jsHeapPeakBytes),
  mp4PayloadBytes:count(p?.encodedPayloadBytes),
  mp4SizeBytes:count(p?.finalMp4Bytes),
  encoderQueuePeak:count(p?.peakVideoEncodeQueue),
  inbandParameterSets:count(h?.inbandParameterSets),
  caveat:"WASM capacity and optional JS heap are not iPhone RAM or thermal metrics"
 };
}
async function executer({file,moteur,arbitre,allowSilent=false,synthetic=false,signal,
 exporter,probeFile,validateSource,getEnvironment,clock,onProgress=()=>{}}={}){
 const now=typeof clock==="function"?clock:()=>performance.now();
 const start=now(),env=(getEnvironment||environment)();
 const record={
  schema:"retoucheproai.nova.iphone-lab.v1",version:VERSION,
  createdAt:new Date().toISOString(),privacy:{
   mediaUploaded:false,includesFileName:false,includesMediaContent:false,
   includesUserAgent:false,includesGPS:false,automaticSharing:false
  },
  environment:env,requestedAudio:allowSilent?"silent-explicit":"preserve",
  sourceKind:synthetic===true?"synthetic-generated":"local-user-file",
  source:null,output:null,phase:"preflight",result:"refused",errorCode:null,
  elapsedMs:null,
  limitation:"Only a physical Safari iPhone run can validate that device; no RSS/thermal proof"
 };
 let processed=null;
 try{
  if(!file||typeof file.slice!=="function"||!Number.isSafeInteger(file.size)||
     file.size<1||file.size>60*1048576)
   throw new Error("budget fichier source incorrect");
  if(!videoFile(file))
   throw new Error("format vidéo requis");
  record.source=sourceSummary(file,null);
  if(!env.secureContext)throw new Error("HTTPS ou localhost sécure requis");
  if(!env.videoEncoder||!env.videoFrame||!env.webAssembly)
   throw new Error("WebCodecs/VideoEncoder ou WebAssembly indisponible");
  const probing=probeFile||((f)=>NOVA_DEMUX.analyser(f));
  const info=await probing(file);
  record.source=sourceSummary(file,info);
  if(!info||!/^(hvc1|hev1)\./.test(info.codec||""))
   throw new Error("HEVC H.265 pilote uniquement");
  const validating=validateSource||((x)=>NOVA_HEVC_RENDER.metadata(x));
  validating(info);
  if(signal?.aborted)throw new Error("Export annulé");
  record.phase="export";
  const fn=exporter||NOVA_EXPORT.exporter;
  processed=await fn({file,moteur,arbitre,allowSilent,allowApproximate:false,
   signal,onProgress:step=>{
    if(typeof step?.stage==="string")record.phase=
     safeMode(step.stage,["budget","source","audio","audioMode","video","verification","fini"]);
    onProgress(step);
   }});
  if(signal?.aborted)throw new Error("Export annulé");
  if(processed?.sourceMode!=="hevc-wasm"||!processed?.blob||
     !processed?.pipelineAudit?.completed)
   throw new Error("résultat audiovisuel HEVC non certifiable");
  record.output=exportSummary(processed);
  record.phase="complete";record.result="success";
 }catch(error){
  record.errorCode=classify(error?.message,!!signal?.aborted);
  record.result=signal?.aborted?"cancelled":"refused";
 }finally{
  record.elapsedMs=rounded(now()-start);
 }
 return Object.freeze({report:Object.freeze(record),
  outputBlob:record.result==="success"?processed?.blob:null});
}
function serialiser(report,advice=null){
 if(!report||report.schema!=="retoucheproai.nova.iphone-lab.v1")
  throw new TypeError("rapport NOVA iPhone invalide");
 // Le générateur ne sérialise que les champs de son propre objet ;
 // rejeter objets externes pour éviter d'y inclure des données privées.
 const s=JSON.stringify({
  schema:report.schema,version:report.version,createdAt:report.createdAt,
  privacy:report.privacy,environment:report.environment,
  requestedAudio:report.requestedAudio,sourceKind:report.sourceKind,
  source:report.source,output:report.output,
  phase:report.phase,result:report.result,errorCode:report.errorCode,
  elapsedMs:report.elapsedMs,limitation:report.limitation,
  deviceAdvice:typeof NOVA_DEVICE_ADVICE==="object"&&NOVA_DEVICE_ADVICE?
   NOVA_DEVICE_ADVICE.publicFields(advice):null
 },null,2);
 if(s.length>14000)throw new RangeError("rapport trop volumineux");
 return s+"\n";
}
return Object.freeze({videoFile,environment,sourceSummary,exportSummary,executer,serialiser});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_IPHONE_REPORT;
