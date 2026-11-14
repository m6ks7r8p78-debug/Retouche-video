/* RetoucheProAI — politique de sélection du pilote de débruitage, hors application.
 * Aucun décodage, fichier, réseau, entraînement, publication ou action automatique.
 */
"use strict";
const finite=x=>typeof x==="number"&&Number.isFinite(x);
function valider(c){
 if(!c||typeof c!=="object"||Array.isArray(c))throw new TypeError("Diagnostic requis");
 if(!["bruit_gaussien","jpeg","compression","ar","inconnu","sain"].includes(c.degradation))throw new TypeError("Type de dégradation inconnu");
 for(const k of ["probaGauss","sigmaEstime"])
  if(!finite(c[k])||c[k]<0||c[k]>1)throw new RangeError(k+" doit être dans [0,1]");
 for(const k of ["analyseLocaleAutorisee","modeManuel","statutModelValide","integriteSourceOk"])
  if(typeof c[k]!=="boolean")throw new TypeError(k+" doit être booléen");
 if(c.usage!==undefined&&c.usage!=="laboratoire")throw new TypeError("Usage laboratoire uniquement");
}
function proposer(c){
 valider(c);
 const raisons=[];
 if(!c.analyseLocaleAutorisee)raisons.push("analyse_non_autorisee");
 if(!c.integriteSourceOk)raisons.push("source_incertaine");
 if(c.modeManuel)raisons.push("choix_manuel_prioritaire");
 if(c.degradation!=="bruit_gaussien")raisons.push("type_non_specifique");
 if(c.probaGauss<.9)raisons.push("confiance_insuffisante");
 if(c.sigmaEstime<.035)raisons.push("bruit_estime_trop_faible");
 const candidat=raisons.length===0;
 if(candidat&&!c.statutModelValide)raisons.push("validation_materielle_manquante");
 return Object.freeze({
  statut:candidat&&c.statutModelValide?"essai_supervise_possible":"ne_pas_appliquer",
  propositionEtude:candidat,applicationAutomatique:false,entrainementAutomatique:false,publication:false,
  raisons,provenance:"politique expérimentale, scores à fournir par modèle privé validé"
 });
}
function prioriserAnnotations(cas){
 if(!Array.isArray(cas)||cas.length>1000)throw new TypeError("Cas invalides");
 const connus=new Set(),out=[];
 for(const x of cas){
  if(!x||typeof x.id!=="string"||!/^[A-Za-z0-9_-]{1,32}$/.test(x.id)||connus.has(x.id))throw new TypeError("ID opaque unique requis");
  connus.add(x.id);
  if(!["fleur","oreilles","lunettes","autre_ar","inconnu"].includes(x.type))throw new TypeError("Type non autorisé");
  if(!["proposition","revue_positive","revue_negative"].includes(x.statut))throw new TypeError("Statut invalide");
  if(!finite(x.confiance)||x.confiance<0||x.confiance>1)throw new TypeError("Confiance invalide");
  if(typeof x.groupe!=="string"||!/^[A-Za-z0-9_-]{1,50}$/.test(x.groupe))throw new TypeError("Groupe opaque requis");
  const score=(x.statut==="proposition"?100:0)+(x.type==="autre_ar"?30:0)+(1-x.confiance)*20;
  out.push({id:x.id,groupe:x.groupe,type:x.type,statut:x.statut,priorite:+score.toFixed(3),
    masqueVerifie:false,originalNonFiltreConfirme:false});
 }
 return out.sort((a,b)=>b.priorite-a.priorite||a.groupe.localeCompare(b.groupe)||a.id.localeCompare(b.id));
}
module.exports=Object.freeze({proposer,prioriserAnnotations});
