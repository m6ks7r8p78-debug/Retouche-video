/* Directeur IA : le contrôle qualité doit rester prudent.
   node --test tests/directeur-qualite.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Q = require("../directeur-qualite.js");
const avant={noise:3.2,blk:{r:1.7},sharp:30,p2:.06,p50:.42,p98:.92,dust:22,shake:4.1,ecretageBlanc:.01};
const apres={noise:1.7,blk:{r:1.2},sharp:40,p2:.05,p50:.44,p98:.95,dust:8,shake:1.5,ecretageBlanc:.012};
test("Baisse de bruit/blocs/secousses : progrès mesurés, pas preuve de réalisme",()=>{
 const r=Q.evaluer(avant,apres,{media:"video"});
 assert.equal(r.verdict,"mesures_en_progres"); assert.ok(r.compte.ameliore>=4);
 assert.equal(r.compte.degrade,0);assert.match(r.preuve,/jamais preuve/);
});
test("Dégradation technique => à vérifier, sans faux score parfait",()=>{
 const r=Q.evaluer(apres,avant,{media:"video"});
 assert.equal(r.verdict,"a_verifier");assert.ok(r.alertes.length>=3);
});
test("Lissage destructeur : baisse de bruit mais perte de netteté visible",()=>{
 const a={noise:4,sharp:39},b={noise:1,sharp:12};
 const r=Q.evaluer(a,b,{media:"photo"});
 assert.equal(r.verdict,"a_verifier");
 assert.ok(r.constats.some(c=>c.metric==="Bruit"&&c.verdict==="ameliore"));
 assert.ok(r.constats.some(c=>c.metric==="Netteté mesurée"&&c.verdict==="degrade"));
});
test("Hausse excessive de netteté n'est pas assimilée au détail authentique",()=>{
 const r=Q.evaluer({sharp:18},{sharp:53},{media:"photo"});
 assert.equal(r.verdict,"mesures_en_progres");
 assert.ok(r.prudences.some(c=>/halos/.test(c)));
});
test("Hautes lumières en danger : avertissement, pas restauration inventée",()=>{
 const r=Q.evaluer({p2:.03,p98:.92},{p2:.03,p98:.999},{media:"photo"});
 assert.ok(r.prudences.some(x=>/Hautes lumières/.test(x)));
});
test("Données manquantes : indéterminé et pas de fausses valeurs",()=>{
 const r=Q.evaluer({}, {},{media:"video"});
 assert.equal(r.verdict,"indetermine");
 assert.equal(r.compte.compare,0);
 assert.equal(r.compte.ameliore,0);
 assert.ok(r.inconnues.length>=4);
});
test("Valeurs non finies écartées",()=>{
 const r=Q.evaluer({noise:NaN,sharp:Infinity},{noise:1,sharp:14});
 assert.equal(r.compte.compare,0);
 assert.equal(r.verdict,"indetermine");
});
test("Mesures stables : ne pas affirmer une amélioration",()=>{
 const r=Q.evaluer(avant,avant);
 assert.equal(r.verdict,"mesures_stables");assert.equal(r.compte.ameliore,0);
});
test("Une photo n'évalue pas la stabilisation ou les poussières d'une vidéo",()=>{
 const r=Q.evaluer(avant,apres,{media:"photo"});
 assert.ok(!r.constats.some(c=>c.metric==="Secousses"||c.metric==="Poussières transitoires"));
});
test("Erreur d'entrée explicite et aucune mutation",()=>{
 assert.throws(()=>Q.evaluer(null,{}),/Deux diagnostics/);
 const a=structuredClone(avant),b=structuredClone(apres);
 Q.evaluer(a,b); assert.deepEqual(a,avant);assert.deepEqual(b,apres);
});
