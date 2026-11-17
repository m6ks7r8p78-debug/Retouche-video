/* Contrôle Safari opt-in : HEVC 1/1/6 synthétique UNIQUEMENT.
 * Aucune vidéo personnelle, aucune capture, aucun téléversement.
 */
(()=>{
"use strict";
const $=x=>document.getElementById(x);
const run=$("nova601Run"),status=$("nova601Status"),link=$("nova601Json"),
 share=$("nova601Share"),copy=$("nova601Copy"),show=$("nova601Show"),reportText=$("nova601ReportText");
const panel=$("nova601ColorPanel");
if(typeof location!=="undefined"&&location.hash==="#nova601ColorPanel"&&panel)panel.open=true;
if(!run||!status||!link||!share||!copy||!show||!reportText)return;
let controller=null,url=null,reportJson="";
function clear(){
 if(url){URL.revokeObjectURL(url);url=null}
 link.hidden=true;link.removeAttribute("href");
 for(const b of [share,copy,show])b.hidden=true;
 reportText.hidden=true;reportText.value="";reportJson="";
}
const errors=new Set(["cancelled","synthetic-fetch-failed",
 "synthetic-size-invalid","synthetic-source-not-116",
 "webcodecs-hevc-unavailable","hevc-decoder-failed",
 "canvas-unavailable","synthetic-sample-invalid","demux-unavailable"]);
function diagnosticFailure(e){
 const code=errors.has(e?.message)?e.message:"synthetic-test-failed";
 return {
  schema:"retoucheproai.nova.safari-hevc-601-patches.v1",
  origin:"ffmpeg-synthetic-only",
  status:code==="cancelled"?"cancelled":"unavailable",
  errorCode:code,
  privacy:{personalMediaIncluded:false,rawMediaIncluded:false,
   rawFrameIncluded:false,deviceIdentifiersIncluded:false,networkUpload:false},
  limitation:"Test HEVC synthétique uniquement ; aucune conclusion sur "+
   "une vidéo personnelle ni sur sa fidélité colorimétrique."
 };
}
const reportName="NOVA_Safari_HEVC_116_couleurs_synthetiques.json";
function save(report){
 clear();
 reportJson=JSON.stringify(report,null,2)+"\n";
 const blob=new Blob([reportJson],{type:"application/json"});
 url=URL.createObjectURL(blob);
 link.href=url;link.download=reportName;
 // Ces TROIS boutons sont visiblement stylés. Ne pas afficher le lien brut.
 for(const b of [share,copy,show])b.hidden=false;
}
function displayReport(){
 if(!reportJson)return;
 reportText.value=reportJson;
 reportText.hidden=false;
 reportText.focus();reportText.select();
}
share.addEventListener("click",async()=>{
 if(!reportJson)return;
 const file=new File([reportJson],reportName,{type:"application/json"});
 try{
  if(typeof navigator.share==="function"&&
     (typeof navigator.canShare!=="function"||navigator.canShare({files:[file]}))){
   await navigator.share({files:[file],title:"Diagnostic couleurs HEVC NOVA"});
   status.textContent="Rapport partagé. Pour l'enregistrer, sélectionne Fichiers dans la feuille de partage iOS.";
   return;
  }
 }catch(e){
  if(e?.name==="AbortError"){
   status.textContent="Partage annulé. Tu peux toujours copier ou afficher le rapport ci-dessous.";
   return;
  }
 }
 // Le lien blob est déclenché uniquement pendant un geste utilisateur.
 link.click();
 status.textContent="Téléchargement demandé à Safari. Si rien n'apparaît dans Fichiers, utilise Copier ou Afficher le rapport.";
});
copy.addEventListener("click",async()=>{
 if(!reportJson)return;
 try{
  if(!navigator.clipboard?.writeText)throw new Error("clipboard-unavailable");
  await navigator.clipboard.writeText(reportJson);
  status.textContent="Rapport JSON copié. Reviens dans ChatGPT et colle le texte directement ici.";
 }catch{
  displayReport();
  status.textContent="Copie automatique indisponible : le rapport est affiché et sélectionné ci-dessous. Maintiens le doigt sur le texte pour le copier.";
 }
});
show.addEventListener("click",()=>{
 if(!reportJson)return;
 if(!reportText.hidden){reportText.hidden=true;show.textContent="Afficher le rapport pour le copier";return}
 displayReport();show.textContent="Masquer le rapport";
 status.textContent="Rapport affiché ci-dessous. Sélectionne puis copie le texte pour me l'envoyer.";
});
run.addEventListener("click",async()=>{
 if(controller){controller.abort();status.textContent="Test annulé.";return}
 clear();
 controller=new AbortController();const active=controller;
 run.textContent="Annuler le test HEVC";
 status.textContent="Mesure de 8 couleurs synthétiques en HEVC matériel, sur cet appareil…";
 try{
  const report=await NOVA_HEVC_601.runSynthetic({signal:active.signal});
  if(controller!==active||active.signal.aborted)return;
  save(report);
  status.textContent="Test terminé : écart moyen "+report.meanAbsRgb255+
   "/255, écart maximal "+report.maxAbsRgb255+
   "/255. Enregistre le JSON ci-dessous pour analyser la couleur Safari. "+
   "Ce n'est pas une certification de fidélité des vidéos personnelles.";
 }catch(error){
  if(controller!==active)return;
  const report=diagnosticFailure(error);
  if(report.status!=="cancelled")save(report);
  status.textContent=report.status==="cancelled"?"Test annulé. Aucun rapport enregistré.":
   "Le décodeur HEVC ou le test synthétique n'a pas abouti ("+
   report.errorCode+"). Un diagnostic anonyme est disponible.";
 }finally{
  if(controller===active){controller=null;
   run.textContent="Tester la couleur HEVC 1/1/6 sur cet iPhone";}
 }
});
window.addEventListener("pagehide",()=>controller?.abort());
document.addEventListener("visibilitychange",()=>{
 if(document.hidden)controller?.abort();
});
})();
