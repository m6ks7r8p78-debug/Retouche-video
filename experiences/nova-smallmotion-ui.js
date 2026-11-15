/* NOVA × SmallMotion opt-in UI. Local browser decode, two reduced RGBA frames,
 * advisory JSON only. Does not modify image, timeline, source, or export plan.
 * No network calls / no persistence; dedicated synthetic & user-file test paths.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const start=$("novaMotionRun"),syntheticButton=$("novaMotionSynthetic"),
 status=$("novaMotionStatus"),report=$("novaMotionJson");
if(!start||!status||!report||!syntheticButton)return;
let selected=null,syntheticSource=false,controller=null,loading=null,version=0,url=null;
function clear(){
 version++;
 controller?.abort();controller=null;
 loading?.abort();loading=null;
 selected=null;syntheticSource=false;start.disabled=true;start.textContent="Analyser 2 images sans modifier";
 if(url){URL.revokeObjectURL(url);url=null}
 report.hidden=true;report.removeAttribute("href");
 status.textContent="Importez une courte vidéo compatible pour obtenir un diagnostic local.";
}
function updateFile(f,synthetic=false){
 clear();
 if(!f||!NOVA_IPHONE_REPORT.videoFile(f))return;
 if(!Number.isSafeInteger(f.size)||f.size<1||f.size>60*1048576){
  status.textContent="Pilote de mouvement limité aux fichiers vidéo de 60 Mio maximum.";
  return;
 }
 selected=f;syntheticSource=synthetic===true;start.disabled=false;
 status.textContent="Prêt. Aucune analyse avant votre appui, aucun envoi ou export automatique.";
}
window.addEventListener("nova:source-selected",e=>updateFile(e.detail?.file));
syntheticButton.addEventListener("click",async()=>{
 clear();const token=version,ctrl=new AbortController();loading=ctrl;
 syntheticButton.disabled=true;
 status.textContent="Chargement de la mire de mouvement H.264 synthétique depuis ce même site…";
 try{
  const response=await fetch("./nova-smallmotion-synthetic.mp4",{
   signal:ctrl.signal,cache:"no-store",mode:"same-origin"
  });
  if(!response.ok)throw Error("Mire de test absente");
  const blob=await response.blob();
  if(ctrl.signal.aborted||token!==version)return;
  if(blob.size<1000||blob.size>250000)
   throw Error("Fichier synthétique non conforme");
  const file=new File([blob],"NOVA_mire_synthetique_H264.mp4",{type:"video/mp4"});
  updateFile(file,true);
  status.textContent="Mire synthétique prête : lancement explicite du diagnostic local…";
  start.click();
 }catch{
  if(!ctrl.signal.aborted&&token===version)
   status.textContent="Mire de test indisponible : aucun fichier personnel demandé, aucun envoi.";
 }finally{
  if(loading===ctrl)loading=null;
  syntheticButton.disabled=false;
 }
});
window.addEventListener("pagehide",()=>controller?.abort());
document.addEventListener("visibilitychange",()=>{if(document.hidden)controller?.abort()});
function waitFor(video,event,signal,ms=12000){
 return new Promise((resolve,reject)=>{
  let timer;
  const clean=()=>{clearTimeout(timer);video.removeEventListener(event,ok);
   video.removeEventListener("error",fail);signal?.removeEventListener("abort",abort)};
  const ok=()=>{clean();resolve()};
  const fail=()=>{clean();reject(Error("Décodage navigateur indisponible"))};
  const abort=()=>{clean();reject(Error("Annulé"))};
  if(signal?.aborted)return reject(Error("Annulé"));
  video.addEventListener(event,ok,{once:true});
  video.addEventListener("error",fail,{once:true});
  signal?.addEventListener("abort",abort,{once:true});
  timer=setTimeout(()=>{clean();reject(Error("Délai de lecture dépassé"))},ms);
 });
}
function scaledSize(w,h){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<64||h<64||w>1920||h>1920)
  throw Error("Dimensions source hors budget SmallMotion");
 const factor=Math.min(1,240/Math.max(w,h));
 const width=Math.round(w*factor),height=Math.round(h*factor);
 if(width<64||height<64)throw Error("Image trop étroite pour le banc de mouvement");
 return {width,height};
}
function pixels(video,canvas,w,h){
 const ctx=canvas.getContext("2d",{willReadFrequently:true});
 if(!ctx)throw Error("Canvas 2D indisponible");
 ctx.clearRect(0,0,w,h);ctx.drawImage(video,0,0,w,h);
 return ctx.getImageData(0,0,w,h);
}
async function sample(file,signal){
 const objectURL=URL.createObjectURL(file);
 const video=document.createElement("video");
 video.muted=true;video.playsInline=true;video.preload="auto";
 video.disablePictureInPicture=true;
 try{
  video.src=objectURL;video.load();
  if(video.readyState<2)await waitFor(video,"loadeddata",signal);
  const duration=video.duration;
  if(!Number.isFinite(duration)||duration<.3||duration>12)
   throw Error("Vidéo pilote : durée entre 0,3 et 12 secondes");
  const d=scaledSize(video.videoWidth,video.videoHeight);
  const canvas=document.createElement("canvas");
  canvas.width=d.width;canvas.height=d.height;
  const t0=0,t1=Math.min(.1167,duration*.5);
  const a=pixels(video,canvas,d.width,d.height);
  if(signal?.aborted)throw Error("Annulé");
  const seeking=waitFor(video,"seeked",signal);
  video.currentTime=t1;
  await seeking;
  if(video.readyState<2)await waitFor(video,"loadeddata",signal);
  const b=pixels(video,canvas,d.width,d.height);
  return {a,b,times:[t0,t1]};
 }finally{
  video.pause();video.removeAttribute("src");
  try{video.load()}catch{}
  URL.revokeObjectURL(objectURL);
 }
}
start.addEventListener("click",async()=>{
 if(controller){controller.abort();status.textContent="Annulation en cours…";return}
 if(!selected)return;
 const ctrl=new AbortController(),id=version,chosen=selected,isSynthetic=syntheticSource;
 controller=ctrl;start.textContent="Annuler l'analyse";report.hidden=true;
 if(url){URL.revokeObjectURL(url);url=null}
 status.textContent="Extraction locale des deux images ; aucune restauration lancée…";
 try{
  const {a,b,times}=await sample(chosen,ctrl.signal);
  if(id!==version||ctrl.signal.aborted)return;
  const result=NOVA_SMALLMOTION.analyser(a,b,{frameTimesSeconds:times,signal:ctrl.signal,synthetic:isSynthetic});
  if(id!==version||ctrl.signal.aborted)return;
  const json=NOVA_SMALLMOTION.serialiser(result);
  url=URL.createObjectURL(new Blob([json],{type:"application/json"}));
  report.href=url;report.download="NOVA_SmallMotion_diagnostic_local.json";report.hidden=false;
  status.textContent=result.status==="local_motion_candidate"?
   result.candidates.length+" zone(s) de mouvement 2D possible(s). Confiance non calibrée ; aucune correction automatique.":
   "Diagnostic : "+result.status+". Aucun changement automatique ; rapport JSON local disponible.";
 }catch{
  if(id===version)status.textContent=ctrl.signal.aborted?
   "Diagnostic annulé. Aucun rapport conservé.":
   "Diagnostic impossible sur ce navigateur/fichier. Vidéo originale intacte, aucun envoi.";
 }finally{
  if(controller===ctrl){controller=null;start.textContent="Analyser 2 images sans modifier";start.disabled=!selected}
 }
});
})();
