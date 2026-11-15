/* NOVA Export UI pilote — indépendant du studio historique.
 * Aucun export ne démarre automatiquement à l'import.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const panel=$("pilotVideo"),start=$("exportVideo"),silent=$("allowSilent"),
  download=$("downloadVideo"),status=$("exportStatus"),fileInput=$("file"),drop=$("drop"),approx=$("allowApproximate"),
  hevcPanel=$("hevcDiagnosticsPanel"),hevcText=$("hevcDiagnosticsText");
if(!panel||!start||!silent||!download||!status||!fileInput)return;
let file=null,controller=null,blobUrl=null,generation=0;
function msg(s){status.textContent=s}
function clear(){
 generation++;
 if(controller){controller.abort();controller=null}
 if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null}
 download.hidden=true;download.removeAttribute("href");
 if(hevcPanel)hevcPanel.hidden=true;
 if(hevcText)hevcText.textContent="";
 start.disabled=true;start.textContent="Exporter un MP4 restauré";panel.hidden=true;silent.checked=false;if(approx)approx.checked=false;
}
function choisir(f){
 clear();file=null;
 if(!f||!f.type.startsWith("video/"))return;
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
 msg("Vérification des codecs et du son…");
 try{
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
    ". Mesures de laboratoire ; pas un benchmark Safari iPhone.";
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
