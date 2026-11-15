"use strict";
(()=>{
 const $=id=>document.getElementById(id);
 const input=$("local-video"),start=$("start"),cancel=$("cancel"),status=$("status"),
   area=$("result"),summary=$("summary"),json=$("json"),copy=$("copy"),feedback=$("copy-status");
 const LIMIT=16*1048576;
 let running=false,controller=null,last=null;
 const messages={
   local_source_aac_reencode_chunks_verified:"Le son de ce fichier a été décodé et réencodé localement en AAC-LC. Il reste à vérifier le MP4 final avec image et son.",
   source_audio_decode_unavailable:"Le navigateur ne peut pas décoder cette piste audio avec la méthode actuelle. L'original est intact.",
   audio_video_duration_incompatible:"Le début ou la durée de la piste audio ne correspond pas suffisamment à la durée vidéo. Aucun export n'est autorisé.",
   aac_encoder_unavailable:"L'encodage AAC-LC natif n'a pas pu être utilisé avec cette source.",
   source_outside_conservative_budget:"Source hors des limites de ce petit essai : maximum 12,2 s et 16 Mio.",
   missing_local_video:"Aucun fichier vidéo local disponible.",
   decoded_audio_not_usable:"Le son décodé n'est pas exploitable avec cette méthode.",
   encoded_audio_not_verified:"Les paquets AAC obtenus n'ont pas passé tous les contrôles.",
   local_audio_validation_failed:"Essai audio non concluant ; aucune vidéo n'a été modifiée.",
   source_video_metadata_unavailable:"Safari ne peut pas lire la durée de cette vidéo dans ce test.",
   cancelled:"Essai annulé ; original intact.",
   nova_native_audio_module_missing:"Le module audio expérimental n'est pas disponible.",
 };
 function report(x){
  last=JSON.stringify(x,null,2)+"\n";
  json.value=last;
  summary.textContent=messages[x.status]||"État inconnu, aucune validation d'export.";
  status.textContent="Diagnostic local terminé : "+x.status;
  feedback.textContent="";
  area.hidden=false;
 }
 function meta(file,signal){
  return new Promise((resolve,reject)=>{
   let url=null,done=false;
   const video=document.createElement("video");
   const timer=setTimeout(()=>finish(null),12000);
   function finish(value){
    if(done)return;
    done=true;clearTimeout(timer);
    video.onloadedmetadata=null;video.onerror=null;
    if(signal)signal.removeEventListener("abort",abort);
    video.removeAttribute("src");try{video.load()}catch{}
    if(url)URL.revokeObjectURL(url);
    if(value===null)reject(new Error("metadata unavailable"));else resolve(value);
   }
   function abort(){finish(null)}
   if(signal){if(signal.aborted){finish(null);return}signal.addEventListener("abort",abort,{once:true})}
   video.preload="metadata";video.muted=true;video.playsInline=true;
   video.onloadedmetadata=()=>{
     const seconds=video.duration;
     finish(Number.isFinite(seconds)&&seconds>0?seconds:null);
   };
   video.onerror=()=>finish(null);
   try{url=URL.createObjectURL(file);video.src=url;video.load()}catch{finish(null)}
  });
 }
 input.addEventListener("change",()=>{
  if(running)return;
  last=null;area.hidden=true;feedback.textContent="";
  const f=input.files?.[0];
  const good=!!f&&f.size>0&&f.size<=LIMIT&&
   (f.type.startsWith("video/")||/\.(mp4|mov|m4v)$/i.test(f.name||""));
  start.disabled=!good;
  status.textContent=!f?"Aucun fichier sélectionné.":
   !good?"Ce fichier dépasse 16 Mio ou n'est pas une vidéo reconnue.":
   "Vidéo sélectionnée localement. Appuie sur « Tester le son localement » pour commencer.";
 });
 cancel.addEventListener("click",()=>controller?.abort());
 start.addEventListener("click",async()=>{
  const file=input.files?.[0];
  if(!file||running)return;
  if(!window.isSecureContext){
   report({schema:"retoucheproai.nova.local-audio-rescue-check.v1",
      status:"local_audio_validation_failed",reason:"secure_context_required",
      source_media_uploaded:false,video_export_tested:false});
   return;
  }
  running=true;start.disabled=true;input.disabled=true;cancel.hidden=false;
  controller=new AbortController();
  area.hidden=true;status.textContent="Lecture de la durée locale, puis test de l'audio…";
  try{
   const durationSeconds=await meta(file,controller.signal);
   if(controller.signal.aborted)throw Error("cancelled");
   if(durationSeconds>12.2){
     report({schema:"retoucheproai.nova.local-audio-rescue-check.v1",
      status:"source_outside_conservative_budget",
      source_media_uploaded:false,original_file_modified:false,final_mp4_created:false,
      video_export_tested:false,report_shared_automatically:false});
     return;
   }
   status.textContent="Décodage local de l'audio et vérification de l'encodeur AAC…";
   const result=await window.NOVA_LOCAL_AUDIO_CHECK.check(file,{
      durationSeconds,signal:controller.signal,native:window.NOVA_AAC_NATIVE
   });
   report(result);
  }catch{
   report({schema:"retoucheproai.nova.local-audio-rescue-check.v1",
     status:controller.signal.aborted?"cancelled":"source_video_metadata_unavailable",
     source_media_uploaded:false,original_file_modified:false,
     final_mp4_created:false,video_export_tested:false,
     report_shared_automatically:false});
  }finally{
   running=false;controller=null;cancel.hidden=true;input.disabled=false;
   input.value="";start.disabled=true;
  }
 });
 copy.addEventListener("click",async()=>{
  if(last===null)return;
  try{
   if(typeof navigator.clipboard?.writeText!=="function")throw Error("clipboard");
   await navigator.clipboard.writeText(last);
   feedback.textContent="Rapport copié. Aucun envoi automatique.";
  }catch{
   json.focus();json.select();
   feedback.textContent="Copie automatique indisponible : sélectionne le texte, puis Copier.";
  }
 });
})();
