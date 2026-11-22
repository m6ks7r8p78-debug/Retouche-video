/* AUBE — interface autonome. Aucun algorithme média n'est remplacé. */
(function(){
"use strict";
const d=document,B=d.body,$=s=>d.querySelector(s),$$=s=>[...d.querySelectorAll(s)];
const paths={
 sun:'<path d="M3 16h18M7 16a5 5 0 0 1 10 0M12 2v4M4.5 6l3 3M19.5 6l-3 3M2 11h3M19 11h3"/>',
 arrow:'<path d="M4 12h16m-7-7 7 7-7 7"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
 video:'<rect x="2" y="5" width="15" height="14" rx="3"/><path d="m17 10 5-3v10l-5-3z"/>',
 photo:'<rect x="2" y="3" width="20" height="18" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="m3 18 5-5 4 4 4-3 5 4"/>',
 sliders:'<path d="M4 7h16M4 17h16M9 4v6M15 14v6"/>',
 close:'<path d="M5 5l14 14M19 5 5 19"/>',
 play:'<path d="m9 5 11 7-11 7z"/>',
 layers:'<rect x="3" y="5" width="12" height="12" rx="2"/><rect x="9" y="10" width="12" height="12" rx="2"/>',
 spark:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>',
 save:'<path d="M12 3v14m-5-5 5 5 5-5M4 20h16"/>',
 dots:'<circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 check:'<path d="m4 12 5 5L20 6"/>',
 pause:'<path d="M8 5v14M16 5v14"/>',
 split:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 2v20"/>',
 eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
};
function icon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.spark)+'</svg>'}
const root=d.createElement("div");root.id="aube-root";
root.innerHTML=
'<div class="ab-container"><header class="ab-nav"><a href="#" class="ab-brand" id="ab-home-link" aria-label="Aube, accueil">'+
 '<span class="ab-symbol">'+icon("sun")+'</span><span><span class="ab-brand-name">AUBE</span><span class="ab-brand-sub">BY RETOUCHEPROAI</span></span></a>'+
 '<nav class="ab-nav-actions" aria-label="Actions"><button type="button" id="ab-tools-top" class="ab-nav-text">'+icon("sliders")+' Outils</button>'+
 '<button type="button" id="ab-models-top" class="ab-nav-text">Modèles IA</button>'+
 '<button type="button" id="ab-options-top" class="ab-iconbutton" aria-label="Outils et réglages">'+icon("dots")+'</button></nav></header>'+
 '<main><section class="ab-home" id="ab-home">'+
 '<div class="ab-hero-copy"><div class="ab-eyebrow">LA RESTAURATION, AUTREMENT</div>'+
 '<h1 class="ab-title">Le temps<br>passe.<br><em>Pas les<br>souvenirs.</em></h1>'+
 '<p class="ab-intro">Donne une nouvelle lumière à tes photos et vidéos. Un studio intelligent qui révèle les détails, sans effacer leur histoire.</p>'+
 '<button type="button" class="ab-primary ab-primary-crafted" id="ab-start"><span class="ab-primary-icon">'+icon("spark")+'</span><span class="ab-primary-label">Réveiller un souvenir</span><span class="ab-primary-arrow">'+icon("arrow")+'</span></button>'+
 '<p class="ab-micro"><i></i>Gratuit · Sans compte · Traitement local par défaut</p></div>'+
 '<div class="ab-art" role="img" aria-label="Illustration originale : un souvenir de montagne au coucher du soleil renaît dans un cadre lumineux">'+
 '<div class="ab-art-halo"></div><div class="ab-art-ring"></div>'+
 '<div class="ab-card-photo"><div class="ab-scene"><div class="ab-mountain"></div><div class="ab-mountain ab-near"></div><div class="ab-grain"></div></div>'+
 '<div class="ab-photo-caption"><span>ÉTÉ · SOUVENIR</span><span>UN INSTANT RETROUVÉ</span></div></div>'+
 '<div class="ab-art-tag"><span class="ab-spark">'+icon("spark")+'</span><span><strong>Chaque détail compte</strong><small>Restauration sur mesure</small></span></div>'+
 '<div class="ab-art-orbit">LUMIÈRE / MÉMOIRE</div></div></section>'+
 '<div class="ab-journey" aria-label="Étapes">'+
 '<div class="ab-step"><b>01</b><span><strong>Importer</strong>Une photo ou une vidéo</span></div>'+
 '<div class="ab-step"><b>02</b><span><strong>Révéler</strong>Amélioration intelligente</span></div>'+
 '<div class="ab-step"><b>03</b><span><strong>Conserver</strong>Ton souvenir restauré</span></div></div></main>'+
 '<section class="ab-work" id="ab-work" hidden aria-label="Espace de restauration">'+
 '<div class="ab-work-head"><div><span class="ab-eyebrow">TON ESPACE DE RESTAURATION</span>'+
 '<h1 id="ab-work-title">Ton souvenir</h1><p class="ab-caption" id="ab-file-text">Analyse de ton fichier.</p></div>'+
 '<span class="ab-pill" id="ab-state-pill">Prêt</span></div>'+
 '<div class="ab-grid-work"><div class="ab-work-preview">'+
 '<div class="ab-render" id="ab-render"></div>'+
 '<div class="ab-viewer" id="ab-viewer"><span class="ab-preview-label" id="ab-preview-label">AMÉLIORÉ</span><span id="ab-live-badge"></span>'+
 '<div class="ab-opening" id="ab-opening" aria-live="polite"><span class="ab-opening-orb"></span><strong>Ouverture de ton souvenir…</strong><small id="ab-opening-sub"></small></div>'+
 '</div>'+
 '<div class="ab-scrubber" id="ab-scrubber"><div id="ab-timeline"></div><div class="ab-scrubber-line"><span id="ab-time"></span>'+
 '<div class="ab-ctrls"><button type="button" id="ab-play" class="ab-ctrl ab-ctrl-play" aria-label="Lire">'+icon("play")+'<span>Lire</span></button>'+
 '<button type="button" id="ab-compare" class="ab-ctrl ab-ctrl-hold" aria-label="Maintenir pour voir l’original">'+icon("eye")+'<span>Maintenir : avant</span></button>'+
 '<button type="button" id="ab-split" class="ab-ctrl ab-ctrl-icon" aria-pressed="false" aria-label="Comparer avec un curseur">'+icon("split")+'</button></div></div></div>'+
 '<div class="ab-work-tools"><button type="button" class="ab-button" id="ab-new">'+icon("upload")+' Autre fichier</button>'+
 '<button type="button" class="ab-button" id="ab-tools">'+icon("sliders")+' Outils avancés</button></div></div>'+
 '<div class="ab-panel"><h2>Redonner vie à l’image</h2><p>L’Aube prépare le traitement. Tu gardes la main sur le résultat.</p>'+
 '<div id="ab-quality-group"><h3>Qualité de sortie</h3><div class="ab-options" id="ab-quality">'+
 '<button type="button" class="ab-opt" data-ab-q="3840">4K<small>Haute définition</small></button>'+
 '<button type="button" class="ab-opt" data-ab-q="1920">Full HD<small>Équilibré</small></button>'+
 '<button type="button" class="ab-opt" data-ab-q="-1">Original<small>Sans agrandir</small></button></div></div>'+
 '<h3>Style de restauration</h3><div class="ab-options" id="ab-profiles">'+
 '<button type="button" class="ab-opt" data-ab-prof="naturel">Naturel<small>Fidèle</small></button>'+
 '<button type="button" class="ab-opt" data-ab-prof="equilibre">Équilibré<small>Adaptatif</small></button>'+
 '<button type="button" class="ab-opt" data-ab-prof="details">Détails<small>Accentué</small></button></div>'+
 '<p class="ab-status" id="ab-analysis" role="status" aria-live="polite">Analyse automatique en attente.</p>'+
 '<button type="button" class="ab-primary ab-primary-crafted" id="ab-enhance"><span class="ab-primary-icon">'+icon("spark")+'</span><span class="ab-primary-label">Lancer la restauration</span><span class="ab-primary-arrow">'+icon("arrow")+'</span></button>'+
 '<button type="button" class="ab-button ab-save" id="ab-save">'+icon("save")+' Enregistrer le souvenir</button>'+
 '<button type="button" class="ab-button" id="ab-after-compare" hidden style="width:100%;margin-top:10px">'+icon("layers")+' Créer un avant / après</button>'+
 '</div></div></section>'+
 '<footer class="ab-footer"><span>AUBE · Une expérience RetoucheProAI</span><span>'+
 '<a href="guide.html">Guide</a> · <a href="confidentialite.html">Confidentialité</a> · <a href="mentions-legales.html">Mentions légales</a></span></footer></div>';
