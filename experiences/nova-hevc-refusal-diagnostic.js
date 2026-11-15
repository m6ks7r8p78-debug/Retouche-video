/* NOVA — diagnostic consultatif, local, lecture seule, des refus HEVC.
 * Un code explicite ne transforme jamais une source refusée en export autorisé.
 * Ne lit aucun fichier, trame ou audio et ne sérialise aucune exception brute.
 */
var NOVA_HEVC_REFUSAL_DIAG=(()=>{
"use strict";
const validCode=new Set([
  "unresolved","not-hevc-pilot","pilot-limit-exceeded","pixel-aspect-unsupported",
  "color-metadata-unsupported","color-metadata-missing",
  "sps-vui-unverified","sps-vui-check-unavailable","sps-vui-unsupported",
  "timeline-data-unavailable","timeline-duplicate-pts","timeline-negative-preroll",
  "timeline-start-nonzero","timeline-end-inconsistent",
  "timeline-first-keyframe-missing","timeline-check-unavailable",
  "timeline-check-inconclusive","independent-checks-inconclusive"
]);
const stages=new Set(["codec","pilot-limits","presentation","color","sps-vui","timeline","unknown"]);
const confidences=new Set(["confirmed-by-metadata","unverified"]);
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const safeInt=x=>Number.isSafeInteger(x);
const output=(code,stage,confidence)=>Object.freeze({
  schema:"retoucheproai.nova.hevc-refusal-diagnostic.v1",
  code:validCode.has(code)?code:"unresolved",
  stage:stages.has(stage)?stage:"unknown",
  confidence:confidences.has(confidence)?confidence:"unverified",
  automaticFallbackAllowed:false,videoExportAllowed:false,audioTested:false
});
const known=(code,stage)=>output(code,stage,"confirmed-by-metadata");
const unknown=(code,stage)=>output(code,stage,"unverified");

function inspect(info,{vui,timeline}={}){
 try{
  if(!info||typeof info!=="object")return unknown("unresolved","unknown");
  if(!/^(hvc1|hev1)\./.test(info.codec||""))
    return known("not-hevc-pilot","codec");
  // Ces seules limites sont vérifiables sans le flux bitstream.
  if((safeInt(info.W)&&safeInt(info.H)&&info.W*info.H>640*360)||
     (safeInt(info.ns)&&info.ns>90)||
     (safeInt(info.durationUs)&&info.durationUs>12000000)||
     (safeInt(info.W)&&info.W%2!==0)||(safeInt(info.H)&&info.H%2!==0))
    return known("pilot-limit-exceeded","pilot-limits");
  const aspect=info.pixelAspect;
  if(aspect&&safeInt(aspect.h)&&safeInt(aspect.v)&&aspect.h!==aspect.v)
    return known("pixel-aspect-unsupported","presentation");
  const c=info.color;
  if(!c)return unknown("color-metadata-missing","color");
  if(!["nclc","nclx"].includes(c.kind)||c.primaries!==1||
     c.transfer!==1||c.matrix!==1||c.fullRange===true)
    return known("color-metadata-unsupported","color");
  const checkVui=vui||globalThis.NOVA_HEVC_VUI?.analyser;
  if(typeof checkVui!=="function")return unknown("sps-vui-check-unavailable","sps-vui");
  let sps;
  try{sps=checkVui(info)}catch{
    // Une exception pourrait venir du parseur ou du VUI; ne pas la classifier
    // en "profil interdit" sans information externe suffisamment fiable.
    return unknown("sps-vui-unverified","sps-vui");
  }
  if(!sps||!safeInt(sps.width)||!safeInt(sps.height))
    return unknown("sps-vui-unverified","sps-vui");
  if(sps.verified!==true||sps.width!==info.W||sps.height!==info.H||
     sps.chroma!==1||sps.lumaBits!==8||sps.chromaBits!==8||
     sps.fullRange!==false||sps.primaries!==1||sps.transfer!==1||sps.matrix!==1)
    return known("sps-vui-unsupported","sps-vui");

  const n=info.ns,pts=info.ptsUs;
  if(!safeInt(n)||n<1||!Array.isArray(pts)||pts.length!==n||
     !Array.isArray(info.key)||info.key.length!==n||
     !Array.isArray(info.so)||info.so.length!==n||
     !Array.isArray(info.sz)||info.sz.length!==n||
     !safeInt(info.durationUs)||info.durationUs<=0)
    return unknown("timeline-data-unavailable","timeline");
  if(info.key[0]!==true)return known("timeline-first-keyframe-missing","timeline");
  if(pts.some(x=>!safeInt(x)))return unknown("timeline-data-unavailable","timeline");
  if(new Set(pts).size!==pts.length)return known("timeline-duplicate-pts","timeline");
  const sorted=[...pts].sort((a,b)=>a-b);
  if(sorted[0]<-250000)return known("timeline-negative-preroll","timeline");
  const nonnegative=sorted.filter(x=>x>=0);
  if(!nonnegative.length)return unknown("timeline-data-unavailable","timeline");
  if(nonnegative[0]!==0)return known("timeline-start-nonzero","timeline");
  const last=nonnegative.at(-1);
  if(last>=info.durationUs||info.durationUs-last>250000)
    return known("timeline-end-inconsistent","timeline");
  const checkPts=timeline||globalThis.NOVA_PTS?.planifier;
  if(typeof checkPts!=="function")return unknown("timeline-check-unavailable","timeline");
  try{
   const plan=checkPts(info);
   if(!plan||!Array.isArray(plan.sorted)||!Array.isArray(plan.nonnegative))
    return unknown("timeline-check-inconclusive","timeline");
  }catch{return unknown("timeline-check-inconclusive","timeline")}
  // Checks consultatifs réussis ≠ décodage, son, export ou qualité vérifiés.
  return unknown("independent-checks-inconclusive","unknown");
 }catch{return unknown("unresolved","unknown")}
}
function publicReport(d){
 if(!d||d.schema!=="retoucheproai.nova.hevc-refusal-diagnostic.v1")
   return unknown("unresolved","unknown");
 return output(d.code,d.stage,d.confidence);
}
return Object.freeze({inspect,publicReport});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_HEVC_REFUSAL_DIAG;
