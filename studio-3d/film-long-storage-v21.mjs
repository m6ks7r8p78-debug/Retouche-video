/** Un projet préparé enregistré dans IndexedDB. Aucun média ni checkpoint de rendu. */
import {serializeLongFilmProject,parseLongFilmProject} from './film-long-project-v21.mjs';
const DATABASE='retoucheproai-film-projects-v21',STORE='projects';
function database(){
 return new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(Error('Stockage local indisponible.'));return;}
  let settled=false;
  const request=indexedDB.open(DATABASE,1);
  request.onupgradeneeded=()=>{
   if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);
  };
  request.onerror=()=>{settled=true;reject(request.error||Error('Ouverture du stockage impossible.'));};
  request.onblocked=()=>{settled=true;reject(Error('Stockage occupé par un autre onglet.'));};
  request.onsuccess=()=>{
   if(settled){request.result.close();return;}
   const db=request.result;db.onversionchange=()=>db.close();resolve(db);
  };
 });
}
async function access(mode,operation){
 const db=await database();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode);let value;
  tx.oncomplete=()=>resolve(value);
  tx.onabort=()=>reject(tx.error||Error('Enregistrement local interrompu.'));
  tx.onerror=()=>{}; // l'abandon de transaction fournit le résultat définitif
  const request=operation(tx.objectStore(STORE));
  request.onsuccess=()=>{value=request.result;};
 });}finally{db.close();}
}
async function saveLongFilmProject(project){
 const source=serializeLongFilmProject(project);
 await access('readwrite',store=>store.put(source,'current'));
}
async function loadLongFilmProject(){
 const source=await access('readonly',store=>store.get('current'));
 return source===undefined?null:parseLongFilmProject(source);
}
async function removeLongFilmProject(){await access('readwrite',store=>store.delete('current'));}
export {saveLongFilmProject,loadLongFilmProject,removeLongFilmProject};