B.prepend(root);
const modal=d.createElement("div");modal.className="ab-overlay";modal.id="ab-import";modal.setAttribute("aria-hidden","true");
modal.innerHTML='<div class="ab-dialog" role="dialog" aria-modal="true" aria-labelledby="ab-import-title">'+
 '<button class="ab-close" type="button" data-ab-close aria-label="Fermer">'+icon("close")+'</button>'+
 '<span class="ab-eyebrow">TON HISTOIRE COMMENCE ICI</span><h2 id="ab-import-title">Quel souvenir veux-tu réveiller ?</h2>'+
 '<p>Choisis un fichier de ton iPhone. L’Aube s’adapte à son format.</p>'+
 '<button type="button" class="ab-choice" id="ab-pick-video"><span class="ab-choice-icon">'+icon("video")+'</span>'+
 '<span class="ab-choice-text"><strong>Une vidéo</strong><small>MP4, MOV · vieux téléphones, films de famille</small></span><span class="ab-choice-arr">'+icon("arrow")+'</span></button>'+
 '<button type="button" class="ab-choice" id="ab-pick-photo"><span class="ab-choice-icon">'+icon("photo")+'</span>'+
 '<span class="ab-choice-text"><strong>Une photo</strong><small>JPEG, PNG, HEIC · souvenirs abîmés ou flous</small></span><span class="ab-choice-arr">'+icon("arrow")+'</span></button></div>';
