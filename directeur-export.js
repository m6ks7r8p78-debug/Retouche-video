/* RetoucheProAI — Précontrôle d'export v0.7.
 * Estimations conservatrices, sans allocation GPU ni test d'encodage.
 * Le WebCodecs réel reste l'autorité finale. Aucune promesse d'export 8K.
 */
var DIRECTEUR_EXPORT=(()=>{
  "use strict";
  const bon=x=>typeof x==="number"&&Number.isFinite(x);
  const miB=1024*1024;
  const entier=x=>bon(x)&&x>0?Math.round(x):0;
  function dimensions(w,h,L){
    w=entier(w);h=entier(h);
    if(!w||!h||!bon(L))return null;
    if(L===-1)return {largeur:w&~1,hauteur:h&~1};
    if(L<=0)return null;
    const s=Math.min(L/Math.max(w,h),L*9/16/Math.min(w,h));
    const largeur=Math.round(w*s/2)*2,hauteur=Math.round(h*s/2)*2;
    return largeur>=2&&hauteur>=2?{largeur,hauteur}:null;
  }
  function preparer(entree={}){
    const w=entier(entree.w),h=entier(entree.h),
      longueur=bon(entree.demande)?entree.demande:1920,
      mobile=!!entree.mobile,gl=entree.limites||{},
      budget=mobile?256*miB:1024*miB,
      gpuMax=entier(gl.texture),renduMax=entier(gl.rendu),
      vp=Array.isArray(gl.viewport)&&gl.viewport.length>=2?gl.viewport:null;
    if(!w||!h)throw new RangeError("Dimensions source invalides");
    const souhaits=[longueur,1920,1280].filter((v,i,a)=>a.indexOf(v)===i),
      candidats=[],rejets=[];
    for(const L of souhaits){
      const d=dimensions(w,h,L);
      if(!d){rejets.push({longueur:L,raison:"Dimensions de sortie invalides"});continue}
      const pixels=d.largeur*d.hauteur;
      const pic= Math.ceil(pixels*4*6); // six surfaces RGBA, estimation non exhaustive
      const raisons=[];
      if(Math.max(d.largeur,d.hauteur)>3840||pixels>3840*2160)
        raisons.push("Sortie supérieure au 4K non validée : le profil d'encodage et la chaîne de rendu doivent être éprouvés");
      if(gpuMax&&Math.max(d.largeur,d.hauteur)>gpuMax)raisons.push("Dépasse MAX_TEXTURE_SIZE WebGL");
      if(renduMax&&Math.max(d.largeur,d.hauteur)>renduMax)raisons.push("Dépasse MAX_RENDERBUFFER_SIZE WebGL");
      if(vp&&vp.every(entier)&&(d.largeur>vp[0]||d.hauteur>vp[1]))raisons.push("Dépasse MAX_VIEWPORT_DIMS WebGL");
      if(pic>budget)raisons.push("Mémoire de travail estimée supérieure au budget de prudence");
      const info={longueur:L,largeur:d.largeur,hauteur:d.hauteur,moEstimes:Math.ceil(pic/miB)};
      if(raisons.length)rejets.push({...info,raison:raisons.join(" ; ")});
      else candidats.push(info);
    }
    const prefere=candidats[0]||null;
    return {version:1,demande:longueur,mobile,budgetMo:budget/miB,
      candidats,rejets,repli:!!prefere&&prefere.longueur!==longueur,
      raisonRepli:rejets.find(x=>x.longueur===longueur)?.raison||null,
      sortiePreferee:prefere,
      examen8k:"Non validé : encoder, profils codec 8K, mémoire, qualité et traitement par tuiles à éprouver sur un appareil réel",
      garantie:"Précontrôle indicatif : WebCodecs.isConfigSupported puis l'encodage restent indispensables"};
  }
  return Object.freeze({dimensions,preparer});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=DIRECTEUR_EXPORT;
