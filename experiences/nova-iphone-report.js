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
  if(signal?.aborted)throw new Error("Export annulé");
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
  // Ne plus inspecter SPS/VUI si Safari a interrompu le probe MOV.
  if(signal?.aborted)throw new Error("Export annulé");
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
/* Contrat strict de sortie : ne jamais diffuser une propriété ajoutée au
 * rapport, même quand un plugin ou un autre labo appelle serialiser().
 * Les nombres ne viennent que des champs explicitement énumérés.
 */
const PRIVACY=Object.freeze({
 mediaUploaded:false,includesFileName:false,includesMediaContent:false,
 includesUserAgent:false,includesGPS:false,automaticSharing:false
});
const LIMITATION="Only a physical Safari iPhone run can validate that device; no RSS/thermal proof";
const CAVEAT="WASM capacity and optional JS heap are not iPhone RAM or thermal metrics";
const ENV_KEYS=["secureContext","videoEncoder","videoDecoder","videoFrame",
 "webAssembly","worker","audioEncoder","standalone"];
const STAGE_KEYS=["preflight","audio","video","video-flush","aac-copy","mux","verify"];
const ERROR_CODES=["cancelled","color-or-bitstream-rejected",
 "audio-preservation-rejected","resource-budget-rejected",
 "codec-or-browser-unavailable","timeline-rejected","export-failed"];
const PHASE_CODES=["preflight","export","budget","source","audio",
 "audioMode","video","verification","fini","complete"];
function sourceForExport(s){
 if(!s||typeof s!=="object")return null;
 const color=s.color&&typeof s.color==="object"?{
  primaries:count(s.color.primaries),
  transfer:count(s.color.transfer),
  matrix:count(s.color.matrix),
  explicitFullRange:typeof s.color.explicitFullRange==="boolean"?
   s.color.explicitFullRange:null
 }:null;
 return {
  mimeCategory:safeMode(s.mimeCategory,["video","unknown"]),
  inputBytes:count(s.inputBytes),
  containerVideo:safeMode(s.containerVideo,["hevc","other-or-unknown"]),
  width:count(s.width),height:count(s.height),
  sampleCount:count(s.sampleCount),durationMs:rounded(s.durationMs),
  color
 };
}
function outputForExport(o){
 if(!o||typeof o!=="object")return null;
 const timing={};
 for(const k of STAGE_KEYS)timing[k]=rounded(o.timingMs?.[k]);
 return {
  mode:safeMode(o.mode,["hevc-wasm"]),
  audio:safeMode(o.audio,["aac-copy","aac-encode","silent"]),
  outputWidth:count(o.outputWidth),outputHeight:count(o.outputHeight),
  outputFps:count(o.outputFps),outputFrames:count(o.outputFrames),
  outputBytes:count(o.outputBytes),observedDurationMs:rounded(o.observedDurationMs),
  colorVerified:o.colorVerified===true,timingMs:timing,
  pipelineElapsedMs:rounded(o.pipelineElapsedMs),
  wasmPipelineMs:rounded(o.wasmPipelineMs),
  wasmHeapCapacityPeakBytes:count(o.wasmHeapCapacityPeakBytes),
  jsHeapObservedPeakBytes:count(o.jsHeapObservedPeakBytes),
  mp4PayloadBytes:count(o.mp4PayloadBytes),mp4SizeBytes:count(o.mp4SizeBytes),
  encoderQueuePeak:count(o.encoderQueuePeak),
  inbandParameterSets:count(o.inbandParameterSets),
  caveat:CAVEAT
 };
}
function serialiser(report,advice=null){
 if(!report||report.schema!=="retoucheproai.nova.iphone-lab.v1")
  throw new TypeError("rapport NOVA iPhone invalide");
 const env={};
 for(const key of ENV_KEYS)env[key]=report.environment?.[key]===true;
 const result=safeMode(report.result,["success","refused","cancelled"]);
 const createdAt=typeof report.createdAt==="string"&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(report.createdAt)&&
  Number.isFinite(Date.parse(report.createdAt))?report.createdAt:null;
 const serialized={
  schema:"retoucheproai.nova.iphone-lab.v1",
  version:VERSION,createdAt,privacy:{...PRIVACY},environment:env,
  requestedAudio:safeMode(report.requestedAudio,["preserve","silent-explicit"]),
  sourceKind:safeMode(report.sourceKind,["synthetic-generated","local-user-file"]),
  source:sourceForExport(report.source),output:outputForExport(report.output),
  phase:safeMode(report.phase,PHASE_CODES),result,
  errorCode:result==="success"?null:
   safeMode(report.errorCode,ERROR_CODES),
  elapsedMs:rounded(report.elapsedMs),
  limitation:LIMITATION,
  deviceAdvice:typeof NOVA_DEVICE_ADVICE==="object"&&NOVA_DEVICE_ADVICE?
   NOVA_DEVICE_ADVICE.publicFields(advice):null
 };
 const s=JSON.stringify(serialized,null,2);
 if(s.length>14000)throw new RangeError("rapport trop volumineux");
 return s+"\n";
}
return Object.freeze({videoFile,environment,sourceSummary,exportSummary,executer,serialiser});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_IPHONE_REPORT;
