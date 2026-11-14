import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const M=require("../outils/directeur-selection-pilotes.cjs");
const s={degradation:"bruit_gaussien",probaGauss:.98,sigmaEstime:.06,
 analyseLocaleAutorisee:true,modeManuel:false,statutModelValide:false,integriteSourceOk:true,usage:"laboratoire"};
test("la validation matérielle manque => aucune application",()=>{
 const r=M.proposer(s);assert.equal(r.propositionEtude,true);assert.equal(r.applicationAutomatique,false);
 assert.equal(r.statut,"ne_pas_appliquer");assert.ok(r.raisons.includes("validation_materielle_manquante"));
});
test("même validé, le modèle ne s'active pas automatiquement",()=>{
 const r=M.proposer({...s,statutModelValide:true});
 assert.equal(r.statut,"essai_supervise_possible");assert.equal(r.applicationAutomatique,false);
 assert.equal(r.entrainementAutomatique,false);
});
test("JPEG, compression et AR refusés",()=>{
 for(const degradation of ["jpeg","compression","ar","sain","inconnu"])
  assert.equal(M.proposer({...s,degradation}).propositionEtude,false);
});
test("bruit trop faible refusé",()=>assert.equal(M.proposer({...s,sigmaEstime:.02}).propositionEtude,false));
test("confiance insuffisante refusée",()=>assert.equal(M.proposer({...s,probaGauss:.89}).propositionEtude,false));
test("le choix manuel prévaut",()=>assert.equal(M.proposer({...s,modeManuel:true}).propositionEtude,false));
test("analyse non autorisée refusée",()=>assert.equal(M.proposer({...s,analyseLocaleAutorisee:false}).propositionEtude,false));
test("source incertaine refusée",()=>assert.equal(M.proposer({...s,integriteSourceOk:false}).propositionEtude,false));
test("probabilités mal formées rejetées",()=>{
 for(const v of [NaN,Infinity,-1,1.1])assert.throws(()=>M.proposer({...s,probaGauss:v}),/probaGauss/);
 assert.throws(()=>M.proposer({...s,sigmaEstime:null}),/sigmaEstime/);
});
test("pas d'usage publication",()=>assert.throws(()=>M.proposer({...s,usage:"publication"}),/laboratoire/));
test("les vrais originaux ne sont jamais inventés",()=>{
 const cases=M.prioriserAnnotations([
  {id:"X1",groupe:"g1",type:"fleur",statut:"revue_positive",confiance:1},
  {id:"X2",groupe:"g2",type:"fleur",statut:"proposition",confiance:.8}]);
 assert.equal(cases[0].id,"X2");assert.equal(cases[0].originalNonFiltreConfirme,false);
});
test("IDs dupliqués et catégories invalides rejetés",()=>{
 const x={id:"A",groupe:"g1",type:"fleur",statut:"proposition",confiance:.5};
 assert.throws(()=>M.prioriserAnnotations([x,x]),/unique/);
 assert.throws(()=>M.prioriserAnnotations([{...x,type:"test"}]),/Type/);
});
test("déterminisme sans mutation",()=>{
 const x={...s};assert.deepEqual(M.proposer(x),M.proposer(x));assert.deepEqual(x,s);
});
