/* NOVA Export UI pilote — indépendant du studio historique.
 * Aucun export ne démarre automatiquement à l'import.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const panel=$("pilotVideo"),start=$("exportVideo"),silent=$("allowSilent"),
  download=$("downloadVideo"),status=$("exportStatus"),fileInput=$("file"),drop=$("drop"),approx=$("allowApproximate"),
  hevcPanel=$("hevcDiagnosticsPanel"),hevcText=$("hevcDiagnosticsText"),
  colorReport=$("novaHdFrameReport"),qualityReport=$("novaHdQualityReport");
if(!panel||!start||!silent||!download||!status||!fileInput)return;
let file=null,controller=null,blobUrl=null,generation=0,colorReportUrl=null,qualityReportUrl=null;
function clearQualityReport(){
 if(qualityReportUrl){URL.revokeObjectURL(qualityReportUrl);qualityReportUrl=null}
 if(qualityReport){qualityReport.hidden=true;qualityReport.removeAttribute("href")}
}
function clearColorReport(){
 if(colorReportUrl){URL.revokeObjectURL(colorReportUrl);colorReportUrl=null}
 if(colorReport){colorReport.hidden=true;colorReport.removeAttribute("href")}
}
function msg(s){status.textContent=s}
function clear(){
 generation++;
 if(controller){controller.abort();controller=null}
 if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null}
 download.hidden=true;download.removeAttribute("href");
 clearColorReport();clearQualityReport();globalThis.NOVA_HD_COLOR?.resetDiagnostic?.();
 if(hevcPanel)hevcPanel.hidden=true;
 if(hevcText)hevcText.textContent="";
 start.disabled=true;start.textContent="Exporter un MP4 restauré";panel.hidden=true;silent.checked=false;if(approx)approx.checked=false;
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
 msg("Pilote prêt. La vidéo doit durer 12 secondes ou moins. Audio conservé par défaut, sinon export refusé.");
}
fileInput.addEventListener("change",e=>choisir(e.target.files?.[0]));
if(drop)drop.addEventListener("drop",e=>{if(e.dataTransfer?.files?.[0])choisir(e.dataTransfer.files[0])});
start.addEventListener("click",async()=>{
 if(controller){controller.abort();start.disabled=true;msg("Annulation de l'export…");return}
 if(!file)return;
 const ctl=new AbortController(),thisGen=generation;
 controller=ctl;start.textContent="Annuler l'export";
 clearColorReport();clearQualityReport();globalThis.NOVA_HD_COLOR?.resetDiagnostic?.();
 download.hidden=true;
 msg("Vérification des codecs et du son…");
 try{
  // Director NOVA : une vidéo Full HD ou avec beaucoup d'images ne doit
  // jamais retomber silencieusement sur le pilote 640×360 / 15 i/s.
  // Tenter le chemin HD natif PTS + AAC; aucune réduction cachée.
  let parsed=null;
  try{parsed=await NOVA_DEMUX.analyser(file)}catch(_){}
  if(ctl.signal.aborted||generation!==thisGen)return;
  const useNativeHD=!!parsed&&/^(hvc1|hev1|avc1|avc3)\./.test(parsed.codec||"")&&
   (parsed.W*parsed.H>640*360||parsed.ns>90);
  if(useNativeHD){
   msg("NOVA sélectionne le traitement HD natif pour conserver la résolution et les images d'origine…");
   const hd=await NOVA_NATIVE_HD.exporter({
    file,moteur:NOVA_ZONES,arbitre:NOVA_DECISION,signal:ctl.signal,
    onProgress:step=>{
     if(ctl.signal.aborted||generation!==thisGen)return;
     if(step.stage==="source")msg("Traitement HD : "+step.width+" × "+step.height+
      ", "+step.frames+" images, environ "+step.fps+" i/s.");
     if(step.stage==="video")msg("Traitement HD : "+step.frame+" / "+step.total+
      " images ; piste audio en préparation.");
     if(step.stage==="audio")msg("Copie AAC impossible : essai d'encodage AAC-LC local autorisé par Safari…");
     if(step.stage==="complete")msg("Vérification finale du MP4 HD et de son audio…");
    }
   });
   if(ctl.signal.aborted||generation!==thisGen)return;
   if(blobUrl)URL.revokeObjectURL(blobUrl);
   blobUrl=URL.createObjectURL(hd.blob);
   download.href=blobUrl;
   download.download=(file.name||"video").replace(/\.[^.]+$/,"")+
    "_NOVA_HD_experimental.mp4";
   download.hidden=false;
   if(qualityReport&&hd.qualityReport){
    qualityReportUrl=URL.createObjectURL(new Blob([
     JSON.stringify(hd.qualityReport,null,2)+"\n"
    ],{type:"application/json"}));
    qualityReport.href=qualityReportUrl;
    qualityReport.download="NOVA_035_bilan_qualite_local.json";
    qualityReport.hidden=false;
   }
   msg("MP4 HD disponible : "+hd.originalWidth+" × "+hd.originalHeight+
    ", "+hd.outputFrames+" / "+hd.sourceFrames+" images, "+
    hd.sourceFps+" i/s d'origine ; "+(hd.audioMode==="aac-copy"?
     "AAC original conservé sans réencodage": "AAC-LC réencodé localement (contrôler la synchronisation)")+". "+
    hd.modifiedFrames+" images avec corrections locales de lumière. "+
    (hd.colorWarning?(" ATTENTION COULEURS : "+hd.colorWarning):
     " Profil couleur BT.709 du MP4 contrôlé ; fidélité à la source à comparer.")+
    (hd.qualityReport?(" Fin AAC / fin vidéo : "+
     (hd.qualityReport.audio.lastAudioPacketMinusVideoDurationMs>0?"+":"")+
     hd.qualityReport.audio.lastAudioPacketMinusVideoDurationMs+
     " ms (pas une preuve de synchronisation perceptuelle). "+
     "Bilan qualité local disponible ci-dessus."):"")+
    " Vérifiez image et son. Pas de reconstruction neuronale.");
   return;
  }
  const result=await NOVA_EXPORT.exporter({
   file,moteur:NOVA_ZONES,arbitre:NOVA_DECISION,
   allowSilent:silent.checked,allowApproximate:!!approx?.checked,signal:ctl.signal,
   onProgress:step=>{
    if(generation!==thisGen)return;
    if(step.stage==="budget")msg("Protection mémoire : "+step.estimatedMiB+" Mio estimés / "+step.limitMiB+" Mio de budget pilote…");
    if(step.stage==="source")msg(step.mode==="hevc-wasm"?
     "HEVC WASM local : "+step.frames+" images source BT.709 SDR analysées par PTS…":step.mode==="pts"?
     "Décodage vidéo selon les PTS MP4 natifs ("+step.frames+" images source)":
     "Mode compatibilité approximatif choisi : les images peuvent être dupliquées.");
    if(step.stage==="audio")msg("Vérification de la piste audio d’origine…");
    if(step.stage==="audioMode")msg(step.mode==="aac-copy"?"AAC original conservé sans réencodage (MP4 compatible) : audio inchangé…":step.mode==="aac-encode"?"Piste audio réencodée après validation de la source…":"Export sans son demandé explicitement…");
    if(step.stage==="video")msg("Encodage MP4 : "+Math.round(step.progress*100)+" % ("+step.frame+"/"+step.total+" images)");
    if(step.stage==="verification")msg("MP4 assemblé : contrôle de lisibilité et de durée sur cet appareil…");
    if(step.stage==="fini")msg("MP4 lisible selon les métadonnées locales. Vérifiez l'image et le son avant partage.");
   }
  });
  if(ctl.signal.aborted||generation!==thisGen)return;
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
  msg("MP4 prêt : "+result.plan.width+" × "+result.plan.height+", "+
    (result.audioMode==="aac-copy"?"audio AAC original copié":result.audioMode==="aac-encode"?"audio AAC réencodé":"sans son, selon votre choix")+
    ", "+(result.sourceMode==="hevc-wasm"?"HEVC WASM local à PTS source":result.sourceMode==="pts"?"PTS natifs":"recherche approximative") +
    ", "+(result.blob.size/1048576).toFixed(1)+" Mo. Métadonnées contrôlées : "+result.validation.width+" × "+result.validation.height+", "+result.validation.duration.toFixed(2)+" s."+ (result.trace?" Cadence : "+result.trace.repetitions+" répétitions et "+result.trace.sautsDeSource+" images source sautées lors de la conversion.":"")+" Vérifiez l’image et le son.");
 }catch(err){
  if(generation===thisGen){
   const diag=!ctl.signal.aborted?globalThis.NOVA_HD_COLOR?.diagnostic?.():null;
   if(diag&&colorReport){
    // Rapport techniques/énums uniquement. Aucune image, aucun son, nom,
    // coordonnées, identifiant ou échantillon source.
    colorReportUrl=URL.createObjectURL(new Blob([
     JSON.stringify(diag,null,2)+"\n"
    ],{type:"application/json"}));
    colorReport.href=colorReportUrl;
    colorReport.download="NOVA_034_diagnostic_trame_Safari.json";
    colorReport.hidden=false;
   }
   msg(ctl.signal.aborted?"Export annulé. Aucun fichier créé.":
    "Export refusé : "+(err?.message||"erreur inconnue")+
     (diag?" Télécharge le diagnostic couleur Safari ci-dessus pour identifier la condition exacte.":""));
  }
 }finally{
  if(controller===ctl){
   controller=null;start.disabled=false;start.textContent="Exporter un MP4 restauré";
  }
 }
});
})();
