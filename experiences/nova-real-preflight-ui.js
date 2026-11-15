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
 "ready-for-native-hd-attempt":"Précontrôle HD favorable : décodeur et encodeur natifs compatibles, résolution et cadence d'origine conservées, AAC original vérifié. Vous pouvez tenter l'export HD. Ce n'est pas une garantie de réussite ni une restauration neuronale.",
 "not-video":"Ce fichier n'est pas reconnu comme une vidéo.",
 "file-budget":"Précontrôle refusé : fichier vide, invalide ou supérieur à 60 Mio.",
 "browser-unavailable":"Ce navigateur ne présente pas toutes les fonctions WebCodecs requises.",
 "insecure-context":"HTTPS requis pour ce laboratoire.",
 "container-unreadable":"MOV/MP4 non analysable par le parseur local expérimental.",
 "unsupported-video-codec":"Codec vidéo non reconnu par ce laboratoire. La source reste intacte ; aucun export automatique.",
 "native-hd-unavailable":"La source H.264 est reconnue, mais le moteur HD natif ne peut pas encore confirmer codec, couleurs, présentation et audio sur cet appareil. Ce n’est pas un refus du format par l’application finale.",
 "hevc-profile-or-timeline-incompatible":"Export non autorisé : le pilote HD natif ne peut pas certifier la source. Les plafonds ci-dessous concernent seulement l’ancien moteur HEVC WebAssembly.",
 "resource-budget":"Dimensions, durée ou budget mémoire estimé hors limites du pilote.",
 "audio-not-preservable":"Copie de la piste AAC d'origine non vérifiable ; aucun export sans son automatique.",
 "analysis-unavailable":"Un module de vérification manque ou a échoué ; aucun résultat favorable.",
 "cancelled":"Précontrôle annulé ; aucune modification du fichier."
});
// Les diagnostics détaillés sont issus exclusivement de compteurs techniques
// bornés. Les autres critères restent non vérifiés en cas de refus précoce.
function details(report){
 const reasons=Array.isArray(report?.blockers)?report.blockers:[];
 const c=report?.colorEvidence;
 const colorDetails=Object.freeze({
  "absent-colr":"Aucune métadonnée couleur colr vérifiable dans le MOV/MP4.",
  "unknown-colr":"Profil colr inconnu : conversion fidèle impossible à certifier.",
  "hdr-pq-hlg":"Transfert HDR PQ ou HLG indiqué : une conversion HDR vers SDR nécessite un traitement dédié.",
  "wide-gamut-primaries":"Primaires étendues P3 ou BT.2020 signalées : sortie SDR BT.709 non équivalente.",
  "full-range":"Plage de niveaux complète : la sortie actuelle exige une plage limitée.",
  "unspecified-tags":"Une ou plusieurs valeurs couleur sont absentes ou marquées « non spécifié ».",
  "non-bt709-tags":"Le conteneur signale une colorimétrie autre que BT.709.",
  "hevc-over8bit":"Le SPS HEVC annonce une profondeur supérieure à 8 bits.",
  "bt709-tags":"Le conteneur annonce BT.709. Ce n'est pas une preuve suffisante du contrat HD complet."
 });
 const src=report?.source||{},limits=report?.pilotLimits||{};
 const items=[];
 if(c&&colorDetails[c.classification]){
  items.push("Diagnostic couleur local : "+colorDetails[c.classification]);
  const v=[c.primaries,c.transfer,c.matrix];
  if(v.every(x=>Number.isSafeInteger(x)))items.push("Codes normalisés colr (P/T/M) : "+v.join("/")+".");
  if(c.lumaBits!=null)items.push("Profondeur luminance HEVC : "+c.lumaBits+" bits.");
  if(c.hevcSps==="verified")items.push("SPS/VUI HEVC vérifié, cohérent avec le conteneur.");
  else if(c.hevcSps==="not-confirmed")items.push("SPS/VUI HEVC non confirmé ; aucune conversion forcée.");
 }
 // Motif technique strictement catégorisé; jamais d'exception native brute
 // (susceptible de contenir un chemin, une information privée ou un codec).
 const nativeDetail=Object.freeze({
  "module-missing":"Le module de traitement HD natif n'est pas chargé.",
  "source-contract-unverified":"Le moteur HD natif a refusé le contrat source (couleur, orientation, horodatages ou budget). Le diagnostic couleur ci-dessous ne garantit pas que les autres points sont compatibles.",
  "decoder-unavailable":"Le décodeur natif pour ce codec n'est pas confirmé sur cet appareil.",
  "encoder-unavailable":"L'encodeur H.264 natif ne peut pas être confirmé sur cet appareil.",
  "aac-analysis-unavailable":"Le précontrôle de la piste audio AAC est indisponible ou a échoué.",
  "aac-copy-unavailable":"La copie intégrale de la piste AAC d'origine n'est pas vérifiable."
 })[report?.nativeReason];
 if(nativeDetail)items.push(nativeDetail);
 if(reasons.includes("coded-pixels-over-limit")){
  const w=src.width,h=src.height;
  const dims=Number.isSafeInteger(w)&&Number.isSafeInteger(h)?w+" × "+h+" ; ":"";
  items.push("Ancien moteur WebAssembly uniquement : "+dims+
   "plafond historique = "+(limits.codedPixelAreaMax||230400)+
   " pixels codés (640 × 360), pas le plafond du HD natif.");
 }
 if(reasons.includes("source-frames-over-limit"))
  items.push("Ancien moteur WebAssembly uniquement : "+(Number.isSafeInteger(src.frames)?src.frames+" images ; ":"")+
   "plafond historique = "+(limits.sourceFramesMax||90)+", pas celui du HD natif.");
 if(reasons.includes("duration-over-limit"))
  items.push("Durée supérieure à "+((limits.maxDurationMs||12000)/1000)+" secondes.");
 if(reasons.includes("coded-dimensions-not-even"))
  items.push("Dimensions encodées impaires non admises par le moteur HEVC.");
 if(Array.isArray(report?.advisories)&&
    report.advisories.includes("source-rate-above-output-rate")){
  const fps=typeof src.estimatedSourceFps==="number"&&
   Number.isFinite(src.estimatedSourceFps)?src.estimatedSourceFps+" images/s environ":"cadence supérieure";
  items.push("Ancien moteur WebAssembly : "+fps+
   " contre sa limite historique de 15 images/s. Le moteur HD natif ne doit pas réduire la cadence.");
 }
 if(reasons.length)
  items.push("Autres vérifications non concluantes ou non exécutées : notamment la couleur, les PTS et l'audio. Aucun export automatique.");
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
