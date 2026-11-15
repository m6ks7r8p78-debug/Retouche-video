/* Test volontaire du chemin HEVC NATIF, distinct du banc HEVC WebAssembly.
 * Seule la mire FFmpeg same-origin peut être chargée ici.
 * Aucun média utilisateur; rapport JSON en liste blanche, export manuel.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const button=$("novaHdSyntheticRun"),status=$("novaHdSyntheticStatus"),
 reportLink=$("novaHdSyntheticJson"),videoLink=$("novaHdSyntheticMp4");
if(!button||!status||!reportLink||!videoLink)return;
const idle="Tester le moteur HEVC natif sans vidéo personnelle";
const phaseLabels=Object.freeze({
 "fixture":"la mire synthétique locale n'a pas pu être chargée",
 "source-contract":"le profil HEVC, la présentation ou les PTS n'ont pas été validés",
 "native-decoder":"le décodeur HEVC natif n'est pas confirmé par le navigateur",
 "native-encoder":"l'encodeur H.264 natif n'est pas confirmé par le navigateur",
 "source-aac":"la piste AAC source ne peut pas être conservée",
 "native-export":"le traitement ou le muxage natif ne s'est pas terminé",
 "output-aac":"la couverture AAC du MP4 exporté n'a pas été vérifiée"
});
// Liste blanche de diagnostics locaux : pas de nom de média, PTS, pixels,
// message d'exception JavaScript, pile, empreinte ni identifiant d'appareil.
const checkpoints=Object.freeze({
 "native-start":"démarrage du traitement",
 "native-source":"analyse de la source",
 "native-decoder-config":"configuration du décodeur HEVC",
 "native-encoder-config":"configuration de l'encodeur H.264",
 "native-aac-check":"vérification AAC",
 "native-muxer":"préparation du MP4",
 "native-codec-start":"ouverture des codecs natifs",
 "native-video-feed":"alimentation du décodeur en images HEVC",
 "native-decoder-submit":"soumission d’un échantillon au décodeur HEVC",
 "native-decoder-submitted":"échantillons transmis au décodeur HEVC",
 "native-decoder-output":"restitution des images décodées",
 "native-decoder-wait-first":"attente de la première image chronologique",
 "native-decoder-buffer-limit":"fenêtre de réordonnancement trop grande pour la mémoire",
 "native-decoder-error":"erreur asynchrone signalée par le décodeur HEVC",
 "native-decoder-drain":"vidage des images en attente du décodeur",
 "native-image-process":"restauration et conversion des images",
 "native-image-encode":"encodage H.264 des images",
 "native-encoder-flush":"finalisation des images encodées",
 "native-aac-copy":"copie des paquets AAC",
 "native-aac-audit":"contrôle de la chronologie AAC",
 "native-mux-finalize":"finalisation du conteneur MP4",
 "native-output-index":"vérification des images du MP4 final",
 "native-output-color":"vérification de la couleur de sortie"
});
const errorClasses=Object.freeze(["Error","TypeError","RangeError","NotSupportedError",
 "EncodingError","DataError","InvalidStateError","OperationError",
 "QuotaExceededError","AbortError","TimeoutError"]);
function erreurClasse(e){
 return errorClasses.includes(e?.name)?e.name:"unknown";
}
let sequence=0,controller=null,objectURLs=[];
function resetLinks(){
 for(const url of objectURLs)URL.revokeObjectURL(url);
 objectURLs=[];
 for(const link of [reportLink,videoLink]){
  link.hidden=true;link.removeAttribute("href");
 }
}
function attach(blob,link,filename){
 const url=URL.createObjectURL(blob);
 objectURLs.push(url);link.href=url;link.download=filename;link.hidden=false;
}
function count(n){return Number.isSafeInteger(n)&&n>=0?n:null}
function blankReport(){
 return {
  schema:"retoucheproai.nova.native-hevc-smoke.v1",version:1,
  sourceKind:"bundled-ffmpeg-synthetic-hevc-aac",
  result:"failed",failedAt:null,errorCode:null,
  checkpoint:null,errorClass:null,framesStarted:0,processedFrames:0,
  decoderChunksSubmitted:0,decoderFramesReceived:0,
  decoderBufferPeak:0,firstPresentationFrameReceived:false,
  source:null,output:null,decodedByNative:false,encodedByNative:false,
  preservedAac:false,
  privacy:{userMediaRead:false,externalUpload:false,filenameInReport:false,
   mediaInReport:false,automaticDownload:false,automaticSharing:false},
  proof:{browserExecution:true,physicalIphoneCertified:false,
   hevcSourceRealUserVideo:false,perceptualQualityCertified:false},
  limitation:"Test local sur mire synthétique : ni certification des vidéos réelles, ni preuve de décodage HEVC Safari physique sans observation utilisateur."
 };
}
function cancel(){
 sequence++;controller?.abort();controller=null;resetLinks();
 button.textContent=idle;button.disabled=false;
}
window.addEventListener("pagehide",()=>controller?.abort());
document.addEventListener("visibilitychange",()=>{
 if(document.hidden)controller?.abort();
});
window.addEventListener("nova:source-selected",()=>{
 cancel();
 status.textContent="Test HEVC natif synthétique disponible indépendamment de la vidéo sélectionnée.";
});
button.addEventListener("click",async()=>{
 if(controller){
  controller.abort();status.textContent="Annulation du test HEVC natif demandée.";
  return;
 }
 resetLinks();
 const seq=++sequence,ctrl=new AbortController(),signal=ctrl.signal;
 controller=ctrl;button.textContent="Annuler le test HEVC natif";
 status.textContent="Lecture de la mire HEVC/AAC fournie avec le laboratoire…";
 const report=blankReport();
 let phase="fixture";
 try{
  const local=new URL("./nova-test-synthetic.mov",document.baseURI);
  if(local.origin!==location.origin)throw Error("fixture-not-same-origin");
  const res=await fetch(local.href,{signal,cache:"no-store"});
  if(!res.ok)throw Error("fixture-http-unavailable");
  const bytes=await res.blob();
  if(bytes.size<1000||bytes.size>100000)throw Error("fixture-size-invalid");
  const file=new File([bytes],"nova-synthetic-hevc-aac.mov",{type:"video/quicktime"});
  if(signal.aborted||seq!==sequence)return;
  phase="source-contract";
  const info=await NOVA_DEMUX.analyser(file);
  if(!/^(hvc1|hev1)\./.test(info?.codec||""))throw Error("expected-synthetic-hevc");
  const p=NOVA_NATIVE_HD.analyse(info,file.size);
  report.source={codec:"hevc",width:count(p.width),height:count(p.height),
   frames:count(p.sourceFrames),durationMs:count(Math.round(p.durationSeconds*1000)),
   bytes:count(file.size)};
  if(signal.aborted||seq!==sequence)return;
  phase="native-decoder";
  status.textContent="Vérification du décodeur HEVC natif WebCodecs…";
  await NOVA_NATIVE_HD.configDecoder(info);
  if(signal.aborted||seq!==sequence)return;
  phase="native-encoder";
  status.textContent="Vérification de l'encodeur H.264 natif…";
  await NOVA_NATIVE_HD.configEncoder(p);
  if(signal.aborted||seq!==sequence)return;
  phase="source-aac";
  const a=await NOVA_AAC_COPY.planifier(file,{durationSeconds:p.durationSeconds,signal});
  if(a?.mode!=="aac-copy"||!a.packets?.length)throw Error("source-aac-unavailable");
  if(signal.aborted||seq!==sequence)return;
  phase="native-export";
  report.checkpoint="native-start";
  status.textContent="Décodage HEVC natif, traitement des images et copie AAC locale…";
  const out=await NOVA_NATIVE_HD.exporter({
   file,moteur:NOVA_ZONES,arbitre:NOVA_DECISION,signal,
   onProgress:step=>{
    if(seq!==sequence||signal.aborted)return;
    if(Object.prototype.hasOwnProperty.call(checkpoints,step?.stage))
     report.checkpoint=step.stage;
    if(step?.stage==="native-decoder-submitted"&&
       Number.isSafeInteger(step.submitted)&&step.submitted>=1&&
       step.submitted<=report.source.frames)
     report.decoderChunksSubmitted=Math.max(report.decoderChunksSubmitted,step.submitted);
    if((step?.stage==="native-decoder-output"||
        step?.stage==="native-decoder-wait-first"||
        step?.stage==="native-decoder-buffer-limit")&&
       Number.isSafeInteger(step.buffered)&&step.buffered>=0&&
       step.buffered<=24)
     report.decoderBufferPeak=Math.max(report.decoderBufferPeak,step.buffered);
    if(step?.stage==="native-decoder-output"&&
       step.firstPresentationReceived===true)
     report.firstPresentationFrameReceived=true;
    if(step?.stage==="native-decoder-output"&&
       Number.isSafeInteger(step.received)&&step.received>=1&&
       step.received<=report.source.frames)
     report.decoderFramesReceived=Math.max(report.decoderFramesReceived,step.received);
    if((step?.stage==="native-image-process"||step?.stage==="native-image-encode")&&
       Number.isSafeInteger(step.frame)&&step.frame>=1&&
       step.frame<=report.source.frames)
     report.framesStarted=Math.max(report.framesStarted,step.frame);
    if(step?.stage==="video"&&Number.isSafeInteger(step.frame)&&
       step.frame>=1&&step.frame<=report.source.frames){
     report.processedFrames=Math.max(report.processedFrames,step.frame);
     status.textContent="Traitement HEVC natif : "+step.frame+" / "+step.total+" images.";
    }
   }
  });
  if(signal.aborted||seq!==sequence)return;
  if(!out?.blob||out.audioMode!=="aac-copy"||out.sourceFrames!==out.outputFrames||
     out.outputFrames!==p.sourceFrames||out.originalWidth!==p.width||
     out.originalHeight!==p.height)throw Error("output-not-verified");
  phase="output-aac";
  status.textContent="Contrôle indépendant de la piste AAC dans le MP4 généré…";
  const verified=await NOVA_AAC_COPY.planifier(out.blob,{
   durationSeconds:p.durationSeconds,signal
  });
  if(verified?.mode!=="aac-copy"||!verified.packets?.length)
   throw Error("output-aac-not-verified");
  if(signal.aborted||seq!==sequence)return;
  report.result="success";
  report.decodedByNative=true;report.encodedByNative=true;
  report.preservedAac=true;
  report.output={codec:"h264",width:count(out.originalWidth),
   height:count(out.originalHeight),frames:count(out.outputFrames),
   bytes:count(out.blob.size),audio:"aac-copy",
   durationMs:count(Math.round(out.durationSeconds*1000)),
   aacPackets:count(verified.packets.length)};
  attach(out.blob,videoLink,"NOVA_HEVC_natif_test_synthetique.mp4");
  status.textContent="Mire synthétique traitée par HEVC natif : "+
   out.outputFrames+" images, MP4 H.264 et AAC vérifiés. "+
   "Écoute le son et vérifie l'image; ce test ne valide pas tes vidéos personnelles.";
 }catch(_error){
  if(seq!==sequence)return;
  report.result=signal.aborted?"cancelled":"failed";
  if(!signal.aborted){
   report.failedAt=phase;
   report.errorCode=phase+"-failed";
   report.errorClass=erreurClasse(_error);
   const checkpoint=phase==="native-export"&&report.checkpoint&&
    Object.prototype.hasOwnProperty.call(checkpoints,report.checkpoint)?
    "interruption lors de : "+checkpoints[report.checkpoint]:
    (phaseLabels[phase]||"étape non vérifiée");
   status.textContent="Essai natif non abouti : "+checkpoint+
    ". "+report.decoderChunksSubmitted+" échantillon(s) HEVC transmis, "+
    report.decoderFramesReceived+" image(s) décodée(s), "+
    (report.firstPresentationFrameReceived?"première image reçue, ":"première image manquante, ")+
    report.processedFrames+" image(s) traitée(s). "+
    "Aucun MP4 n'est présenté comme réussi. Rapport JSON local disponible.";
  }else status.textContent="Test annulé; aucun MP4 incomplet enregistré.";
 }finally{
  if(controller===ctrl){
   controller=null;button.textContent=idle;
   if(seq===sequence&&!signal.aborted){
    // Ne sérialiser QUE l'objet reconstruit depuis les compteurs et les constantes.
    const json=JSON.stringify(report,null,2)+"\n";
    attach(new Blob([json],{type:"application/json"}),reportLink,
     "NOVA_test_HEVC_natif_synthetique.json");
   }
  }
 }
});
})();
