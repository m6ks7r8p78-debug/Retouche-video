/* NOVA Export UI pilote — indépendant du studio historique.
 * Aucun export ne démarre automatiquement à l'import.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const panel=$("pilotVideo"),start=$("exportVideo"),silent=$("allowSilent"),
  download=$("downloadVideo"),status=$("exportStatus"),fileInput=$("file"),drop=$("drop"),approx=$("allowApproximate"),
  hevcPanel=$("hevcDiagnosticsPanel"),hevcText=$("hevcDiagnosticsText"),
  proofRun=$("novaOutputProofRun"),proofSave=$("novaOutputProofSave"),
  proofStatus=$("novaOutputProofStatus");
if(!panel||!start||!silent||!download||!status||!fileInput)return;
let file=null,controller=null,blobUrl=null,generation=0;
let proofBlob=null,proofClaim=null,proofUrl=null;
function clearProof(){
 if(proofUrl){URL.revokeObjectURL(proofUrl);proofUrl=null}
 proofBlob=null;proofClaim=null;
 if(proofRun){proofRun.hidden=true;proofRun.disabled=false}
 if(proofSave){proofSave.hidden=true;proofSave.removeAttribute("href")}
 if(proofStatus)proofStatus.textContent="";
}
function prepareProof(blob,result){
 clearProof();
 if(!(blob instanceof Blob)||!result||!proofRun)return;
 proofBlob=blob;proofClaim={
  originalWidth:result.originalWidth,originalHeight:result.originalHeight,
  sourceFrames:result.sourceFrames,audioMode:result.audioMode
 };
 proofRun.hidden=false;
 if(proofStatus)proofStatus.textContent="Le MP4 est prêt. Vérification facultative du fichier avant copie ou partage.";
}
proofRun?.addEventListener("click",async()=>{
 if(!proofBlob||!proofClaim||!globalThis.NOVA_OUTPUT_IDENTITY)return;
 const current=proofBlob,gen=generation;
 proofRun.disabled=true;
 if(proofStatus)proofStatus.textContent="Lecture locale et calcul de l’empreinte SHA-256 du MP4 exporté…";
 try{
  const evidence=await NOVA_OUTPUT_IDENTITY.inspect(current,proofClaim);
  if(gen!==generation||proofBlob!==current)return;
  const json=NOVA_OUTPUT_IDENTITY.serialiser(evidence);
  if(proofUrl)URL.revokeObjectURL(proofUrl);
  proofUrl=URL.createObjectURL(new Blob([json],{type:"application/json"}));
  if(proofSave){
   proofSave.href=proofUrl;proofSave.download="NOVA_preuve_integrite_MP4_local.json";
   proofSave.hidden=false;
  }
  if(proofStatus)proofStatus.textContent=evidence.matchesClaim?
    "MP4 contrôlé AVANT partage : dimensions et nombre d'images conformes. Enregistre le rapport JSON. Son empreinte identifie ce MP4 ; partage-la seulement si tu le souhaites.":
    "ALERTE : dimensions ou nombre d'images non conformes à l'annonce NOVA. Conserve l'original et le rapport.";
 }catch(e){
  if(gen===generation&&proofBlob===current&&proofStatus)
   proofStatus.textContent="Preuve non disponible : "+(e?.message||"échec du contrôle")+
    ". Le MP4 exporté reste intact.";
 }finally{
  if(gen===generation&&proofBlob===current)proofRun.disabled=false;
 }
});
function msg(s){status.textContent=s}
function clear(){
 generation++;
 clearProof();
 if(controller){controller.abort();controller=null}
 if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null}
 download.hidden=true;download.removeAttribute("href");
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
 download.hidden=true;
 clearProof();
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
   prepareProof(hd.blob,hd);
   msg("MP4 HD disponible : "+hd.originalWidth+" × "+hd.originalHeight+
    ", "+hd.outputFrames+" / "+hd.sourceFrames+" images, "+
    hd.sourceFps+" i/s d'origine ; "+(hd.audioMode==="aac-copy"?
     "AAC original conservé sans réencodage": "AAC-LC réencodé localement (contrôler la synchronisation)")+". "+
    hd.modifiedFrames+" images avec corrections locales de lumière. "+
    (hd.colorWarning?(" ATTENTION COULEURS : "+hd.colorWarning):" Profil BT.709 du MP4 contrôlé ; fidélité à la source à vérifier.")+
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
  if(generation===thisGen)msg(ctl.signal.aborted?"Export annulé. Aucun fichier créé.":"Export refusé : "+(err?.message||"erreur inconnue"));
 }finally{
  if(controller===ctl){
   controller=null;start.disabled=false;start.textContent="Exporter un MP4 restauré";
  }
 }
});
})();
