/* NOVA — écriture MP4 progressive dans OPFS local (expérimentation opt-in).
 * Aucun réseau, aucun nom de média source. Préserve les positions byte exactes
 * émises par Mp4Muxer.StreamTarget (qui peuvent arriver hors ordre).
 * L'API onData est synchrone; les écritures OPFS sont asynchrones : chaque
 * chunk est COPIÉ, borné en attente et vidé avant vérification du File final.
 * Ne garantit pas à lui seul la mémoire GPU/CPU, ni la sauvegarde iOS.
 */
var NOVA_OPFS_STREAM=(()=>{
"use strict";
const MiB=1048576,CHUNK_SIZE=65536,MAX_PENDING=2*MiB,MAX_FILE=24*MiB;
const fail=reason=>new Error("NOVA OPFS local : "+reason);
const bytes=n=>Number.isSafeInteger(n)&&n>=0;
const supported=()=>typeof navigator!=="undefined"&&
 !!navigator.storage&&typeof navigator.storage.getDirectory==="function"&&
 typeof globalThis.Mp4Muxer?.StreamTarget==="function"&&
 typeof globalThis.crypto?.getRandomValues==="function";
async function create({signal,storage,maxPendingBytes=MAX_PENDING,maxFileBytes=MAX_FILE,
  muxer=globalThis.Mp4Muxer,random=globalThis.crypto}={}){
 const store=storage??(typeof navigator!=="undefined"?navigator.storage:null);
 if(!store||typeof store.getDirectory!=="function"||
    !muxer||typeof muxer.StreamTarget!=="function"||
    !random||typeof random.getRandomValues!=="function")
  throw fail("stockage privé ou StreamTarget indisponible, aucune sortie générée");
 if(!bytes(maxPendingBytes)||maxPendingBytes<CHUNK_SIZE||maxPendingBytes>MAX_PENDING||
    !bytes(maxFileBytes)||maxFileBytes<1024||maxFileBytes>MAX_FILE)
  throw fail("limites de stockage invalides");
 if(signal?.aborted)throw fail("export annulé");
 // Nom aléatoire indépendant des métadonnées source; sous-dossier privé.
 const id=Array.from(random.getRandomValues(new Uint8Array(16)),x=>
  x.toString(16).padStart(2,"0")).join("");
 const name="export-"+id+".mp4";
 let dir=null,handle=null,writable=null;
 try{
  const root=await store.getDirectory();
  dir=await root.getDirectoryHandle("nova-opfs-local-v1",{create:true});
  handle=await dir.getFileHandle(name,{create:true});
  writable=await handle.createWritable();
 }catch(e){
  if(dir)try{await dir.removeEntry(name)}catch{}
  throw fail("impossible d'ouvrir le stockage privé local");
 }
 let chain=Promise.resolve(),failure=null,finished=false,removed=false,
  pendingBytes=0,peakPendingBytes=0,totalWritten=0,highWater=0,writeCount=0;
 function ensure(){
  if(failure)throw fail("écriture locale interrompue");
  if(signal?.aborted)throw fail("export annulé");
  if(finished||removed)throw fail("sortie déjà clôturée");
 }
 function onData(data,position){
  ensure();
  if(!(data instanceof Uint8Array)||!bytes(position)||!data.length||
    position+data.length>maxFileBytes||
    pendingBytes+data.length>maxPendingBytes){
   failure=fail("volume de sortie ou file d'écriture dépassé");
   throw failure;
  }
  // L'éditeur mp4-muxer peut recycler ses buffers en appelant onData.
  const copied=data.slice();
  pendingBytes+=copied.byteLength;
  peakPendingBytes=Math.max(peakPendingBytes,pendingBytes);
  highWater=Math.max(highWater,position+copied.byteLength);
  writeCount++;
  chain=chain.then(()=>writable.write({type:"write",position,data:copied}))
   .then(()=>{
    totalWritten+=copied.length;
    pendingBytes-=copied.length;
   },err=>{
    pendingBytes-=copied.length;
    failure=err||fail("écriture locale échouée");
   });
 }
 const target=new muxer.StreamTarget({onData,chunked:true,chunkSize:CHUNK_SIZE});
 async function drain(){
  await chain;
  if(failure)throw fail("écriture locale interrompue");
  if(signal?.aborted)throw fail("export annulé");
 }
 async function finish(){
  ensure();
  await drain();
  try{await writable.close()}
  catch(e){failure=e;throw fail("impossible de terminer le fichier local")}
  finished=true;
  let file;
  try{file=await handle.getFile()}
  catch(e){throw fail("fichier final local illisible")}
  if(file.size<1024||file.size>maxFileBytes||file.size!==highWater)
   throw fail("taille finale du MP4 incompatible avec les octets émis");
  return Object.freeze({file,metrics:Object.freeze({
   mode:"opfs-local-stream",bytes:file.size,writeCount,
   peakPendingBytes,bufferLimitBytes:maxPendingBytes,
   totalBytesWritten:totalWritten,rawFileSizeBytes:file.size,
   qualification:"offsets aléatoires vers OPFS; RAM CPU/GPU non mesurée"
  })});
 }
 async function release(){
  if(removed)return;
  removed=true;
  try{await chain}catch{}
  if(!finished)try{await writable.abort()}catch{}
  try{await dir.removeEntry(name)}catch{}
 }
 return Object.freeze({target,drain,finish,release,
  snapshot:()=>Object.freeze({mode:"opfs-local-stream",pendingBytes,
   peakPendingBytes,writeCount,highestOffset:highWater,finished,removed})});
}
// Vérification active (non lecture des médias) : une seule écriture de
// 1 octet zéro, puis abort/suppression du fichier temporaire aléatoire.
// Une API exposée sans permission ou sans quota ne suffit PAS pour 48 s.
async function probe({signal,storage,muxer,random}={}){
 let sink=null;
 try{
  if(signal?.aborted)return false;
  sink=await create({signal,storage,muxer,random});
  sink.target.options.onData(new Uint8Array(1),0);
  await sink.drain();
  return !signal?.aborted;
 }catch{return false}
 finally{
  if(sink)await sink.release();
 }
}
return Object.freeze({supported,create,probe});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_OPFS_STREAM;
