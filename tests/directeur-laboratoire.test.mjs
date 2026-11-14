/* Tests du laboratoire — résultat technique synthétique uniquement. */
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const LAB=require("../outils/directeur-laboratoire.cjs");
test("trois niveaux identifiés et aucune autopromotion",()=>{
 const p=LAB.experimenter();assert.ok(p.niveau1&&p.niveau2&&p.niveau3);
 assert.equal(p.aucunDeploiementAutomatique,true);
 assert.equal(p.aucuneDonneeConservee,true);
});
test("banc vraiment reproductible, deux partitions distinctes",()=>{
 assert.deepEqual(LAB.experimenter(),LAB.experimenter());
 assert.notDeepEqual(LAB.donnees(12345,2),LAB.donnees(93217,2));
});
test("exploration de plusieurs familles d'algorithmes",()=>{
 const h=LAB.hypotheses();
 assert.ok(h.length>=20);
 assert.deepEqual(new Set(h.map(x=>x.mode)),new Set(["original","moyenne","contours"]));
});
test("qualité mesurée sur un banc indépendant de l'entraînement",()=>{
 const p=LAB.experimenter();assert.equal(p.nombreCasTrain,18);
 assert.equal(p.nombreCasValidation,18);assert.ok(p.gainTrain>0);
 assert.ok(p.gainValidation>0);assert.equal(p.degradations.length,0);
 assert.equal(p.etat,"proposition_a_revoir");
});
test("priorité donnée à la faiblesse mesurée, pas à la fonction déjà réussie",()=>{
 const p=LAB.prioriser([{module:"AR",gravite:.9,confiance:.9},{module:"4K",gravite:.1,confiance:1}]);
 assert.equal(p[0].module,"AR");assert.equal(p[0].priorite,.81);
});
test("ordre stable à priorité égale",()=>{
 const p=LAB.prioriser([{module:"Z",gravite:.5,confiance:1},{module:"A",gravite:.5,confiance:1}]);
 assert.equal(p[0].module,"A");
});
test("médias privés refusés sans consentements séparés",()=>{
 const p=LAB.experimenter({source:"utilisateur"});
 assert.equal(p.etat,"refuse");assert.equal(p.aucuneDonneeConservee,true);
});
test("même avec consentements, entraînement utilisateur non branché",()=>{
 const p=LAB.experimenter({source:"utilisateur",autorisationStockage:true,autorisationEntrainement:true});
 assert.equal(p.etat,"non_implemente");assert.equal(p.aucunDeploiementAutomatique,true);
});
test("les données entrantes restent intactes",()=>{
 const signal=[.2,.4,.7,.9],snap=signal.slice();
 LAB.appliquer(signal,{mode:"contours",force:.4,seuil:.2});
 assert.deepEqual(signal,snap);
});
test("aucun résultat non fini, essais invalides rejetés",()=>{
 assert.throws(()=>LAB.appliquer([1,NaN,2],{mode:"moyenne",force:.5,seuil:1}),/non fini/);
 assert.throws(()=>LAB.donnees(2,0),/invalides/);
 assert.throws(()=>LAB.experimenter({source:"inconnue"}),/Provenance/);
});
test("référence intacte ne requiert aucune hypothèse inventée",()=>{
 const t=LAB.donnees(42,1);
 const ref=LAB.evaluer({mode:"original",force:0,seuil:1},t);
 assert.ok(ref.erreur>0);
});
