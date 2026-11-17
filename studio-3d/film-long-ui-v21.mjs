/** Préparation locale, distincte de la génération d'une vidéo. */
import {planLongFilmOutline,serializeLongFilmProject} from './film-long-project-v21.mjs';
const button=document.querySelector('#prepareLongFilm'),status=document.querySelector('#longStatus'),
 save=document.querySelector('#saveLongFilm');
let url=null;
function clear(){if(url)URL.revokeObjectURL(url);url=null;save.hidden=true;save.removeAttribute('href');}
button.addEventListener('click',()=>{
 clear();
 try{
  const project=planLongFilmOutline({description:document.querySelector('#longDescription').value,
   targetDurationSeconds:Number(document.querySelector('#longDuration').value)});
  url=URL.createObjectURL(new Blob([serializeLongFilmProject(project)],{type:'application/json'}));
  save.href=url;save.hidden=false;
  status.textContent='Projet préparé : '+project.scenes.length+' scène(s), '+project.targetDurationSeconds/60+
   ' minutes prévues. Durées réparties provisoirement, détails conservés. Aucune vidéo générée.';
 }catch(error){status.textContent='Projet non préparé : '+(error?.message||'erreur inconnue');}
});
for(const name of ['#longDescription','#longDuration'])document.querySelector(name).addEventListener('input',()=>{
 clear();status.textContent='Scénario modifié : préparez à nouveau le projet avant de l’enregistrer.';
});
window.addEventListener('pagehide',event=>{if(!event.persisted)clear();});
