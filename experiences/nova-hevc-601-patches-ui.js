/* Contrôle Safari opt-in : HEVC 1/1/6 synthétique UNIQUEMENT.
 * Aucune vidéo personnelle, aucune capture, aucun téléversement.
 */
(()=>{
"use strict";
const $=x=>document.getElementById(x);
const run=$("nova601Run"),status=$("nova601Status"),link=$("nova601Json");
const panel=$("nova601ColorPanel");
if(typeof location!=="undefined"&&location.hash==="#nova601ColorPanel"&&panel)panel.open=true;
if(!run||!status||!link)return;
let controller=null,url=null;
function clear(){
 if(url){URL.revokeObjectURL(url);url=null}
 link.hidden=true;link.removeAttribute("href");
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
function save(report){
 clear();
 const blob=new Blob([JSON.stringify(report,null,2)+"\n"],
  {type:"application/json"});
 url=URL.createObjectURL(blob);
 link.href=url;link.download="NOVA_Safari_HEVC_116_couleurs_synthetiques.json";
 link.hidden=false;
}
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
