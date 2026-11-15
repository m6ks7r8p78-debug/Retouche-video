#!/usr/bin/env node
/* Validation du centre de coordination RetoucheProAI.
 * Fonctionne sous Node 22 sans dépendance, sans accès réseau, sans média.
 * Ne prouve pas l'état CI des laboratoires : vérifie l'intégrité de l'index.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(fileURLToPath(new URL("../../",import.meta.url)));
const registryDefault=path.join(root,"coordination","REGISTRE.json");
const states=new Set(["draft-pr-observed","branch-observed","main-observed"]);
const identifier=/^[a-z][a-z0-9-]*$/;
function assert(ok,message){if(!ok)throw new Error("Index coordination invalide : "+message)}
export function validateRegistry(record){
 assert(record&&typeof record==="object"&&!Array.isArray(record),"objet JSON requis");
 assert(record.schemaVersion===1,"version de schéma non reconnue");
 assert(record.repository==="m6ks7r8p78-debug/Retouche-video","dépôt incohérent");
 assert(record.coordinationBranch==="coordination-retoucheproai-v1","branche centrale incohérente");
 assert(record.privacy==="public-metadata-only","métadonnées publiques seulement");
 assert(record.integrationRule==="no-main-change-no-production-deploy-no-private-media",
  "règle de protection manquante");
 assert(/^\d{4}-\d{2}-\d{2}$/.test(record.indexedAt),"date d'index invalide");
 assert(Array.isArray(record.labs)&&record.labs.length>=5,"laboratoires absents");
 const seen=new Set();
 for(const lab of record.labs){
  assert(lab&&typeof lab==="object","fiche laboratoire invalide");
  assert(typeof lab.id==="string"&&identifier.test(lab.id),"identifiant de labo invalide");
  assert(!seen.has(lab.id),"doublon de laboratoire : "+lab.id);
  seen.add(lab.id);
  for(const key of ["label","interface","workBoundary","validationGap"])
   assert(typeof lab[key]==="string"&&lab[key].trim().length>=8,
    lab.id+" : "+key+" manquant");
  assert(typeof lab.branch==="string"&&/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(lab.branch),
   lab.id+" : branche invalide");
  assert(states.has(lab.observation),lab.id+" : observation invalide");
  assert(lab.pr===null||Number.isSafeInteger(lab.pr)&&lab.pr>0,lab.id+" : PR invalide");
  if(lab.observation==="draft-pr-observed")assert(lab.pr!==null,lab.id+" : PR brouillon non renseignée");
  if(lab.observation==="main-observed")assert(lab.branch==="main",lab.id+" : main incohérent");
  assert(Array.isArray(lab.links)&&lab.links.length>0,lab.id+" : références absentes");
  for(const raw of lab.links){
   assert(typeof raw==="string","lien non textuel");
   let uri;try{uri=new URL(raw)}catch{throw new Error(lab.id+" : URL non valide")}
   assert(uri.protocol==="https:"&&uri.hostname==="github.com"&&
     uri.pathname.toLowerCase().startsWith("/m6ks7r8p78-debug/retouche-video/")&&
     !uri.search&&!uri.hash,lab.id+" : seules les références GitHub publiques du dépôt sont autorisées");
  }
 }
 assert(Array.isArray(record.proposedHandoffs),"relais proposés absents");
 for(const h of record.proposedHandoffs){
  assert(h&&seen.has(h.from)&&seen.has(h.to)&&h.from!==h.to,"relais vers laboratoire inexistant");
  assert(h.state==="proposal","un relais n'est jamais une intégration validée");
  assert(typeof h.topic==="string"&&h.topic.length>15,"proposition de relais incomplète");
 }
 for(const key of states)assert(typeof record.statusSemantics?.[key]==="string",
  "explication d'état manquante : "+key);
 return {labs:seen.size,handoffs:record.proposedHandoffs.length};
}
export async function checkIndex(filename=registryDefault){
 const input=JSON.parse(await fs.readFile(filename,"utf8"));
 return validateRegistry(input);
}
const calledAsScript=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(calledAsScript){
 try{
  const result=await checkIndex(process.argv[2]||registryDefault);
  const files=["README.md","PROTOCOLE.md","RELAIS_UNIVERSEL.md","REGISTRE.json"];
  for(const f of files)await fs.access(path.join(root,"coordination",f));
  const dir=await fs.readdir(path.join(root,"coordination"),{withFileTypes:true});
  for(const entry of dir){
   assert(entry.isFile()&&/\.(md|json)$/.test(entry.name),
    "fichier inconnu ou potentiellement privé dans coordination : "+entry.name);
  }
  process.stdout.write("Coordination OK : "+result.labs+" laboratoires, "+
   result.handoffs+" relais proposés, aucun média dans coordination.\n");
 }catch(error){
  process.stderr.write(String(error.message||error)+"\n");
  process.exitCode=1;
 }
}
