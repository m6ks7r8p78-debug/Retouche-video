/* AUBE — parcours complet v2.1. Présentation uniquement ; moteur intact. */
(function(){
"use strict";
const d=document,B=d.body,$=s=>d.querySelector(s),$$=s=>[...d.querySelectorAll(s)];
if(!$("#aube-root")||!window.__aube)return;
const svg=(path)=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';
const icons={
check:'<path d="m4 12 5 5L20 6"/>',
file:'<path d="M7 2h7l5 5v15H7zM14 2v5h5M10 13h6M10 17h6"/>',
spark:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>',
save:'<path d="M12 3v13m-5-5 5 5 5-5M4 20h16"/>',
alert:'<path d="M12 3 2 21h20L12 3zm0 6v5m0 4h.01"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
film:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 3v18M16 3v18"/>',
edit:'<path d="M4 17 17 4l3 3L7 20H4z"/>',
};
function el(tag,attrs,html){const x=d.createElement(tag);for(const [k,v] of Object.entries(attrs||{}))x.setAttribute(k,v);if(html!==undefined)x.innerHTML=html;return x}
const work=$("#ab-work"),head=$(".ab-work-head"),panel=$(".ab-panel"),render=$("#ab-render");
const track=el("div",{class:"ab-steps-work",id:"ab-steps-work","aria-label":"Progression de la restauration"},
 ['Importer','Analyser','Restaurer','Conserver'].map((t,i)=>'<div class="ab-step-work" data-ab-step="'+(i+1)+'"><span class="ab-step-index">'+String(i+1).padStart(2,'0')+'</span><span>'+t+'</span></div>').join(""));
head.after(track);
const fileCard=el("div",{class:"ab-media-card",id:"ab-media-card"},'<span class="ab-media-icon">'+svg(icons.file)+'</span><span class="ab-media-copy"><strong id="ab-media-name">Souvenir importé</strong><small id="ab-media-detail">Analyse en cours</small></span><span class="ab-media-state" id="ab-media-state">'+svg(icons.check)+'</span>');
track.after(fileCard);
const insight=el("section",{class:"ab-insights",id:"ab-insights","aria-label":"Analyse automatique"},
 '<div class="ab-insight-title"><span class="ab-insight-spark">'+svg(icons.spark)+'</span><span><strong>Lecture intelligente</strong><small>Analyse des défauts et choix du rendu</small></span></div><div id="ab-insight-real"></div>');
const action=$("#ab-enhance");action.before(insight);
const rec=$("#rec");if(rec)$("#ab-insight-real").appendChild(rec);
const output=el("section",{class:"ab-output-intent",id:"ab-output-intent"},
 '<div class="ab-output-text"><span class="ab-output-glyph">'+svg(icons.film)+'</span><div><strong>Préparer pour X</strong><small>Exporter une version adaptée au réseau social</small></div></div><button type="button" id="ab-x-toggle" role="switch" aria-checked="false" aria-label="Préparer pour X" class="ab-switch"><span></span></button>');
action.before(output);
const outcome=el("section",{class:"ab-outcome",id:"ab-outcome",hidden:""},
 '<div class="ab-outcome-emblem">'+svg(icons.check)+'</div><div><span class="ab-eyebrow">UN SOUVENIR RETROUVÉ</span><h2>Il mérite de rester.</h2><p>Regarde les détails retrouvés, compare avec l’original et conserve le fichier sur ton appareil.</p></div>');
fileCard.after(outcome);
const resultNotes=el("div",{class:"ab-result-notes",id:"ab-result-notes",hidden:""},
 '<strong>Ton fichier est prêt</strong><p>L’Aube conserve les dimensions et le format autorisés par le moteur. La qualité dépend toujours du fichier d’origine.</p>');
panel.insertBefore(resultNotes,insight);
const subt=el("p",{class:"ab-output-note",id:"ab-output-note"},'Tu peux modifier le rendu avant de lancer un nouveau traitement.');
panel.appendChild(subt);
const again=el("button",{type:"button",class:"ab-button ab-again",id:"ab-again",hidden:""},svg(icons.edit)+' Refaire une restauration');
panel.appendChild(again);
again.addEventListener("click",()=>{const o=$("#out"),pg=$("#pg");if(!o?.hidden&&pg?.hidden&&$("#ex")&&!$("#ex").disabled){$("#ex").click()}});
const alert=el("section",{id:"ab-error-box",class:"ab-error-box",role:"alert",hidden:""},
 '<span>'+svg(icons.alert)+'</span><div><strong>Cette étape n’a pas abouti.</strong><p id="ab-error-description">Réessaie ou choisis un autre fichier.</p><button class="ab-button" id="ab-error-retry" type="button">Réessayer</button></div>');
$("#ab-analysis").after(alert);
$("#ab-error-retry").addEventListener("click",()=>{const b=$("#ab-enhance");if(b&&!b.disabled)b.click();else window.__aube.ouvrirImporter()});
const sequence=el("div",{class:"ab-progress-sequence",id:"ab-progress-sequence"},
 '<div>'+svg(icons.check)+'<span>Fichier importé</span></div><div class="ab-current">'+svg(icons.spark)+'<span>Restauration en cours</span></div><div>'+svg(icons.save)+'<span>Enregistrement après traitement</span></div>');
$("#ab-cancel").before(sequence);
const progTitle=$("#ab-progress-overlay h2");if(progTitle)progTitle.textContent="Chaque image compte.";
const progSub=el("p",{id:"ab-progress-subtitle",class:"ab-progress-subtitle"},'Les calculs peuvent être longs selon le fichier et les capacités du téléphone. Ne ferme pas cette page pendant le traitement.');
$("#ab-track").after(progSub);
const xToggle=$("#ab-x-toggle"),x=$("#o_x");
xToggle.addEventListener("click",()=>{if(!x||x.disabled)return;x.click();update()});
const settings=$("#ab-more-settings");
if(settings){
 const enhance=el("p",{class:"ab-drawer-note"},'Le mode automatique reste conseillé. Les réglages ci-dessous agissent directement sur le traitement.');
 settings.prepend(enhance);
}
const tools=$("#ab-more-tools");
if(tools)tools.prepend(el("p",{class:"ab-drawer-note"},'Montage, ralentis et corrections avancées — uniquement lorsque le média est compatible.'));
const resultControls=el("div",{class:"ab-result-controls",id:"ab-result-controls"},'');
render.after(resultControls);
for(const id of ["pvsolo","bat"]){const n=$("#"+id);if(n)resultControls.append(n)}
const moreResult=el("button",{class:"ab-button ab-result-more",type:"button",id:"ab-result-more"},svg(icons.spark)+' Voir les autres possibilités');
resultControls.append(moreResult);moreResult.addEventListener("click",()=>window.__aube.ouvrirOutils());
let oldState="",lastMessage="",poll=null;
const strip=s=>String(s||"").replace(/\s+/g," ").trim();
function update(){
 const loaded=(B.classList.contains("loaded")&&!$("#app")?.hidden)||$("#aube-root").classList.contains("ab-opening-now");
 if(!loaded){oldState="";return}
 const pg=$("#pg"),out=$("#out"),busy=!!(pg&&!pg.hidden)||B.classList.contains("ab-processing"),finished=!!(out&&!out.hidden&&!busy);
 const state=busy?"processing":finished?"result":"analysis";
 const isPhoto=($("#qwrap")?.hidden)||!!(window.__photoName&&!$("#f")?.files?.length);
 B.classList.toggle("ab-finished",finished);
 B.classList.toggle("ab-analyzing",!busy&&!finished);
 const mark=busy?3:finished?4:2;
 $$("#ab-steps-work [data-ab-step]").forEach(x=>{const n=Number(x.dataset.abStep);x.classList.toggle("ab-step-now",n===mark);x.classList.toggle("ab-step-done",n<mark)});
 $("#ab-outcome").hidden=!finished;$("#ab-result-notes").hidden=!finished;
 $("#ab-again").hidden=!finished;$("#ab-result-controls").hidden=!finished;
 $("#ab-enhance").hidden=finished;
 $("#ab-output-intent").hidden=finished||isPhoto;
 $("#ab-quality-group").hidden=finished||isPhoto;
 $("#ab-profiles").hidden=finished;
 const panelHeading=$(".ab-panel h2");
 if(panelHeading)panelHeading.textContent=finished?"Ton souvenir, sauvegardé en un geste.":"Redonner vie à l’image";
 const hints=$$(".ab-panel>h3");hints.forEach(y=>y.hidden=finished);
 const filename=isPhoto?window.__photoName:$("#f")?.files?.[0]?.name;
 $("#ab-media-name").textContent=filename||"Souvenir importé";
 const bytes=isPhoto?window.__photoFile?.size:$("#f")?.files?.[0]?.size;
 const size=!bytes?"":bytes<1048576?Math.max(1,Math.round(bytes/1024))+" Ko":(bytes/1048576).toFixed(bytes>=10485760?0:1).replace(".",",")+" Mo";
 $("#ab-media-detail").textContent=(isPhoto?"Photo":"Vidéo")+(size?" · "+size:"")+(finished?" · Traitement terminé":busy?" · En traitement":" · Analyse automatique");
 $("#ab-media-state").innerHTML=busy?svg(icons.clock):svg(icons.check);
 if(xToggle){xToggle.setAttribute("aria-checked",String(!!x?.checked));xToggle.disabled=!x||x.disabled||isPhoto}
 if(finished){
  $("#ab-file-text").textContent="Ton résultat est prêt. Compare-le et enregistre-le.";
  $("#ab-result-more").hidden=true;
  $("#ab-outcome").scrollIntoView&&oldState!=="result"&&$("#ab-outcome").scrollIntoView({block:"nearest",behavior:"smooth"});
 }
 const status=strip($("#st1")?.textContent||$("#st0")?.textContent);
 const error=!finished&&!busy&&/erreur|impossible|échec|refusé|non pris en charge|saturé|incompatible/i.test(status);
 $("#ab-error-box").hidden=!error;
 if(error&&status!==lastMessage){$("#ab-error-description").textContent=status;lastMessage=status}
 const ai=strip($("#rec_t")?.textContent);
 $("#ab-insights").hidden=finished||busy||(!ai&&$("#rec")?.hidden);
 if(busy&&pg&&!pg.hidden){
  const value=Number(pg?.value)||0,max=Number(pg?.max)||1;
  const v=Math.max(0,Math.min(100,Math.floor(100*value/max)));
  $("#ab-percent").textContent=v+" %";
  $("#ab-fill").style.width=v+"%";
  $("#ab-track").setAttribute("aria-valuenow",String(v));
  if(status)$("#ab-progress-message").textContent=status;
 }
 oldState=state;
}
const obs=new MutationObserver(()=>{requestAnimationFrame(update)});
for(const id of ["app","out","pg","rec","rec_t","st1","st0","o_x","qwrap"]){
 const n=$("#"+id);if(n)obs.observe(n,{attributes:true,attributeFilter:["hidden","checked","disabled"],childList:id==="st1"||id==="st0"||id==="rec_t",subtree:id==="st1"||id==="st0"||id==="rec_t"});
}
obs.observe(B,{attributes:true,attributeFilter:["class"]});
["#f","#fp","#q","#o_x"].forEach(id=>$(id)?.addEventListener("change",()=>requestAnimationFrame(update)));
["#ab-enhance","#ab-save"].forEach(id=>$(id)?.addEventListener("click",()=>requestAnimationFrame(update)));
poll=setInterval(()=>{if(B.classList.contains("ab-processing"))update()},220);
update();
window.__aube.etapes={actualiser:update,version:"2.1"};
})();