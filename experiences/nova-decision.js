/* RetoucheProAI NOVA — arbitre de candidats v0.1 (prototype expérimental).
 * Comparaisons de signaux, pas score de réalisme ni récupération certifiée.
 * Aucun réseau, aucun accès au média, aucune activation d'un modèle neuronal.
 */
var NOVA_DECISION=(()=>{
  "use strict";
  const n=x=>typeof x==="number"&&Number.isFinite(x);
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const round=x=>Math.round(x*10000)/10000;
  function verifier(m){
    if(!m||!n(m.luminance)||!n(m.ecretage)||!n(m.contours)||
       m.luminance<0||m.luminance>1||m.ecretage<0||m.ecretage>1||m.contours<0||m.contours>1)
      throw new TypeError("Mesures normalisées (luminance, ecretage, contours) requises");
    return m;
  }
  function arbitrer(source,candidats,options={}){
    verifier(source);
    if(!Array.isArray(candidats))throw new TypeError("Liste de candidats requise");
    const autorise=options.autoriserGeneration===true;
    const vue=[],idVus=new Set(["original"]);
    for(const c of candidats){
      if(!c||typeof c.id!=="string"||!c.id||idVus.has(c.id))throw new TypeError("Identifiant candidat non unique");
      idVus.add(c.id);const m=verifier(c.mesures),raisons=[],alertes=[];
      const generation=c.generatif===true;
      if(generation&&!autorise)alertes.push("Reconstruction non autorisée : candidat écarté");
      if(c.prouvable===false)alertes.push("Comparaison technique insuffisante");
      if(n(c.confiance)&&c.confiance<.65)alertes.push("Confiance d'analyse insuffisante");
      if(m.ecretage>source.ecretage+.012)alertes.push("Écrêtage accru");
      if(m.contours<source.contours*.86)alertes.push("Perte de contours mesurée");
      if(m.contours>Math.max(source.contours*.0+0.02,source.contours*1.55))alertes.push("Suraccentuation possible");
      const ecart=n(c.ecart)?c.ecart:0;
      if(ecart>.12)alertes.push("Modification excessive des pixels");
      if(n(c.scintillementDelta)&&c.scintillementDelta>.005)alertes.push("Scintillement accru");
      if(n(c.deriveIdentite)&&c.deriveIdentite>.02)alertes.push("Identité du visage potentiellement altérée");
      const sombre=source.luminance<.28;
      const lumiere= sombre?clamp((m.luminance-source.luminance)*3,0,.2):0;
      const contours=clamp(m.contours-source.contours,0,.07);
      const ecretageAmeliore=clamp(source.ecretage-m.ecretage,0,.05);
      const utilite=round(lumiere+contours*.8+ecretageAmeliore*.4);
      if(lumiere>.008)raisons.push("Lecture des ombres légèrement améliorée (proxy)");
      if(contours>.005)raisons.push("Contraste local des contours accru (proxy, pas détail réel)");
      if(ecretageAmeliore>.005)raisons.push("Moins de zones écrêtées");
      if(utilite<.008)alertes.push("Gain technique insuffisant pour remplacer l'original");
      vue.push({id:c.id,nom:c.nom||c.id,utilite,eligible:alertes.length===0,
        raisons,alertes,generatif:generation,mesures:{luminance:round(m.luminance),
          ecretage:round(m.ecretage),contours:round(m.contours)}});
    }
    const valides=vue.filter(x=>x.eligible).sort((a,b)=>b.utilite-a.utilite);
    const choisi=valides[0]?.id||"original";
    return {version:1,choisi,sourceConservee:choisi==="original",candidats:vue,
      validationHumaineObligatoire:true,
      note:"Sélection technique prudente sur trois indicateurs simples : aucune garantie de fidélité, de réalisme, ni de qualité perçue."};
  }
  return Object.freeze({arbitrer});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=NOVA_DECISION;
