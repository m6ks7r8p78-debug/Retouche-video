/* NOVA HD : essai volontaire sur vraie vidéo et conservation originale sans perte.
 * Jamais d'envoi réseau; le mode "original" n'a aucune retouche.
 * Le mode HD respecte tous les PTS et exige de préserver l'AAC.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const run=$("novaHdRun"),save=$("novaHdSave"),keep=$("novaHdOriginal"),
 reportLink=$("novaHdColorJson"),qualityLink=$("novaHdQualityJson"),
 status=$("novaHdStatus"),panel=$("novaHdPanel");
if(!run||!save||!keep||!status||!panel)return;
const label="Essayer le traitement HD sans réduire la vidéo";
let selected=null,controller=null,outputURL=null,originalURL=null,generation=0,reportURL=null,qaURL=null;
function revoke(){
 if(outputURL){URL.revokeObjectURL(outputURL);outputURL=null}
 if(originalURL){URL.revokeObjectURL(originalURL);originalURL=null}
 if(reportURL){URL.revokeObjectURL(reportURL);reportURL=null}
 if(qaURL){URL.revokeObjectURL(qaURL);qaURL=null}
 for(const el of [save,keep,reportLink,qualityLink]){if(el){el.hidden=true;el.removeAttribute("href")}}
}
function reset(){
 generation++;controller?.abort();controller=null;
 revoke();selected=null;run.disabled=true;run.textContent=label;
 status.textContent="Choisis une vidéo pour essayer le moteur HD natif. Aucun traitement ne démarre automatiquement.";
}
window.addEventListener("nova:source-selected",e=>{
 reset();
 const f=e.detail?.file;
 if(!f||!NOVA_IPHONE_REPORT.videoFile(f)||!Number.isSafeInteger(f.size)||
    f.size<1||f.size>60*1048576)return;
 selected=f;run.disabled=false;
 originalURL=URL.createObjectURL(f);
 keep.href=originalURL;
 keep.download=(f.name||"video").replace(/\.[^.]+$/,"")+"_original_intact"+
  (/.\.(mp4|mov|m4v)$/i.test(f.name||"")?"."+f.name.split(".").at(-1).toLowerCase():".mov");
 keep.hidden=false;
 status.textContent="Vidéo sélectionnée. Le moteur HD essaie de conserver résolution, cadence et AAC sans réduction. L'original reste disponible séparément.";
});
window.addEventListener("pagehide",()=>controller?.abort());
document.addEventListener("visibilitychange",()=>{if(document.hidden)controller?.abort()});
run.addEventListener("click",async()=>{
 if(controller){controller.abort();status.textContent="Arrêt demandé : aucun MP4 incomplet enregistré.";return}
 if(!selected)return;
 if(outputURL){URL.revokeObjectURL(outputURL);outputURL=null}
 save.hidden=true;save.removeAttribute("href");
 if(reportURL){URL.revokeObjectURL(reportURL);reportURL=null}
 if(reportLink){reportLink.hidden=true;reportLink.removeAttribute("href")}
 if(qaURL){URL.revokeObjectURL(qaURL);qaURL=null}
 if(qualityLink){qualityLink.hidden=true;qualityLink.removeAttribute("href")}
 const my=generation,ctrl=new AbortController(),src=selected;
 controller=ctrl;run.textContent="Annuler l'essai HD";
 status.textContent="Décodage HEVC natif, restauration classique douce et export en cours…";
 try{
  const out=await NOVA_NATIVE_HD.exporter({file:src,moteur:NOVA_ZONES,
   arbitre:NOVA_DECISION,signal:ctrl.signal,onProgress:p=>{
    if(my!==generation||ctrl.signal.aborted)return;
    if(p.stage==="source")status.textContent="Source : "+p.width+" × "+p.height+
      ", "+p.frames+" images, environ "+p.fps+" i/s. Aucun rééchantillonnage de cadence.";
    if(p.stage==="video")status.textContent="Traitement local HD : "+
      p.frame+" / "+p.total+" images, audio préparé sans export muet.";
    if(p.stage==="audio")status.textContent="Copie AAC impossible : tentative d'encodage AAC-LC natif local…";
    if(p.stage==="complete")status.textContent="Vérification finale de l'export HD…";
   }});
  if(my!==generation||ctrl.signal.aborted)return;
  outputURL=URL.createObjectURL(out.blob);
  save.href=outputURL;save.download=(src.name||"video").replace(/\.[^.]+$/,"")+
   "_NOVA_HD_experimental.mp4";save.hidden=false;
  if(qualityLink&&out.qualityReport){
   qaURL=URL.createObjectURL(new Blob([
    JSON.stringify(out.qualityReport,null,2)+"\n"
   ],{type:"application/json"}));
   qualityLink.href=qaURL;qualityLink.hidden=false;
  }
  status.textContent="MP4 HD exporté : "+out.originalWidth+" × "+
   out.originalHeight+", "+out.outputFrames+" images / "+
   out.sourceFrames+" source, cadence d'origine ~"+out.sourceFps+
   " i/s, "+(out.audioMode==="aac-copy"?
    "AAC original copié sans réencodage":"AAC-LC réencodé localement : vérifie le son et sa synchronisation")+
   ". "+out.modifiedFrames+
   " images avec correction locale de lumière. "+
   (out.colorWarning?("ATTENTION COULEURS : "+out.colorWarning):
    "Profil BT.709 du MP4 vérifié, fidélité à l'original non certifiée.")+
   (out.qualityReport?(" Fin des paquets AAC / fin vidéo : "+
    out.qualityReport.audio.lastAudioPacketMinusVideoDurationMs+
    " ms (non assimilable à la synchro perceptuelle). "+
    "Bilan JSON local disponible."):"")+
   " Vérifie visuellement la fidélité et écoute le son ; aucune restauration neuronale.";
 }catch(e){
  if(my===generation&&!ctrl.signal.aborted&&reportLink){
   try{
    // Les chiffres des métadonnées et le résultat de l'audit SPS/VUI seulement.
    // Aucun nom de fichier, octet vidéo, GPS, identifiant ou image dans le JSON.
    const info=await NOVA_DEMUX.analyser(src);
    if(info&&my===generation){
     const report=NOVA_HD_COLOR.report(info);
     const json=JSON.stringify(report,null,2)+"\n";
     reportURL=URL.createObjectURL(new Blob([json],{type:"application/json"}));
     reportLink.href=reportURL;
     reportLink.download="NOVA_diagnostic_couleur_local.json";
     reportLink.hidden=false;
    }
   }catch(_){}
  }
  if(my===generation){
   status.textContent=ctrl.signal.aborted?"Essai HD annulé. Aucun export incomplet.":
    "Essai HD non abouti sur ce navigateur : "+(e?.message||"erreur inconnue")+
    ". L'original intact reste accessible ; il n'est pas présenté comme restauré.";
  }
 }finally{
  if(controller===ctrl){
   controller=null;run.disabled=!selected;run.textContent=label;
  }
 }
});
})();
