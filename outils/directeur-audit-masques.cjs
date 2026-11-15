/* RetoucheProAI — revue statique de propositions de masques temporels.
 * Métadonnées numériques anonymes seulement : jamais pixels, noms, chemins ou modèles.
 * Les alertes sont des priorités de revue, pas des annotations vraies.
 */
"use strict";
const entre=(x,min,max)=>typeof x==="number"&&Number.isFinite(x)&&x>=min&&x<=max;
function verifierSerie(frames){
  if(!Array.isArray(frames)||frames.length===0||frames.length>10000)throw new RangeError("Série invalide");
  for(const [i,x] of frames.entries()){
    if(!x||typeof x!=="object"||Array.isArray(x)||typeof x.present!=="boolean")throw new TypeError("Proposition invalide: "+i);
    const allowed=new Set(["present","fraction","centreRel","iouAligne","verificationHumaine"]);
    if(Object.keys(x).some(k=>!allowed.has(k)))throw new TypeError("Métadonnées restreintes: aucun média, nom ou chemin");
    if(x.verificationHumaine!==false)throw new TypeError("Le protocole exploratoire exige des masques non vérifiés");
    if(x.present){
      if(!entre(x.fraction,0,.05)||x.fraction===0||!Array.isArray(x.centreRel)||x.centreRel.length!==2||x.centreRel.some(n=>!entre(n,0,1)))throw new TypeError("Géométrie invalide");
      if(x.iouAligne!==null&&x.iouAligne!==undefined&&!entre(x.iouAligne,0,1))throw new TypeError("IoU invalide");
    }else if(x.fraction!==0||x.centreRel!==null)throw new TypeError("Une absence n'a pas de géométrie");
  }
}
function auditerSerie(frames){
  verifierSerie(frames);
  let precedent=null;
  const details=frames.map((x,i)=>{
    const alertes=[];
    if(precedent&&(!x.present))alertes.push("masque_disparu");
    if(precedent&&x.present){
      const pas=Math.hypot(x.centreRel[0]-precedent.centreRel[0],x.centreRel[1]-precedent.centreRel[1]);
      const ratio=Math.max(x.fraction,precedent.fraction)/Math.min(x.fraction,precedent.fraction);
      if(pas>.14)alertes.push("saut_centre");
      if(ratio>2.5)alertes.push("variation_surface");
      if(x.iouAligne!==null&&x.iouAligne!==undefined&&x.iouAligne<.2)alertes.push("forme_instable");
    }
    precedent=x.present?x:null;
    return Object.freeze({index:i,alertes,aRevoir:alertes.length>0,masqueVerifie:false});
  });
  return Object.freeze({images:frames.length,propositions:frames.filter(x=>x.present).length,
    alertes:details.filter(x=>x.aRevoir).length,details,
    valideParHumain:false,promotionAutomatique:false,publication:false,entrainementSurPseudomasques:false});
}
function controlerApercu(m){
  if(!m||typeof m!=="object"||Array.isArray(m))throw new TypeError("Mesures requises");
  const allowed=new Set(["fractionMasque","fractionInventee","ecartMaxExterieur","marquePixelsInventes","masqueVerifie"]);
  if(Object.keys(m).some(k=>!allowed.has(k)))throw new TypeError("Métadonnées privées interdites");
  if(!entre(m.fractionMasque,0,1)||!entre(m.fractionInventee,0,1)||!Number.isInteger(m.ecartMaxExterieur)||m.ecartMaxExterieur<0||m.ecartMaxExterieur>255||typeof m.marquePixelsInventes!=="boolean"||typeof m.masqueVerifie!=="boolean")throw new TypeError("Mesures invalides");
  const raisons=[];
  if(m.fractionMasque<=0||m.fractionMasque>.05)raisons.push("surface_source_refusee");
  if(m.fractionInventee<m.fractionMasque||m.fractionInventee>.065)raisons.push("surface_inventee_refusee");
  if(m.ecartMaxExterieur!==0)raisons.push("pixels_exterieurs_modifies");
  if(!m.marquePixelsInventes)raisons.push("carte_invention_absente");
  if(!m.masqueVerifie)raisons.push("masque_revue_humaine_requise");
  return Object.freeze({statut:raisons.length?"revue_requise":"protocole_de_revue_possible",
    raisons,originalRecupere:false,autorisationPublication:false,
    activationAutomatique:false,exploitationPourEntrainement:false});
}
module.exports=Object.freeze({auditerSerie,controlerApercu});
