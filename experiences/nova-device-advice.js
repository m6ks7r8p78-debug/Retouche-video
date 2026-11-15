/* NOVA 0.25 — contrat de capacités consultatif inter-laboratoires.
 * SmallMotion: s'abstenir quand la mesure n'est pas complète; ses seuils
 * pour 2 images NE sont PAS réutilisés pour les exports HEVC.
 * AURA: un résultat synthétique ne certifie ni l'app ni un iPhone réel.
 * Export X: sortie locale, jamais publication automatisée.
 * Aucune action sur le média, aucune demande réseau, aucun stockage.
 */
var NOVA_DEVICE_ADVICE=(()=>{
"use strict";
const MiB=1048576;
const LIMITS=Object.freeze({
  encodedBytes:24*MiB,wasmCapacityBytes:384*MiB,
  inputBytes:60*MiB,maxHevcSamples:90
});
const S=new Set(["retoucheproai.nova.iphone-lab.v1"]);
const yes=v=>v===true;
const safe=n=>Number.isSafeInteger(n)&&n>=0;
function result(state,reason,next,evidence,nearLimit=false){
 return Object.freeze({
  schema:"retoucheproai.nova.device-advice.v1",
  state,reason,next,evidence,
  nearLimit,
  // Inter-lab invariants : conseil seulement. Ces booleens sont fixes.
  mediaModified:false,settingsChanged:false,automaticUpload:false,
  physicalIphoneCertified:false,totalRamKnown:false,
  limits:"NOVA pilot budgets only; no battery, GPU, RSS or thermal measurement"
 });
}
function assess(report,{visibility="visible"}={}){
 const abstain=(reason,next="review-refusal")=>
  result("abstain",reason,next,"insufficient");
 if(!report||!S.has(report.schema)||!["synthetic-generated","local-user-file"].includes(report.sourceKind))
  return abstain("invalid-report");
 if(visibility!=="visible")return abstain("page-not-visible","retry-foreground");
 const env=report.environment;
 if(!env||!yes(env.secureContext)||!yes(env.videoEncoder)||
    !yes(env.videoFrame)||!yes(env.webAssembly))
  return abstain("required-browser-capability-unavailable","inspect-codec-support");
 if(report.result!=="success"||report.errorCode!==null)
  return abstain(report.result==="cancelled"?"cancelled":"export-refused");
 const source=report.source,out=report.output;
 if(!source||!out||source.containerVideo!=="hevc"||
    !safe(source.inputBytes)||source.inputBytes>LIMITS.inputBytes||
    !safe(source.sampleCount)||source.sampleCount>LIMITS.maxHevcSamples||
    !safe(source.durationMs)||source.durationMs<=0)
  return abstain("source-limits-or-evidence-missing");
 if(out.mode!=="hevc-wasm"||!yes(out.colorVerified)||
    !safe(out.mp4SizeBytes)||out.mp4SizeBytes<1024||
    !safe(out.mp4PayloadBytes)||out.mp4PayloadBytes<1||
    !safe(out.wasmHeapCapacityPeakBytes)||out.wasmHeapCapacityPeakBytes<1||
    !safe(out.pipelineElapsedMs)||out.pipelineElapsedMs<1)
  return abstain("incomplete-output-audit");
 if(out.mp4SizeBytes>LIMITS.encodedBytes||
    out.mp4PayloadBytes>LIMITS.encodedBytes||
    out.wasmHeapCapacityPeakBytes>LIMITS.wasmCapacityBytes)
  return abstain("pilot-resource-limit-exceeded");
 if(report.requestedAudio==="preserve"&&
    !["aac-copy","aac-encode"].includes(out.audio))
  return abstain("audio-not-preserved");
 if(report.requestedAudio!=="preserve"&&report.requestedAudio!=="silent-explicit")
  return abstain("audio-consent-unknown");
 if(report.requestedAudio==="silent-explicit"&&out.audio!=="silent")
  return abstain("audio-consent-mismatch");
 // Sur la base des budgets NOVA, 80 % est un seuil *consultatif*.
 // "lent" est uniquement un coût de CET essai, pas un test CPU/iPhone.
 const near=out.mp4SizeBytes>LIMITS.encodedBytes*.8||
    out.mp4PayloadBytes>LIMITS.encodedBytes*.8||
    out.wasmHeapCapacityPeakBytes>LIMITS.wasmCapacityBytes*.8||
    out.pipelineElapsedMs>Math.max(5000,source.durationMs*3);
 const evidence=report.sourceKind==="synthetic-generated"?
   "synthetic-run-in-current-browser":"one-file-run-in-current-browser";
 if(near)return result("caution","high-observed-cost",
  "reduce-workload-next-run",evidence,true);
 if(report.requestedAudio==="preserve"&&out.audio==="aac-encode")
  return result("caution","audio-reencoded-not-bit-identical",
   "review-audio-output",evidence);
 return result("one-run-success","local-export-observed",
  report.sourceKind==="synthetic-generated"?
   "test-an-authorized-local-file":"repeat-on-physical-iphone",evidence);
}
const messages=Object.freeze({
 "invalid-report":"Résultat incomplet : aucun avis de compatibilité.",
 "page-not-visible":"Essai interrompu : garder Safari au premier plan.",
 "required-browser-capability-unavailable":"Codec ou contexte sécurisé indisponible : export non validé.",
 "cancelled":"Essai annulé : aucune réussite déduite.",
 "export-refused":"Export refusé : vérifier le diagnostic sans changer automatiquement la vidéo.",
 "source-limits-or-evidence-missing":"Limites source ou preuves insuffisantes.",
 "incomplete-output-audit":"Couleurs, audio, mémoire ou MP4 non vérifiables.",
 "pilot-resource-limit-exceeded":"Budget expérimental dépassé : export non généralisable.",
 "audio-not-preserved":"Conservation du son non démontrée : aucun succès déclaré.",
 "audio-consent-unknown":"Choix audio absent : aucun succès déclaré.",
 "audio-consent-mismatch":"Le choix audio et la sortie ne correspondent pas.",
 "high-observed-cost":"Coût élevé pour cet essai : réduire la charge du prochain test, sans retouche automatique.",
 "audio-reencoded-not-bit-identical":"Audio réencodé : écouter et vérifier ; aucune copie bit-à-bit promise.",
 "local-export-observed":"Export observé pour ce fichier seulement ; compatibilité Safari iPhone non certifiée."
});
function message(advice){
 return messages[advice?.reason]||messages["invalid-report"];
}
return Object.freeze({LIMITS,assess,message});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_DEVICE_ADVICE;
