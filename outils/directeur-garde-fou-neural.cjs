/* RetoucheProAI — garde-fous de recherche inspirés des principes de DLSS 5.
 * Ce module ne contient PAS DLSS, n'importe aucun SDK NVIDIA, ne traite aucun pixel.
 * Il ne prend que des mesures numériques anonymisées et ne déclenche aucune application.
 */
'use strict';
const entre=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const entier=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b;
const CLES_PLAN=new Set(['usage','source','objectif','analyseAutorisee','choixManuel','mouvementFiable','alignement','coupeScene','zoneOccultee','referenceOriginale','variationHorsZone','verificationHumaine','moteur']);
const CLES_AR=new Set(['usage','origineReferences','nombreScenes','nombreImages','iouChatAvant','iouChatApres','iouChienAvant','iouChienApres','iouLunettesAvant','iouLunettesApres','fauxPositifsTemoins','annotationVerifiee','validationIphone']);
function validerChamps(o,clés){
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).length!==clés.size||Object.keys(o).some(k=>!clés.has(k)))
  throw new TypeError('Diagnostic anonyme uniquement, sans fichier, nom, pixels ni clé supplémentaire');
}
function planifierRenduNeuronal(d){
 validerChamps(d,CLES_PLAN);
 if(d.usage!=='laboratoire'||!['video_2d','rendu_3d'].includes(d.source)||!['fidelite','reconstruction_explicite'].includes(d.objectif)||!['iphone_safari','ordinateur','laboratoire_cpu'].includes(d.moteur))
  throw new TypeError('Usage, source, objectif ou environnement invalide');
 for(const k of ['analyseAutorisee','choixManuel','mouvementFiable','coupeScene','referenceOriginale','verificationHumaine']) if(typeof d[k]!=='boolean') throw new TypeError('Booléen requis: '+k);
 for(const k of ['alignement','zoneOccultee','variationHorsZone']) if(!entre(d[k],0,1))throw new RangeError('Fraction invalide: '+k);
 const raisons=[];
 if(!d.analyseAutorisee)raisons.push('analyse_non_autorisee');
 if(d.choixManuel)raisons.push('choix_manuel_prioritaire');
 if(d.coupeScene)raisons.push('reinitialiser_etat_temporel');
 if(!d.mouvementFiable||d.alignement<.9)raisons.push('mouvement_non_fiable');
 if(d.variationHorsZone>0)raisons.push('modification_hors_zone');
 if(d.zoneOccultee>0 && d.objectif==='fidelite' && !d.referenceOriginale) raisons.push('pixels_originaux_inobservables');
 if(d.objectif==='reconstruction_explicite'&&!d.verificationHumaine) raisons.push('revue_humaine_obligatoire');
 if(d.source==='video_2d')raisons.push('buffers_moteur_3d_absents');
 let etude='analyse_seule';
 if(raisons.length===0)etude='etude_reconstruction_temporelle';
 else if(raisons.every(r=>r==='buffers_moteur_3d_absents'))etude='etude_video_2d_sans_sdk_nvidia';
 return Object.freeze({etude,raisons:Object.freeze(raisons),
   principes:Object.freeze(['contraintes_structurelles','mouvement_et_etat_causal','masques_et_controles','fidelite_vs_invention','budget_ressources']),
   dlss5NvidiaIntegre:false, sdkNvidiaUtilise:false, applicationAutomatique:false,
   modeleGenere:false, entrainementAutomatique:false, publication:false, deploiement:false});
}
function auditerCandidatAr(d){
 validerChamps(d,CLES_AR);
 if(d.usage!=='laboratoire'||!['procedural','annotation_reelle_verifiee'].includes(d.origineReferences)||!entier(d.nombreScenes,1,10000)||!entier(d.nombreImages,1,1000000)||d.nombreImages<d.nombreScenes)throw new TypeError('Protocole de comparaison invalide');
 for(const k of ['iouChatAvant','iouChatApres','iouChienAvant','iouChienApres','iouLunettesAvant','iouLunettesApres','fauxPositifsTemoins'])if(!entre(d[k],0,1))throw new RangeError('Mesure invalide: '+k);
 for(const k of ['annotationVerifiee','validationIphone'])if(typeof d[k]!=='boolean')throw new TypeError('Booléen requis: '+k);
 const echecs=[];
 if(d.fauxPositifsTemoins>.01)echecs.push('faux_positifs_superieurs_1pct');
 if(d.iouChatApres<.5)echecs.push('chat_iou_inferieur_50pct');
 if(d.iouChienApres+1e-8<d.iouChienAvant-.04)echecs.push('recul_chien');
 if(d.iouLunettesApres+1e-8<d.iouLunettesAvant-.04)echecs.push('recul_lunettes');
 if(d.nombreScenes<5||d.nombreImages<50)echecs.push('echantillon_insuffisant');
 if(d.origineReferences!=='annotation_reelle_verifiee'||!d.annotationVerifiee)echecs.push('masques_reels_non_valides');
 if(!d.validationIphone)echecs.push('validation_iphone_absente');
 return Object.freeze({statut:echecs.length?'rejete_pour_activation':'evaluation_humaine_requise',
  echecs:Object.freeze(echecs), modeleDeployee:false, publication:false, autorisationAutomatique:false,
  choixManuelRequis:true, qualitePerceptuelleNonProuvee:true});
}
module.exports=Object.freeze({planifierRenduNeuronal,auditerCandidatAr});
