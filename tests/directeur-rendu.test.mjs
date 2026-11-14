/* Per-frame temporal denoise tests: no proof of perceptual image quality. */
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const R=require("../directeur-rendu.js");
const z=(debut,fin,noise,n=3)=>({debut,fin,mesures:{noise},echantillons:n,confiance:n>=2?"limitee":"faible"});
const zones={zones:[z(0,5,.7),z(5,10,4.5)]};
const plan=()=>R.preparer({zonage:zones,bruitGlobal:2.5,activer:true});
test("clean segment reduces denoising to protect texture",()=>{
 const p=plan();assert.ok(p.actif);assert.ok(R.facteur(p,2)<1);assert.ok(R.facteur(p,2)>=.78);
});
test("noisy segment modestly increases denoising",()=>{
 const p=plan();assert.ok(R.facteur(p,8)>1);assert.ok(R.facteur(p,8)<=1.10);
});
test("smooth boundary: no sudden jump between adjacent frames",()=>{
 const p=plan();
 for(let t=4.3;t<5.65;t+=1/30)assert.ok(Math.abs(R.facteur(p,t+1/30)-R.facteur(p,t))<.017);
});
test("manual adjustments and AI pipelines disable temporal modulation",()=>{
 for(const c of [{manuel:true},{ia:true},{activer:false}]){
 const p=R.preparer({zonage:zones,bruitGlobal:2.5,activer:true,...c});
 assert.equal(p.actif,false);assert.equal(R.facteur(p,7),1);
 }
});
test("stable or single zone never alters export",()=>{
 const p=R.preparer({zonage:{zones:[z(0,10,.8)]},bruitGlobal:1,activer:true});
 assert.equal(p.actif,false);
 const s=R.preparer({zonage:{zones:[z(0,5,1),z(5,10,1.2)]},bruitGlobal:1.1,activer:true});
 assert.equal(s.actif,false);
});
test("uncertain single-sample zones not modified",()=>{
 const p=R.preparer({zonage:{zones:[z(0,5,.7,1),z(5,10,5,1)]},bruitGlobal:2.5,activer:true});
 assert.equal(p.actif,false);
});
test("missing nonfinite measurements rejected, no exceptions or new values",()=>{
 for(const z0 of [null,{debut:0,fin:5,echantillons:3,mesures:{noise:NaN},confiance:"limitee"}]){
  const p=R.preparer({zonage:{zones:[z0,z(5,10,5)]},bruitGlobal:2.5,activer:true});
  assert.equal(p.actif,false);
 }
});
test("bounds even for extreme noise anomalies",()=>{
 const p=R.preparer({zonage:{zones:[z(0,5,0),z(5,10,150)]},bruitGlobal:80,activer:true});
 assert.ok(p.actif);
 for(let t=0;t<=10;t+=.05){const f=R.facteur(p,t);assert.ok(f>=.78&&f<=1.10)}
});
test("unknown timestamp gives neutral factor",()=>{
 assert.equal(R.facteur(plan(),NaN),1);assert.equal(R.facteur(plan(),Infinity),1);
});
test("data and plan are not mutated by repeated frame evaluations",()=>{
 const data=structuredClone(zones),p=plan(),snap=structuredClone(p);
 for(let i=0;i<250;i++)R.facteur(p,i/25);
 assert.deepEqual(zones,data);assert.deepEqual(p,snap);
});
test("incomplete or out-of-order zones are refused",()=>{
 const a=R.preparer({zonage:{zones:[z(5,10,.7),z(0,5,4.5)]},bruitGlobal:2.5,activer:true});
 assert.equal(a.actif,false);
 const b=R.preparer({zonage:{zones:[z(0,5,NaN),z(5,10,4.5)]},bruitGlobal:2.5,activer:true});
 assert.equal(b.actif,false);
});

test("netteté jamais accentuée par le Directeur, même dans un segment très bruité",()=>{
 const p=plan();assert.ok(p.actif);
 for(let t=0;t<=10;t+=.03){const f=R.facteurNettete(p,t);assert.ok(f>=.84&&f<=1)}
 assert.ok(R.facteurNettete(p,8)<1);
 assert.equal(R.facteurNettete(p,2),1);
});
test("transition de netteté temporelle continue sans palier visible",()=>{
 const p=plan();
 for(let t=4.2;t<5.8;t+=1/30)
  assert.ok(Math.abs(R.facteurNettete(p,t+1/30)-R.facteurNettete(p,t))<.018);
});
test("aucun effet sur la netteté en profil manuel, IA ou données insuffisantes",()=>{
 for(const c of [{manuel:true},{ia:true},{activer:false}]){
  const p=R.preparer({zonage:zones,bruitGlobal:2.5,activer:true,...c});
  assert.equal(R.facteurNettete(p,8),1);
 }
 const faible=R.preparer({zonage:{zones:[z(0,5,.7,1),z(5,10,4.5,1)]},bruitGlobal:2.5,activer:true});
 assert.equal(R.facteurNettete(faible,8),1);
});
test("entrée temporelle invalide neutralise aussi la netteté",()=>{
 const p=plan();for(const t of [NaN,Infinity,-Infinity])assert.equal(R.facteurNettete(p,t),1);
});
test("fort bruit: la réduction de netteté plafonne à 16 %, sans multiplier le travail GPU",()=>{
 const p=R.preparer({zonage:{zones:[z(0,5,.2),z(5,10,500)]},bruitGlobal:80,activer:true});
 assert.equal(R.facteurNettete(p,8),.84);
 assert.ok(p.amplitudeNettete>.1);
 assert.ok(p.zones.every(v=>Number.isFinite(v.nettete)));
});

test("old/incomplete plans never generate NaN shader coefficients",()=>{
 const p={actif:true,transition:.35,zones:[
  {debut:0,fin:5,facteur:.9},
  {debut:5,fin:10,facteur:1.05,nettete:.9}
 ]};
 for(let t=0;t<=10;t+=.05){
  const x=R.facteurNettete(p,t);
  assert.ok(Number.isFinite(x)&&x>=.84&&x<=1);
 }
});
