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
 "ready-for-export-attempt":"Précontrôle favorable pour ce chemin : codec, contraintes de durée et mémoire, PTS et copie AAC vérifiés. Essai d'export seulement, sans garantie de fidélité finale.",
 "not-video":"Ce fichier n'est pas reconnu comme une vidéo.",
 "file-budget":"Précontrôle refusé : fichier vide, invalide ou supérieur à 60 Mio.",
 "browser-unavailable":"Ce navigateur ne présente pas toutes les fonctions WebCodecs requises.",
 "insecure-context":"HTTPS requis pour ce laboratoire.",
 "container-unreadable":"MOV/MP4 non analysable par le parseur local expérimental.",
 "unsupported-video-codec":"Ce chemin expérimental ne prend pas en charge le codec analysé.",
 "h264-unsafe-metadata":"H.264 : les métadonnées de présentation ne permettent pas encore un export fidèle.",
 "h264-pilot-limit":"H.264 : la vidéo dépasse une limite du pilote (durée 12 s, résolution source 1080p ou nombre d'images).",
 "h264-unsafe-color":"H.264 : colorimétrie SDR BT.709 non confirmée ; conversion automatique refusée.",
 "h264-timeline-incompatible":"H.264 : horodatages ou image initiale incompatibles avec le chemin PTS natif.",
 "h264-decoder-unavailable":"H.264 : le décodeur WebCodecs natif n'est pas disponible ici.",
 "h264-encoder-unavailable":"H.264 : l'encodeur de sortie WebCodecs n'est pas disponible ici.",
 "hevc-profile-or-timeline-incompatible":"Profil HEVC, BT.709, durée, cadence, présentation ou PTS incompatibles avec les limites du pilote.",
 "resource-budget":"Dimensions, durée ou budget mémoire estimé hors limites du pilote.",
 "audio-not-preservable":"Copie de la piste AAC d'origine non vérifiable ; aucun export sans son automatique.",
 "analysis-unavailable":"Un module de vérification manque ou a échoué ; aucun résultat favorable.",
 "cancelled":"Précontrôle annulé ; aucune modification du fichier."
});
// Seuls les codes reconnus, jamais un texte d'exception, sont présentés.
const causeLabels=Object.freeze({
 "not-hevc-pilot":"Cette source utilise un autre codec que le pilote HEVC.",
 "pilot-limit-exceeded":"Un plafond propre au pilote HEVC est dépassé.",
 "pixel-aspect-unsupported":"La géométrie des pixels ne peut pas être conservée dans ce chemin.",
 "color-metadata-unsupported":"La colorimétrie déclarée sort du profil SDR BT.709 pris en charge.",
 "color-metadata-missing":"Les informations de couleur sont insuffisantes pour conclure.",
 "sps-vui-unverified":"Le contrôle du SPS/VUI HEVC n'a pas pu être confirmé.",
 "sps-vui-check-unavailable":"Le module local de contrôle SPS/VUI manque.",
 "sps-vui-unsupported":"Des informations SPS/VUI contrôlées ne correspondent pas au pilote.",
 "timeline-data-unavailable":"Les informations de temps disponibles sont insuffisantes.",
 "timeline-duplicate-pts":"La chronologie contient des horodatages de présentation dupliqués.",
 "timeline-negative-preroll":"Le pré-défilement temporel dépasse la limite du lecteur.",
 "timeline-start-nonzero":"La première image présentable ne commence pas à zéro.",
 "timeline-end-inconsistent":"La fin temporelle ne correspond pas à la durée déclarée.",
 "timeline-first-keyframe-missing":"La première image n'est pas identifiée comme image clé.",
 "timeline-check-unavailable":"Le module de contrôle des horodatages manque.",
 "timeline-check-inconclusive":"Le contrôle des horodatages n'a pas abouti.",
 "independent-checks-inconclusive":"Les contrôles indépendants n'expliquent pas le refus.",
 "unresolved":"La cause exacte ne peut pas être établie."
});
// Les diagnostics détaillés sont issus exclusivement de compteurs techniques
// bornés. Les autres critères restent non vérifiés en cas de refus précoce.
function details(report){
 const reasons=Array.isArray(report?.blockers)?report.blockers:[];
 const src=report?.source||{},limits=report?.pilotLimits||{};
 const items=[];
 if(reasons.includes("coded-pixels-over-limit")){
  const w=src.width,h=src.height;
  const dims=Number.isSafeInteger(w)&&Number.isSafeInteger(h)?w+" × "+h+" ; ":"";
  items.push("Résolution trop élevée : "+dims+
   "plafond de calcul du moteur HEVC = "+(limits.codedPixelAreaMax||230400)+
   " pixels codés (640 × 360).");
 }
 if(reasons.includes("source-frames-over-limit"))
  items.push("Trop d'images : "+(Number.isSafeInteger(src.frames)?src.frames+" ; ":"")+
   "plafond actuel = "+(limits.sourceFramesMax||90)+".");
 if(reasons.includes("duration-over-limit"))
  items.push("Durée supérieure à "+((limits.maxDurationMs||12000)/1000)+" secondes.");
 if(reasons.includes("coded-dimensions-not-even"))
  items.push("Dimensions encodées impaires non admises par le moteur HEVC.");
 if(Array.isArray(report?.advisories)&&
    report.advisories.includes("source-rate-above-output-rate")){
  const fps=typeof src.estimatedSourceFps==="number"&&
   Number.isFinite(src.estimatedSourceFps)?src.estimatedSourceFps+" images/s environ":"cadence supérieure";
  items.push("Attention à la fidélité du mouvement : source estimée à "+fps+
   ", mais le pilote d'export est limité à 15 images/s.");
 }
 if(reasons.length)
  items.push("Autres vérifications non concluantes ou non exécutées : notamment la couleur, les PTS et l'audio. Aucun export automatique.");
 const diag=report?.diagnostic;
 if(diag&&Object.hasOwn(causeLabels,diag.code)){
  const prefix=diag.confidence==="confirmed-by-metadata"?
   "Cause identifiable dans les métadonnées (d'autres causes restent possibles) : ":
   "Vérification supplémentaire non concluante : ";
  items.push(prefix+causeLabels[diag.code]+" Audio non testé à cette étape.");
 }
 return items.length?" "+items.join(" "):"";
}
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
  status.textContent=(messages[r.status]||messages["analysis-unavailable"])+details(r);
 }catch{
  if(id===generation)status.textContent=ctl.signal.aborted?
   messages.cancelled:messages["analysis-unavailable"];
 }finally{
  if(controller===ctl){controller=null;button.textContent=label;button.disabled=!selected}
 }
});
})();
