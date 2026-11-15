"use strict";
/**
 * P30 Safari manual lab test. No media/files accessed, no networking, no
 * persistent storage, no device ID, no UA, GPS, IP, filename or timestamp.
 * Manual checkbox is NEVER independently verified as a physical iPhone.
 */
(()=> {
 const $=id=>document.getElementById(id);
 const data=window.CINEMA_P29_SYNTHETIC;
 const safeEvidence=Boolean(data&&
  data.schema==="retouche-cinema-p29-synthetic-mobile-preview-v1"&&
  data.status==="verified_synthetic_preview_only"&&data.benchmark_cases===9&&
  data.cases_color_error_increase===9&&data.cases_file_larger_no_gain===3&&
  data.cases_temporal_pixel_change===9&&data.cases_audio_preserved===9&&
  data.user_video_analyzed===false&&data.may_modify_or_export_video===false&&
  data.physical_iphone_safari_tested===false&&data.recommendation===null);
 const run=$("run-check"),copy=$("copy-report"),save=$("save-report"),
  field=$("report-json"),area=$("report-area"),status=$("check-status"),feedback=$("save-status");
 let lastText=null;
 function browserSurface(){
   const viewport=Math.max(0,Math.round(window.innerWidth||0));
   return {
     viewport_category:viewport>0&&viewport<360?"compact":
       viewport>=360&&viewport<=430?"mobile":viewport>430?"wide":"unknown",
     layout_overflow_detected:document.documentElement.scrollWidth>viewport+1,
     javascript_active:true,
     page_context:location.protocol==="https:"?"https":
       location.protocol==="http:"?"http":
       location.protocol==="file:"?"local-file":"other",
     secure_context:window.isSecureContext===true
   };
 }
 function manual(){
   return {
     reported_physical_iphone_safari:$("confirm-safari").checked,
     readability_confirmed_by_user:$("confirm-readable").checked,
     explanation_toggle_confirmed_by_user:$("confirm-disclosure").checked,
   };
 }
 function createReport(){
   const observed=browserSurface();
   const answered=manual();
   const report={
     schema:"retouche-cinema-p30-manual-iphone-report-v1",
     status:"manual_feedback_unverified",
     reference:"synthetic_Cinema_P29_only",
     evidence_loaded:safeEvidence,
     local_browser_check:observed,
     voluntary_self_report:answered,
     conclusions:{
       local_layout_check_passed:safeEvidence&&
         observed.viewport_category!=="unknown"&&!observed.layout_overflow_detected,
       user_declared_success:answered.reported_physical_iphone_safari&&
         answered.readability_confirmed_by_user&&
         answered.explanation_toggle_confirmed_by_user,
       physical_iphone_safari_verified_by_laboratory:false,
       export_video_tested:false,
       real_person_media_tested:false,
       neural_restoration_tested:false,
     },
     privacy:{
       media_uploaded:false,
       media_file_accessed:false,
       file_names_included:false,
       user_agent_collected:false,
       network_requests_made_by_this_test:false,
       geolocation_collected:false,
       persistent_storage_used:false,
       report_shared_automatically:false
     }
   };
   return JSON.stringify(report,null,2)+"\n";
 }
 run.addEventListener("click",()=>{
   lastText=createReport();
   field.value=lastText;
   area.hidden=false;
   feedback.textContent="";
   status.className=safeEvidence?"status status-ready":"status status-muted";
   status.textContent=safeEvidence?
     "Rapport local préparé — informations déclaratives, non certifiées.":
     "Preuves synthétiques manquantes : rapport non certifié. Aucun export possible.";
 });
 copy.addEventListener("click",async()=>{
   if(lastText===null)return;
   try{
     if(!navigator.clipboard||typeof navigator.clipboard.writeText!=="function")
       throw new Error("clipboard unavailable");
     await navigator.clipboard.writeText(lastText);
     feedback.textContent="Rapport copié. Aucun envoi automatique.";
   }catch{
     field.focus();
     field.select();
     feedback.textContent="Copie automatique indisponible : sélectionne le texte ci-dessus, puis « Copier ».";
   }
 });
 save.addEventListener("click",()=>{
   if(lastText===null)return;
   try{
     const blob=new Blob([lastText],{type:"application/json;charset=utf-8"});
     const url=URL.createObjectURL(blob);
     const a=document.createElement("a");
     a.href=url;
     a.download="Cinema_P30_rapport_manuel.json";
     a.hidden=true;
     document.body.appendChild(a);
     a.click();
     a.remove();
     // Some mobile browsers do not honor the download attribute; text copy is
     // always available. Revoke later to allow the save sheet to open.
     setTimeout(()=>URL.revokeObjectURL(url),1200);
     feedback.textContent="Enregistrement local demandé. Si Safari n'affiche rien, utilise « Copier le rapport ».";
   }catch{
     field.focus();
     field.select();
     feedback.textContent="Enregistrement indisponible : copie le texte du rapport manuellement.";
   }
 });
})();
