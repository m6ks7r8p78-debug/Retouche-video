/* RetoucheProAI — décisions de recherche pour spécialistes de bruit.
 * Aucun accès au média, poids, réseau, moteur ou stockage. Simulation/labo seulement.
 */
'use strict';
const autorise = new Set(['degradation','confianceGaussien','sigmaEstime','analyseLocaleAutorisee','integriteSourceOK','modeManuel','referenceValidee','expertFortValide','usage']);
const nombres = n => typeof n==='number' && Number.isFinite(n) && n>=0 && n<=1;
function proposerSpecialiste(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c) ||
      Object.keys(c).length !== autorise.size || Object.keys(c).some(k=>!autorise.has(k)))
    throw new TypeError('Diagnostics numériques anonymes requis; aucun média, chemin ni nom');
  if (!['gaussien','compression','jpeg','sain','ar','inconnu'].includes(c.degradation) ||
      !nombres(c.confianceGaussien) || !nombres(c.sigmaEstime) || c.usage!=='laboratoire')
    throw new TypeError('Type, confidence, sigma ou usage invalide');
  for(const k of ['analyseLocaleAutorisee','integriteSourceOK','modeManuel','referenceValidee','expertFortValide'])
    if(typeof c[k] !== 'boolean')throw new TypeError('Booléen attendu: '+k);
  const raisons=[];
  if (!c.analyseLocaleAutorisee) raisons.push('analyse_non_autorisee');
  if (!c.integriteSourceOK) raisons.push('source_non_fiable');
  if (c.modeManuel) raisons.push('choix_manuel_prioritaire');
  if (c.degradation!=='gaussien') raisons.push('hors_bruit_gaussien');
  if (c.confianceGaussien<.9) raisons.push('classification_non_suffisante');
  if (c.sigmaEstime<.035) raisons.push('intervention_non_justifiee');
  if (!c.referenceValidee) raisons.push('reference_indisponible');
  const eligibles=raisons.length===0;
  let proposition='aucun';
  if(eligibles){
    if(c.sigmaEstime>=.085 && c.expertFortValide) proposition='expert_bruit_fort_pour_revue';
    else {
      proposition='reference_pour_revue';
      if(c.sigmaEstime>=.085) raisons.push('specialiste_non_valide_sur_cette_cible');
    }
  }
  return Object.freeze({proposition,raisons,simulationSeulement:true,
    decisionModeleNonVerifieeSurBruitNaturel:true,
    applicationAutomatique:false, entrainementAutomatique:false,
    publication:false, deploiement:false});
}
module.exports=Object.freeze({proposerSpecialiste});