B.appendChild(modal);
const drawer=d.createElement("div");drawer.id="ab-drawer";drawer.className="ab-overlay ab-drawer";drawer.setAttribute("aria-hidden","true");
drawer.innerHTML='<div class="ab-dialog" role="dialog" aria-modal="true" aria-labelledby="ab-tools-title">'+
 '<button class="ab-close" type="button" data-ab-close aria-label="Fermer">'+icon("close")+'</button>'+
 '<span class="ab-eyebrow">TOUS TES OUTILS</span><h2 id="ab-tools-title">Le studio complet.</h2>'+
 '<p>Les fonctions avancées sont là lorsque tu en as besoin.</p>'+
 '<div class="ab-quick"><button type="button" data-ab-proxy="pickv">Restaurer un visage</button>'+
 '<button type="button" data-ab-proxy="picke">Effacer une zone</button>'+
 '<button type="button" data-ab-proxy="pickm">Regrouper les vidéos</button>'+
 '<button type="button" data-ab-proxy="mdlb">Gérer les modèles IA</button>'+
 '<button type="button" data-ab-proxy="stb">Paramètres et confidentialité</button>'+
 '<button type="button" data-ab-proxy="modeb" id="ab-expert" aria-pressed="false">Mode expert</button></div>'+
 '<details><summary>Réglages et qualité</summary><div id="ab-more-settings"></div></details>'+
 '<details><summary>Montage et vidéo</summary><div id="ab-more-tools"></div></details>'+
 '<div id="ab-more-extras"></div></div>';
B.appendChild(drawer);
const prog=d.createElement("div");prog.id="ab-progress-overlay";prog.className="ab-progress-shade";
prog.innerHTML='<div class="ab-progress-card" role="status" aria-live="polite">'+
 '<div class="ab-progress-orb">'+icon("sun")+'</div><span class="ab-eyebrow">RESTAURATION EN COURS</span>'+
 '<h2>La lumière revient.</h2><p id="ab-progress-message">Traitement du fichier en cours.</p>'+
 '<div class="ab-percent" id="ab-percent">0 %</div><div class="ab-track" id="ab-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="ab-fill"></i></div>'+
 '<button type="button" class="ab-button" id="ab-cancel" disabled>Annulation indisponible</button></div>';
