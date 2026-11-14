/* Priorisation des modules faibles : besoin mesuré d'abord, pas de « victoire facile ». */
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require=createRequire(import.meta.url);
const P=require("../outils/directeur-priorites.cjs");
const base={gravite:.5,importance_utilisateur:.8,faisabilite:.5,cout_calcul:.3,risque_regression:.3,nb_cas:20,source:"mesure"};
const mod=(module,o)=>({...base,module,...o});
test("exemple du prompt : SR bonne, filtres AR en échec → filtres AR prioritaires",()=>{
 const r=P.prioriser([mod("super_resolution",{qualite_mesuree:.86,taux_echec:.05,faisabilite:.9}),
  mod("filtres_ar",{qualite_mesuree:.35,taux_echec:.55,gravite:.9,faisabilite:.3,cout_calcul:.7})]);
 assert.deepEqual(r.prochaine_priorite,{module:"filtres_ar",action:"ameliorer"});
 const sr=r.classement.find(x=>x.module==="super_resolution");
 assert.equal(sr.action,"maintenir");assert.ok(sr.score<=.05);
});
test("la facilité ne fait jamais passer un module satisfaisant devant un module faible",()=>{
 for(const f of [0,.25,.5,.75,1]){
  const r=P.prioriser([mod("facile",{qualite_mesuree:.9,taux_echec:0,faisabilite:1,cout_calcul:0,risque_regression:0}),
   mod("faible",{qualite_mesuree:.55,taux_echec:.3,faisabilite:f,cout_calcul:1,risque_regression:1})]);
  assert.equal(r.classement[0].module,"faible");
 }
});
test("sans mesures suffisantes : action « mesurer », jamais « améliorer »",()=>{
 const r=P.prioriser([mod("xx",{qualite_mesuree:.2,taux_echec:.9,nb_cas:3}),mod("yy",{qualite_mesuree:null,taux_echec:null,source:"estimation"})]);
 for(const c of r.classement){assert.equal(c.action,"mesurer");assert.equal(c.mesure,false)}
});
test("une faiblesse plus grave et plus fréquente obtient un score plus élevé",()=>{
 const a=P.evaluer(mod("aa",{qualite_mesuree:.5,taux_echec:.2}));
 const b=P.evaluer(mod("bb",{qualite_mesuree:.5,taux_echec:.5,gravite:.9}));
 assert.ok(b.score>a.score);
 const imp=P.evaluer(mod("cc",{qualite_mesuree:.5,taux_echec:.5,gravite:.9,importance_utilisateur:1}));
 assert.ok(imp.score>b.score);
});
test("modulation bornée par coût et risque, raisons explicites",()=>{
 const sur=P.evaluer(mod("ss",{qualite_mesuree:.4,taux_echec:.4,cout_calcul:0,risque_regression:0}));
 const cher=P.evaluer(mod("cc",{qualite_mesuree:.4,taux_echec:.4,cout_calcul:1,risque_regression:1}));
 assert.ok(cher.score<sur.score&&cher.score>=sur.score*.64-1e-9);
 assert.ok(cher.raisons.some(r=>r.includes("retour arrière")));
});
test("déterministe et entrées invalides refusées",()=>{
 const l=[mod("aa",{qualite_mesuree:.5,taux_echec:.5}),mod("bb",{qualite_mesuree:.5,taux_echec:.5})];
 assert.deepEqual(P.prioriser(l),P.prioriser([...l].reverse()));
 assert.throws(()=>P.prioriser([]));
 assert.throws(()=>P.prioriser([mod("aa",{qualite_mesuree:1.2,taux_echec:0})]),RangeError);
 assert.throws(()=>P.prioriser([mod("A b",{qualite_mesuree:.5,taux_echec:0})]),TypeError);
 assert.throws(()=>P.prioriser([mod("aa",{qualite_mesuree:.5,taux_echec:0}),mod("aa",{qualite_mesuree:.5,taux_echec:0})]));
 assert.throws(()=>P.prioriser([mod("aa",{qualite_mesuree:.5,taux_echec:0,source:"devine"})]),RangeError);
});
test("synthétique : jamais déclaré satisfaisant, une faiblesse synthétique reste à améliorer",()=>{
 const bon=P.evaluer(mod("bon",{qualite_mesuree:.9,taux_echec:0,donnees:"synthetique"}));
 assert.equal(bon.action,"mesurer");assert.equal(bon.satisfaisant,false);
 const faible=P.evaluer(mod("faible",{qualite_mesuree:.4,taux_echec:.5,donnees:"synthetique"}));
 assert.equal(faible.action,"ameliorer");assert.ok(faible.raisons.some(r=>r.includes("synthétiques")));
 assert.throws(()=>P.prioriser([mod("x1",{qualite_mesuree:.4,taux_echec:.5,donnees:"imagine"})]),RangeError);
});
test("une faiblesse confirmée d'un module important passe devant des inconnues",()=>{
 const r=P.prioriser([mod("faible",{qualite_mesuree:.37,taux_echec:.62,gravite:.77,importance_utilisateur:1,faisabilite:.35,cout_calcul:.7,risque_regression:.5,nb_cas:8,donnees:"synthetique"}),
  mod("inconnu",{qualite_mesuree:null,taux_echec:null,source:"estimation",nb_cas:0,importance_utilisateur:1})]);
 assert.deepEqual(r.prochaine_priorite,{module:"faible",action:"ameliorer"});
});
test("état versionné : valide, aucune qualité inventée, filtres AR mesurés et prioritaires",()=>{
 const etat=JSON.parse(readFileSync(new URL("../suivi/etat-modules.json",import.meta.url)));
 for(const m of etat.modules){
  if(m.source==="mesure"){assert.ok(m.nb_cas>=5&&typeof m.preuve==="string"&&m.preuve.length>20&&m.donnees);continue}
  assert.ok(m.qualite_mesuree===null&&m.source==="estimation");
 }
 const r=P.prioriser(etat.modules);
 assert.equal(r.prochaine_priorite.module,"filtres_ar");
 assert.equal(r.aucuneModificationAutomatique,true);
});
