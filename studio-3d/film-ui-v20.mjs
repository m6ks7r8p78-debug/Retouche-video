/** Film Studio v0.20 — maillage triangulé continu de la manchette poignet–paume.
 * Aucune API distante, aucune lecture de fichiers privés.
 */
import './generateur.js';
import {buildSyntheticFilmSceneV20} from './film-cigarette-cylinder-v20.mjs';
import {gripInspectionTime,cameraForGrip} from './film-inspection-v10.mjs';
import {readSyntheticGLB,sampleSyntheticPose,paintSyntheticScene} from './film-viewer-v03.mjs';
import {createWebGLFilmRenderer} from './film-webgl-v04.mjs';
import {sampleCadence,makeLocalDiagnostic} from './film-diagnostic-v06.mjs';
import {createExportFile,canShareLocally,shareLocalFile} from './film-share-v20.mjs';

const find=id=>document.querySelector(id);
let canvas=find('#view');
const prompt=find('#prompt'),create=find('#create'),
 play=find('#play'),seek=find('#seek'),clock=find('#clock'),
 status=find('#status'),download=find('#download'),
 steps=find('#steps'),limits=find('#limits'),
 runDiagnostic=find('#runDiagnostic'),saveDiagnostic=find('#saveDiagnostic'),diagnosticStatus=find('#diagnosticStatus'),
 shareGlb=find('#shareGlb'),shareDiagnostic=find('#shareDiagnostic'),shareStatus=find('#shareStatus'),
 focusHand=find('#focusHand'),focusInfo=find('#focusInfo');
let gpu=null,ctx=null,gl=null,glError=null;
try {
 gl=canvas.getContext('webgl2',{alpha:false,antialias:true,preserveDrawingBuffer:true});
 if(gl)gpu=createWebGLFilmRenderer(gl);
}catch(error){glError=error?.message||'Initialisation WebGL2 impossible';}
if(!gpu){
 // Quand un contexte WebGL a été créé puis les shaders refusés, l'élément
 // Canvas ne peut plus changer de type de contexte. Recréer l'élément.
 if(gl){
   const original=canvas;
   const fresh=document.createElement('canvas');
   for(const attr of original.attributes)fresh.setAttribute(attr.name,attr.value);
   original.replaceWith(fresh);
   canvas=fresh;gl=null;
 }
 try{ctx=canvas.getContext('2d',{alpha:false});}catch{ctx=null;}
}
let previewAvailable=Boolean(gpu||ctx);
canvas.dataset.renderer=gpu?'webgl2':ctx?'canvas2d':'none';
const backend=document.querySelector('#backend');
if(backend)backend.textContent=gpu?
 'Rendu WebGL2 réel des triangles GLB, avec profondeur et lumière simple.':
 ctx?'Repli Canvas 2D : projection approximative, pas un rendu du vrai maillage.':
 'Pas de rendu local possible sur ce navigateur. '+(glError||'');