B.appendChild(prog);
let prevFocus=null,kind="";
function closeAll(){for(const p of [modal,drawer]){p.classList.remove("ab-visible");p.setAttribute("aria-hidden","true")}
 B.style.overflow="";if(prevFocus&&prevFocus.focus)prevFocus.focus();prevFocus=null}
function open(panel){closeAll();prevFocus=d.activeElement;panel.classList.add("ab-visible");panel.setAttribute("aria-hidden","false");
 B.style.overflow="hidden";const first=panel.querySelector(".ab-close");if(first)first.focus()}
$$("[data-ab-close]").forEach(b=>b.addEventListener("click",closeAll));
[modal,drawer].forEach(p=>p.addEventListener("mousedown",e=>{if(e.target===p)closeAll()}));
d.addEventListener("keydown",e=>{if(e.key==="Escape"){closeAll()}});
function toast(message){const prior=$("#ab-toast");if(prior)prior.remove();const p=d.createElement("p");p.id="ab-toast";p.className="ab-toast";p.setAttribute("role","status");p.textContent=message;B.appendChild(p);setTimeout(()=>p.remove(),3800)}
const start=()=>open(modal);
$("#ab-start").addEventListener("click",start);
$("#ab-new").addEventListener("click",start);
$("#ab-home-link").addEventListener("click",e=>{e.preventDefault();if(B.classList.contains("loaded")){start()}else{root.scrollIntoView({behavior:"smooth"})}});
function selectFile(type){
 const input=$(type==="photo"?"#fp":"#f");
 if(!input){toast("Le sélecteur de fichiers est indisponible.");return}
 kind=type;closeAll();input.click();
}
$("#ab-pick-photo").addEventListener("click",()=>selectFile("photo"));
$("#ab-pick-video").addEventListener("click",()=>selectFile("video"));
for(const [s,fn] of [["#ab-tools-top",()=>open(drawer)],["#ab-tools",()=>open(drawer)],
 ["#ab-options-top",()=>open(drawer)],["#ab-models-top",()=>$("#mdlb")?.click()]])$(s)?.addEventListener("click",fn);
drawer.addEventListener("click",e=>{const btn=e.target.closest("[data-ab-proxy]");if(!btn)return;
 const original=$("#"+btn.dataset.abProxy);if(!original||original.disabled){toast("Cet outil est indisponible.");return}
 if(btn.dataset.abProxy==="modeb"){original.click();btn.setAttribute("aria-pressed",String(!B.classList.contains("simple")));btn.textContent=B.classList.contains("simple")?"Mode expert":"Mode simple";return}
 closeAll();original.click();
 if(btn.dataset.abProxy==="pickm"){const target=$("#mg");if(target&&!target.hidden)open(drawer)}
});
const mediaFile=type=>{kind=type;const inp=$(type==="photo"?"#fp":"#f");startOpening(inp?.files?.[0]);requestAnimationFrame(refresh)};
$("#f")?.addEventListener("change",()=>mediaFile("video"));
$("#fp")?.addEventListener("change",()=>mediaFile("photo"));
for(const target of ["#ab-home","#ab-viewer"]){const node=$(target);
 ["dragenter","dragover"].forEach(ev=>node.addEventListener(ev,e=>{e.preventDefault();node.classList.add("ab-dropzone")}));
 ["dragleave","drop"].forEach(ev=>node.addEventListener(ev,e=>{e.preventDefault();node.classList.remove("ab-dropzone")}));
 node.addEventListener("drop",e=>{const files=e.dataTransfer?.files;if(!files?.length)return;const file=files[0];
 const photo=file.type.startsWith("image/"),video=file.type.startsWith("video/");
 if(!photo&&!video){toast("Format non reconnu : choisis une photo ou une vidéo.");return}
 const input=$(photo?"#fp":"#f");if(!input)return;
 try{input.files=files;kind=photo?"photo":"video";input.dispatchEvent(new Event("change",{bubbles:true}))}
 catch(err){toast("L’import direct n’est pas disponible. Utilise le bouton pour choisir un fichier.")}
 })}
