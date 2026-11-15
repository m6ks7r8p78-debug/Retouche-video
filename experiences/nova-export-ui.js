/* NOVA Export UI pilote — indépendant du studio historique.
 * Aucun export ne démarre automatiquement à l'import.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const panel=$("pilotVideo"),start=$("exportVideo"),silent=$("allowSilent"),
  download=$("downloadVideo"),status=$("exportStatus"),fileInput=$("file"),drop=$("drop"),approx=$("allowApproximate"),
  hevcPanel=$("hevcDiagnosticsPanel"),hevcText=$("hevcDiagnosticsText"),
  reportPanel=$("novaLocalExportReportPanel"),
  reportLink=$("novaLocalExportReportJson"),
  opfs=$("writeOpfs"),hd720=$("outputHd720");
if(!panel||!start||!silent||!download||!status||!fileInput)return;
let file=null,controller=null,blobUrl=null,generation=0,releaseStored=null,
 reportUrl=null;
async function originEstimate(){
 try{
  if(typeof navigator.storage?.estimate!=="function")return null;
  const e=await navigator.storage.estimate();
  return {usage:e.usage,quota:e.quota};
 }catch{return null}
}
function clearReport(){
 if(reportUrl){URL.revokeObjectURL(reportUrl);reportUrl=null}
 if(reportPanel){reportPanel.hidden=true;reportPanel.open=false}
 if(reportLink){reportLink.hidden=true;reportLink.removeAttribute("href")}
}
function setReport(report){
 if(!reportPanel||!reportLink||
    typeof globalThis.NOVA_LOCAL_EXPORT_REPORT?.serialize!=="function")return;
 const json=NOVA_LOCAL_EXPORT_REPORT.serialize(report);
 clearReport();
 reportUrl=URL.createObjectURL(new Blob([json],{type:"application/json"}));
 reportLink.href=reportUrl;
 reportLink.download="NOVA_diagnostic_ressources_local.json";
 reportLink.hidden=false;reportPanel.hidden=false;
}
function releaseTemp(){
 if(!releaseStored)return;
 const dispose=releaseStored;releaseStored=null;
 Promise.resolve().then(()=>dispose()).catch(()=>{});
}
window.addEventListener("pagehide",releaseTemp);
function msg(s){status.textContent=s}
function clear(){
 generation++;
 if(controller){controller.abort();controller=null}
 if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null}
 releaseTemp();
 clearReport();
 download.hidden=true;download.removeAttribute("href");
 if(hevcPanel)hevcPanel.hidden=true;
 if(hevcText)hevcText.textContent="";
 start.disabled=true;start.textContent="Exporter un MP4 restauré";panel.hidden=true;silent.checked=false;if(approx)approx.checked=false;
 if(opfs){opfs.checked=false;opfs.disabled=!globalThis.NOVA_OPFS_STREAM?.supported();}
 if(hd720){hd720.checked=false;hd720.disabled=!globalThis.NOVA_OPFS_STREAM?.supported();}
}
function choisir(f){
 clear();file=null;
 // Message local de sélection pour les bancs de validation opt-in.
 // La File n'est ni enregistrée, ni transmise sur le réseau.
 window.dispatchEvent(new CustomEvent("nova:source-selected",{detail:{file:f||null}}));
 if(!f||!NOVA_IPHONE_REPORT.videoFile(f))return;
 file=f;panel.hidden=false;
 if(f.size>60*1024*1024){msg("Pilote limité à 60 Mo. Utilisez la version principale.");return}
 if(typeof VideoEncoder==="undefined"||typeof Mp4Muxer==="undefined"){
  msg("Cet appareil ne prend pas en charge l'encodeur vidéo nécessaire.");return;
 }
 start.disabled=false;
 msg("Pilote prêt. HEVC : 12 s ; H.264 SDR vérifié : 24 s en mémoire, jusqu'à 48 s avec OPFS choisi explicitement. Audio conservé par défaut, sinon refus.");
}
fileInput.addEventListener("change",e=>choisir(e.target.files?.[0]));
if(drop)drop.addEventListener("drop",e=>{if(e.dataTransfer?.files?.[0])choisir(e.dataTransfer.files[0])});
start.addEventListener("click",async()=>{
 if(controller){controller.abort();start.disabled=true;msg("Annulation de l'export…");return}
 if(!file)return;
 const ctl=new AbortController(),thisGen=generation;
 let lastStage="unverified";
 controller=ctl;start.textContent="Annuler l'export";
 if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null}
 releaseTemp();
 clearReport();
 download.hidden=true;download.removeAttribute("href");
 msg("Vérification des codecs et du son…");
 try{
  const result=await NOVA_EXPORT.exporter({
   file,moteur:NOVA_ZONES,arbitre:NOVA_DECISION,
   allowSilent:silent.checked,allowApproximate:!!approx?.checked,signal:ctl.signal,
   storageMode:opfs?.checked?"opfs":"memory",
   outputProfile:hd720?.checked?"h264-hd720-opfs-6s":"standard",
   onProgress:step=>{
    if(generation!==thisGen)return;
    lastStage=step.stage;
    if(step.stage==="budget")msg("Protection mémoire : "+step.estimatedMiB+" Mio estimés / "+step.limitMiB+" Mio de budget pilote…");
    if(step.stage==="storage")msg("Écriture MP4 progressive dans le stockage privé du navigateur (aucun envoi réseau)…");
    if(step.stage==="source")msg(step.mode==="hevc-wasm"?
     "HEVC WASM local : "+step.frames+" images source BT.709 SDR analysées par PTS…":step.mode==="pts"?
     "Décodage vidéo selon les PTS MP4 natifs ("+step.frames+" images source)":
     "Mode compatibilité approximatif choisi : les images peuvent être dupliquées.");
    if(step.stage==="window"){
     msg("Traitement local de la fenêtre "+step.index+
      "/"+step.total+" ("+(step.startMs/1000).toFixed(1)+"–"+
      (step.endMs/1000).toFixed(1)+" s), piste audio continue…");
     // Événement local ne contenant NI fichier NI pixels NI nom privé.
     // Les lecteurs d'écran reçoivent déjà le statut textuel.
     document.dispatchEvent(new CustomEvent("nova:window-progress",{
      detail:{index:step.index,total:step.total,
       startMs:step.startMs,endMs:step.endMs}
     }));
    }
    if(step.stage==="audio")msg("Vérification de la piste audio d’origine…");
    if(step.stage==="audioMode")msg(step.mode==="aac-copy"?"AAC original conservé sans réencodage (MP4 compatible) : audio inchangé…":step.mode==="aac-encode"?"Piste audio réencodée après validation de la source…":"Export sans son demandé explicitement…");
    if(step.stage==="video")msg("Encodage MP4 : "+Math.round(step.progress*100)+" % ("+step.frame+"/"+step.total+" images)");
    if(step.stage==="verification")msg("MP4 assemblé : contrôle de lisibilité et de durée sur cet appareil…");
    if(step.stage==="fini")msg("MP4 lisible selon les métadonnées locales. Vérifiez l'image et le son avant partage.");
   }
  });
  if(ctl.signal.aborted||generation!==thisGen){
   await result.release?.();return;
  }
  releaseStored=result.release??null;
  if(blobUrl)URL.revokeObjectURL(blobUrl);
  blobUrl=URL.createObjectURL(result.blob);
  if(hevcPanel&&hevcText&&result.hevcDiagnostics){
   const m=result.hevcDiagnostics;
   const mib=n=>Number.isSafeInteger(n)?(n/1048576).toFixed(1)+" Mio":"non disponible";
   hevcText.textContent="Capacité maximale du tas WebAssembly : "+
    mib(m.wasmHeapPeakBytes)+" (pas la RAM totale). Tas JavaScript facultatif : "+
    mib(m.jsHeapPeakBytes)+". Durée du pipeline HEVC : "+
    (Number.isFinite(m.pipelineElapsedMs)?Math.round(m.pipelineElapsedMs)+" ms":"non mesurée")+
    ". Images source traitées : "+m.frames+
    ". Paramètres SPS/VPS/PPS en bande validés : "+m.inbandParameterSets+
    ". Images extraites dans un même lot : "+m.peakDrainedFrames+
    (m.pipelineAudit?(
     ". Export audiovisuel complet : "+
     Math.round(m.pipelineAudit.elapsedMs)+" ms dont "+
     "précontrôle "+Math.round(m.pipelineAudit.stagesMs.preflight||0)+" ms, "+
     "audio "+Math.round(m.pipelineAudit.stagesMs.audio||0)+" ms, "+
     "vidéo/restauration "+Math.round(m.pipelineAudit.stagesMs.video||0)+" ms, "+
     "vidage H.264 "+Math.round(m.pipelineAudit.stagesMs["video-flush"]||0)+" ms, "+
     "copie AAC "+Math.round(m.pipelineAudit.stagesMs["aac-copy"]||0)+" ms, "+
     "muxage "+Math.round(m.pipelineAudit.stagesMs.mux||0)+" ms, "+
     "vérification "+Math.round(m.pipelineAudit.stagesMs.verify||0)+" ms. "+
     "Payload H.264 : "+m.pipelineAudit.encodedVideoBytes+
     " octets ; AAC : "+m.pipelineAudit.encodedAudioBytes+
     " octets ; MP4 : "+m.pipelineAudit.finalMp4Bytes+" octets ; "+
     "queue encodage max "+m.pipelineAudit.peakVideoEncodeQueue+"."
    ):"")+
    " Mesures de laboratoire ; mémoire WASM/JS et octets de fichiers "+
    "ne représentent pas la RAM totale ni le coût CPU/GPU d'un iPhone.";
   hevcPanel.hidden=false;
  }
  download.href=blobUrl;
  download.download=(file.name||"video").replace(/\.[^.]+$/,"")+"_NOVA_pilote.mp4";
  download.hidden=false;
  try{
   const report=NOVA_LOCAL_EXPORT_REPORT.success(result,{
    storageEstimate:await originEstimate()
   });
   if(generation===thisGen)setReport(report);
  }catch{}
  msg("MP4 prêt"+(result.storageMode==="opfs-local-stream"?
    " (écrit progressivement en stockage privé local)":"")+
    (result.windowPlan?
    " ("+result.windowPlan.count+" fenêtres vidéo, une piste AAC continue)":"")+
    " : "+result.plan.width+" × "+result.plan.height+", "+
    (result.audioMode==="aac-copy"?"audio AAC original copié":result.audioMode==="aac-encode"?"audio AAC réencodé":"sans son, selon votre choix")+
    ", "+(result.sourceMode==="hevc-wasm"?"HEVC WASM local à PTS source":result.sourceMode==="pts"?"PTS natifs":"recherche approximative") +
    ", "+(result.blob.size/1048576).toFixed(1)+" Mo. Métadonnées contrôlées : "+result.validation.width+" × "+result.validation.height+", "+result.validation.duration.toFixed(2)+" s."+ (result.trace?" Cadence : "+result.trace.repetitions+" répétitions et "+result.trace.sautsDeSource+" images source sautées lors de la conversion.":"")+" Vérifiez l’image et le son.");
 }catch(err){
  if(generation===thisGen){
   msg(ctl.signal.aborted?"Export annulé. Aucun fichier créé.":"Export refusé : "+(err?.message||"erreur inconnue"));
   try{
    setReport(NOVA_LOCAL_EXPORT_REPORT.failure({
     storageMode:opfs?.checked?"opfs":"memory",
     stage:lastStage,storageEstimate:await originEstimate()
    }));
   }catch{}
  }
 }finally{
  if(controller===ctl){
   controller=null;start.disabled=false;start.textContent="Exporter un MP4 restauré";
  }
 }
});
})();
