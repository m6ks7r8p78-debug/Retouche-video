/** Film Studio v0.17 — partage iOS facultatif, déclenché uniquement par un clic humain.
 * Aucun réseau direct, aucune destination implicite, aucun média privé.
 */
const GLB_NAME='retoucheproai-film-studio-v17.glb';
const DIAG_NAME='retoucheproai-diagnostic-v17.json';
function createExportFile(kind,data,{FileCtor=globalThis.File}={}){
 if(typeof FileCtor!=='function')throw Error('Création de fichier indisponible.');
 if(kind==='glb'){
  if(!(data instanceof Uint8Array)||data.length<20||data.length>12*1024*1024)
   throw Error('Fichier GLB inexistant ou hors limites.');
  if(String.fromCharCode(...data.subarray(0,4))!=='glTF')throw Error('En-tête GLB invalide.');
  return new FileCtor([data],GLB_NAME,{type:'model/gltf-binary'});
 }
 if(kind==='diagnostic'){
  if(typeof data!=='string'||data.length<10||data.length>65536)throw Error('Diagnostic local absent.');
  const parsed=JSON.parse(data);
  if(parsed?.schema!=='retoucheproai.film-studio.device-diagnostic.v0.6'||
    parsed?.privacy?.sentToServer!==false||parsed?.privacy?.userPromptIncluded!==false||
    parsed?.privacy?.userAgentIncluded!==false||
    parsed?.privacy?.videoOrPhotoIncluded!==false||
    parsed?.validation?.physicalIPhoneCertified!==false)
    throw Error('Rapport non conforme au périmètre privé.');
  return new FileCtor([data],DIAG_NAME,{type:'application/json'});
 }
 throw Error('Format de partage non autorisé.');
}
function canShareLocally(file,{native=globalThis.navigator}={}){
 if(!native||typeof native.share!=='function')return false;
 if(typeof native.canShare==='function'){
  try{return native.canShare({files:[file]})===true;}catch{return false;}
 }
 // canShare absent : l'utilisateur peut toujours déclencher le partage,
 // sans promesse de compatibilité. Erreur explicite avec export de secours.
 return true;
}
async function shareLocalFile(file,{native=globalThis.navigator}={}){
 if(!canShareLocally(file,{native}))return {status:'non_disponible'};
 try{
  // Le navigateur natif demande à l'utilisateur de choisir une destination.
  // Ne jamais appeler depuis un effet automatique ou après une attente.
  await native.share({files:[file]});
  // Cela ne prouve pas que le fichier a été enregistré dans Fichiers.
  return {status:'transmis_au_panneau_de_partage'};
 }catch(error){
  if(error?.name==='AbortError')return {status:'annule'};
  return {status:'echec',reason:'Le partage iOS n’a pas abouti ; utiliser le lien de téléchargement.'};
 }
}
export {createExportFile,canShareLocally,shareLocalFile,GLB_NAME,DIAG_NAME};