// Déplacer uniquement les surfaces techniques nécessaires : nouveau DOM de présentation, anciens IDs préservés.
const attach=(id,selector)=>{const e=$("#"+id),target=$(selector);if(e&&target)target.appendChild(e)};
attach("inst",".ab-hero-copy");attach("cv","#ab-viewer");attach("tm","#ab-timeline");attach("tc","#ab-time");
for(const id of ["ri","pv","ba","rv"])attach(id,"#ab-render");
attach("tp2","#ab-more-settings");attach("tp3","#ab-more-tools");
attach("mg","#ab-more-extras");attach("bt","#ab-more-extras");attach("activite","#ab-more-extras");
for(const id of ["kbres","bares"])attach(id,"#ab-more-extras");
/* Avant / après : maintenir le bouton (ou l'image) montre l'original, relâcher revient à l'amélioré (vraie bascule du moteur #cmp). */
const holdBtn=$("#ab-compare"),cmpB=$("#cmp"),cvB=$("#cv");let holding=false,holdT=0,holdXY=null;
const pe=(t)=>{try{cmpB&&cmpB.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,pointerType:"touch"}))}catch(e){}};
function holdOn(){if(holding||!cmpB)return;holding=true;pe("pointerdown");root.classList.add("ab-holding");$("#ab-preview-label").textContent="ORIGINAL";try{navigator.vibrate&&navigator.vibrate(8)}catch(e){}}
function holdOff(){clearTimeout(holdT);holdXY=null;if(!holding)return;holding=false;pe("pointerup");root.classList.remove("ab-holding");$("#ab-preview-label").textContent="AMÉLIORÉ"}
holdBtn.addEventListener("click",e=>e.preventDefault());
holdBtn.addEventListener("pointerdown",e=>{e.preventDefault();try{holdBtn.setPointerCapture(e.pointerId)}catch(_){}holdOn()});
["pointerup","pointercancel","lostpointercapture"].forEach(n=>holdBtn.addEventListener(n,holdOff));
holdBtn.addEventListener("contextmenu",e=>e.preventDefault());
holdBtn.addEventListener("keydown",e=>{if((e.key===" "||e.key==="Enter")&&!e.repeat){e.preventDefault();holdOn()}});
holdBtn.addEventListener("keyup",e=>{if(e.key===" "||e.key==="Enter")holdOff()});
const splitOn=()=>$("#spl")?.getAttribute("aria-pressed")==="true";
if(cvB){cvB.addEventListener("pointerdown",e=>{if(splitOn())return;holdXY=[e.clientX,e.clientY];clearTimeout(holdT);holdT=setTimeout(()=>{if(holdXY)holdOn()},170)});
 cvB.addEventListener("pointermove",e=>{if(holdXY&&!holding&&Math.hypot(e.clientX-holdXY[0],e.clientY-holdXY[1])>9){clearTimeout(holdT);holdXY=null}});
 ["pointerup","pointercancel","pointerleave"].forEach(n=>cvB.addEventListener(n,holdOff));
 cvB.addEventListener("contextmenu",e=>e.preventDefault())}
window.addEventListener("blur",holdOff);d.addEventListener("visibilitychange",holdOff);
/* Ouverture : l'espace de travail s'affiche dès le choix du fichier, sans attendre que le lecteur ait lu le fichier. */
let opening=false,openT=0;
function startOpening(file){if(!file)return;opening=true;clearTimeout(openT);openT=setTimeout(()=>{opening=false;schedule()},45000);
 const mb=file.size/1048576;$("#ab-opening-sub").textContent=file.name+" · "+(mb<1?Math.max(1,Math.round(file.size/1024))+" Ko":mb.toFixed(mb>=10?0:1).replace(".",",")+" Mo");refresh()}
