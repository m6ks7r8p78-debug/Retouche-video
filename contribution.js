/* RetoucheProAI v6.7 — CONTRIBUTION : règles du programme de contribution volontaire (cycle de vie + verrou d’envoi).
   Fonctions pures, sans réseau. La collecte distante est DÉSACTIVÉE dans cette version (DISTANT_ACTIF = false) :
   aucun média n’est envoyé, quel que soit le résultat de ces vérifications. Le même code de règles est destiné
   à être exécuté côté serveur (la vérification côté téléphone seule ne vaut rien). */
var CONTRIBUTION = (() => {
  const DISTANT_ACTIF = false;
  const VERSION_NOTICE = "2026-11-11";
  const FINALITES = ["filter_recovery", "upscaling", "face_restoration", "temporal", "annotation", "training", "research"];
  /* permissions secondaires : jamais déduites d’une finalité */
  const PERMISSIONS = ["stockage", "annotation_humaine", "partage_chercheurs", "publication_exemples", "avatars", "reutilisation_produit"];
  const ETATS = ["brouillon", "invitation_envoyee", "accord_partiel", "accord_complet", "verification_en_attente", "autorise", "refuse", "revoque",
    "suppression_demandee", "supprime", "exclusion_dataset_en_attente", "exclu_dataset"];
  const T = {
    brouillon: ["invitation_envoyee", "supprime"],
    invitation_envoyee: ["accord_partiel", "accord_complet", "refuse", "brouillon", "supprime"],
    accord_partiel: ["accord_complet", "refuse", "revoque", "suppression_demandee"],
    accord_complet: ["verification_en_attente", "revoque", "refuse", "suppression_demandee"],
    verification_en_attente: ["autorise", "refuse", "revoque", "suppression_demandee"],
    autorise: ["revoque", "suppression_demandee"],
    refuse: ["suppression_demandee", "supprime"],
    revoque: ["suppression_demandee", "exclusion_dataset_en_attente"],
    suppression_demandee: ["supprime", "exclusion_dataset_en_attente"],
    exclusion_dataset_en_attente: ["exclu_dataset"],
    exclu_dataset: ["supprime"], supprime: []
  };
  const peut = (de, vers) => !!(T[de] && T[de].includes(vers));
  function transition(c, vers, quand, acteur) {
    if (!peut(c.etat, vers)) throw new Error("Transition interdite : " + c.etat + " → " + vers);
    return { ...c, etat: vers, historique: [...(c.historique || []), { de: c.etat, vers, quand: quand || Date.now(), acteur: acteur || "inconnu" }] };
  }

  /* accord d’une personne valable pour une finalité à un instant donné */
  function accordValable(a, finalite, maintenant) {
    if (!a || a.revoked || a.revoque) return false;
    if (a.mineur || a.majeur === false) return false;             /* mineurs : parcours représentant légal non validé → refus */
    if (a.expire && a.expire <= maintenant) return false;
    if (a.notice && a.notice !== VERSION_NOTICE) return false;    /* notice modifiée → redemander l’accord */
    return Array.isArray(a.purposes) && a.purposes.includes(finalite);
  }

  /* VERROU : un média ne peut contribuer à une finalité que si TOUT est réuni. Retourne toujours les raisons de refus. */
  function verifier(media, accords, finalite, opts) {
    const o = opts || {}, now = o.maintenant || Date.now(), R = [];
    if (!FINALITES.includes(finalite)) R.push("finalité inconnue");
    if (!media || !media.droitsFichier) R.push("droits sur le fichier non déclarés (auteur ou autorisation de l’ayant droit)");
    if (media && media.tiersProteges) R.push("musique, voix ou éléments de tiers sans autorisation");
    if (media && media.mineurPresent) R.push("personne mineure représentée : contribution refusée (parcours représentant légal non validé)");
    const P = (media && media.personnes) || [];
    if (media && media.personnesInconnues) R.push("personnes reconnaissables non identifiées : accord impossible à recueillir");
    for (const p of P) {
      const a = (accords || []).filter(x => x.personneId === p && (!x.mediaId || x.mediaId === media.id));
      if (!a.some(x => accordValable(x, finalite, now))) R.push("accord manquant, expiré ou révoqué pour la personne " + p);
    }
    if (media && ["revoque", "refuse", "suppression_demandee", "supprime", "exclusion_dataset_en_attente", "exclu_dataset"].includes(media.etat)) R.push("état du média : " + media.etat);
    else if (media && media.etat !== "autorise") R.push("média non autorisé (état : " + ((media && media.etat) || "brouillon") + ")");
    for (const perm of (o.permissions || ["stockage"])) if (!(media && media.permissions && media.permissions[perm] === true)) R.push("permission « " + perm + " » non accordée");
    const reglesOk = R.length === 0;
    if (!DISTANT_ACTIF) R.push("collecte distante désactivée dans cette version");
    return { reglesOk, envoiPermis: reglesOk && DISTANT_ACTIF, raisons: R };
  }

  /* invitation : jeton aléatoire à durée limitée et usage unique ; seule l’empreinte SHA-256 est conservée */
  async function creerInvitation(mediaId, personneId, dureeMs, maintenant) {
    const b = new Uint8Array(32); crypto.getRandomValues(b);
    const jeton = Array.from(b, x => x.toString(16).padStart(2, "0")).join(""), now = maintenant || Date.now();
    return { jeton, enregistrement: { mediaId, personneId, empreinte: await empreinte(jeton), cree: now, expire: now + (dureeMs || 7 * 864e5), utilise: false, notice: VERSION_NOTICE } };
  }
  async function empreinte(s) {
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(h), x => x.toString(16).padStart(2, "0")).join("");
  }
  async function validerInvitation(enr, jeton, maintenant) {
    const now = maintenant || Date.now();
    if (!enr || typeof jeton !== "string" || jeton.length !== 64) return { ok: false, raison: "invitation invalide" };
    if (enr.utilise) return { ok: false, raison: "invitation déjà utilisée" };
    if (enr.expire <= now) return { ok: false, raison: "invitation expirée" };
    if (await empreinte(jeton) !== enr.empreinte) return { ok: false, raison: "invitation invalide" };
    return { ok: true, enregistrement: { ...enr, utilise: true, utiliseLe: now } };
  }

  /* registre chaîné : chaque ligne contient l’empreinte de la précédente (une modification ultérieure se voit) */
  async function ajouterAuRegistre(registre, evenement) {
    const prec = registre.length ? registre[registre.length - 1].empreinte : "0".repeat(64);
    const corps = { n: registre.length, quand: evenement.quand || Date.now(), type: evenement.type, donnees: evenement.donnees || {}, precedent: prec };
    return [...registre, { ...corps, empreinte: await empreinte(JSON.stringify(corps)) }];
  }
  async function verifierRegistre(registre) {
    let prec = "0".repeat(64);
    for (let i = 0; i < registre.length; i++) {
      const { empreinte: e, ...corps } = registre[i];
      if (corps.precedent !== prec || corps.n !== i || await empreinte(JSON.stringify(corps)) !== e) return { ok: false, ligne: i };
      prec = e;
    }
    return { ok: true };
  }

  /* minimisation : champs de métadonnées à retirer avant toute contribution (pseudonymisation ≠ anonymisation) */
  const META_SENSIBLES = ["gps", "latitude", "longitude", "location", "make", "model", "serial", "owner", "artist", "author", "creationdate", "datetimeoriginal", "software", "filename", "comment"];
  function minimiserMeta(meta) {
    const o = {}, retire = [];
    for (const [k, v] of Object.entries(meta || {})) { if (META_SENSIBLES.some(s => k.toLowerCase().replace(/[^a-z]/g, "").includes(s))) retire.push(k); else o[k] = v }
    return { meta: o, retire };
  }

  return { DISTANT_ACTIF, VERSION_NOTICE, FINALITES, PERMISSIONS, ETATS, peut, transition, accordValable, verifier, creerInvitation, validerInvitation, empreinte, ajouterAuRegistre, verifierRegistre, minimiserMeta };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CONTRIBUTION;
