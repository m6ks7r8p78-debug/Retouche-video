import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {proposerSpecialiste}=require('../outils/directeur-specialistes-bruit.cjs');
const base={degradation:'gaussien',confianceGaussien:.97,sigmaEstime:.06,
 analyseLocaleAutorisee:true,integriteSourceOK:true,modeManuel:false,
 referenceValidee:true,expertFortValide:true,usage:'laboratoire'};
const choose=(changes={})=>proposerSpecialiste({...base,...changes});
test('bruit modéré : référence seulement',()=>assert.equal(choose().proposition,'reference_pour_revue'));
test('bruit fort et expert validé : spécialiste pour revue',()=>assert.equal(choose({sigmaEstime:.1}).proposition,'expert_bruit_fort_pour_revue'));
test('exactement au seuil 0.085 : spécialiste',()=>assert.equal(choose({sigmaEstime:.085}).proposition,'expert_bruit_fort_pour_revue'));
test('expert absent : repli référence et motif',()=>{const r=choose({sigmaEstime:.14,expertFortValide:false});assert.equal(r.proposition,'reference_pour_revue');assert.ok(r.raisons.includes('specialiste_non_valide_sur_cette_cible'))});
test('dégradation inconnue, JPEG et filtre AR : refus',()=>{for(const degradation of ['inconnu','jpeg','compression','ar','sain'])assert.equal(choose({degradation}).proposition,'aucun')});
test('niveau de bruit trop faible : aucune proposition',()=>assert.equal(choose({sigmaEstime:.02}).proposition,'aucun'));
test('confiance insuffisante : aucune proposition',()=>assert.equal(choose({confianceGaussien:.89,sigmaEstime:.12}).proposition,'aucun'));
test('choix manuel prévaut',()=>assert.equal(choose({modeManuel:true}).proposition,'aucun'));
test('analyse et intégrité exigées',()=>{assert.equal(choose({analyseLocaleAutorisee:false}).proposition,'aucun');assert.equal(choose({integriteSourceOK:false}).proposition,'aucun')});
test('référence indisponible : aucune proposition',()=>assert.equal(choose({referenceValidee:false}).proposition,'aucun'));
test('sortie ne peut pas appliquer, entraîner, publier ou déployer',()=>{let x=choose({sigmaEstime:.14});for(const key of ['applicationAutomatique','entrainementAutomatique','publication','deploiement'])assert.equal(x[key],false)});
test('rejette identifiants et noms privés',()=>assert.throws(()=>choose({video:'clip prive'}),/aucun média/));
test('interdit les paramètres non numériques et mode hors labo',()=>{assert.throws(()=>choose({sigmaEstime:NaN}));assert.throws(()=>choose({usage:'production'}))});