let scene=null,time=0,playing=false,lastTick=0,url=null,lastGlb=null;
let sceneTimeline=null,viewMode='scene';
let diagnosticUrl=null,diagnosticRunning=false,contextLosses=0,contextRestorations=0;
let diagnosticJson=null,shareBusy=false;
function shareMessage(result){
 if(result.status==='transmis_au_panneau_de_partage')return 'Panneau de partage refermé : vérifier dans Fichiers si vous avez choisi « Enregistrer dans Fichiers ». Aucun enregistrement n’est certifié.';
 if(result.status==='annule')return 'Partage annulé ; le téléchargement classique reste disponible.';
 if(result.status==='non_disponible')return 'Ce navigateur ne prend pas en charge le partage de fichier. Utilisez le téléchargement classique.';
 return result.reason||'Partage non terminé : utiliser le téléchargement classique.';
}
function updateShareGlb(){
 shareGlb.hidden=!(lastGlb&&!shareBusy&&canShareLocally(createExportFile('glb',lastGlb)));
}
function updateShareDiagnostic(){
 shareDiagnostic.hidden=!(diagnosticJson&&!shareBusy&&canShareLocally(createExportFile('diagnostic',diagnosticJson)));
}
function clearDiagnostic(){
 if(diagnosticUrl)URL.revokeObjectURL(diagnosticUrl);
 diagnosticUrl=null;diagnosticJson=null;
 saveDiagnostic.hidden=true;saveDiagnostic.removeAttribute('href');
 shareDiagnostic.hidden=true;
 diagnosticStatus.textContent='Aucun diagnostic lancé. Les résultats restent sur cet appareil.';
}
function canDiagnose(){return Boolean(scene&&previewAvailable&&!diagnosticRunning&&!document.hidden);}
function updateDiagnosticButton(){runDiagnostic.disabled=!canDiagnose();}
let camera={yaw:.30,pitch:.10},pointer=null;
const add=(parent,label)=>{const li=document.createElement('li');li.textContent=String(label);parent.appendChild(li);};
const fmt=t=>Number(t).toFixed(1).replace('.',',');
function update(){
 if(!scene||!previewAvailable)return;
 const rect=canvas.getBoundingClientRect();
 const dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1));
 const width=Math.max(1,Math.min(2048,Math.round(rect.width*dpr)));
 const height=Math.max(1,Math.min(2048,Math.round(rect.height*dpr)));
 if(canvas.width!==width)canvas.width=width;
 if(canvas.height!==height)canvas.height=height;
 const pose=sampleSyntheticPose(scene,time);
 const renderCamera=viewMode==='main'?cameraForGrip(scene,pose,camera):camera;
 canvas.dataset.viewMode=viewMode;
 if(gpu) gpu.render(scene,pose,width,height,renderCamera);
 else paintSyntheticScene(ctx,scene,pose,width,height,renderCamera);
 clock.textContent=fmt(time)+' / '+fmt(pose.duration)+' s';
 seek.value=String(Math.round(time/Math.max(.001,pose.duration)*1000));
}
const halt=()=>{
 playing=false;lastTick=0;
 play.textContent='▶ Lire';
 play.setAttribute('aria-pressed','false');
};
function tick(stamp){
 if(!playing||!scene)return;
 if(lastTick){time=Math.min(scene.clips[0].duration,time+Math.min(.10,Math.max(0,(stamp-lastTick)/1000)));}
 lastTick=stamp;
 if(time>=scene.clips[0].duration){halt();update();return;}
 update();
 window.requestAnimationFrame(tick);
}
focusHand.addEventListener('click',()=>{
 if(!scene||!previewAvailable||!sceneTimeline)return;
 halt();
 if(viewMode==='scene'){
   viewMode='main';time=gripInspectionTime(sceneTimeline);
   focusHand.textContent='Revenir à la scène entière';
   focusHand.setAttribute('aria-pressed','true');
   focusInfo.textContent='Gros plan mobile : la caméra suit le récipient. Faites glisser pour tourner, utilisez la chronologie pour examiner la prise et le dépôt. Ce n’est pas une simulation de contact.';
 }else{
   viewMode='scene';
   focusHand.textContent='Voir la main de près';
   focusHand.setAttribute('aria-pressed','false');
   focusInfo.textContent='Vue entière restaurée. Les distances de surface restent approximatives.';
 }
 update();
});
play.addEventListener('click',()=>{
 if(!scene)return;
 if(playing){halt();return;}
 if(time>=scene.clips[0].duration)time=0;
 playing=true;lastTick=0;play.textContent='⏸ Pause';
 play.setAttribute('aria-pressed','true');
 window.requestAnimationFrame(tick);
});
seek.addEventListener('input',()=>{
 if(!scene)return;
 halt();time=scene.clips[0].duration*Math.max(0,Math.min(1000,Number(seek.value)||0))/1000;
 update();
});
canvas.addEventListener('pointerdown',event=>{
 pointer={x:event.clientX,y:event.clientY,id:event.pointerId};
 if(typeof canvas.setPointerCapture==='function'){
  try{canvas.setPointerCapture(event.pointerId);}catch{/* capture non disponible pour certains gestes WebKit */}
 }
});
canvas.addEventListener('pointermove',event=>{
 if(!pointer||event.pointerId!==pointer.id)return;
 camera.yaw+=(event.clientX-pointer.x)*.009;
 camera.pitch=Math.max(-.35,Math.min(.55,camera.pitch+(event.clientY-pointer.y)*.006));
 pointer.x=event.clientX;pointer.y=event.clientY;
 update();
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{pointer=null;});
window.addEventListener('resize',update);
document.addEventListener('visibilitychange',()=>{if(document.hidden)halt();updateDiagnosticButton();});
window.addEventListener('pagehide',event=>{
 halt();
 // Préserver WebGL, les liens blob et les données lors d'un retour depuis le cache Safari.
 if(!event.persisted){if(url)URL.revokeObjectURL(url);if(gpu)gpu.dispose();}
});
window.addEventListener('pageshow',()=>{if(scene&&previewAvailable)update();updateDiagnosticButton();});
canvas.addEventListener('webglcontextlost',event=>{
 event.preventDefault();contextLosses++;
 halt();previewAvailable=false;play.disabled=true;seek.disabled=true;focusHand.disabled=true;
 updateDiagnosticButton();
 status.textContent='Le contexte WebGL a été interrompu. Tentative de reprise au retour du GPU.';
});
canvas.addEventListener('webglcontextrestored',()=>{
 contextRestorations++;
 if(!gl||!lastGlb||!scene)return;
 try{
   gpu=createWebGLFilmRenderer(gl);
   gpu.prepare(scene,lastGlb);
   previewAvailable=true;play.disabled=false;seek.disabled=false;focusHand.disabled=false;
   update();updateDiagnosticButton();
   status.textContent='Rendu WebGL2 rétabli, scénario conservé localement.';
 }catch(error){
   previewAvailable=false;play.disabled=true;seek.disabled=true;
   status.classList.add('error');
   status.textContent='Restauration WebGL impossible : '+(error?.message||'erreur inconnue');
 }
});
create.addEventListener('click',()=>{
 halt();clearDiagnostic();shareGlb.hidden=true;shareStatus.textContent='';
 viewMode='scene';sceneTimeline=null;focusHand.disabled=true;
 focusHand.textContent='Voir la main de près';focusHand.setAttribute('aria-pressed','false');
 focusInfo.textContent='Créez une scène pour inspecter la main.';
 create.disabled=true;play.disabled=true;seek.disabled=true;runDiagnostic.disabled=true;
 status.classList.remove('error');
 if(url)URL.revokeObjectURL(url);
 url=null;scene=null;lastGlb=null;time=0;download.hidden=true;download.removeAttribute('href');
 steps.replaceChildren();limits.replaceChildren();
 try {
   const output=buildSyntheticFilmSceneV20(prompt.value,globalThis.Retouche3DGenerator);
   if(output.status!=='apercu_partiel_glb_anime'){
     for(const scene of output.project.scenes)for(const step of scene.steps)add(steps,step.intent+' (non animé)');
     add(limits,output.reason);
     status.textContent='Scénario analysé ; aucune animation 3D créée.';
     return;
   }
   const parsed=readSyntheticGLB(output.glb);
   if(gpu)gpu.prepare(parsed,output.glb);
   for(const item of output.timeline)add(steps,item.order+'. '+item.intent.replaceAll('_',' ')+' · '+fmt(item.start)+'–'+fmt(item.end)+' s');
   for(const warning of output.warnings)add(limits,warning);
   url=URL.createObjectURL(new Blob([output.glb],{type:'model/gltf-binary'}));
   download.href=url;download.hidden=false;
   scene=parsed;lastGlb=output.glb;sceneTimeline=output.timeline;
   focusHand.disabled=!previewAvailable||Boolean(output.actionAudit);
   if(output.actionAudit)focusInfo.textContent='Gros plan de tasse non disponible pour la scène de cigarette.';
   updateShareGlb();
   play.disabled=!previewAvailable;seek.disabled=!previewAvailable;
   if(previewAvailable)update();
   updateDiagnosticButton();
   if(output.actionAudit){
     const a=output.actionAudit;
     status.textContent='GLB stylisé créé localement : '+a.episodesVerified+
       ' gestes distincts avec une cigarette unique. Cinq doigts animés avec phalanges effilées. Cigarette à corps cylindrique fermé et filtre visible (sans combustion réelle), index et majeur opposés autour de la tige (sans force physique). Cible filtre–lèvres suivie avec écart maximal mesuré '+(output.lipAudit?Math.round(output.lipAudit.peakApproachGapM*1000)+' mm':'non disponible')+'. Cycles main–bouche et fumée sphéroïdale animés, sans contact physique lèvres certifié, sans fluides physiques et sans MP4 natif. '+
       (gpu?'Rendu WebGL2.':ctx?'Secours Canvas 2D.':'Aperçu indisponible.');
   }else{
   status.textContent='GLB animé créé localement : '+output.animatedActions.length+
     ' gestes, '+fmt(output.duration)+' s. Manchette déformable sur '+output.morphAudit.targetCount+' zones, déplacement maximal estimé '+Math.round(output.morphAudit.maxCoordinateDisplacementM*1000)+' mm (sans skinning). Jonction poignet–paume : un seul maillage triangulé fermé ('+output.continuousAudit.triangles+' triangles), fixé au poignet. Chevauchement estimé manchette–tasse '+Math.round(output.continuousAudit.maxSampledCupPenetrationM*1000)+' mm. Paume réalignée ; chevauchement volumique paume–tasse estimé '+
     Math.round(output.volumeAudit.maxSampledPalmCupPenetrationM*1000)+' mm. Anse ajourée de '+output.handleAudit.handleSegmentCount+' segments. Proximité moyenne maximale doigt–anse '+
     Math.round(output.handleAudit.maxMeanFingertipHandleGapM*1000)+' mm (centres des doigts, sans preuve de collision). Gros plan main disponible. Distance radiale minimale doigt–surface de tasse '+
     Math.round(output.surfaceAudit.minRadialSurfaceGapM*1000)+' mm (estimation, pas un contact vérifié). Cinq doigts articulés ; écart assise '+
     Math.round((output.handSeatAudit.seatedPelvisSurfaceClearanceM??0)*1000)+' mm (visuel seulement). Audit cinématique '+output.motionAudit.sampleHz+
     ' Hz : déplacement maximal '+Math.round(output.motionAudit.maxSpeedMps*100)/100+
     ' m/s, sans saut majeur détecté. '+(gpu?'Rendu WebGL2 des maillages disponible.':
     ctx?'Aperçu de secours Canvas 2D disponible.':'Aperçu indisponible sur ce navigateur.')+
     ' Aucun MP4 généré.';
   }
 }catch(error){
   status.classList.add('error');
   status.textContent='Échec de préparation : '+(error?.message||'Erreur inconnue');
 }finally{create.disabled=false;updateDiagnosticButton();}
});

runDiagnostic.addEventListener('click',async()=>{
 if(!canDiagnose())return;
 halt();diagnosticRunning=true;updateDiagnosticButton();
 const currentScene=scene,currentGlb=lastGlb;
 clearDiagnostic();
 diagnosticStatus.textContent='Analyse de la fluidité en cours (90 images locales, sans transfert).';
 try{
  let position=0;
  const metrics=await sampleCadence({
   nextFrame:()=>new Promise(resolve=>window.requestAnimationFrame(resolve)),
   draw:()=>{
     if(!currentScene||!previewAvailable)return;
     const old=time;
     position=(position+1)%90;
     time=currentScene.clips[0].duration*(position/90);
     update();
     time=old;
   },
   frames:90,
   isActive:()=>document.hidden!==true&&previewAvailable&&scene===currentScene&&lastGlb===currentGlb
  });
  time=0;update();
  const error=(gpu&&gl)?gl.getError():0;
  const report=makeLocalDiagnostic({
   backend:canvas.dataset.renderer,
   canvasWidth:canvas.width,canvasHeight:canvas.height,
   dpr:Math.min(2,Math.max(1,window.devicePixelRatio||1)),
   glbBytes:currentGlb.length,metrics,
   webglContextLosses:contextLosses,contextRestorations,webglError:error
  });
  const json=JSON.stringify(report,null,2)+'\n';
  diagnosticJson=json;updateShareDiagnostic();
  diagnosticUrl=URL.createObjectURL(new Blob([json],{type:'application/json'}));
  saveDiagnostic.href=diagnosticUrl;saveDiagnostic.hidden=false;
  diagnosticStatus.textContent='Mesure locale : '+metrics.effectiveFps.toFixed(1)+
   ' images/s, 95e percentile '+metrics.p95FrameMs.toFixed(1)+' ms, '+
   metrics.slowFramesOver50ms+' images lentes (>50 ms). '+
   (error?'Erreur WebGL détectée. ':'Aucune erreur WebGL détectée. ')+
   'Ce rapport ne valide pas la mémoire ni la température du téléphone.';
 }catch(error){
  diagnosticStatus.textContent='Diagnostic interrompu : '+(error?.message||'cause inconnue');
  diagnosticJson=null;shareDiagnostic.hidden=true;
 }finally{
  diagnosticRunning=false;updateDiagnosticButton();
 }
});


async function userShare(kind){
 if(shareBusy)return;
 const expected=kind==='glb'?lastGlb:diagnosticJson;
 if(!expected)return;
 let file;
 try{file=createExportFile(kind,expected);}
 catch(error){shareStatus.textContent='Fichier non partageable : '+(error?.message||'format inconnu');return;}
 // Le partage est appelé sur le geste tactile avant tout await.
 shareBusy=true;shareGlb.disabled=true;shareDiagnostic.disabled=true;
 const request=shareLocalFile(file);
 try{
  const result=await request;
  shareStatus.textContent=shareMessage(result);
 }finally{
  shareBusy=false;shareGlb.disabled=false;shareDiagnostic.disabled=false;
  updateShareGlb();updateShareDiagnostic();
 }
}
shareGlb.addEventListener('click',()=>userShare('glb'));
shareDiagnostic.addEventListener('click',()=>userShare('diagnostic'));
