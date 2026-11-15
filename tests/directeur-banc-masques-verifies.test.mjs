import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {evaluerMasquesVerifies, bilanPublicMasques} = require('../outils/directeur-banc-masques-verifies.cjs');
const exemple = (groupe='G1', image=0, ensemble='validation') => ({
  groupe, image, ensemble, annotationHumaineVerifiee:true,
  candidat:{vp:3,fp:1,fn:1,vn:5}, temoin:{vp:2,fp:2,fn:2,vn:4}
});
test('mesure IoU et précision vérifiables, sans promotion', () => {
  const r=evaluerMasquesVerifies([exemple()]);
  assert.equal(r.validation.scoresCandidat.iou,.6);
  assert.equal(r.validation.scoresCandidat.precision,.75);
  assert.equal(r.validation.scoresCandidat.rappel,.75);
  assert.equal(r.validation.scoresCandidat.tauxFauxPositifs,.166667);
  assert.equal(r.validation.scoresTemoin.iou,.333333);
  assert.equal(r.validation.differenceIoU,.266667);
  assert.equal(r.promotionAutomatique,false);
  assert.equal(r.restaurationOriginaleProuvee,false);
});
test('test et validation sont séparés et le groupe est atomique',()=>{
  const r=evaluerMasquesVerifies([exemple(),exemple('G2',0,'test')]);
  assert.equal(r.validation.images,1);
  assert.equal(r.test.images,1);
  assert.throws(()=>evaluerMasquesVerifies([exemple(),exemple('G1',1,'test')]),/Fuite/);
});
test('rejette une image dupliquée',()=>assert.throws(()=>evaluerMasquesVerifies([exemple(),exemple()]),/deux fois/));
test('refuse tout masque non annoté humainement',()=>assert.throws(()=>evaluerMasquesVerifies([{...exemple(),annotationHumaineVerifiee:false}]),/annotation/));
test('refuse des comptes non associés à la même vérité terrain',()=>assert.throws(()=>evaluerMasquesVerifies([{...exemple(),temoin:{vp:2,fp:2,fn:3,vn:3}}]),/vérité terrain/));
test('refuse toute information privée ou champ supplémentaire',()=>assert.throws(()=>evaluerMasquesVerifies([{...exemple(),nom:'IMG-prive.MOV'}]),/non autorisés/));
test('refuse les valeurs non sûres, comptes incomplets et images vides',()=>{
  assert.throws(()=>evaluerMasquesVerifies([{...exemple(),candidat:{vp:NaN,fp:1,fn:1,vn:5}}]));
  assert.throws(()=>evaluerMasquesVerifies([{...exemple(),candidat:{vp:3,fp:1,fn:1}}]));
  assert.throws(()=>evaluerMasquesVerifies([{...exemple(),candidat:{vp:0,fp:0,fn:0,vn:0},temoin:{vp:0,fp:0,fn:0,vn:0}}]));
});
test('absence de positif et de prédiction : ratios non définis plutôt que scores parfaits',()=>{
  const x={...exemple(),candidat:{vp:0,fp:0,fn:0,vn:10},temoin:{vp:0,fp:0,fn:0,vn:10}};
  const r=evaluerMasquesVerifies([x]);
  assert.equal(r.validation.scoresCandidat.iou,null);
  assert.equal(r.validation.scoresCandidat.precision,null);
  assert.equal(r.validation.scoresCandidat.rappel,null);
});
test('le bilan public supprime les scores de petits ensembles',()=>{
  const b=bilanPublicMasques(evaluerMasquesVerifies([exemple()]));
  assert.equal(b.validation.scoresDiffusables,false);
  assert.equal(b.validation.candidat,null);
  assert.equal(b.publicationDeMedias,false);
});
test('le bilan public agrégé est possible avec cinq groupes et cinquante images',()=>{
  const frames=Array.from({length:50},(_,i)=>exemple('G'+Math.floor(i/10),i%10));
  const b=bilanPublicMasques(evaluerMasquesVerifies(frames));
  assert.equal(b.validation.scoresDiffusables,true);
  assert.equal(b.validation.candidat.iou,.6);
  assert.equal(b.validation.groupes,5);
});
test('ne laisse pas publier un faux objet de résultat',()=>assert.throws(()=>bilanPublicMasques({validation:{groupes:999,images:999}}),/Résultat/));
test('entrées vides ou trop grandes refusées',()=>{
  assert.throws(()=>evaluerMasquesVerifies([]));
  assert.throws(()=>evaluerMasquesVerifies(Array(10001).fill(exemple())));
});
