/** Banc de traitement séquentiel de scènes synthétiques. Aucun export MP4.
 * Le consommateur reçoit une pose à la fois ; un seul GLB reste actif par bloc.
 * Un checkpoint ne confirme que les blocs explicitement validés par le consommateur.
 */
import {createLongFilmProject,nextFilmChunk,filmProjectFingerprint} from './film-long-project-v21.mjs';
import {buildSyntheticFilmSceneV20} from './film-cigarette-cylinder-v20.mjs';
import {readSyntheticGLB,sampleSyntheticPose} from './film-viewer-v03.mjs';
const yieldToInterface=()=>new Promise(resolve=>setTimeout(resolve,0));
const CHECKPOINT='retoucheproai.film-chunk-checkpoint.v0.21';
const abortIfNeeded=signal=>{
 if(signal?.aborted){const error=new Error('Traitement interrompu.');error.name='AbortError';throw error;}
};
async function createFilmCheckpoint(project){
 project=createLongFilmProject(project);
 return Object.freeze({schema:CHECKPOINT,fingerprint:await filmProjectFingerprint(project),nextFrame:0});
}
async function processNextFilmChunk({project,checkpoint,generator,sink,signal}){
 project=createLongFilmProject(project);
 const fingerprint=await filmProjectFingerprint(project);
 if(checkpoint?.schema!==CHECKPOINT||checkpoint.fingerprint!==fingerprint||
  !Number.isSafeInteger(checkpoint.nextFrame)||checkpoint.nextFrame<0||checkpoint.nextFrame>project.totalFrames)
  throw Error('Reprise incompatible avec ce scénario.');
 if(!sink||['beginChunk','writeFrame','commitChunk','abortChunk'].some(k=>typeof sink[k]!=='function'))
  throw Error('Consommateur transactionnel de bloc requis.');
 abortIfNeeded(signal);
 const chunk=nextFilmChunk(project,checkpoint.nextFrame);
 if(!chunk)return {done:true,checkpoint};
 const authored=project.scenes[chunk.sceneIndex];
 // Préserver ces intentions dans le projet sans prétendre les avoir réalisées.
 if(authored.characterIds.length||authored.dialogue||authored.notes)
  throw Error('Identité persistante, dialogues ou mise en scène détaillée : exécution non disponible dans le moteur actuel.');
 const output=buildSyntheticFilmSceneV20(authored.prompt,generator);
 if(output.status!=='apercu_partiel_glb_anime'||!output.glb)
  throw Error('Scène non exécutable : '+(output.reason||authored.id));
 const scene=readSyntheticGLB(output.glb),clip=scene.clips[0];
 const sourceFrames=clip.duration*project.fps;
 if(Math.abs(sourceFrames-authored.frameCount)>.001)
  throw Error('Durée demandée différente du clip disponible : aucune boucle ni image figée ajoutée.');
 abortIfNeeded(signal);
 // L'identifiant est stable lors d'une reprise. Le consommateur doit dédupliquer
 // une validation déjà persistée si l'accusé de réception s'est perdu.
 const transactionId=fingerprint+':'+chunk.startFrame+':'+chunk.endFrame;
 let opened=false;
 try{
  opened=true;await sink.beginChunk({transactionId,chunk,scene,glb:output.glb,fps:project.fps});
  for(let frame=chunk.startFrame;frame<chunk.endFrame;frame++){
   // Les promesses déjà résolues ne laissent pas passer les clics d'annulation.
   if((frame-chunk.startFrame)%12===0)await yieldToInterface();
   abortIfNeeded(signal);
   const localFrame=frame-authored.startFrame;
   await sink.writeFrame({frame,localFrame,timeSeconds:frame/project.fps,
    pose:sampleSyntheticPose(scene,localFrame/project.fps,clip.name)});
  }
  abortIfNeeded(signal);
  await sink.commitChunk({transactionId,chunk});
 }catch(error){
  if(opened){try{await sink.abortChunk({transactionId,chunk,error});}catch{/* garder l'erreur initiale */}}
  throw error;
 }
 return {done:chunk.endFrame===project.totalFrames,
  checkpoint:Object.freeze({schema:CHECKPOINT,fingerprint,nextFrame:chunk.endFrame}),
  processedFrames:chunk.frameCount,synthetic:true,renderedFilm:false,
  warnings:output.warnings.slice()};
}
/** Enchaîne les blocs sans accumuler leurs poses. Le stockage de reprise doit
 * confirmer chaque checkpoint avant le bloc suivant. Après une erreur de stockage,
 * le consommateur doit dédupliquer la transaction déjà validée lors de la reprise.
 */
async function runFilmProject({project,checkpoint,generator,sink,signal,saveCheckpoint,onProgress}){
 if(typeof saveCheckpoint!=='function')throw Error('Sauvegarde de reprise requise.');
 if(onProgress!==undefined&&typeof onProgress!=='function')throw Error('Suivi de progression invalide.');
 project=createLongFilmProject(project);
 let current=checkpoint??await createFilmCheckpoint(project),processedFrames=0,completedChunks=0;
 while(true){
  const result=await processNextFilmChunk({project,checkpoint:current,generator,sink,signal});
  if(result.processedFrames){
   // Même si une annulation arrive après commit, conserver ce bloc déjà validé.
   await saveCheckpoint(result.checkpoint);
   current=result.checkpoint;processedFrames+=result.processedFrames;completedChunks++;
   if(onProgress)await onProgress(Object.freeze({checkpoint:current,completedFrames:current.nextFrame,
    totalFrames:project.totalFrames,processedFrames,completedChunks,renderedFilm:false}));
  }
  if(result.done)return {done:true,checkpoint:current,processedFrames,completedChunks,
   synthetic:true,renderedFilm:false};
  await yieldToInterface();
 }
}
export {createFilmCheckpoint,processNextFilmChunk,runFilmProject};
