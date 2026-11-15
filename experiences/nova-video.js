/* NOVA Preview Video v0.2 — uniquement prévisualisation locale, aucun export.
 * Garde le son/la lecture sur l'élément video natif ; traite une copie basse résolution
 * avec NOVA Mosaïque sans envoyer ni conserver les images sur un serveur.
 */
var NOVA_VIDEO=(()=>{
"use strict";
function creer(options={}){
 const {video,canvas,moteur,arbitre,onFrame,onError}=options;
 if(!video||!canvas||!moteur?.restituer||!arbitre?.arbitrer)throw new TypeError("Lecteur, canvas et moteurs requis");
 const widthMax=Math.max(96,Math.min(512,Number(options.widthMax)||320));
 const intervalMs=Math.max(100,Math.min(600,Number(options.intervalMs)||220));
 const source=document.createElement("canvas"),sourceCtx=source.getContext("2d",{willReadFrequently:true});
 const ctx=canvas.getContext("2d");
 let running=false,pending=null,last=-Infinity,frames=0,painted=0,active=true,observer=null;
 const nativeCb=typeof video.requestVideoFrameCallback==="function";
 function dimensions(){
  const w=video.videoWidth,h=video.videoHeight;
  if(!(w>0&&h>0))return false;
  const scale=Math.min(1,widthMax/Math.max(w,h));
  const iw=Math.max(1,Math.round(w*scale)),ih=Math.max(1,Math.round(h*scale));
  if(source.width!==iw||source.height!==ih){source.width=canvas.width=iw;source.height=canvas.height=ih}
  return true;
 }
 function rendre(){
  if(!active||video.readyState<2||!dimensions())return null;
  try{
   sourceCtx.drawImage(video,0,0,source.width,source.height);
   const image=sourceCtx.getImageData(0,0,source.width,source.height);
   const result=moteur.restituer(image,{size:64,arbitre});
   ctx.putImageData(new ImageData(result.data,result.width,result.height),0,0);
   canvas.hidden=false;painted++;
   const report={numero:painted,temps:video.currentTime,bilan:result.bilan,
     largeur:source.width,hauteur:source.height};
   if(typeof onFrame==="function")onFrame(report);
   return report;
  }catch(err){if(typeof onError==="function")onError(err);return null}
 }
 function planifier(){
  if(!active||!running||pending!==null)return;
  if(nativeCb)pending=video.requestVideoFrameCallback(pas);
  else pending=requestAnimationFrame(pas);
 }
 function pas(now){
  pending=null;
  if(!active||!running)return;
  frames++;
  if(now-last>=intervalMs){
   last=now;rendre();
  }
  if(!video.paused&&!video.ended)planifier();
 }
 function jouer(){
  if(!active)return;
  running=true;last=-Infinity;planifier();
 }
 function pause(){running=false;annuler()}
 function annuler(){
  if(pending===null)return;
  if(nativeCb&&typeof video.cancelVideoFrameCallback==="function")video.cancelVideoFrameCallback(pending);
  else if(!nativeCb)cancelAnimationFrame(pending);
  pending=null;
 }
 function avance(){if(!active)return;rendre()}
 function lancer(){
  if(!active)return false;
  rendre();
  if(!video.paused&&!video.ended)jouer();
  return true;
 }
 function detruire(){
  if(!active)return;
  active=false;pause();
  video.removeEventListener("play",jouer);
  video.removeEventListener("pause",pause);
  video.removeEventListener("ended",pause);
  video.removeEventListener("seeked",avance);
  canvas.hidden=true;canvas.width=canvas.height=0;
 }
 video.addEventListener("play",jouer);
 video.addEventListener("pause",pause);
 video.addEventListener("ended",pause);
 video.addEventListener("seeked",avance);
 return Object.freeze({lancer,detruire,rendre,statistiques:()=>({imagesCalculees:painted,rappels:frames,resolution:[canvas.width,canvas.height],actif:active})});
}
return Object.freeze({creer});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_VIDEO;
