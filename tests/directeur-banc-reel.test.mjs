import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const M=require("../outils/directeur-banc-reel.cjs");
const hash=s=>s.repeat(64);
const PH="0123456789abcdef";
const make=(id,sha,plus={})=>({id,type:"video",sha256:hash(sha),duree:8,
  phash:[PH,PH,PH],famille:"scene_"+id,indices:[],...plus});

test("aucune évaluation implicite",()=>{
  const r=M.banc([make("A","a")]);
  assert.equal(r.etat,"refuse");
  assert.equal(r.aucunEntrainement,true);
});
test("évaluation locale sans publication ni stockage",()=>{
  const r=M.banc([make("A","a")],{autorisationEvaluation:true});
  assert.equal(r.etat,"evaluation_locale");
  assert.equal(r.aucunFichierCree,true);
  assert.equal(r.aucunePublication,true);
});
test("détecte exactitude SHA et ne sépare jamais les copies",()=>{
  const r=M.banc([make("A","a"),make("B","a")],{autorisationEvaluation:true});
  assert.deepEqual(r.copiesExactes,[["A","B"]]);
  assert.equal(r.nombreGroupes,1);
  assert.equal(r.planTests[0].ids.length,2);
});
test("versions nominales sont candidates, non des originaux certifiés",()=>{
  const r=M.banc([
    make("A","a",{nom:"exemple.mp4",phash:[]}),
    make("B","b",{nom:"exemple-retouche-0001-20261114-070000.mp4",phash:[]})
  ],{autorisationEvaluation:true});
  assert.equal(r.liens[0].type,"nom_seulement");
  assert.equal(r.planTests[0].referenceOriginaleDemontree,false);
});
test("ressemblance pHash n'est pas une identité exacte",()=>{
  const r=M.banc([make("A","a"),make("B","b")],{autorisationEvaluation:true});
  assert.equal(r.copiesExactes.length,0);
  assert.equal(r.liens[0].type,"ressemblance_visuelle_non_certifiee");
});
test("différence temporelle forte ne crée pas de candidat visuel",()=>{
  const r=M.banc([make("A","a"),make("B","b",{duree:20})],{autorisationEvaluation:true});
  assert.equal(r.liens.length,0);
});
test("famille de scène ne fuit pas entre lots",()=>{
  const r=M.banc([make("A","a",{famille:"groupe"}),make("B","b",{famille:"groupe",phash:[]})],
    {autorisationEvaluation:true});
  assert.equal(r.nombreGroupes,1);
  assert.equal(r.planTests[0].ids.length,2);
});
test("l'AR explicite est priorisé, pas identifié par le nom seul",()=>{
  const r=M.banc([make("A","a",{phash:[],indices:["AR"]}),make("B","b",{phash:[]})],
    {autorisationEvaluation:true});
  assert.equal(r.planTests[0].ids[0],"A");
});
test("aucun contournement de consentement pour entraînement",()=>{
  const r=M.banc([make("A","a")],{autorisationEvaluation:true,autorisationEntrainement:true});
  assert.equal(r.aucunEntrainement,true);
  assert.equal(r.planTests[0].autorisationEntrainement,false);
});
test("les données brutes et URL sont rejetées",()=>{
  for(const prop of ["url","pixels","raw","path"]){
    assert.throws(()=>M.banc([make("A","a",{[prop]:"secret"})],{autorisationEvaluation:true}),/non autorisées/);
  }
});
test("les empreintes et identifiants invalides sont rejetés",()=>{
  assert.throws(()=>M.banc([make("A","!")],{autorisationEvaluation:true}),/empreinte/);
  assert.throws(()=>M.banc([make("A","a"),make("A","b")],{autorisationEvaluation:true}),/uniques/);
  assert.throws(()=>M.banc([make("A","a",{phash:["ZZ"]})],{autorisationEvaluation:true}),/perceptuelles/);
});
test("une photo peut faire partie du corpus sans créer de fausse vidéo",()=>{
  const r=M.banc([make("PHOTO","a",{type:"image",duree:0,phash:[],indices:["occlusion"]})],
    {autorisationEvaluation:true});
  assert.equal(r.nombreImages,1);
  assert.equal(r.planTests[0].indices[0],"occlusion");
});
test("le rapport partageable ne contient aucun nom ou empreinte",()=>{
  const r=M.banc([make("A","a",{nom:"fichier-prive.mp4"})],{autorisationEvaluation:true});
  const p=M.bilanPublic(r);
  assert.equal(p.medias,1);
  assert.ok(!JSON.stringify(p).includes("fichier-prive"));
  assert.ok(!JSON.stringify(p).includes(hash("a")));
});
test("AB technique n'autorise ni promotion ni score perceptuel fictif",()=>{
  const r=M.comparerAB({alignement:"apparie",originalProuve:false,psnr:31.2,ssim:.95});
  assert.equal(r.ameliorationPerceptuelleDemontree,false);
  assert.equal(r.promotionAutomatique,false);
});
test("rejet des métriques non finies ou SSIM illégal",()=>{
  assert.throws(()=>M.comparerAB({alignement:"apparie",ssim:NaN}),/finies/);
  assert.throws(()=>M.comparerAB({alignement:"apparie",ssim:1.3}),/hors/);
});
test("reproductible et non mutatif",()=>{
  const x=[make("A","a",{phash:[]}),make("B","b",{phash:[]})],avant=JSON.stringify(x);
  assert.deepEqual(M.banc(x,{autorisationEvaluation:true}),M.banc(x,{autorisationEvaluation:true}));
  assert.equal(JSON.stringify(x),avant);
});