/* NOVA — contrôle préalable volontaire, lecture seule, sans téléversement.
 * Aucune conversion ni modification de la source : résultat limité à la
 * compatibilité HEVC/BT.709/PTS/budget et couverture audio AAC du pilote.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const button=$("novaRealPreflightRun"),status=$("novaRealPreflightStatus"),
 link=$("novaRealPreflightJson");
if(!button||!status||!link)return;
const label="Vérifier cette vidéo sans exporter";
const messages=Object.freeze({
 "ready-for-export-attempt":"Précontrôle favorable : format HEVC SDR, contraintes de durée et mémoire, et piste AAC vérifiés. Cela permet seulement de tenter un export, sans le garantir.",
 "not-video":"Ce fichier n'est pas reconnu comme une vidéo.",
 "file-budget":"Précontrôle refusé : fichier vide, invalide ou supérieur à 60 Mio.",
 "browser-unavailable":"Ce navigateur ne présente pas toutes les fonctions WebCodecs requises.",
 "insecure-context":"HTTPS requis pour ce laboratoire.",
 "container-unreadable":"MOV/MP4 non analysable par le parseur local expérimental.",
 "unsupported-video-codec":"Ce précontrôle d'export est réservé aux sources HEVC H.265 du pilote.",
 "hevc-profile-or-timeline-incompatible":"Profil HEVC, BT.709, durée, cadence, présentation ou PTS incompatibles avec les limites du pilote.",
 "resource-budget":"Dimensions, durée ou budget mémoire estimé hors limites du pilote.",
 "audio-not-preservable":"Copie de la piste AAC d'origine non vérifiable ; aucun export sans son automatique.",
 "analysis-unavailable":"Un module de vérification manque ou a échoué ; aucun résultat favorable.",
 "cancelled":"Précontrôle annulé ; aucune modification du fichier."
});
let selected=null,controller=null,generation=0,blobUrl=null;
function revoke(){
 if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null}
 link.hidden=true;link.removeAttribute("href");
}
function reset(){
 generation++;controller?.abort();controller=null;revoke();
 selected=null;button.disabled=true;button.textContent=label;
 status.textContent="Choisissez une vidéo locale. Aucun diagnostic ne part sans votre appui.";
}
window.addEventListener("nova:source-selected",event=>{
 reset();
 const f=event.detail?.file;
 if(!f||!NOVA_IPHONE_REPORT.videoFile(f))return;
 if(!Number.isSafeInteger(f.size)||f.size<1||f.size>60*1048576){
  status.textContent=messages["file-budget"];return;
 }
 selected=f;button.disabled=false;
 status.textContent="Vidéo sélectionnée. Appuyez pour contrôler les formats, la couleur, les PTS, la mémoire et l'AAC localement.";
});
window.addEventListener("pagehide",()=>controller?.abort());
document.addEventListener("visibilitychange",()=>{if(document.hidden)controller?.abort()});
button.addEventListener("click",async()=>{
 if(controller){controller.abort();status.textContent="Annulation demandée…";return}
 if(!selected)return;
 revoke();const id=generation,ctl=new AbortController(),chosen=selected;
 controller=ctl;button.textContent="Annuler le précontrôle";
 status.textContent="Lecture locale des métadonnées, des PTS et de la piste audio…";
 try{
  const r=await NOVA_REAL_PREFLIGHT.inspect({file:chosen,signal:ctl.signal});
  if(id!==generation||ctl.signal.aborted)return;
  const json=NOVA_REAL_PREFLIGHT.serialiser(r);
  blobUrl=URL.createObjectURL(new Blob([json],{type:"application/json"}));
  link.href=blobUrl;link.download="NOVA_precontrole_video_locale.json";link.hidden=false;
  status.textContent=messages[r.status]||messages["analysis-unavailable"];
 }catch{
  if(id===generation)status.textContent=ctl.signal.aborted?
   messages.cancelled:messages["analysis-unavailable"];
 }finally{
  if(controller===ctl){controller=null;button.textContent=label;button.disabled=!selected}
 }
});
})();
