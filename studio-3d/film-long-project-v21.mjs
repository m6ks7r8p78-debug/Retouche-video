/** Projet long : scénario conservé, chronologie entière en images, travail par blocs.
 * Une heure planifiée n'est pas une heure de film générée. Aucun codec ni IA distante.
 */
const SCHEMA='retoucheproai.film-long-project.v0.21';
const MAX_SECONDS=3600,MAX_SCENES=2000,MAX_TEXT=1000000;
const text=(value,label,max=20000)=>{
 if(typeof value!=='string'||value.length>max)throw Error(label+' invalide ou trop long.');
 return value;
};
const id=(value,label)=>{
 if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(value))throw Error(label+' invalide.');
 return value;
};
const positiveInt=(n,label,max)=>{
 if(!Number.isSafeInteger(n)||n<1||n>max)throw Error(label+' invalide.');return n;
};
function createLongFilmProject(input){
 if(!input||typeof input!=='object')throw Error('Projet requis.');
 const fps=input.fps??24;
 if(![24,25,30,60].includes(fps))throw Error('Cadence non prise en charge.');
 const title=text(input.title??'Mon film','Titre',200);
 const description=text(input.description??'','Description générale',200000);
 const targetSeconds=input.targetDurationSeconds??3600;
 positiveInt(targetSeconds,'Durée cible',MAX_SECONDS);
 const chunkFrames=positiveInt(input.chunkFrames??fps*10,'Taille de bloc',fps*30);
 if(!Array.isArray(input.characters??[])||(input.characters??[]).length>100)
  throw Error('Catalogue de personnages invalide.');
 const characters=(input.characters??[]).map(c=>({
  id:id(c?.id,'Identifiant de personnage'),description:text(c?.description,'Description de personnage')
 }));
 const characterIds=new Set(characters.map(c=>c.id));
 if(characterIds.size!==characters.length)throw Error('Personnage dupliqué.');
 if(!Array.isArray(input.scenes)||!input.scenes.length||input.scenes.length>MAX_SCENES)
  throw Error('Scènes absentes ou trop nombreuses.');
 const ids=new Set();let cursor=0,totalText=description.length+title.length;
 for(const c of characters)totalText+=c.description.length;
 const scenes=input.scenes.map(s=>{
  const key=id(s?.id,'Identifiant de scène');
  if(ids.has(key))throw Error('Scène dupliquée.');ids.add(key);
  const prompt=text(s.prompt,'Description de scène');
  if(!prompt.trim())throw Error('Description de scène vide.');
  const notes=text(s.notes??'','Détails de mise en scène');
  const dialogue=text(s.dialogue??'','Dialogues');
  totalText+=prompt.length+notes.length+dialogue.length;
  if(totalText>MAX_TEXT)throw Error('Budget de texte du projet dépassé.');
  const cast=s.characterIds??[];
  if(!Array.isArray(cast)||cast.length>100||new Set(cast).size!==cast.length||
   cast.some(key=>!characterIds.has(key)))throw Error('Personnages de scène inconnus ou dupliqués.');
  const frameCount=positiveInt(s.frameCount,'Durée de scène en images',fps*MAX_SECONDS);
  const startFrame=cursor;cursor+=frameCount;
  if(cursor>targetSeconds*fps)throw Error('Les scènes dépassent la durée cible.');
  return {id:key,prompt,notes,dialogue,characterIds:cast.slice(),startFrame,frameCount,endFrame:cursor};
 });
 const project={schema:SCHEMA,title,description,fps,targetDurationSeconds:targetSeconds,
  chunkFrames,characters,scenes,totalFrames:cursor,unplannedFrames:targetSeconds*fps-cursor,
  status:'scenario_planifie_non_rendu',renderedFilm:false};
 // Les limites et la reprise ne doivent pas changer à l'insu d'un traitement en cours.
 for(const s of scenes){Object.freeze(s.characterIds);Object.freeze(s);}
 characters.forEach(Object.freeze);Object.freeze(characters);Object.freeze(scenes);
 return Object.freeze(project);
}
function serializeLongFilmProject(project){
 return JSON.stringify(createLongFilmProject(project),null,2)+'\n';
}
function parseLongFilmProject(source){
 if(typeof source!=='string'||source.length>3000000)throw Error('Fichier de projet trop volumineux.');
 const raw=JSON.parse(source);
 if(raw.schema!==SCHEMA)throw Error('Version de projet incompatible.');
 return createLongFilmProject(raw);
}
function locateFilmFrame(project,frame){
 if(!Number.isSafeInteger(frame)||frame<0||frame>=project.totalFrames)
  throw Error('Image hors de la chronologie.');
 let lo=0,hi=project.scenes.length-1;
 while(lo<=hi){
  const mid=(lo+hi)>>1,s=project.scenes[mid];
  if(frame<s.startFrame)hi=mid-1;
  else if(frame>=s.endFrame)lo=mid+1;
  else return {scene:s,sceneIndex:mid,localFrame:frame-s.startFrame};
 }
 throw Error('Chronologie discontinue.');
}
function nextFilmChunk(project,startFrame=0){
 if(startFrame===project.totalFrames)return null;
 const {scene,sceneIndex,localFrame}=locateFilmFrame(project,startFrame);
 const endFrame=Math.min(scene.endFrame,startFrame+project.chunkFrames);
 return Object.freeze({sceneId:scene.id,sceneIndex,startFrame,endFrame,
  localStartFrame:localFrame,frameCount:endFrame-startFrame});
}
async function filmProjectFingerprint(project){
 const bytes=new TextEncoder().encode(serializeLongFilmProject(project));
 const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function planLongFilmOutline({description,targetDurationSeconds=300,title='Mon film'}){
 text(description,'Scénario détaillé',200000);
 if(!description.trim())throw Error('Décrivez votre film avant de préparer le projet.');
 const headings=[...description.matchAll(/^\s*sc[eè]ne\s+\d+\s*[:：]/gmi)];
 const parts=headings.length?headings.map((m,i)=>description.slice(m.index,headings[i+1]?.index??description.length)):[description];
 if(parts.length>MAX_SCENES)throw Error('Trop de scènes.');
 const totalFrames=targetDurationSeconds*24,base=Math.floor(totalFrames/parts.length);
 return createLongFilmProject({title,description,targetDurationSeconds,fps:24,
  scenes:parts.map((prompt,i)=>({id:'scene_'+(i+1),prompt,
   frameCount:base+(i<totalFrames%parts.length?1:0)}))});
}
export {SCHEMA,createLongFilmProject,serializeLongFilmProject,parseLongFilmProject,
 locateFilmFrame,nextFilmChunk,filmProjectFingerprint,planLongFilmOutline};
