/* NOVA 0.23 — test Safari déclenché volontairement par un seul bouton.
 * Aucun upload, aucun localStorage, aucune persistance automatique.
 * Deux liens locaux facultatifs : rapport JSON et MP4 de l'essai.
 * Le panneau reste discret et fermé dans le parcours habituel.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const run=$("iphoneBenchRun"),status=$("iphoneBenchStatus"),
 json=$("iphoneBenchJson"),video=$("iphoneBenchMp4"),reportPanel=$("iphoneBenchPanel");
if(!run||!status||!json||!video||!reportPanel)return;
let file=null,generation=0,controller=null,urls=[];
function clearURLs(){
 for(const url of urls)URL.revokeObjectURL(url);
 urls=[];
 for(const link of [json,video]){link.hidden=true;link.removeAttribute("href")}
}
function reset(){
 generation++;
 controller?.abort();controller=null;
 file=null;clearURLs();run.disabled=true;
 run.textContent="Tester Safari sur cette vidéo";
 status.textContent="Importez une courte vidéo HEVC locale pour activer le test.";
}
window.addEventListener("nova:source-selected",event=>{
 reset();
 const f=event.detail?.file;
 if(!f||!f.type?.startsWith("video/")||f.size>60*1048576)return;
 file=f;run.disabled=false;
 status.textContent="Prêt : aucune analyse, conversion ou transmission n'a démarré.";
});
function linkBlob(blob,label,element){
 const url=URL.createObjectURL(blob);
 urls.push(url);
 element.href=url;element.download=label;element.hidden=false;
}
run.addEventListener("click",async()=>{
 if(controller){
  controller.abort();run.disabled=true;
  status.textContent="Annulation du test en cours…";
  return;
 }
 if(!file||!globalThis.NOVA_IPHONE_REPORT)return;
 clearURLs();
 const myGeneration=generation,ctrl=new AbortController();
 controller=ctrl;run.textContent="Annuler le test";
 status.textContent="Vérification locale des capacités Safari et du fichier HEVC…";
 try{
  const {report,outputBlob}=await NOVA_IPHONE_REPORT.executer({
   file,moteur:NOVA_ZONES,arbitre:NOVA_DECISION,signal:ctrl.signal,
   allowSilent:$("allowSilent")?.checked===true,
   onProgress:step=>{
    if(myGeneration!==generation)return;
    if(step.stage==="video")
     status.textContent="Test vidéo local : "+Math.round((step.progress||0)*100)+" %";
    else if(step.stage==="verification")
     status.textContent="Contrôle local du MP4 et des couleurs…";
   }
  });
  if(myGeneration!==generation)return;
  const text=NOVA_IPHONE_REPORT.serialiser(report);
  linkBlob(new Blob([text],{type:"application/json"}),
    "NOVA_023_rapport_Safari_local.json",json);
  if(report.result==="success"&&outputBlob){
   linkBlob(outputBlob,"NOVA_023_test_Safari.mp4",video);
   status.textContent="Test réussi localement. Consultez le MP4 et enregistrez "+
    "le rapport JSON si vous souhaitez le partager. Aucun envoi automatique.";
  }else{
   status.textContent="Test "+(report.result==="cancelled"?"annulé":"refusé")+
    " ("+report.errorCode+"). Le rapport JSON peut être enregistré ; "+
    "aucun MP4 incomplet n'est disponible.";
  }
 }catch(e){
  if(myGeneration===generation){
   status.textContent="Diagnostic interrompu : "+
    (ctrl.signal.aborted?"annulation demandée":"erreur interne locale");
  }
 }finally{
  if(controller===ctrl){
   controller=null;run.textContent="Tester Safari sur cette vidéo";
   run.disabled=!file;
  }
 }
});
})();
