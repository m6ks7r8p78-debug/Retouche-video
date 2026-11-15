/* NOVA — inventaire et nettoyage VOLONTAIRE des exports OPFS abandonnés.
 * Ne lit aucun octet vidéo ni audio. N'accepte que nos noms aléatoires
 * export-<32 hex>.mp4 dans le sous-dossier OPFS exact de NOVA.
 * Une marge d'âge >= 1 h évite les exports actifs d'un autre onglet.
 * Une fermeture brutale peut laisser des fichiers; jamais de suppression
 * automatique au chargement (risque de perte d'un fichier non enregistré).
 */
var NOVA_OPFS_RECOVERY=(()=>{
"use strict";
const PREFIX="nova-opfs-local-v1",LIMIT=128,MAX_BYTES=24*1048576,AGE_MS=3600000;
const NAME=/^export-[a-f0-9]{32}\.mp4$/;
const fail=msg=>new Error("NOVA récupération OPFS : "+msg);
const safe=n=>Number.isSafeInteger(n)&&n>=0;
function summary(inspection,{deleted=0,failed=0}={}){
 return Object.freeze({schema:"retoucheproai.nova.opfs-recovery.v1",
  status:"local-only",oldFiles:inspection.oldFiles,
  oldBytes:inspection.oldBytes,recentFiles:inspection.recentFiles,
  activeFiles:inspection.activeFiles,unrecognizedEntries:inspection.unrecognizedEntries,
  unreadableEntries:inspection.unreadableEntries,deleted,failed,
  minimumAgeMinutes:60,filesUploaded:false,fileContentsRead:false,
  sourceNamesRecorded:false,physicalIphoneVerified:false});
}
async function inspect({storage=typeof navigator!=="undefined"?navigator.storage:null,
  signal,nowMs=Date.now(),minAgeMs=AGE_MS,
  active=typeof NOVA_OPFS_STREAM!=="undefined"?NOVA_OPFS_STREAM.isActive:()=>false}={}){
 if(!storage||typeof storage.getDirectory!=="function")throw fail("API indisponible");
 if(!safe(nowMs)||!safe(minAgeMs)||minAgeMs>30*24*3600000||
    typeof active!=="function")throw fail("paramètres invalides");
 if(signal?.aborted)throw fail("annulé");
 const root=await storage.getDirectory();
 if(!root||typeof root.getDirectoryHandle!=="function")throw fail("répertoire invalide");
 let dir;
 try{dir=await root.getDirectoryHandle(PREFIX,{create:false})}
 catch(e){
  // N'ouvre jamais un nouveau dossier pour un simple inventaire.
  if(e?.name==="NotFoundError")return {dir:null,entries:[],oldFiles:0,
   oldBytes:0,recentFiles:0,activeFiles:0,unrecognizedEntries:0,unreadableEntries:0};
  throw fail("lecture du sous-dossier privé impossible");
 }
 if(!dir||typeof dir.entries!=="function")throw fail("inventaire non disponible");
 const result={dir,entries:[],oldFiles:0,oldBytes:0,recentFiles:0,
  activeFiles:0,unrecognizedEntries:0,unreadableEntries:0};
 let total=0;
 for await (const [name,handle] of dir.entries()){
  if(signal?.aborted)throw fail("annulé");
  if(++total>LIMIT)throw fail("trop d'entrées ; aucun nettoyage effectué");
  if(typeof name!=="string"||!NAME.test(name)||handle?.kind!=="file"){
   result.unrecognizedEntries++;continue;
  }
  if(active(name)){result.activeFiles++;continue}
  let file;
  try{file=await handle.getFile()}catch{result.unreadableEntries++;continue}
  if(!safe(file?.size)||file.size>MAX_BYTES||
     !safe(file?.lastModified)||file.lastModified>nowMs){
   result.unreadableEntries++;continue;
  }
  const age=nowMs-file.lastModified;
  if(age<minAgeMs){result.recentFiles++;continue}
  result.oldFiles++;result.oldBytes+=file.size;
  result.entries.push({name,size:file.size});
 }
 return result;
}
async function scan(opts){
 const result=await inspect(opts);
 return summary(result);
}
async function cleanup(opts={}){
 // Le bouton UI a besoin d'un clic explicite. Même avec une injection
 // programmatique, vérifie les métadonnées à nouveau juste avant removal.
 const first=await inspect(opts);
 let deleted=0,failed=0;
 if(!first.dir)return summary(first);
 const guard=opts.active||((typeof NOVA_OPFS_STREAM!=="undefined"&&
  NOVA_OPFS_STREAM.isActive)||(()=>false));
 const nowMs=opts.nowMs??Date.now(),ageMs=opts.minAgeMs??AGE_MS;
 for(const {name} of first.entries){
  if(opts.signal?.aborted)throw fail("annulé");
  try{
   if(guard(name))continue;
   const handle=await first.dir.getFileHandle(name,{create:false});
   const file=await handle.getFile();
   if(!safe(file.size)||file.size>MAX_BYTES||!safe(file.lastModified)||
      file.lastModified>nowMs||nowMs-file.lastModified<ageMs)continue;
   await first.dir.removeEntry(name);
   deleted++;
  }catch{failed++}
 }
 return summary(first,{deleted,failed});
}
return Object.freeze({scan,cleanup,MIN_AGE_MS:AGE_MS});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_OPFS_RECOVERY;
