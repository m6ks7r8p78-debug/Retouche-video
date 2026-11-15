/* NOVA 0.24 — banc iPhone Safari, deux parcours strictement volontaires.
 * 1. Média HEVC personnel sélectionné localement, 2. fixture HEVC/AAC synthétique.
 * Le laboratoire ne téléverse rien et n'enregistre rien automatiquement.
 */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const run=$("iphoneBenchRun"),demo=$("iphoneBenchSynthetic"),status=$("iphoneBenchStatus"),
 adviceText=$("iphoneBenchAdvice"),
 json=$("iphoneBenchJson"),video=$("iphoneBenchMp4"),panel=$("iphoneBenchPanel"),
 stability=$("iphoneBenchStabilityRun"),stabilityStatus=$("iphoneBenchStabilityStatus"),
 stabilityJson=$("iphoneBenchStabilityJson");
if(!run||!status||!json||!video||!panel)return;
let file=null,generation=0,controller=null,urls=[];
const runLabel="Tester Safari sur cette vidéo";
const demoLabel="Tester Safari sans vidéo personnelle";
function clearURLs(){
 for(const url of urls)URL.revokeObjectURL(url);
 urls=[];
 for(const link of [json,video,stabilityJson].filter(Boolean)){
  link.hidden=true;link.removeAttribute("href")
 }
}
function reset(){
 generation++;
 controller?.abort();controller=null;
 file=null;clearURLs();run.disabled=true;
 if(adviceText){adviceText.textContent="";adviceText.hidden=true}
 if(demo){demo.disabled=false;demo.textContent=demoLabel}
 if(stability){stability.disabled=false;stability.textContent="Vérifier la stabilité · 3 essais synthétiques"}
 if(stabilityStatus)stabilityStatus.textContent="";
 run.textContent=runLabel;
 status.textContent="Importez une vidéo HEVC ou essayez le clip synthétique sans média privé.";
}
window.addEventListener("nova:source-selected",event=>{
 reset();
 const f=event.detail?.file;
 if(!NOVA_IPHONE_REPORT.videoFile(f)||f.size>60*1048576)return;
 file=f;run.disabled=false;
 status.textContent="Prêt : aucune analyse, conversion ou transmission n'a démarré.";
});
function linkBlob(blob,label,element){
 const url=URL.createObjectURL(blob);
 urls.push(url);element.href=url;element.download=label;element.hidden=false;
}
window.addEventListener("pagehide",()=>controller?.abort());
document.addEventListener("visibilitychange",()=>{
 if(document.hidden)controller?.abort();
});
async function execute(selectFile,button,synthetic){
 if(controller){
  controller.abort();button.disabled=true;
  status.textContent="Annulation du diagnostic local…";
  return;
 }
 if(!synthetic&&!file)return;
 clearURLs();
 if(adviceText){adviceText.textContent="";adviceText.hidden=true}
 if(stability){stability.disabled=true}
 if(stabilityStatus)stabilityStatus.textContent="";
 const myGeneration=generation,ctrl=new AbortController();
 controller=ctrl;
 run.disabled=button!==run;
 if(demo)demo.disabled=button!==demo;
 button.textContent="Annuler le test";
 status.textContent=synthetic?
  "Chargement local du clip synthétique HEVC/AAC, sans fichier personnel…":
  "Vérification locale de la vidéo HEVC sélectionnée…";
 try{
  const chosen=await selectFile(ctrl.signal);
  if(ctrl.signal.aborted||myGeneration!==generation)return;
  const {report,outputBlob}=await NOVA_IPHONE_REPORT.executer({
   file:chosen,moteur:NOVA_ZONES,arbitre:NOVA_DECISION,
   signal:ctrl.signal,synthetic,
   allowSilent:$("allowSilent")?.checked===true,
   onProgress:step=>{
    if(myGeneration!==generation||ctrl.signal.aborted)return;
    if(step.stage==="video")
     status.textContent="Test vidéo local : "+Math.round((step.progress||0)*100)+" %";
    else if(step.stage==="verification")
     status.textContent="Contrôle local du MP4, des couleurs et du son…";
   }
  });
  if(myGeneration!==generation||ctrl.signal.aborted)return;
  const advice=NOVA_DEVICE_ADVICE.assess(report,{
   visibility:document.hidden?"hidden":"visible"
  });
  if(adviceText){
   adviceText.textContent=NOVA_DEVICE_ADVICE.message(advice)+
    " Aucun profil automatique ni validation physique iPhone.";
   adviceText.hidden=false;
  }
  const contents=NOVA_IPHONE_REPORT.serialiser(report,advice);
  linkBlob(new Blob([contents],{type:"application/json"}),
   "NOVA_024_rapport_Safari_local.json",json);
  if(report.result==="success"&&outputBlob){
   linkBlob(outputBlob,"NOVA_024_test_Safari.mp4",video);
   status.textContent=(synthetic?"Clip synthétique : ":"Vidéo locale : ")+
    "test réussi. Vérifiez le MP4 et enregistrez volontairement le rapport JSON. Aucun envoi automatique.";
  }else{
   status.textContent="Test "+(report.result==="cancelled"?"annulé":"refusé")+
    " ("+report.errorCode+"). Rapport JSON local disponible ; aucun MP4 incomplet.";
  }
 }catch(error){
  if(myGeneration===generation)
   status.textContent=ctrl.signal.aborted?"Diagnostic annulé.":
    "Impossible de terminer ce test local. Vérifiez que l'aperçu NOVA 0.24 contient le clip synthétique.";
 }finally{
  if(controller===ctrl){
   // Safari peut suspendre la page : ne jamais laisser "en cours"
   // ou un ancien lien après le retour d'un résultat tardif.
   if(ctrl.signal.aborted&&myGeneration===generation)
    status.textContent="Diagnostic annulé ou interrompu par Safari. Aucun nouvel export.";
   controller=null;
   run.textContent=runLabel;run.disabled=!file;
   if(demo){demo.textContent=demoLabel;demo.disabled=false}
   if(stability)stability.disabled=false;
  }
 }
}
function syntheticMedia(signal){
 return fetch("./nova-test-synthetic.mov",{signal,cache:"no-store"}).then(async response=>{
  if(!response.ok)throw new Error("fixture absente");
  const blob=await response.blob();
  if(blob.size<1000||blob.size>100000)throw new Error("fixture invalide");
  return new File([blob],"NOVA_synthetic_HEVC_AAC.mov",{type:"video/quicktime"});
 });
}
async function repeatSynthetic(){
 if(controller){
  controller.abort();
  if(stabilityStatus)stabilityStatus.textContent="Annulation demandée.";
  return;
 }
 clearURLs();
 if(adviceText){adviceText.textContent="";adviceText.hidden=true}
 const activeGeneration=generation,ctrl=new AbortController();
 controller=ctrl;
 run.disabled=true;if(demo)demo.disabled=true;
 stability.textContent="Annuler les trois essais";
 if(stabilityStatus)stabilityStatus.textContent="Chargement du clip de test synthétique local…";
 try{
  // Une seule lecture du média synthétique, sans import personnel.
  const syntheticFile=await syntheticMedia(ctrl.signal);
  if(ctrl.signal.aborted||activeGeneration!==generation)return;
  const result=await NOVA_IPHONE_STABILITY.run({
   signal:ctrl.signal,onProgress:step=>{
    if(activeGeneration===generation&&stabilityStatus)
     stabilityStatus.textContent="Conversion synthétique "+step.current+" / 3 en cours…";
   },execute:async()=>NOVA_IPHONE_REPORT.executer({
    file:syntheticFile,moteur:NOVA_ZONES,arbitre:NOVA_DECISION,
    allowSilent:false,synthetic:true,signal:ctrl.signal
   })
  });
  if(ctrl.signal.aborted||activeGeneration!==generation)return;
  linkBlob(new Blob([NOVA_IPHONE_STABILITY.serialize(result)],{type:"application/json"}),
   "NOVA_026_stabilite_3_essais_locaux.json",stabilityJson);
  if(stabilityStatus)stabilityStatus.textContent=
   "Bilan de "+result.completed+" essai(s) : "+result.status+
   ". Ce résultat concerne ce navigateur et ne certifie pas un iPhone physique.";
 }catch(error){
  if(activeGeneration===generation&&stabilityStatus)
   stabilityStatus.textContent=ctrl.signal.aborted?
    "Série annulée : aucun bilan de réussite.":
    "Série interrompue : aucune réussite certifiée, ne pas répéter automatiquement.";
 }finally{
  if(controller===ctrl){
   if(ctrl.signal.aborted&&activeGeneration===generation&&stabilityStatus)
    stabilityStatus.textContent="Série annulée ou interrompue par Safari : aucun bilan de réussite.";
   controller=null;run.disabled=!file;
   if(demo)demo.disabled=false;
   stability.textContent="Vérifier la stabilité · 3 essais synthétiques";
  }
 }
}
stability?.addEventListener("click",repeatSynthetic);
run.addEventListener("click",()=>execute(()=>file,run,false));
demo?.addEventListener("click",()=>execute(syntheticMedia,demo,true));
})();
