"use strict";
/**
 * P29 browser renderer, no cookies, storage, forms, media, fetch, workers or
 * export/processing actions. Only generated, whitelisted numeric evidence.
 */
(()=> {
 const LABEL="retouche-cinema-p29-synthetic-mobile-preview-v1";
 const $=id=>document.getElementById(id);
 const status=$("status"),report=$("report"),button=$("details-button"),details=$("details");
 const data=window.CINEMA_P29_SYNTHETIC;
 const bounded=x=>Number.isSafeInteger(x)&&x>=0&&x<=9;
 const valid=Boolean(data&&typeof data==="object"&&
   data.schema===LABEL&&data.status==="verified_synthetic_preview_only"&&
   data.source_label==="Démonstration de laboratoire — dessins fictifs"&&
   data.benchmark_cases===9&&data.user_video_analyzed===false&&
   data.may_modify_or_export_video===false&&
   data.physical_iphone_safari_tested===false&&
   data.recommendation===null&&
   bounded(data.cases_color_error_increase)&&
   bounded(data.cases_file_larger_no_gain)&&
   bounded(data.cases_temporal_pixel_change)&&
   data.cases_audio_preserved===9&&
   data.cases_file_larger_no_gain<=data.cases_color_error_increase);
 // Fail closed for missing, altered or unverifiable evidence.
 if(!valid){
   status.textContent="Diagnostic indisponible : preuves de laboratoire non vérifiées.";
   report.hidden=true;button.disabled=true;details.hidden=true;
   return;
 }
 status.className="status status-ready";
 status.textContent="✓ Mesures de laboratoire vérifiées · données fictives";
 $("color-count").textContent=data.cases_color_error_increase+" / "+data.benchmark_cases;
 $("size-count").textContent=data.cases_file_larger_no_gain+" / "+data.benchmark_cases;
 $("summary").textContent="Dans "+data.cases_color_error_increase+
   " essais sur "+data.benchmark_cases+", la deuxième compression a augmenté "+
   "l'erreur de couleur mesurée sur nos dessins fictifs.";
 $("additional").textContent=data.cases_audio_preserved+
   " pistes audio sur 9 sont restées identiques ; "+
   data.cases_temporal_pixel_change+
   " essais montrent des différences supplémentaires entre images. "+
   "Ces différences ne prouvent pas des saccades ressenties.";
 report.hidden=false;
 button.disabled=false;
 button.addEventListener("click",()=>{
   const open=details.hidden;
   details.hidden=!open;
   button.setAttribute("aria-expanded",String(open));
   $("chevron").textContent=open?"−":"＋";
 });
})();
