/* Directeur IA v0.1 — tests unitaires synthétiques : node --test tests/directeur-ia.test.mjs
   Ces tests valident les décisions, pas la qualité visuelle réelle ni le comportement de Safari iPhone. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../directeur-ia.js');
const base = {type:'video',w:1280,h:720,mesures:{noise:2,sharp:28,p2:.04,p50:.43,p98:.93,blk:{r:1.37},shake:3,dust:19},scintillement:{frac:.28,mean:.005}};
const ids=p=>p.operations.map(x=>x.id);
test('dégradation multi-cause: plan ordonné et sans doublons',()=>{
  const p=D.planifier(base), x=ids(p);
  assert.deepEqual(x.slice(0,4), ['debloc','debruitage','poussiere','stabilisation']);
  assert.ok(x.indexOf('debloc') < x.indexOf('detail'));
  assert.ok(x.indexOf('stabilisation') < x.indexOf('scintillement'));
  assert.deepEqual(x.slice(-2),['controle','export']);
  assert.equal(x.length,new Set(x).size);
});
test('photo ne propose ni poussières vidéo, ni stabilisation, ni voix',()=>{
 const x=ids(D.planifier({type:'photo',w:640,h:480,mesures:{noise:2.5,sharp:18,dust:100,shake:10,audio:{peak:-20,floor:-40}}}));
 for (const id of ['poussiere','stabilisation','voix','scintillement']) assert.ok(!x.includes(id));
});
test('bonne source: pas de surtraitement',()=>{
 const p=D.planifier({type:'photo',w:3000,h:2000,mesures:{noise:.5,sharp:60,p2:.04,p50:.5,p98:.99}});
 assert.deepEqual(ids(p),['controle','export']);
});
test('mesures absentes ne sont pas traitées comme un flou certain',()=>{
 assert.deepEqual(ids(D.planifier({type:'photo',w:500,h:500})),['controle','export']);
});
test('8K mobile: limite explicite, aucun export fictif',()=>{
 const p=D.planifier({...base,appareil:{mobile:true},choix:{mode:'reconstruction',autoriserGeneration:true,longueur:7680}});
 assert.equal(p.sortie.propose,1920);assert.equal(p.sortie.exportConfigure,false);
 assert.match(p.sortie.limite,/8K/);assert.ok(p.avertissements.some(t=>t.includes('8K')));
});
test('4K desktop et fidélité désactive toute génération',()=>{
 const p=D.planifier({...base,appareil:{mobile:false},choix:{mode:'fidelite',longueur:3840}});
 assert.equal(p.sortie.propose,3840);assert.ok(!ids(p).includes('resolution'));
});
test('reconstruction exige consentement fonctionnel explicite',()=>{
 const p1=D.planifier({...base,choix:{mode:'reconstruction',longueur:3840}});
 const p2=D.planifier({...base,choix:{mode:'reconstruction',longueur:3840,autoriserGeneration:true}});
 assert.ok(!ids(p1).includes('resolution'));assert.ok(ids(p2).includes('resolution'));
 assert.equal(p2.operations.find(x=>x.id==='resolution').genere,true);
});
test('modèle indisponible => refus traçable',()=>{
 const p=D.planifier({...base,disponibles:{stabilisation:false}});
 assert.ok(!ids(p).includes('stabilisation'));assert.ok(p.ecartes.some(x=>x.id==='stabilisation'));
});
test('préférences excluent un traitement sans écraser les autres',()=>{
 const p=D.planifier({...base,choix:{exclus:['debloc','stabilisation']}});
 assert.ok(!ids(p).includes('debloc')&&!ids(p).includes('stabilisation'));
 assert.ok(ids(p).includes('debruitage'));
});
test('protection anti-halos: bruit et compression réduisent la netteté',()=>{
 const faible=D.planifier({type:'photo',w:800,h:600,mesures:{sharp:10,noise:1.8,blk:{r:1.1}}});
 const fort=D.planifier({type:'photo',w:800,h:600,mesures:{sharp:10,noise:6,blk:{r:2}}});
 const a=faible.operations.find(x=>x.id==='detail'),b=fort.operations.find(x=>x.id==='detail');
 assert.ok(a&&(!b||b.intensite<a.intensite));
});
test('souffle audio => voix, sans bruit => absent',()=>{
 const bruit={...base,mesures:{...base.mesures,audio:{peak:-30,floor:-44}}};
 assert.ok(ids(D.planifier(bruit)).includes('voix'));
 assert.ok(!ids(D.planifier(base)).includes('voix'));
});
test('concilier refuse l’activation dangereuse et conserve les autres options',()=>{
 const p=D.planifier({type:'photo',w:3000,h:2000,mesures:{noise:.5,sharp:60}}), r={o:{db:.7,dn:.9,dust:true,stab:true,defl:true,voice:true,cs:.6}};
 assert.equal(D.concilier(r,p),r);
 assert.deepEqual(r.o,{db:0,dn:.2,dust:false,stab:false,defl:false,voice:false,cs:.6});
});
test('plan déterministe et mesure source inchangée',()=>{
 const x=JSON.parse(JSON.stringify(base));assert.deepEqual(D.planifier(x),D.planifier(x));assert.deepEqual(x,base);
});
test('erreurs données d’entrée explicites',()=>{
 assert.throws(()=>D.planifier({type:'video',w:0,h:100}),/dimensions/);
 assert.throws(()=>D.planifier({type:'autre',w:100,h:100}),/type/);
});

test('seuils REC conservés: bruit modéré et scintillement ne sont pas écartés',()=>{
 const p=D.planifier({type:'video',w:720,h:1280,mesures:{noise:1.6,sharp:35},scintillement:{frac:0,mean:.008}});
 assert.ok(ids(p).includes('debruitage'));
 assert.ok(ids(p).includes('scintillement'));
});

test('sortie origine: conserver la résolution source, même en 4K sur mobile',()=>{
 const p=D.planifier({type:'video',w:3840,h:2160,mesures:{noise:.3},appareil:{mobile:true},choix:{longueur:'origine',mode:'reconstruction',autoriserGeneration:true}});
 assert.equal(p.sortie.souhaite,3840);
 assert.equal(p.sortie.propose,3840);
 assert.equal(p.sortie.facteur,1);
 assert.equal(p.sortie.limite,null);
 assert.ok(!ids(p).includes('resolution'));
});
test('sortie origine: ne pas inventer de super-résolution pour une photo 8K',()=>{
 const p=D.planifier({type:'photo',w:7680,h:4320,mesures:{noise:.2},choix:{longueur:'origine',mode:'reconstruction',autoriserGeneration:true}});
 assert.equal(p.sortie.propose,7680);
 assert.equal(p.sortie.facteur,1);
 assert.ok(!ids(p).includes('resolution'));
});
