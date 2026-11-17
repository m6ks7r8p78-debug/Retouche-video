/** Préparation locale, distincte de la génération d'une vidéo. */
import {planLongFilmOutline,serializeLongFilmProject,parseLongFilmProject} from './film-long-project-v21.mjs';
import {saveLongFilmProject,loadLongFilmProject,removeLongFilmProject} from './film-long-storage-v21.mjs';
const find=id=>document.querySelector(id);
const button=find('#prepareLongFilm'),status=find('#longStatus'),save=find('#saveLongFilm'),
 description=find('#longDescription'),duration=find('#longDuration'),restore=find('#restoreLongFilm'),
 forget=find('#forgetLongFilm'),importFile=find('#importLongFilm');
let url=null,revision=0,prepared=null;
// Les écritures et la suppression restent ordonnées même pendant plusieurs clics.
let storageQueue=Promise.resolve();
const enqueue=fn=>{const task=storageQueue.then(fn);storageQueue=task.catch(()=>{});return task;};
function clear(){if(url)URL.revokeObjectURL(url);url=null;save.hidden=true;save.removeAttribute('href');}
function show(project,message){
 const nextUrl=URL.createObjectURL(new Blob([serializeLongFilmProject(project)],{type:'application/json'}));
 clear();url=nextUrl;save.href=url;save.hidden=false;
 prepared={project,description:description.value,duration:duration.value};
 status.textContent=message+' : '+project.scenes.length+' scène(s), '+project.targetDurationSeconds/60+
  ' minutes prévues. Aucune vidéo générée.';
}
async function persist(project,token){
 try{await enqueue(()=>saveLongFilmProject(project));
  restore.disabled=false;forget.disabled=false;
  if(token===revision)status.textContent+=' Projet enregistré dans ce navigateur ; gardez aussi le fichier JSON.';
 }catch{
  if(token===revision)status.textContent+=' Stockage local indisponible : utilisez le fichier JSON pour conserver ce projet.';
 }
}
button.addEventListener('click',()=>{
 const token=++revision;clear();
 try{
  // Un clic répété conserve le catalogue, les dialogues et les durées importées.
  const retained=prepared&&prepared.description===description.value&&prepared.duration===duration.value;
  const project=retained?prepared.project:planLongFilmOutline({description:description.value,targetDurationSeconds:Number(duration.value)});
  show(project,retained?'Projet préparé, détails et durées conservés':'Projet préparé, durées réparties provisoirement');void persist(project,token);
 }catch(error){status.textContent='Projet non préparé : '+(error?.message||'erreur inconnue');}
});
for(const element of [description,duration])element.addEventListener('input',()=>{
 revision++;clear();status.textContent='Texte modifié, non enregistré : préparez à nouveau le projet. La version préparée précédente reste disponible.';
});
function fill(project){
 description.value=project.description||project.scenes.map(s=>s.prompt).join('\n\n');
 // Conserver aussi les durées personnalisées des fichiers créés par le moteur.
 if(![...duration.options].some(o=>Number(o.value)===project.targetDurationSeconds)){
  const option=document.createElement('option');option.value=String(project.targetDurationSeconds);
  option.textContent=project.targetDurationSeconds/60+' minutes (projet importé)';duration.appendChild(option);
 }
 duration.value=String(project.targetDurationSeconds);
}
restore.addEventListener('click',async()=>{
 const token=++revision;restore.disabled=true;
 try{
  const project=await enqueue(loadLongFilmProject);
  if(token!==revision)return;
  if(!project){status.textContent='Aucun projet enregistré dans ce navigateur.';return;}
  fill(project);show(project,'Projet repris, détails et durées conservés');
 }catch(error){if(token===revision)status.textContent='Reprise impossible : '+(error?.message||'erreur inconnue');}
 finally{restore.disabled=false;}
});
importFile.addEventListener('change',async()=>{
 const file=importFile.files?.[0];if(!file)return;
 const token=++revision;
 try{
  if(file.size>12000000)throw Error('Fichier trop volumineux.');
  const project=parseLongFilmProject(await file.text());
  if(token!==revision)return;
  fill(project);show(project,'Projet importé, détails et durées conservés');await persist(project,token);
 }catch(error){if(token===revision)status.textContent='Import refusé : '+(error?.message||'fichier invalide')+'. Le projet précédent est conservé.';}
 finally{importFile.value='';}
});
forget.addEventListener('click',async()=>{
 const token=++revision;forget.disabled=true;
 try{await enqueue(removeLongFilmProject);restore.disabled=true;
  if(token===revision)status.textContent='Copie du navigateur effacée. Votre texte et le fichier téléchargeable restent disponibles.';
 }catch(error){if(token===revision)status.textContent='Effacement impossible : '+(error?.message||'erreur inconnue');forget.disabled=false;}
});
// Ne pas remplacer le texte que la personne peut commencer à saisir pendant l'ouverture.
void enqueue(loadLongFilmProject).then(project=>{
 restore.disabled=!project;forget.disabled=!project;
}).catch(()=>{restore.disabled=false;});
window.addEventListener('pagehide',event=>{if(!event.persisted)clear();});
