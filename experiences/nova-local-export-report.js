/* NOVA — diagnostic de ressources local, en liste blanche.
 * Ni média, nom de fichier, piste AAC, exception brute, IP ou télémétrie réseau.
 * Ces compteurs ne sont PAS la mémoire CPU/GPU/RSS du navigateur.
 */
var NOVA_LOCAL_EXPORT_REPORT=(()=>{
"use strict";
const schema="retoucheproai.nova.local-export-resource.v1";
const safe=n=>Number.isFinite(n)&&n>=0&&n<=1e12?Math.round(n*100)/100:null;
const integer=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12?n:null;
const mode=(value,allowed,fallback="unverified")=>allowed.includes(value)?value:fallback;
const stages=["preflight","audio","video","video-flush","aac-copy","mux","verify"];
function shared({storageMode,stage="unverified",errorCode=null,storageEstimate=null}={}){
 const origin=storageEstimate||{};
 return {
  schema,status:"unverified",stage:mode(stage,
   [...stages,"complete","storage","source","window","budget","audioMode",
    "verification","fini","unverified"]),
  storageMode:mode(storageMode,["memory","opfs-local-stream","opfs"]),
  originStorageEstimate:{
   usageBytes:integer(origin.usage),quotaBytes:integer(origin.quota),
   qualification:"stockage de toute l'origine; pas RAM, GPU ni quota garanti"
  },
  privacy:{
   privateMediaIncluded:false,filenameRecorded:false,pixelsRecorded:false,
   audioSamplesRecorded:false,packetBytesRecorded:false,
   automaticUpload:false,automaticSharing:false
  },
  physicalIphoneVerified:false,
  qualityPerceptuallyCertified:false,
  totalDeviceMemoryMeasured:false
 };
}
function success(result,{storageEstimate}={}){
 if(!result||!result.plan||!result.blob||
    !Number.isSafeInteger(result.blob.size)||result.blob.size<1024)
  throw new TypeError("NOVA diagnostic : résultat d'export invalide");
 const r=shared({storageMode:result.storageMode,
  stage:"complete",storageEstimate});
 r.status="local-mp4-created";
 r.output={
  width:integer(result.plan.width),height:integer(result.plan.height),
  fps:integer(result.plan.fps),
  frames:integer(result.plan.frames),
  durationSeconds:safe(result.plan.duration),
  mp4Bytes:integer(result.blob.size),
  windows:integer(result.windowPlan?.count)
 };
 r.pipeline={
  elapsedMs:safe(result.pipelineAudit?.elapsedMs),
  encodedVideoBytes:integer(result.pipelineAudit?.encodedVideoBytes),
  encodedAudioBytes:integer(result.pipelineAudit?.encodedAudioBytes),
  encodedFrames:integer(result.pipelineAudit?.frames),
  peakEncodeQueue:integer(result.pipelineAudit?.peakVideoEncodeQueue),
  jsHeapPeakBytes:integer(result.pipelineAudit?.jsHeapPeakBytes),
  jsHeapQualification:"Chrome facultatif; indisponible dans de nombreux Safari; GPU/WASM/RSS exclus"
 };
 const m=result.storageMetrics||{};
 r.opfs={
  streamUsed:result.storageMode==="opfs-local-stream",
  bytesWritten:integer(m.totalBytesWritten),
  peakPendingBytes:integer(m.peakPendingBytes),
  maxPendingBytes:integer(m.bufferLimitBytes),
  ioWrites:integer(m.writeCount),
  qualification:"file d'écriture OPFS uniquement, aucune mesure du pic RAM total"
 };
 r.audio={
  mode:mode(result.audioMode,["aac-copy","aac-encode","silent"]),
  packetsChecked:integer(result.audioAudit?.packets),
  sourceAudioHashesCompared:false
 };
 r.color={
  nclx709LimitedChecked:result.colorAudit?.kind==="nclx"&&
   result.colorAudit?.primaries===1&&result.colorAudit?.matrix===1&&
   result.colorAudit?.transfer===1&&result.colorAudit?.fullRange===false
 };
 return Object.freeze(r);
}
function failure({storageMode,stage="unverified",storageEstimate}={}){
 const r=shared({storageMode,stage,storageEstimate});
 r.status="local-export-refused-or-cancelled";
 r.output=null;
 r.failure={
  qualification:"reason intentionally excluded; no raw error messages or source metadata"
 };
 return Object.freeze(r);
}
function serialize(report){
 if(!report||report.schema!==schema||
    !["local-mp4-created","local-export-refused-or-cancelled"].includes(report.status))
  throw new TypeError("NOVA diagnostic : schéma inconnu");
 const json=JSON.stringify(report,null,2)+"\n";
 if(json.length>6000)throw new RangeError("NOVA diagnostic : rapport trop volumineux");
 return json;
}
return Object.freeze({success,failure,serialize});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_LOCAL_EXPORT_REPORT;