function legacy(id){const e=$("#"+id);if(e&&!e.disabled){e.click();return true}return false}
$("#ab-play").addEventListener("click",()=>legacy("pp"));
$("#ab-split").addEventListener("click",()=>{legacy("spl");$("#ab-split").setAttribute("aria-pressed",String($("#spl")?.getAttribute("aria-pressed")==="true"))});
/* Lire / Pause : l'étiquette suit le vrai lecteur */
const syncPlay=()=>{try{const playing=typeof v!=="undefined"&&!v.paused&&!v.ended;const b=$("#ab-play");b.innerHTML=icon(playing?"pause":"play")+"<span>"+(playing?"Pause":"Lire")+"</span>";b.setAttribute("aria-label",playing?"Pause":"Lire");b.classList.toggle("ab-on",playing)}catch(e){}};
try{["play","playing","pause","ended","emptied"].forEach(n=>v.addEventListener(n,syncPlay))}catch(e){}
$("#ab-enhance").addEventListener("click",()=>{if(!legacy("ex"))toast("Le traitement n’est pas disponible pour ce fichier.")});
$("#ab-save").addEventListener("click",()=>{if(!legacy("sv"))toast("L’enregistrement n’est pas encore disponible.")});
$("#ab-after-compare").addEventListener("click",()=>{if(!legacy("bab")&&!legacy("bas2"))toast("La comparaison n’est pas disponible.")});
$("#ab-cancel").addEventListener("click",()=>{const x=$("#ex");if(x&&/annul/i.test(x.textContent||""))x.click()});
$$("[data-ab-q]").forEach(b=>b.addEventListener("click",()=>{const legacyButton=$('[data-q="'+b.dataset.abQ+'"]');if(legacyButton)legacyButton.click();else if($("#q")){$("#q").value=b.dataset.abQ;$("#q").dispatchEvent(new Event("change",{bubbles:true}))}requestAnimationFrame(refresh)}));
$$("[data-ab-prof]").forEach(b=>b.addEventListener("click",()=>{const legacyButton=$('[data-prof="'+b.dataset.abProf+'"]');if(legacyButton)legacyButton.click();requestAnimationFrame(refresh)}));
function pressed(group,val,attr){$$(group+" [data-ab-"+attr+"]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset["ab"+attr[0].toUpperCase()+attr.slice(1)]===val)))}
function refresh(){
 const ready=B.classList.contains("loaded")&&!$("#app")?.hidden;
 const v0=d.querySelector("body>video");if(opening&&ready&&(kind==="photo"||(v0&&v0.readyState>=1&&!/Chargement/.test($("#st0")?.textContent||""))))opening=false;
 const loaded=ready||opening;root.classList.toggle("ab-opening-now",opening);
 const out=$("#out"),pg=$("#pg"),exb=$("#ex"),st1t=($("#st1")?.textContent||"").trim();
 const video=loaded&&pg&&!pg.hidden,photoBusy=loaded&&!video&&!!exb?.disabled&&/…$|en cours/i.test(st1t)&&!/Terminé/.test(st1t);
 const running=video||photoBusy,result=loaded&&out&&!out.hidden&&!running;
 $("#ab-home").hidden=loaded;$("#ab-work").hidden=!loaded;
 root.classList.toggle("ab-result-ready",!!result);
 B.classList.toggle("ab-processing",!!running);B.classList.toggle("ab-indetermine",!!photoBusy);
 root.classList.toggle("ab-loaded",!!loaded);
 if(!loaded)return;
 const isPhoto=kind==="photo"||(kind!=="video"&&$("#qwrap")?.hidden);
 $("#ab-work-title").textContent=result?"La magie du résultat.":isPhoto?"Ta photo, révélée.":"Ta vidéo, retrouvée.";
 $("#ab-state-pill").textContent=running?"En cours":result?"Terminé":"Prêt à améliorer";
 $("#ab-file-text").textContent=isPhoto?"Restauration de ta photo":"Restauration de ta vidéo";
 $("#ab-quality-group").hidden=!!isPhoto;
 root.classList.toggle("ab-photo-mode",!!isPhoto);
 const rec=$("#rec_t"),st=$("#st0"),st1=$("#st1");
 const message=(rec&&!$("#rec")?.hidden?rec.textContent:st?.textContent||"").trim();
 $("#ab-analysis").textContent=result?"Ton souvenir est restauré.":message||"Analyse automatique prête.";
 const q=$("#q");pressed("#ab-quality",q?.value||"1920","q");
 const originalProf=$('#prof [data-prof][aria-pressed="true"]');
 pressed("#ab-profiles",originalProf?.dataset.prof||"equilibre","prof");
 const ex=$("#ex"),sv=$("#sv");
 $("#ab-enhance").disabled=!!(ex?.disabled||running);
 $("#ab-enhance .ab-primary-label").textContent=isPhoto?"Restaurer cette photo":q?.value==="3840"?"Restaurer en 4K":q?.value==="1920"?"Restaurer en Full HD":"Restaurer le fichier";
 $("#ab-save").disabled=!sv||sv.hidden||sv.disabled;
 $("#ab-save").textContent=isPhoto?"Enregistrer la photo":"Enregistrer la vidéo";
 $("#ab-after-compare").hidden=!(result&&!isPhoto&&!$("#bab")?.hidden);
 $("#ab-render").hidden=!result;
 $("#ab-viewer").hidden=!!result;
 $("#ab-scrubber").hidden=!!result;
 const tc=$("#tc");$("#ab-live-badge").textContent=isPhoto?"PHOTO":"VIDÉO";
 if(photoBusy){
  $("#ab-percent").textContent="";$("#ab-track").removeAttribute("aria-valuenow");
  $("#ab-progress-message").textContent=st1t||"Traitement de la photo…";
  $("#ab-cancel").disabled=true;$("#ab-cancel").textContent="Annulation indisponible pour une photo";
 }else if(running){
  $("#ab-track").setAttribute("aria-valuemin","0");
  const max=Number(pg.max)||1,value=Number(pg.value)||0;
  const progress=Math.max(0,Math.min(100,Math.floor(value/max*100)));
  $("#ab-percent").textContent=progress+" %";$("#ab-fill").style.width=progress+"%";
  $("#ab-track").setAttribute("aria-valuenow",String(progress));
  $("#ab-progress-message").textContent=(st1?.textContent||"").trim()||"Restauration en cours. Durée restante non mesurée.";
  const canCancel=/annul/i.test(ex?.textContent||"");$("#ab-cancel").disabled=!canCancel;
  $("#ab-cancel").textContent=canCancel?"Annuler":"Annulation indisponible";
 }else if(st1t&&/erreur|impossible|échec|refusé/i.test(st1t)&&st1t!==lastErr){lastErr=st1t;toast(st1t.slice(0,160))}

}
let pending=false,lastErr="";
function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;refresh()})}
const observer=new MutationObserver(schedule);
for(const sel of ["#app","#out","#pg","#ex","#sv","#q","#rec","#rec_t","#st0","#st1","#ri","#rv","#pv","#ba"]){
 const n=$(sel);if(n)observer.observe(n,{attributes:true,attributeFilter:["hidden","disabled","value","aria-pressed"],childList:sel==="#st0"||sel==="#st1"||sel==="#rec_t"||sel==="#ex",subtree:sel==="#st0"||sel==="#st1"||sel==="#rec_t"});
}
observer.observe(B,{attributes:true,attributeFilter:["class"]});
if($("#pg"))$("#pg").addEventListener("change",schedule);
$("#q")?.addEventListener("change",schedule);
$$("[data-q],[data-prof]").forEach(b=>b.addEventListener("click",()=>requestAnimationFrame(refresh)));
window.addEventListener("online",()=>toast("Connexion retrouvée."));
window.addEventListener("offline",()=>toast("Hors ligne. Les fonctions installées restent utilisables."));
refresh();
window.__aube={ouvrirImporter:start,ouvrirOutils:()=>open(drawer),fermer:closeAll,actualiser:refresh,version:"aube-1.0"};
window.__lueur=window.__aube;
})();