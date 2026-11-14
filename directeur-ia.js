/* RetoucheProAI — Directeur IA global v0.1.
   Moteur de planification pur, déterministe, sans DOM, réseau ni modèle chargé.
   Entrées : mesures réelles de AZ.run / PHOTO.analyze ; jamais de promesse de détails retrouvés.
   Le moteur n'exécute aucun traitement : la passerelle d'application utilise le pipeline existant.
*/
var DIRECTEUR_IA = (() => {
  "use strict";
  const borne = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
  const score = (val, bas, haut) => borne((val - bas) / (haut - bas));
  const entiers = (v) => Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
  const catalogue = Object.freeze({
    debloc: { nom: "Atténuer les blocs de compression", ordre: 10, gere: "db", genere: false },
    debruitage: { nom: "Réduire le bruit", ordre: 20, gere: "dn", genere: false },
    poussiere: { nom: "Retirer les poussières", ordre: 30, gere: "dust", genere: false, video: true },
    stabilisation: { nom: "Stabiliser le mouvement", ordre: 40, gere: "stab", genere: false, video: true },
    scintillement: { nom: "Atténuer le scintillement", ordre: 50, gere: "defl", genere: false, video: true },
    lumiere: { nom: "Corriger prudemment lumière et couleurs", ordre: 60, gere: "img", genere: false },
    detail: { nom: "Régler la netteté avec retenue", ordre: 70, gere: "sh", genere: false },
    resolution: { nom: "Préparer une montée en résolution", ordre: 80, gere: null, genere: true },
    voix: { nom: "Clarifier la voix", ordre: 85, gere: "voice", genere: false, video: true },
    controle: { nom: "Contrôler le rendu", ordre: 90, gere: null, genere: false },
    export: { nom: "Exporter avec provenance", ordre: 100, gere: null, genere: false }
  });
  const metr = x => (Number.isFinite(x) ? x : 0);
  const valeurs = (m, fl) => {
    const blocs = m.blk && metr(m.blk.r), contraste = Number.isFinite(m.p98) && Number.isFinite(m.p2) ? m.p98 - m.p2 : null;
    const audio = m.audio || null;
    return {
      compression: score(blocs, 1.08, 1.6), bruit: score(metr(m.noise), 1.3, 4.6),
      flou: Number.isFinite(m.sharp) ? score(45 - m.sharp, 0, 30) : 0, poussiere: score(metr(m.dust), 8, 45),
      tremblement: score(metr(m.shake), 1.5, 6),
      scintillement: Math.max(score(metr(fl && fl.frac), .12, .48), score(metr(fl && fl.mean), .005, .02)),
      sousExposition: Number.isFinite(m.p50) ? score(.28 - m.p50, 0, .20) : 0,
      contrasteFaible: contraste == null ? 0 : score(.52 - contraste, 0, .32),
      voixBruitee: audio && Number.isFinite(audio.floor) && Number.isFinite(audio.peak) && audio.peak > -45
        ? score(audio.floor, -56, -42) : 0
    };
  };
  function cible(type, w, h, appareil, demande) {
    const mobile = !!appareil.mobile, disponible = type === "video" ? (mobile ? 1920 : 3840) : 3840;
    const souhaite = entiers(demande) || disponible, source = Math.max(w, h), propose = Math.min(souhaite, disponible);
    // L'export réel garde sa propre autorité : ne pas activer un format non implémenté.
    return { souhaite, propose, plafondAutomatique: disponible, facteur: +(propose / source).toFixed(2),
      exportConfigure: false, limite: souhaite > disponible ? "La sortie demandée dépasse le plafond automatique actuel : aucun export 8K n'est promis." : null };
  }
  function planifier(entree) {
    if (!entree || !["photo", "video"].includes(entree.type)) throw new TypeError("type photo ou video requis");
    const { type } = entree, w = entiers(entree.w), h = entiers(entree.h);
    if (!w || !h) throw new RangeError("dimensions source invalides");
    const m = entree.mesures || {}, fl = entree.scintillement || null, appareil = entree.appareil || {},
      choix = entree.choix || {}, mode = ["auto", "fidelite", "reconstruction"].includes(choix.mode) ? choix.mode : "auto",
      dispo = entree.disponibles || {}, mesures = valeurs(m, fl), sortie = cible(type, w, h, appareil, choix.longueur),
      avertissements = [], operations = [], ecartes = [];
    const exclu = (id) => choix.exclus && choix.exclus.includes(id);
    const proposer = (id, force, raison, opts = {}) => {
      const cat = catalogue[id];
      if (!cat || (cat.video && type !== "video") || force <= 0 || exclu(id)) return;
      if (dispo[id] === false) { ecartes.push({ id, raison: "Fonction indisponible dans cette configuration" }); return; }
      if (opts.generatif && (mode === "fidelite" || choix.autoriserGeneration !== true)) {
        ecartes.push({ id, raison: "Reconstruction IA non autorisée explicitement" }); return;
      }
      operations.push({ id, nom: cat.nom, ordre: cat.ordre, intensite: +borne(force).toFixed(2),
        raison, genere: !!opts.generatif, executant: cat.gere, preuve: opts.preuve || "mesure de la source" });
    };
    if (mesures.compression > .12) proposer("debloc", mesures.compression, "Grille de compression mesurée");
    if (mesures.bruit > .08) proposer("debruitage", mesures.bruit, "Bruit mesuré dans les zones calmes");
    if (type === "video") {
      if (mesures.poussiere > .12) proposer("poussiere", mesures.poussiere, "Taches transitoires repérées");
      if (mesures.tremblement > .18) proposer("stabilisation", mesures.tremblement, "Secousses entre images");
      if (mesures.scintillement > .18) proposer("scintillement", mesures.scintillement, "Variations temporelles mesurées");
    }
    if (Math.max(mesures.sousExposition, mesures.contrasteFaible) > .24)
      proposer("lumiere", Math.max(mesures.sousExposition, mesures.contrasteFaible), "Luminance ou contraste insuffisant mesuré ; préserver l'ambiance de la scène");
    if (mesures.flou > .2) {
      const force = Math.min(mesures.flou, 1 - .65 * Math.max(mesures.bruit, mesures.compression));
      if (force > .15) proposer("detail", force, "Netteté faible ; limiter les halos et les détails artificiels");
      else ecartes.push({ id: "detail", raison: "La netteté est limitée pour ne pas accentuer le bruit ou les blocs" });
    }
    if (type === "video" && mesures.voixBruitee > .25) proposer("voix", mesures.voixBruitee, "Souffle audio détecté sur une piste comportant du signal");
    if (sortie.facteur > 1.02) proposer("resolution", Math.min(1, (sortie.facteur - 1) / 3), "Dimensions de sortie supérieures à la source", { generatif: true });
    proposer("controle", 1, "Vérifier les défauts mesurables, comparer avant/après", { preuve: "étape de vérification" });
    proposer("export", 1, "Conserver les paramètres et indiquer les reconstructions", { preuve: "provenance des traitements" });
    operations.sort((a, b) => a.ordre - b.ordre);
    if (sortie.limite) avertissements.push(sortie.limite);
    if (mode !== "reconstruction" || choix.autoriserGeneration !== true)
      avertissements.push("Les détails absents ne sont pas récupérables à l'identique ; aucune reconstruction non autorisée.");
    if (type === "video") avertissements.push("Plan global à partir d'échantillons : l'adaptation scène par scène n'est pas encore branchée à l'export.");
    const actifs = operations.filter(x => !["controle", "export"].includes(x.id));
    const resume = actifs.length ? actifs.slice(0, 3).map(x => x.nom.toLowerCase()).join(" · ") : "Source peu dégradée : ne pas forcer les traitements";
    return { version: 1, type, mode, dimensions: { w, h }, mesures, sortie, operations, ecartes, avertissements,
      resume, execution: "planification ; seuls les réglages compatibles avec le pipeline existant seront appliqués" };
  }
  /* Passerelle volontairement étroite : ne remplace ni les mesures ni les préférences de REC.
     Les opérations sont déjà exécutées par REC/PHOTO, ici on borne seulement les excès observables.
     N'active jamais un module indisponible et ne change pas les exclusions enregistrées de l'utilisateur. */
  function concilier(recommandation, plan) {
    if (!recommandation || !recommandation.o || !plan || !Array.isArray(plan.operations)) return recommandation;
    const o = recommandation.o, ids = new Set(plan.operations.map(x => x.id));
    if (!ids.has("debloc") && Number.isFinite(o.db)) o.db = 0;
    if (!ids.has("debruitage") && Number.isFinite(o.dn)) o.dn = Math.min(o.dn, .2);
    if (!ids.has("poussiere") && o.dust === true) o.dust = false;
    if (!ids.has("stabilisation") && o.stab === true) o.stab = false;
    if (!ids.has("scintillement") && o.defl === true) o.defl = false;
    if (!ids.has("voix") && o.voice === true) o.voice = false;
    return recommandation;
  }
  return Object.freeze({ planifier, concilier, valeurs, catalogue });
})();
if (typeof module !== "undefined" && module.exports) module.exports = DIRECTEUR_IA;
