"use strict";
(()=>{
 const $=id=>document.getElementById(id);
 const gate=window.NOVA_LOCAL_AV_GATE;
 const input=$("local-video"),start=$("start"),cancel=$("cancel"),
  status=$("status"),fileStatus=$("selected-file"),panel=$("playback-panel"),
  preview=$("output-preview"),save=$("save"),review=$("review-status"),
  visible=$("video-visible"),audible=$("audio-audible"),
  sync=$("sync-plausible"),reportPanel=$("report-panel"),
  reportText=$("report-json"),copy=$("copy"),copyStatus=$("copy-status");
 const MAX=gate.LIMIT_BYTES;
 let selected=null,ctl=null,out=null,url=null,phase="none",generation=0,
  loaded=false,running=false,latestReport=null;
 const messages={
  aac_track_not_verified:"La piste AAC du MP4 ne passe pas les contrôles audio. Aucun fichier n’est proposé.",
  source_color_not_eligible:"Profil couleur ou rendu SDR non vérifiable : NOVA refuse une conversion potentiellement infidèle.",
  memory_or_size_guard:"Limite de mémoire ou de taille atteinte. L’original reste intact.",
  source_timeline_not_eligible:"La cadence ou la chronologie des images ne peut pas être conservée fidèlement.",
  video_codec_not_available:"Le décodeur ou l’encodeur vidéo natif manque pour cette source.",
  final_mp4_not_verified:"Le MP4 final n’a pas passé les vérifications structurelles.",
  failed_during_source:"L’analyse du MP4 a échoué.",
  failed_during_audio:"La préparation audio n’a pas abouti.",
  failed_during_video:"Le traitement des images n’a pas abouti.",
  failed_during_complete:"Le contrôle final de l’export n’a pas abouti.",
  processing_failed:"Cet export expérimental n’a pas abouti.",
  cancelled:"Traitement arrêté. Rien n’a été enregistré."
 };
 function setStatus(s){status.textContent=s}
 function setReport(state,errorCode="none"){
  latestReport=gate.report(state,{out,phase,errorCode,manuallyObserved:{
   video_visible:visible.checked,audio_audible:audible.checked,
   sync_plausible:sync.checked
  }});
  reportText.value=JSON.stringify(latestReport,null,2)+"\n";
  reportPanel.hidden=false;
  copyStatus.textContent="";
 }
 function disableSave(){
  save.hidden=true;
  save.removeAttribute("href");
 }
 function clearOutput(){
  disableSave();
  if(preview){try{preview.pause()}catch{}preview.removeAttribute("src");try{preview.load()}catch{}}
  if(url){URL.revokeObjectURL(url);url=null}
  out=null;loaded=false;panel.hidden=true;
  for(const cb of [visible,audible,sync])cb.checked=false;
 }
 function reset(){
  generation++;
  if(ctl){ctl.abort();ctl=null}
  running=false;clearOutput();
  selected=null;phase="none";latestReport=null;
  reportPanel.hidden=true;
  input.disabled=false;start.disabled=true;cancel.hidden=true;
  setStatus("Choisis une vidéo pour préparer un MP4 local. Aucun export automatique.");
 }
 input.addEventListener("change",()=>{
  reset();
  const f=input.files?.[0];
  if(!f){fileStatus.textContent="Aucune vidéo sélectionnée.";return}
  if(!gate.validateFile(f)){
   fileStatus.textContent="Ce fichier dépasse 16 Mio ou son format n’est pas reconnu pour ce pilote.";
   setReport(gate.statuses.rejected,"memory_or_size_guard");
   return;
  }
  selected=f;fileStatus.textContent="Vidéo locale sélectionnée. Tu peux démarrer l’essai.";
  start.disabled=false;
 });
 cancel.addEventListener("click",()=>{if(ctl){ctl.abort();setStatus("Annulation en cours…")}});
 function metadataPlaybackReady(signal){
  return new Promise((resolve,reject)=>{
   if(signal?.aborted){reject(Error("cancelled"));return}
   let ended=false;
   const timer=setTimeout(()=>finish(false),16000);
   function finish(ok){
    if(ended)return;ended=true;clearTimeout(timer);
    preview.removeEventListener("loadedmetadata",onOk);
    preview.removeEventListener("error",onErr);
    signal?.removeEventListener("abort",onAbort);
    ok?resolve():reject(Error("preview"));
   }
   function onOk(){finish(Number.isFinite(preview.duration)&&preview.duration>0&&
     preview.videoWidth>0&&preview.videoHeight>0)}
   function onErr(){finish(false)}
   function onAbort(){finish(false)}
   preview.addEventListener("loadedmetadata",onOk);
   preview.addEventListener("error",onErr);
   signal?.addEventListener("abort",onAbort,{once:true});
   try{preview.load()}catch{finish(false)}
  });
 }
 function reviewReady(){
  disableSave();
  if(!out||!loaded||!url||!gate.validOutput(out))return;
  if(visible.checked&&audible.checked){
   save.href=url;save.hidden=false;save.download="NOVA_HD_test_image_son.mp4";
   review.textContent=sync.checked?
    "Image, son et synchronisation jugés satisfaisants par toi. Enregistrement local disponible.":
    "Image et son confirmés par toi. Synchronisation non confirmée ; enregistrement expérimental disponible.";
   setReport(gate.statuses.reviewed);
  }else{
   review.textContent="Lis le MP4 puis confirme l’image et le son pour débloquer l’enregistrement.";
   setReport(gate.statuses.assembled);
  }
 }
 for(const cb of [visible,audible,sync])cb.addEventListener("change",reviewReady);
 save.addEventListener("click",event=>{
  if(!url||save.hidden||!visible.checked||!audible.checked){event.preventDefault();return}
  review.textContent="Enregistrement demandé localement. Vérifie le fichier dans Fichiers ou Photos.";
 });
 window.addEventListener("pagehide",()=>{ctl?.abort();clearOutput()});
 document.addEventListener("visibilitychange",()=>{if(document.hidden&&running)ctl?.abort()});
 start.addEventListener("click",async()=>{
  if(!selected||running)return;
  if(!window.isSecureContext){
   setStatus("HTTPS sécurisé requis : export bloqué.");
   setReport(gate.statuses.failed,"processing_failed");
   return;
  }
  clearOutput();phase="source";const my=++generation;
  const file=selected;ctl=new AbortController();const signal=ctl.signal;
  running=true;start.disabled=true;input.disabled=true;cancel.hidden=false;
  reportPanel.hidden=true;
  setStatus("Analyse du MP4 et de ses limites de sécurité…");
  try{
   if(!window.NOVA_NATIVE_HD?.exporter||!window.NOVA_DEMUX?.analyser||
      !window.NOVA_AAC_NATIVE?.planifier||!window.NOVA_AAC_COPY?.planifier||
      !window.NOVA_HD_COLOR?.imagePourRendu||!window.Mp4Muxer?.Muxer)
     throw Error("video codec module unavailable");
   const result=await window.NOVA_NATIVE_HD.exporter({
    file,moteur:window.NOVA_ZONES,arbitre:window.NOVA_DECISION,
    signal,onProgress:progress=>{
     if(my!==generation||signal.aborted)return;
     if(["source","audio","video","complete"].includes(progress?.stage))
      phase=progress.stage;
     if(progress?.stage==="source")
      setStatus("NOVA vérifie la source et sa résolution HD sans réduction cachée…");
     if(progress?.stage==="audio")
      setStatus("Piste AAC non copiable : recours à l’encodage AAC-LC local…");
     if(progress?.stage==="video"){
      const n=Number.isInteger(progress.frame)?progress.frame:0;
      const total=Number.isInteger(progress.total)?progress.total:0;
      setStatus("Traitement HD en mémoire : "+n+" / "+total+" images. Son conservé.");
     }
     if(progress?.stage==="complete")
      setStatus("Contrôle final du MP4 et de la piste AAC…");
    }
   });
   if(my!==generation||signal.aborted)return;
   if(!gate.validOutput(result))throw Error("final MP4 not verified");
   out=result;
   url=URL.createObjectURL(out.blob);
   preview.src=url;preview.muted=false;preview.volume=1;
   setStatus("MP4 construit ; vérification de sa lecture dans Safari…");
   await metadataPlaybackReady(signal);
   if(my!==generation||signal.aborted)return;
   loaded=true;phase="complete";panel.hidden=false;
   setStatus("MP4 assemblé, "+out.outputFrames+" images et piste AAC "+
      (out.audioMode==="aac-native-encode"?"réencodée":"copiée")+
      ". Lis le résultat et contrôle le son avant de l’enregistrer.");
   setReport(gate.statuses.assembled);
  }catch(e){
   if(my!==generation)return;
   const cancelled=signal.aborted;
   const code=cancelled?"cancelled":gate.stageOf(e,phase);
   clearOutput();
   setStatus(cancelled?"Essai annulé. Aucun fichier enregistré.":
    (messages[code]||messages.processing_failed));
   setReport(cancelled?gate.statuses.cancelled:
      /final_mp4_not_verified/.test(code)?gate.statuses.playback:gate.statuses.failed,code);
  }finally{
   if(my===generation){
    ctl=null;running=false;input.disabled=false;cancel.hidden=true;
    start.disabled=!selected;
   }
  }
 });
 copy.addEventListener("click",async()=>{
  if(!latestReport)return;
  try{
   if(!navigator.clipboard?.writeText)throw Error("clipboard unavailable");
   await navigator.clipboard.writeText(JSON.stringify(latestReport,null,2)+"\n");
   copyStatus.textContent="Rapport copié. Il n’a pas été envoyé automatiquement.";
  }catch{
   reportText.focus();reportText.select();
   copyStatus.textContent="Copie automatique indisponible : sélectionne le texte puis utilise « Copier ».";
  }
 });
})();
