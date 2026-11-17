/** Film Studio v0.4 - un vrai maillage GLB dessiné en WebGL2, repli Canvas 2D explicite.
 * Aucun réseau, aucun fichier réel, aucun film exporté.
 */
import './generateur.js';
import {buildSyntheticFilmSceneV03} from './film-contact-v03.mjs';
import {readSyntheticGLB,sampleSyntheticPose,paintSyntheticScene} from './film-viewer-v03.mjs';
import {createWebGLFilmRenderer} from './film-webgl-v04.mjs';

const find=id=>document.querySelector(id);
const canvas=find('#view'),prompt=find('#prompt'),create=find('#create'),
 play=find('#play'),seek=find('#seek'),clock=find('#clock'),
 status=find('#status'),download=find('#download'),
 steps=find('#steps'),limits=find('#limits');
let gpu=null,ctx=null,glError=null;
try {
 const gl=canvas.getContext('webgl2',{alpha:false,antialias:true,preserveDrawingBuffer:true});
 if(gl) gpu=createWebGLFilmRenderer(gl);
} catch(error){glError=error?.message||'WebGL2 indisponible';}
if(!gpu){try {ctx=canvas.getContext('2d',{alpha:false});}catch{ctx=null;}}
const previewAvailable=Boolean(gpu||ctx);
canvas.dataset.renderer=gpu?'webgl2':ctx?'canvas2d':'none';
const backend=document.querySelector('#backend');
if(backend)backend.textContent=gpu?
 'Rendu WebGL2 réel des triangles GLB, avec profondeur et lumière simple.':
 ctx?'Repli Canvas 2D : projection approximative, pas un rendu du vrai maillage.':
 'Pas de rendu local possible sur ce navigateur. '+(glError||'');
let scene=null,time=0,playing=false,lastTick=0,url=null;
let camera={yaw:.30,pitch:.10},pointer=null;
const add=(parent,label)=>{const li=document.createElement('li');li.textContent=String(label);parent.appendChild(li);};
const fmt=t=>Number(t).toFixed(1).replace('.',',');
function update(){
 if(!scene||!previewAvailable)return;
 const rect=canvas.getBoundingClientRect();
 const dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1));
 const width=Math.max(1,Math.round(rect.width*dpr));
 const height=Math.max(1,Math.round(rect.height*dpr));
 if(canvas.width!==width)canvas.width=width;
 if(canvas.height!==height)canvas.height=height;
 const pose=sampleSyntheticPose(scene,time);
 if(gpu) gpu.render(scene,pose,width,height,camera);
 else paintSyntheticScene(ctx,scene,pose,width,height,camera);
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
 if(typeof canvas.setPointerCapture==='function')canvas.setPointerCapture(event.pointerId);
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
document.addEventListener('visibilitychange',()=>{if(document.hidden)halt();});
window.addEventListener('pagehide',()=>{halt();if(url)URL.revokeObjectURL(url);if(gpu)gpu.dispose();});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();halt();play.disabled=true;seek.disabled=true;status.textContent='Contexte WebGL perdu. Recharger pour rétablir la prévisualisation.';});
create.addEventListener('click',()=>{
 halt();create.disabled=true;play.disabled=true;seek.disabled=true;
 status.classList.remove('error');
 if(url)URL.revokeObjectURL(url);
 url=null;scene=null;time=0;download.hidden=true;download.removeAttribute('href');
 steps.replaceChildren();limits.replaceChildren();
 try {
   const output=buildSyntheticFilmSceneV03(prompt.value,globalThis.Retouche3DGenerator);
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
   scene=parsed;play.disabled=!previewAvailable;seek.disabled=!previewAvailable;
   if(previewAvailable)update();
   status.textContent='GLB animé créé localement : '+output.animatedActions.length+
     ' gestes, '+fmt(output.duration)+' s. '+(gpu?'Rendu WebGL2 des maillages disponible.':
     ctx?'Aperçu de secours Canvas 2D disponible.':'Aperçu indisponible sur ce navigateur.')+
     ' Aucun MP4 généré.';
 }catch(error){
   status.classList.add('error');
   status.textContent='Échec de préparation : '+(error?.message||'Erreur inconnue');
 }finally{create.disabled=false;}
});
