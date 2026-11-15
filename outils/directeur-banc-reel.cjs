/* RetoucheProAI — banc d'évaluation réel, local et non entraînant.
 * Aucun accès disque/réseau, aucun média ni poids de modèle inclus.
 * Les cas portent uniquement sur des métadonnées déjà extraites en privé.
 * Une ressemblance ne prouve ni une origine propre ni une amélioration esthétique.
 */
"use strict";

const HEX64=/^[0-9a-f]{64}$/i, PHASH=/^[0-9a-f]{16}$/i;
const INDICES=new Set(["AR","tonal","bruit","faible_lumiere","compression",
  "audio","composite","surimpression","sans_reference","occlusion","continuite"]);
const CLES=new Set(["id","type","sha256","duree","phash","famille","indices","nom"]);
function entierFini(x){return typeof x==="number"&&Number.isFinite(x);}
function normaliserNom(v){
  return (v||"").toLowerCase().replace(/ssstwitter_com_/g,"ssstwitter.com_")
    .replace(/\(\d+\)(?=\.[a-z0-9]+$)/,"")
    .replace(/-regroupee/,"").replace(/-retouche-\d+-\d{8}-\d+/,"");
}
function valider(entrees){
  if(!Array.isArray(entrees)||!entrees.length||entrees.length>1000)
    throw new RangeError("Corpus de 1 à 1000 métadonnées requis");
  const ids=new Set();
  return entrees.map((x,i)=>{
    if(!x||typeof x!=="object"||Array.isArray(x)||Object.keys(x).some(k=>!CLES.has(k)))
      throw new TypeError("Métadonnées non autorisées : ne pas inclure pixels, médias, URL ou chemins");
    if(typeof x.id!=="string"||!/^[A-Za-z0-9_-]{1,40}$/.test(x.id)||ids.has(x.id))
      throw new TypeError("Identifiants anonymes uniques requis");
    ids.add(x.id);
    if(!["video","image"].includes(x.type)||!HEX64.test(x.sha256||""))
      throw new TypeError("Type et empreinte SHA-256 requis");
    if(!entierFini(x.duree)||x.duree<0||x.duree>86400)
      throw new TypeError("Durée invalide");
    if(x.type==="image"&&x.duree!==0)throw new TypeError("Une image a une durée nulle");
    if(!Array.isArray(x.phash)||x.phash.length>8||x.phash.some(p=>!PHASH.test(p)))
      throw new TypeError("Empreintes perceptuelles invalides");
    if(typeof x.famille!=="string"||!/^[A-Za-z0-9_-]{1,70}$/.test(x.famille))
      throw new TypeError("Famille anonyme requise");
    if(!Array.isArray(x.indices)||x.indices.some(z=>!INDICES.has(z)))
      throw new TypeError("Indices de qualité inconnus");
    if(x.nom!==undefined&&(typeof x.nom!=="string"||x.nom.length>220||/[\\\/\n\r]/.test(x.nom)))
      throw new TypeError("Nom simple de fichier uniquement");
    return {id:x.id,type:x.type,sha256:x.sha256.toLowerCase(),duree:x.duree,
      phash:x.phash.map(h=>h.toLowerCase()),famille:x.famille,
      indices:[...new Set(x.indices)],nom:x.nom||""};
  });
}
function differenceHash(a,b){
  let n=BigInt("0x"+a)^BigInt("0x"+b),s=0;
  while(n){s++;n&=n-1n;}
  return s;
}
function visuellementProches(a,b){
  if(a.type!==b.type||a.type!=="video"||a.phash.length<3||b.phash.length<3||
     a.phash.length!==b.phash.length||!a.duree||!b.duree)return false;
  const ratio=Math.max(a.duree,b.duree)/Math.min(a.duree,b.duree);
  if(ratio>1.25)return false;
  const dist=a.phash.map((p,i)=>differenceHash(p,b.phash[i]));
  return dist.filter(x=>x<=11).length>=2;
}
function hashStable(s){
  let v=2166136261;
  for(let i=0;i<s.length;i++){v=Math.imul(v^s.charCodeAt(i),16777619)>>>0;}
  return v>>>0;
}
function banc(entrees,options={}){
  const securite={aucunEntrainement:true,aucunDeploiementAutomatique:true,
    aucunePublication:true,aucunFichierCree:true};
  if(options.autorisationEvaluation!==true)
    return {etat:"refuse",raison:"Autorisation d'évaluation locale requise",...securite};
  const a=valider(entrees),parents=a.map((_,i)=>i);
  const racine=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  const unir=(i,j)=>{const x=racine(i),y=racine(j);if(x!==y)parents[Math.max(x,y)]=Math.min(x,y);};
  const liens=[], copiesExactes=[];
  for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
    const x=a[i],y=a[j];
    const exact=x.sha256===y.sha256;
    const nom=x.nom&&y.nom&&normaliserNom(x.nom)===normaliserNom(y.nom);
    const proche=!exact&&visuellementProches(x,y);
    const famille=x.famille===y.famille;
    if(exact){copiesExactes.push([x.id,y.id]);liens.push({a:x.id,b:y.id,type:"sha256_exact"});}
    else if(nom)liens.push({a:x.id,b:y.id,type:"nom_seulement"});
    else if(proche)liens.push({a:x.id,b:y.id,type:"ressemblance_visuelle_non_certifiee"});
    if(exact||nom||proche||famille)unir(i,j);
  }
  const groupes=new Map();
  a.forEach((x,i)=>{
    const k=racine(i);
    if(!groupes.has(k))groupes.set(k,[]);
    groupes.get(k).push(x);
  });
  const lots={exploration:[],confirmation:[]},plan=[];
  for(const members of groupes.values()){
    const ids=members.map(m=>m.id).sort(),indices=[...new Set(members.flatMap(m=>m.indices))].sort();
    const famille=members.map(m=>m.famille).sort()[0];
    const score=(indices.includes("AR")?100:0)+(indices.includes("occlusion")?90:0)+
      (indices.includes("sans_reference")?75:0)+(indices.includes("compression")?65:0)+
      (indices.includes("faible_lumiere")?60:0)+(indices.includes("tonal")?55:0)+
      (indices.includes("continuite")?50:0)+Math.min(ids.length,5)*4;
    const lot=hashStable(ids.join("|"))%4===0?"confirmation":"exploration";
    lots[lot].push(...ids);
    plan.push({ids,famille,indices,score,lot,
      referenceOriginaleDemontree:false,autorisationEntrainement:false});
  }
  plan.sort((x,y)=>y.score-x.score||x.ids[0].localeCompare(y.ids[0]));
  return {etat:"evaluation_locale",nombreMedias:a.length,
    nombreImages:a.filter(x=>x.type==="image").length,
    nombreGroupes:groupes.size,copiesExactes,liens,
    lots,planTests:plan,statutQualite:"mesures exploratoires; aucune amélioration perceptuelle démontrée",
    ...securite};
}
function comparerAB(m){
  if(!m||typeof m!=="object"||!["apparie","inconnu"].includes(m.alignement))
    throw new TypeError("Alignement déclaré requis");
  const vals=["psnr","ssim","variationTexture","scintillement"];
  if(vals.some(k=>m[k]!==undefined&&!entierFini(m[k])))
    throw new TypeError("Mesures finies requises");
  if(m.ssim!==undefined&&(m.ssim<0||m.ssim>1))throw new RangeError("SSIM hors de [0,1]");
  return {etat:m.alignement==="apparie"?"mesures_techniques_seulement":"comparaison_non_alignee",
    ameliorationPerceptuelleDemontree:false,originalProuve:m.originalProuve===true,
    autorisationEntrainement:false,promotionAutomatique:false,
    raison:"PSNR/SSIM et statistiques seules ne démontrent pas le réalisme ou la récupération d'une zone occultée"};
}
function bilanPublic(r){
  if(!r||r.etat!=="evaluation_locale")throw new TypeError("Bilan valide requis");
  return Object.freeze({etat:r.etat,medias:r.nombreMedias,images:r.nombreImages,
    groupes:r.nombreGroupes,copiesExactes:r.copiesExactes.length,
    liensSuspectes:r.liens.filter(x=>x.type!=="sha256_exact").length,
    aucunePublication:true,aucunEntrainement:true});
}
module.exports=Object.freeze({banc,comparerAB,bilanPublic,differenceHash,visuellementProches,normaliserNom});