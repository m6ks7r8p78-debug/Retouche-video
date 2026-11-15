/* Directeur IA — compatibilité réelle des traitements v0.3.
   Calcul pur (aucun téléchargement, modèle, réseau ou demande d'autorisation).
   Un module pouvant démarrer n'est PAS déclaré efficace/terminé : les erreurs
   de codec, mémoire et qualité restent vérifiées pendant l'exécution.
*/
var DIRECTEUR_CAPACITES=(()=>{
  "use strict";
  function inspecter(c={}){
    const type=c.type==="photo"?"photo":"video",vid=type==="video",wb=!!c.webgl,
      decode=!!c.videoDecoder,encode=!!c.videoEncoder,audio=!!c.audioEncoder,
      voix=!!c.voixModele,auto=!!c.reconstructionAutorisee;
    const disponibles={
      debloc:wb,debruitage:wb,detail:wb,lumiere:wb,
      poussiere:vid&&wb&&decode,
      scintillement:vid&&wb&&decode&&!!c.scintillementMesure,
      stabilisation:vid&&wb,
      voix:vid&&audio&&voix,
      resolution:wb&&(!vid||encode),
      controle:true,export:true
    };
    const raisons=[];
    if(!wb)raisons.push("Moteur graphique WebGL indisponible : les traitements vidéo/photo dépendants du shader ne sont pas exécutables.");
    if(vid&&!decode)raisons.push("Lecture séquentielle WebCodecs absente : poussières et scintillement non garantis.");
    if(vid&&!encode)raisons.push("Encodeur vidéo WebCodecs absent : export vidéo non garanti.");
    if(vid&&!audio)raisons.push("Encodeur audio absent : amélioration de la voix non proposée automatiquement.");
    if(vid&&!voix)raisons.push("Modèle voix désactivé ou incompatible : aucun nettoyage vocal automatique proposé.");
    const manuel=(id,possible,raison)=>({id,possible,declenchement:"manuel",raison});
    const options=[
      manuel("effacer_zone",!vid,"Nécessite de dessiner une zone ; une zone masquée exige une reconstruction déclarée."),
      manuel("retirer_filtre_video",vid&&decode,"Détection et retrait AR imparfaits : analyse par un outil dédié, pas d'activation aveugle."),
      manuel("restaurer_visages_video",vid&&decode,"Reconstruit des détails potentiellement inventés ; consentement et comparaison requis."),
      manuel("changer_format",vid,"Changer de format peut recadrer ou reconstruire des bords ; moteur séparé déjà disponible.")
    ];
    return {version:1,type,disponibles,options,raison:raisons,reconstructionAutorisee:auto,
      garantie:"Compatibilité indicative au démarrage, pas validation du codec, du modèle ni de la qualité finale."};
  }
  return Object.freeze({inspecter});
})();
if(typeof module!=="undefined"&&module.exports)module.exports=DIRECTEUR_CAPACITES;
