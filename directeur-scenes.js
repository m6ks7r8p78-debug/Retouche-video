/* RetoucheProAI — Directeur temporel v0.3.
   Zones de QUALITÉ échantillonnées, pas des coupes de plans certifiées.
   Calcul pur, sans DOM, aucun réseau, sans modèle supplémentaire.
   Les frontières proviennent de sondages espacés : elles sont approximatives.
*/
var DIRECTEUR_SCENES = (() => {
  "use strict";
  const nombre = x => typeof x === "number" && Number.isFinite(x);
  const borne = (v,a,b) => Math.max(a, Math.min(b,v));
  const mediane = a => {
    if (!a.length) return null;
    const b=a.slice().sort((x,y)=>x-y);
    return b.length%2 ? b[b.length>>1] : (b[b.length/2-1]+b[b.length/2])/2;
  };
  const round = n => +n.toFixed(3);
  const classe = e => ({
    lumiere: nombre(e.p50) && e.p50 < .18 ? "sombre" : "normale",
    bruit: nombre(e.noise) && e.noise >= 3 ? "marque" : "modere",
    nettete: nombre(e.sharp) && e.sharp < 23 ? "faible" : "normale",
  });
  const signature = s => [s.lumiere,s.bruit,s.nettete].join("|");
  function analyser(entree) {
    const duree = entree && entree.duree, donnees=entree && entree.echantillons;
    if (!nombre(duree) || duree <= 0) throw new RangeError("Durée vidéo invalide");
    if (!Array.isArray(donnees) || !donnees.length) {
      return { version:1,duree,echantillons:0,zones:[],avertissements:["Aucun échantillon temporel disponible : utiliser le plan global."] };
    }
    // Les valeurs sont issues d'un décodage local effectué par le moteur d'analyse.
    // Ne pas conserver de pixels, de pistes audio ou de données personnelles.
    const pts=donnees.filter(e=>e && nombre(e.t) && nombre(e.p50) && nombre(e.noise) && nombre(e.sharp) && nombre(e.p2) && nombre(e.p98))
      .map(e=>({t:borne(e.t,0,duree),p50:e.p50,p2:e.p2,p98:e.p98,noise:e.noise,sharp:e.sharp}))
      .sort((a,b)=>a.t-b.t)
      .filter((e,i,a)=>i===0 || e.t-a[i-1].t>=.001);
    if (!pts.length) return {version:1,duree,echantillons:0,zones:[],avertissements:["Échantillons incomplets : conserver le plan global."]};
    // Un nombre réduit de sondages ne permet pas de positionner des changements de plan à l'image près.
    const cuts=[0];
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i],sa=classe(a),sb=classe(b),
        jump=Math.abs(a.p50-b.p50), deltaBruit=Math.abs(a.noise-b.noise),
        kinds=signature(sa)!==signature(sb);
      if (kinds && (jump>.17 || (deltaBruit>=1.7 && Math.abs(a.sharp-b.sharp)>=6)))
        cuts.push(i);
    }
    cuts.push(pts.length);
    const med = key => {
      const v=pts.map(e=>e[key]).filter(nombre);
      return mediane(v);
    };
    const mediandes={p2:med("p2"),p50:med("p50"),p98:med("p98"),noise:med("noise"),sharp:med("sharp")};
    const zones=[];
    for(let k=0;k<cuts.length-1;k++){
      const i0=cuts[k],i1=cuts[k+1],slice=pts.slice(i0,i1),first=slice[0],last=slice[slice.length-1];
      const a=i0===0?0:(pts[i0-1].t+first.t)/2;
      const b=i1===pts.length?duree:(last.t+pts[i1].t)/2;
      const m={};
      for(const key of ["p2","p50","p98","noise","sharp"])m[key]=round(mediane(slice.map(e=>e[key])));
      const etat=classe(m);
      const raison=[];
      if(etat.lumiere==="sombre")raison.push("luminance faible");
      if(etat.bruit==="marque")raison.push("bruit marqué");
      if(etat.nettete==="faible")raison.push("netteté faible");
      if(!raison.length)raison.push("conserver les textures naturelles");
      const difference=Math.abs(m.p50-mediandes.p50)>.14||Math.abs(m.noise-mediandes.noise)>1.3;
      zones.push({
        debut:round(a),fin:round(Math.max(a,b)),echantillons:slice.length,mesures:m,etat,
        priorites:raison,prioriteLocale:difference,confiance:slice.length>=2?"limitee":"faible",
        precision:"frontières approximatives ; ne reflète pas nécessairement une coupe de plan"
      });
    }
    return {version:1,duree,echantillons:pts.length,zones,
      variation:zones.length>1||zones.some(x=>x.prioriteLocale),
      avertissements:[
        "Sondages répartis dans la durée : ne pas confondre changement d'éclairage et changement de scène.",
        "Ces zones orientent un diagnostic, pas encore les réglages image par image de l'export."
      ]};
  }
  return Object.freeze({analyser});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=DIRECTEUR_SCENES;
