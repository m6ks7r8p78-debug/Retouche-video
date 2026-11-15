/* RetoucheProAI — Adaptation temporelle de débruitage et protection des textures v0.6.
 * S'applique uniquement au pipeline vidéo classique, pendant l'export.
 * Aucune seconde analyse ni allocation par image : un facteur scalaire par frame.
 * Ne modifie jamais les réglages P.dn, les profils, les pixels source ni les modules IA.
 * Des sondages clairsemés ne prouvent pas des coupes de plan : l'effet est volontairement borné.
 */
var DIRECTEUR_RENDU=(()=>{
  "use strict";
  const bon = x => Number.isFinite(x);
  const borne = (v,a,b) => Math.max(a,Math.min(b,v));
  function preparer({zonage,bruitGlobal,activer=false,manuel=false,ia=false}={}) {
    const neutre=(raison)=>({version:1,actif:false,raison,zones:[],amplitude:0});
    if(!activer)return neutre("Adaptation non activée");
    if(manuel)return neutre("Réglage manuel prioritaire");
    if(ia)return neutre("Pipeline IA spécifique : ne pas superposer un réglage de bruit non validé");
    if(!bon(bruitGlobal)||bruitGlobal<0)return neutre("Niveau global de bruit inconnu");
    if(!zonage||!Array.isArray(zonage.zones)||zonage.zones.length<2)
      return neutre("Variations locales insuffisantes");
    const zones=zonage.zones.map(z=>{
      const debut=z&&z.debut,fin=z&&z.fin,m=z&&z.mesures,noise=m&&m.noise;
      if(!bon(debut)||debut<0||!bon(fin)||fin<=debut||!bon(noise)||noise<0) return null;
      let facteur=1;
      const fiable=z.echantillons>=2&&z.confiance==="limitee"&&fin-debut>=.5;
      // Une forte netteté et une dynamique étendue peuvent signaler du détail
      // naturel plutôt qu'un bruit aléatoire : atténuer les interventions.
      // Ce garde-fou n'est pas un classificateur sémantique de texture.
      const dynamique=m&&bon(m.p2)&&bon(m.p98)?m.p98-m.p2:null;
      const textureProtegee=bon(m&&m.sharp)&&m.sharp>=55&&bon(dynamique)&&dynamique>=.45;
      const prudence=textureProtegee?.25:1;
      // Moins de débruitage si un passage est propre, surtout pour conserver les textures.
      if(fiable&&noise<=1.5&&bruitGlobal-noise>=.65)
        facteur=1-borne(.045*(bruitGlobal-noise-.3),0,.22);
      // Renforcement modeste uniquement si une zone est réellement plus bruitée.
      else if(fiable&&noise>=3&&noise-bruitGlobal>=.8)
        facteur=1+borne(.025*(noise-bruitGlobal-.4),0,.10)*prudence;
      // Ne jamais accentuer une zone bruitée : on réduit modestement l'accentuation
      // existante au lieu de créer des détails. Les zones propres restent inchangées.
      const nettete=fiable&&noise>=3&&noise-bruitGlobal>=.8
        ? 1-borne(.035*(noise-bruitGlobal-.3),0,.16)*prudence : 1;
      return {debut,fin,bruit:+noise.toFixed(3),echantillons:z.echantillons,
        confiance:z.confiance,textureProtegee,facteur:+facteur.toFixed(4),nettete:+nettete.toFixed(4)};
    });
    if(zones.some(z=>!z))return neutre("Données temporelles incomplètes");
    for(let i=1;i<zones.length;i++)
      if(zones[i].debut<zones[i-1].debut||zones[i].fin<zones[i-1].fin||
        Math.abs(zones[i].debut-zones[i-1].fin)>.005)
        return neutre("Zones temporelles disjointes ou superposées");
    if(bon(zonage.duree) && (Math.abs(zones[0].debut)>.005||
      Math.abs(zones[zones.length-1].fin-zonage.duree)>.005))
      return neutre("Zones temporelles incomplètes pour la durée annoncée");
    const amplitudeBruit=Math.max(...zones.map(z=>Math.abs(z.facteur-1))),
      amplitudeNettete=Math.max(...zones.map(z=>Math.abs(z.nettete-1)));
    const amplitude=Math.max(amplitudeBruit,amplitudeNettete);
    if(amplitude<.005)return neutre("Différences locales trop faibles pour intervenir");
    return {version:2,actif:true,raison:"Débruitage et netteté adaptés avec prudence aux zones mesurées, en protégeant les textures probables",
      zones,amplitude:+amplitude.toFixed(4),
      amplitudeBruit:+amplitudeBruit.toFixed(4),amplitudeNettete:+amplitudeNettete.toFixed(4),transition:.35,
      limite:"Adaptation expérimentale : baisse légère de netteté dans le bruit, jamais de hausse ni de détails inventés ; comparer le rendu aux originaux"};
  }
  /* Fonction définie une fois, plutôt qu'une nouvelle fermeture à chaque frame. */
  function interpoler(a,b,lim,t,champ){
    const front=(a.fin+b.debut)/2;
    if(!bon(front)||Math.abs(front-t)>=lim||!bon(a[champ])||!bon(b[champ]))return null;
    const f=borne((t-front+lim)/(2*lim),0,1),smooth=f*f*(3-2*f);
    return a[champ]+(b[champ]-a[champ])*smooth;
  }
  function calculer(plan,t,champ,min,max){
    if(!plan||!plan.actif||!bon(t)||!Array.isArray(plan.zones)||!plan.zones.length)return 1;
    const zones=plan.zones;
    let i=zones.length-1;
    for(let k=0;k<zones.length;k++){if(t<zones[k].fin){i=k;break}}
    if(!bon(zones[i][champ]))return 1;
    let v=zones[i][champ];
    const tW=plan.transition||.35;
    if(i>0){const v0=interpoler(zones[i-1],zones[i],tW,t,champ);if(v0!==null)v=v0}
    if(i<zones.length-1){const v1=interpoler(zones[i],zones[i+1],tW,t,champ);if(v1!==null)v=v1}
    return Math.round(borne(v,min,max)*100000)/100000;
  }
  function facteur(plan,t){return calculer(plan,t,"facteur",.78,1.10)}
  function facteurNettete(plan,t){return calculer(plan,t,"nettete",.84,1)}
  return Object.freeze({preparer,facteur,facteurNettete});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=DIRECTEUR_RENDU;
