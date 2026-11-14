/* RetoucheProAI — Laboratoire autonome v0.9 (branche expérimentale uniquement).
 * Niveau 1 : adaptation du Directeur IA déjà reliée au rendu.
 * Niveau 2 : optimisation déterministe de réglages sur signaux synthétiques.
 * Niveau 3 : création et comparaison de familles d'hypothèses expérimentales.
 * Aucun média personnel, réseau, réentraînement neuronal, commit ou déploiement.
 */
var DIRECTEUR_LAB=(()=>{
  "use strict";
  const clamp=x=>Math.max(0,Math.min(1,x));
  const finite=x=>typeof x==="number"&&Number.isFinite(x);
  const hasard=seed=>{let v=(seed>>>0)||1;return()=>((v=(Math.imul(1664525,v)+1013904223)>>>0)/4294967296)};
  const familles=Object.freeze(["plat","contour","texture"]);
  function donnees(seed=1234,parFamille=6){
    if(!Number.isInteger(seed)||!Number.isInteger(parFamille)||parFamille<1||parFamille>64)
      throw new RangeError("Graines et nombre de cas synthétiques invalides");
    const r=hasard(seed),exemples=[];
    for(const categorie of familles)for(let k=0;k<parFamille;k++){
      const truth=[],mesurees=[],n=96,decalage=(r()-.5)*.24;
      for(let i=0;i<n;i++){
        const naturel=categorie==="plat"?.47+decalage+.025*Math.sin(i/27):
          categorie==="contour"?.25+decalage+.48*(i>=38+k%17?1:0):
          .48+decalage+.11*Math.sin(i*.48)+.045*Math.sin(i*1.5);
        const v=clamp(naturel);
        truth.push(v);
        mesurees.push(clamp(v+(r()-.5)*(categorie==="texture"?.24:.30)));
      }
      exemples.push({categorie,truth,mesurees});
    }
    return exemples;
  }
  const hypothese=(mode,force,seuil=1)=>Object.freeze({mode,force,seuil});
  function hypotheses(){
    const h=[hypothese("original",0)];
    for(const force of [.15,.3,.45,.6,.8]){
      h.push(hypothese("moyenne",force));
      for(const seuil of [.1,.2,.35,.5])h.push(hypothese("contours",force,seuil));
    }
    return h;
  }
  function appliquer(signal,essai){
    if(!Array.isArray(signal)||!essai||!["original","moyenne","contours"].includes(essai.mode)||
      !finite(essai.force)||essai.force<0||essai.force>1||!finite(essai.seuil)||essai.seuil<=0)
      throw new TypeError("Hypothèse ou signal invalide");
    if(!signal.every(finite))throw new TypeError("Signal non fini");
    if(essai.mode==="original"||essai.force===0)return signal.slice();
    const resultat=signal.slice();
    for(let i=1;i<signal.length-1;i++){
      const c=signal[i],a=signal[i-1],b=signal[i+1];
      const wa=essai.mode==="moyenne"?1:Math.max(0,1-Math.abs(a-c)/essai.seuil);
      const wb=essai.mode==="moyenne"?1:Math.max(0,1-Math.abs(b-c)/essai.seuil);
      resultat[i]=clamp(c*(1-essai.force)+(c+wa*a+wb*b)/(1+wa+wb)*essai.force);
    }
    return resultat;
  }
  function evaluer(essai,lot){
    if(!Array.isArray(lot)||!lot.length)throw new TypeError("Lot de validation requis");
    const erreurs={},nombres={};
    for(const ex of lot){
      if(!familles.includes(ex.categorie)||ex.truth?.length!==ex.mesurees?.length||!ex.truth?.length)
        throw new TypeError("Référence et signal de même dimension requis");
      const rendu=appliquer(ex.mesurees,essai);
      let err=0;
      for(let i=0;i<rendu.length;i++){
        if(!finite(ex.truth[i]))throw new TypeError("Référence non finie");
        err+=(rendu[i]-ex.truth[i])**2;
      }
      erreurs[ex.categorie]=(erreurs[ex.categorie]||0)+err/rendu.length;
      nombres[ex.categorie]=(nombres[ex.categorie]||0)+1;
    }
    let total=0,compte=0;
    for(const id of familles)if(nombres[id]){erreurs[id]/=nombres[id];total+=erreurs[id];compte++}
    return {erreur:total/compte,parCategorie:erreurs};
  }
  function prioriser(diagnostics=[]){
    if(!Array.isArray(diagnostics))throw new TypeError("Diagnostics invalides");
    return diagnostics.filter(x=>x&&typeof x.module==="string"&&finite(x.gravite)&&finite(x.confiance)&&x.gravite>=0&&x.confiance>=0)
      .map(x=>({module:x.module,priorite:+(clamp(x.gravite)*clamp(x.confiance)).toFixed(3)}))
      .sort((a,b)=>b.priorite-a.priorite||a.module.localeCompare(b.module));
  }
  function experimenter(options={}){
    const source=options.source||"synthetique";
    if(!["synthetique","utilisateur"].includes(source))throw new TypeError("Provenance invalide");
    if(source==="utilisateur")return {etat:options.autorisationStockage===true&&options.autorisationEntrainement===true?
      "non_implemente":"refuse",raison:options.autorisationStockage===true&&options.autorisationEntrainement===true?
      "Aucun pipeline de données personnelles raccordé":"Consentements stockage et entraînement distincts requis",
      aucuneDonneeConservee:true,aucunDeploiementAutomatique:true};
    const n=options.nombreParFamille===undefined?6:options.nombreParFamille;
    const train=donnees(12345,n),validation=donnees(93217,n);
    const base=hypothese("original",0),baseTrain=evaluer(base,train),baseVal=evaluer(base,validation);
    const candidats=hypotheses(),res=candidats.map(h=>({h,train:evaluer(h,train)}));
    res.sort((a,b)=>a.train.erreur-b.train.erreur);
    const gagnant=res[0],v=evaluer(gagnant.h,validation);
    const gainTrain=(baseTrain.erreur-gagnant.train.erreur)/baseTrain.erreur;
    const gainValidation=(baseVal.erreur-v.erreur)/baseVal.erreur;
    const degradations=familles.filter(f=>v.parCategorie[f]>baseVal.parCategorie[f]*1.05);
    const compatible=gainTrain>=.02&&gainValidation>=.02&&!degradations.length;
    return {version:1,etat:compatible?"proposition_a_revoir":"non_retenu",
      niveau1:"Adaptation en production de branche, indépendante du laboratoire",
      niveau2:"Recherche de paramètres sur un entraînement synthétique distinct de la validation",
      niveau3:"Familles d'hypothèses générées et confrontées à un banc indépendant",
      provenance:"signaux 1D synthétiques déterministes, aucun média personnel",
      nombreCasTrain:train.length,nombreCasValidation:validation.length,
      hypothesesEvaluees:candidats.length,gagnant:gagnant.h,reference:baseVal,validation:v,
      gainTrain:+gainTrain.toFixed(5),gainValidation:+gainValidation.toFixed(5),
      degradations,aucunDeploiementAutomatique:true,aucuneDonneeConservee:true,
      limites:"Meilleure erreur sur signal 1D synthétique : ni preuve de réalisme, ni entraînement neuronal, ni qualité vidéo"};
  }
  return Object.freeze({donnees,hypotheses,appliquer,evaluer,prioriser,experimenter});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=DIRECTEUR_LAB;
