/* NOVA 0.28 — reçu d'interruption local et facultatif.
 * Aucun média, nom, chemin, identifiant, historique ou transmission réseau.
 * Un reçu montre une annulation observée par CE document ; il ne prouve
 * ni une réelle suspension iPhone, ni la libération de ressources natives.
 */
var NOVA_IPHONE_INTERRUPTION=(()=>{
"use strict";
const SCHEMA="retoucheproai.nova.interruption-local.v1";
const triggers=["user","pagehide","visibility-hidden"];
const modes=["synthetic-generated","local-user-file"];
const workflows=["single-export","three-synthetic-runs"];
const numeric=n=>Number.isFinite(n)&&n>=0?Math.round(n):null;
function create({sourceKind,trigger,workflow,elapsedMs}={}){
 return Object.freeze({
  schema:SCHEMA,
  status:"cancelled",
  trigger:triggers.includes(trigger)?trigger:"unknown",
  sourceKind:modes.includes(sourceKind)?sourceKind:"unknown",
  workflow:workflows.includes(workflow)?workflow:"unknown",
  elapsedMs:numeric(elapsedMs),
  mediaUploaded:false,mediaIncluded:false,fileNameIncluded:false,
  identifyingDeviceInfoIncluded:false,automaticSharing:false,
  physicalIphoneCertified:false,nativeMemoryReleased:false,
  limitation:"Local abort event observed if the page survives; no proof of iPhone background behavior or native resource release"
 });
}
function serialize(data){
 if(!data||data.schema!==SCHEMA)
  throw new TypeError("reçu local NOVA invalide");
 // La liste blanche est reconstruite : jamais de champ libre reçu d'un
 // fichier / autre labo / objet arbitraire.
 const clean=create(data);
 const text=JSON.stringify(clean,null,2);
 if(text.length>3000)throw new RangeError("reçu local trop volumineux");
 return text+"\n";
}
return Object.freeze({create,serialize});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_IPHONE_INTERRUPTION;
