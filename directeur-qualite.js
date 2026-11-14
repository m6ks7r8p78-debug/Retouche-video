/* RetoucheProAI — Directeur IA : contrôle comparatif mesurable v0.2.
   Métriques issues des analyseurs existants ; aucun réseau / DOM / modèle neural.
   Ce contrôle ne prétend NI mesurer le réalisme ni retrouver la vérité terrain.
   Il n'interdit pas un export : il fournit des signaux de relecture et des réserves. */
var DIRECTEUR_QUALITE = (() => {
  "use strict";
  const bon = x => Number.isFinite(x), arr = [];
  function evaluer(avant, apres, options = {}) {
    if (!avant || !apres) throw new TypeError("Deux diagnostics du même média sont requis");
    const constats = [], alertes = [], prudences = [], inconnues = [];
    const opt = options || {}, media = opt.media === "photo" ? "photo" : "video";
    const m = (nom, a, b, limite, sens, detail) => {
      if (!bon(a) || !bon(b)) { inconnues.push(nom); return }
      const variation = b - a, amelioration = sens * variation;
      const verdict = amelioration > limite ? "ameliore" : amelioration < -limite ? "degrade" : "stable";
      const ligne = { metric: nom, avant: +a.toFixed(4), apres: +b.toFixed(4),
        variation: +variation.toFixed(4), verdict, interpretation: detail };
      constats.push(ligne);
      if (verdict === "degrade") alertes.push(nom+" : variation défavorable mesurée ; revoir le résultat à l'œil");
      return ligne;
    };
    const bin = (x, path) => path.reduce((a, k) => a && typeof a === "object" ? a[k] : undefined, x);
    m("Bruit",avant.noise,apres.noise,.35,-1,"Un bruit plus faible peut aussi correspondre à une texture gommée.");
    m("Blocs de compression",bin(avant,["blk","r"]),bin(apres,["blk","r"]),.12,-1,"Valeur issue du détecteur de blocs, non du fichier compressé.");
    if (bon(avant.sharp) && bon(apres.sharp)) {
      const sh=m("Netteté mesurée",avant.sharp,apres.sharp,5,1,"Une hausse de netteté peut provenir d'halos artificiels, pas de détails retrouvés.");
      if (sh && sh.verdict === "ameliore" && apres.sharp > avant.sharp * 1.85)
        prudences.push("Hausse importante de netteté : vérifier les halos et les fausses textures en zoomant.");
    } else inconnues.push("Netteté mesurée");
    if (bon(avant.p2) && bon(avant.p98) && bon(apres.p2) && bon(apres.p98)) {
      m("Contraste dynamique",avant.p98-avant.p2,apres.p98-apres.p2,.07,1,
        "Le contraste ne doit pas être maximisé aveuglément : l'ambiance peut être volontaire.");
      if (apres.p98 >= .995 && avant.p98 < .97)
        prudences.push("Hautes lumières proches du blanc : inspecter les zones écrêtées.");
    } else inconnues.push("Contraste dynamique");
    if (bon(avant.dust) && bon(apres.dust) && media === "video")
      m("Poussières transitoires",avant.dust,apres.dust,5,-1,"Mesure temporelle sensible aux mouvements.");
    if (bon(avant.shake) && bon(apres.shake) && media === "video")
      m("Secousses",avant.shake,apres.shake,.7,-1,"La stabilisation peut recadrer le cadre.");
    if (bon(avant.flicker) && bon(apres.flicker) && media === "video")
      m("Scintillement",avant.flicker,apres.flicker,.006,-1,"Comparer hors changements de plans.");
    if (bon(avant.ecretageBlanc) && bon(apres.ecretageBlanc))
      m("Pixels blancs écrêtés",avant.ecretageBlanc,apres.ecretageBlanc,.02,-1,"Les détails perdus dans les blancs ne sont pas reconstruits fidèlement.");
    if (bon(avant.ecretageNoir) && bon(apres.ecretageNoir))
      m("Pixels noirs écrêtés",avant.ecretageNoir,apres.ecretageNoir,.02,-1,"Ne pas aplatir les noirs de la scène.");
    // Sans référence authentique, une hausse d'un score n'est pas un jugement esthétique.
    const plus=constats.filter(x=>x.verdict==="ameliore").length;
    const moins=constats.filter(x=>x.verdict==="degrade").length;
    const sans=constats.filter(x=>x.verdict==="stable").length;
    const verdict=constats.length === 0 ? "indetermine" : moins ? "a_verifier" : plus ? "mesures_en_progres" : "mesures_stables";
    if (!constats.length) prudences.push("Mesures avant/après insuffisantes : pas de comparaison fiable.");
    return {
      version:2, media, verdict, compte:{ameliore:plus,degrade:moins,stable:sans,compare:constats.length},
      constats, alertes, prudences, inconnues,
      preuve:"Comparaison de signaux techniques, jamais preuve de fidélité à l'original ni score de réalisme."
    };
  }
  return Object.freeze({evaluer});
})();
if (typeof module !== "undefined" && module.exports) module.exports = DIRECTEUR_QUALITE;
