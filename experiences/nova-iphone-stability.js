/* NOVA 0.26 — répétabilité synthétique, pas un benchmark matériel.
 * Trois essais maximum, séquentiels, sans médias personnels.
 * Aucun accès réseau ni stockage, aucun contenu de fichier dans le rapport.
 * Un échec ou annulation interdit toute certification de stabilité.
 */
var NOVA_IPHONE_STABILITY=(()=>{
"use strict";
const schema="retoucheproai.nova.synthetic-stability.v1";
const safe=n=>Number.isFinite(n)&&n>=0?Math.round(n):null;
const int=n=>Number.isSafeInteger(n)&&n>=0?n:null;
const med=v=>v.slice().sort((a,b)=>a-b)[Math.floor(v.length/2)];
const validSource=r=>r?.sourceKind==="synthetic-generated"&&
 r?.schema==="retoucheproai.nova.iphone-lab.v1";
function summary(reports,{interrupted=false}={}){
 // Même l'annulation après le troisième résultat interdit un faux succès.
 if(typeof interrupted!=="boolean"||!Array.isArray(reports)||
    reports.length>3||(!interrupted&&reports.length<1))
  throw Error("NOVA stabilité : nombre de rapports invalide");
 const counts={completed:reports.length,succeeded:0,refused:0,cancelled:0};
 const times=[],wasm=[],sizes=[];
 let ref=null,consistent=true,reason=null;
 for(const r of reports){
  if(!validSource(r))throw Error("NOVA stabilité : seuls les rapports synthétiques sont admis");
  const mode=r.result;
  if(mode==="success")counts.succeeded++;
  else if(mode==="cancelled")counts.cancelled++;
  else counts.refused++;
  if(mode!=="success"){
   reason=mode==="cancelled"?"run-cancelled":"run-refused";
   consistent=false;continue;
  }
  const o=r.output||{};
  const ident=[o.outputWidth,o.outputHeight,o.outputFps,o.outputFrames,
   o.audio,o.colorVerified,o.mode];
  if(ref&&ident.some((v,i)=>v!==ref[i]))consistent=false;
  else if(!ref)ref=ident;
  if(o.colorVerified!==true||o.mode!=="hevc-wasm"||
    !["aac-copy","aac-encode"].includes(o.audio))consistent=false;
  const t=safe(o.pipelineElapsedMs),w=int(o.wasmHeapCapacityPeakBytes),
    s=int(o.mp4SizeBytes);
  if(t===null||t===0||w===null||w===0||s===null||s<1024)
   consistent=false;
  else{times.push(t);wasm.push(w);sizes.push(s)}
 }
 const full=!interrupted&&counts.completed===3&&counts.succeeded===3&&
   consistent&&times.length===3;
 let variability="not-measured",status="incomplete";
 if(full){
  const tMin=Math.min(...times),tMax=Math.max(...times);
  variability=tMin>=50&&tMax>tMin*3?"high":"observed";
  status=variability==="high"?"caution":"three-synthetic-runs-consistent";
 }else if(interrupted||counts.refused||counts.cancelled)status="abstain";
 else if(!consistent)status="inconsistent-output";
 const d=full?Math.max(...wasm)-Math.min(...wasm):null;
 return Object.freeze({
  schema,sourceKind:"synthetic-generated",expectedRuns:3,
  ...counts,status,variability,outputConsistent:full,
  elapsedMedianMs:times.length===3?med(times):null,
  elapsedMinMs:times.length===3?Math.min(...times):null,
  elapsedMaxMs:times.length===3?Math.max(...times):null,
  wasmHeapCapacityMinBytes:wasm.length===3?Math.min(...wasm):null,
  wasmHeapCapacityMaxBytes:wasm.length===3?Math.max(...wasm):null,
  wasmCapacitySpreadBytes:d,
  outputSizeMinBytes:sizes.length===3?Math.min(...sizes):null,
  outputSizeMaxBytes:sizes.length===3?Math.max(...sizes):null,
  failureReason:interrupted?"run-cancelled":reason,
  interrupted,
  caveat:"Three synthetic runs in this browser, not physical-iPhone certification; WASM allocation capacity is not RSS or a memory leak test",
  physicalIphoneCertified:false,realMediaTested:false,
  totalRamKnown:false,thermalMeasured:false,
  uploadsPerformed:false,automaticSettingsChange:false
 });
}
async function run({execute,signal,onProgress=()=>{},runs=3}={}){
 if(typeof execute!=="function"||runs!==3)
  throw Error("NOVA stabilité : trois essais et callback requis");
 const records=[];
 for(let i=0;i<runs;i++){
  if(signal?.aborted)break;
  onProgress({current:i+1,total:3});
  if(signal?.aborted)break;
  const data=await execute(i,signal);
  // Rejeter tout autre format de rapport sans exposer les données.
  if(!validSource(data?.report))throw Error("NOVA stabilité : provenance invalide");
  records.push(data.report);
  // Aucune accumulation de Blob MP4 dans les statistiques.
  if(signal?.aborted||data.report.result!=="success")break;
 }
 return summary(records,{interrupted:signal?.aborted===true});
}
function serialize(value){
 if(!value||value.schema!==schema)
  throw Error("Rapport de stabilité non valide");
 // Ne jamais recopier de texte libre (nom, chemin, userAgent).
 const statuses=["incomplete","abstain","inconsistent-output",
  "caution","three-synthetic-runs-consistent"];
 const variations=["not-measured","observed","high"];
 const reasons=[null,"run-refused","run-cancelled"];
 const status=statuses.includes(value.status)?value.status:"abstain";
 const v={
  schema,sourceKind:"synthetic-generated",expectedRuns:3,
  completed:int(value.completed)!==null&&value.completed<=3?value.completed:0,
  succeeded:int(value.succeeded)!==null&&value.succeeded<=3?value.succeeded:0,
  refused:int(value.refused)!==null&&value.refused<=3?value.refused:0,
  cancelled:int(value.cancelled)!==null&&value.cancelled<=3?value.cancelled:0,
  status,variability:variations.includes(value.variability)?
   value.variability:"not-measured",
  interrupted:value.interrupted===true,
  outputConsistent:value.interrupted!==true&&value.outputConsistent===true&&
   (status==="three-synthetic-runs-consistent"||status==="caution"),
  elapsedMedianMs:safe(value.elapsedMedianMs),
  elapsedMinMs:safe(value.elapsedMinMs),elapsedMaxMs:safe(value.elapsedMaxMs),
  wasmHeapCapacityMinBytes:int(value.wasmHeapCapacityMinBytes),
  wasmHeapCapacityMaxBytes:int(value.wasmHeapCapacityMaxBytes),
  wasmCapacitySpreadBytes:int(value.wasmCapacitySpreadBytes),
  outputSizeMinBytes:int(value.outputSizeMinBytes),
  outputSizeMaxBytes:int(value.outputSizeMaxBytes),
  failureReason:reasons.includes(value.failureReason)?value.failureReason:null,
  caveat:"Three synthetic runs in this browser, not physical-iPhone certification; WASM allocation capacity is not RSS or a memory leak test",
  physicalIphoneCertified:false,realMediaTested:false,
  totalRamKnown:false,thermalMeasured:false,
  uploadsPerformed:false,automaticSettingsChange:false
 };
 if(v.interrupted){v.status="abstain";v.outputConsistent=false;
  v.failureReason="run-cancelled"}
 const out=JSON.stringify(v,null,2);
 if(out.length>5000)throw Error("Rapport de stabilité trop volumineux");
 return out+"\n";
}
return Object.freeze({run,summary,serialize});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_IPHONE_STABILITY;
