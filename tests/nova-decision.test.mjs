import test from "node:test";
import assert from "node:assert/strict";
import NOVA from "../experiences/nova-decision.js";
const s={luminance:.19,ecretage:.002,contours:.11};
const make=(id,mesures,extra={})=>({id,mesures,ecart:.03,confiance:.85,prouvable:true,...extra});
test("retient une correction douce mesurable pour une source sombre",()=>{
 const d=NOVA.arbitrer(s,[make("lumiere",{luminance:.24,ecretage:.003,contours:.112})]);
 assert.equal(d.choisi,"lumiere");assert.equal(d.validationHumaineObligatoire,true);
});
test("ne change rien s'il n'y a pas de gain positif",()=>{
 const d=NOVA.arbitrer({luminance:.53,ecretage:.002,contours:.12},
 [make("plat",{luminance:.53,ecretage:.002,contours:.12})]);
 assert.equal(d.choisi,"original");assert.equal(d.sourceConservee,true);
});
test("rejette les hautes lumières massivement écrêtées",()=>{
 const d=NOVA.arbitrer(s,[make("brule",{luminance:.25,ecretage:.04,contours:.12})]);
 assert.equal(d.choisi,"original");assert.ok(d.candidats[0].alertes.some(x=>x.includes("Écrêtage")));
});
test("rejette le lissage excessif et la suraccentuation",()=>{
 for(const contour of [.02,.3]){
  const d=NOVA.arbitrer(s,[make("contours",{luminance:.23,ecretage:.003,contours:contour})]);
  assert.equal(d.choisi,"original");
 }
});
test("rejette une intervention trop grande et une faible confiance",()=>{
 for(const extra of [{ecart:.19},{confiance:.2}]){
  const d=NOVA.arbitrer(s,[make("risque",{luminance:.23,ecretage:.002,contours:.12},extra)]);
  assert.equal(d.choisi,"original");
 }
});
test("la génération est interdite sans consentement, même si le proxy est positif",()=>{
 const c=make("inventer",{luminance:.23,ecretage:.003,contours:.12},{generatif:true});
 assert.equal(NOVA.arbitrer(s,[c]).choisi,"original");
 assert.equal(NOVA.arbitrer(s,[c],{autoriserGeneration:true}).choisi,"inventer");
});
test("refuse scintillement ou altération d'identité",()=>{
 for(const extra of [{scintillementDelta:.018},{deriveIdentite:.07}]){
  assert.equal(NOVA.arbitrer(s,[make("risque",{luminance:.23,ecretage:.002,contours:.12},extra)]).choisi,"original");
 }
});
test("ne modifie pas les entrées et rejette les identifiants dupliqués",()=>{
 const c=make("lumiere",{luminance:.24,ecretage:.003,contours:.11});
 const copy=JSON.stringify(c);NOVA.arbitrer(s,[c]);assert.equal(JSON.stringify(c),copy);
 assert.throws(()=>NOVA.arbitrer(s,[c,c]),/unique/);
});
test("les mesures manquantes ou absurdes sont refusées",()=>{
 assert.throws(()=>NOVA.arbitrer({luminance:.5},[]));
 assert.throws(()=>NOVA.arbitrer(s,[make("impossible",{luminance:2,ecretage:.2,contours:.1})]));
});
