/* RetoucheProAI — Priorisation des modules faibles v1.0 (branche expérimentale, outil de pilotage hors application).
 * Classe les modules selon le BESOIN mesuré (qualité insuffisante, fréquence et gravité des échecs, importance
 * pour l'utilisateur), puis module ce besoin dans une plage bornée par la faisabilité, le coût de calcul et le
 * risque de régression. Principe : un module déjà satisfaisant n'est jamais priorisé parce qu'il est facile à
 * améliorer ; un module sans mesures suffisantes reçoit l'action « mesurer » et non « améliorer ».
 * Aucun réseau, aucune modification de code ou de réglage : le résultat est une recommandation à revoir.
 *   node outils/directeur-priorites.cjs suivi/etat-modules.json
 */
var DIRECTEUR_PRIORITES=(()=>{
  "use strict";
  const SEUILS=Object.freeze({qualiteSatisfaisante:.8,echecSatisfaisant:.1,casMinimum:5});
  const POIDS=Object.freeze({qualite:.4,echec:.35,gravite:.25});
  const unite=["qualite_mesuree","taux_echec","gravite","importance_utilisateur","faisabilite","cout_calcul","risque_regression"];
  const fini=x=>typeof x==="number"&&Number.isFinite(x);
  function verifier(m,i){
    if(!m||typeof m!=="object")throw new TypeError(`module ${i} : objet attendu`);
    if(typeof m.module!=="string"||!/^[a-z0-9_]{2,40}$/.test(m.module))throw new TypeError(`module ${i} : identifiant invalide`);
    for(const k of unite){
      const v=m[k];
      if(v==null&&(k==="qualite_mesuree"||k==="taux_echec"||k==="gravite"))continue;
      if(!fini(v)||v<0||v>1)throw new RangeError(`${m.module}.${k} doit être un nombre entre 0 et 1`);
    }
    if(m.nb_cas!=null&&(!Number.isInteger(m.nb_cas)||m.nb_cas<0))throw new RangeError(`${m.module}.nb_cas invalide`);
    if(m.source!=null&&!["mesure","estimation"].includes(m.source))throw new RangeError(`${m.module}.source : mesure|estimation`);
  }
  function evaluer(m){
    const mesure=m.source==="mesure"&&(m.nb_cas||0)>=SEUILS.casMinimum&&fini(m.qualite_mesuree)&&fini(m.taux_echec);
    const raisons=[];
    const imp=m.importance_utilisateur;
    // Besoin : ce qui manque réellement. Sans mesure, on raisonne sur l'importance seule et on demande des mesures.
    let besoin;
    if(mesure){
      const g=fini(m.gravite)?m.gravite:.5;
      besoin=POIDS.qualite*(1-m.qualite_mesuree)+POIDS.echec*m.taux_echec+POIDS.gravite*g*Math.min(1,m.taux_echec*4);
      raisons.push(`qualité ${m.qualite_mesuree}, échecs ${Math.round(m.taux_echec*100)} % sur ${m.nb_cas} cas`);
    }else{
      besoin=.5;
      raisons.push(`mesures insuffisantes (${m.nb_cas||0} cas, source ${m.source||"inconnue"}) : besoin inconnu`);
    }
    const satisfaisant=mesure&&m.qualite_mesuree>=SEUILS.qualiteSatisfaisante&&m.taux_echec<=SEUILS.echecSatisfaisant;
    // Modulation bornée : la faisabilité ne peut multiplier le besoin que de 0,7 à 1 ; coût et risque de 0,8 à 1.
    const modulation=(.7+.3*m.faisabilite)*(1-.2*m.cout_calcul)*(1-.2*m.risque_regression);
    // Sans mesure, l'ordre des mesures à faire suit l'importance seule : la facilité ne doit pas choisir quoi mesurer.
    let score=besoin*(.4+.6*imp)*(mesure?modulation:1);
    let action;
    if(satisfaisant){
      score=Math.min(score,.05);action="maintenir";
      raisons.push("satisfaisant : seulement surveiller les régressions");
    }else if(!mesure){
      action="mesurer";
      raisons.push("mesurer sur un banc autorisé avant tout développement");
    }else{
      action="ameliorer";
      if(m.risque_regression>.6)raisons.push("risque de régression élevé : expérimentation isolée et retour arrière obligatoires");
      if(m.cout_calcul>.7)raisons.push("coût de calcul élevé : vérifier la tenue sur iPhone");
    }
    return {module:m.module,action,score:+score.toFixed(4),besoin:+besoin.toFixed(4),mesure,satisfaisant,raisons};
  }
  function prioriser(modules){
    if(!Array.isArray(modules)||!modules.length)throw new TypeError("liste de modules attendue");
    const vus=new Set();
    modules.forEach((m,i)=>{verifier(m,i);if(vus.has(m.module))throw new Error(`module dupliqué : ${m.module}`);vus.add(m.module)});
    const rang={ameliorer:0,mesurer:1,maintenir:2};
    const classes=modules.map(evaluer).sort((a,b)=>
      // à score égal à 0,01 près, une faiblesse mesurée passe avant une inconnue
      (Math.abs(b.score-a.score)>.01?b.score-a.score:rang[a.action]-rang[b.action])||a.module.localeCompare(b.module));
    const premier=classes.find(x=>x.action!=="maintenir")||null;
    return Object.freeze({
      classement:classes,
      prochaine_priorite:premier&&{module:premier.module,action:premier.action},
      regles:"Besoin mesuré d'abord ; faisabilité/coût/risque ne modulent que dans une plage bornée ; aucun changement automatique.",
      seuils:SEUILS,aucuneModificationAutomatique:true
    });
  }
  return Object.freeze({prioriser,evaluer,SEUILS});
})();
if(typeof module!=="undefined"&&module.exports){
  module.exports=DIRECTEUR_PRIORITES;
  if(require.main===module){
    const fs=require("fs");
    const f=process.argv[2]||"suivi/etat-modules.json";
    const d=JSON.parse(fs.readFileSync(f,"utf8"));
    console.log(JSON.stringify(DIRECTEUR_PRIORITES.prioriser(d.modules||d),null,1));
  }
}
