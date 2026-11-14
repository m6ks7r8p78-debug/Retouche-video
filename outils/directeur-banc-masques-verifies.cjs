/* RetoucheProAI — banc de segmentation avec références humaines déclarées.
 * Entrées : comptes numériques anonymisés, calculés hors Git à partir de masques.
 * Aucun pixel, réseau, fichier personnel, apprentissage ou activation dans l'app.
 */
"use strict";

const TYPES = Object.freeze(["vp", "fp", "fn", "vn"]);
const CHAMPS = new Set(["groupe", "image", "ensemble", "annotationHumaineVerifiee", "candidat", "temoin"]);
const productions = new WeakSet();
const entier = n => Number.isSafeInteger(n) && n >= 0;
const somme = c => TYPES.reduce((s, k) => s + c[k], 0);
const vide = () => ({vp: 0, fp: 0, fn: 0, vn: 0});
const ajouter = (total, c) => { for (const k of TYPES) total[k] += c[k]; };
const fraction = (num, den) => den === 0 ? null : +(num / den).toFixed(6);

function comptes(c) {
  if (!c || typeof c !== "object" || Array.isArray(c) ||
      Object.keys(c).length !== 4 || Object.keys(c).some(k => !TYPES.includes(k)) ||
      TYPES.some(k => !entier(c[k]))) throw new TypeError("Comptes VP/FP/FN/VN invalides");
  const pixels = somme(c);
  if (pixels === 0 || pixels > 100_000_000) throw new RangeError("Nombre de pixels invalide");
  return {pixels, positifs: c.vp + c.fn, negatifs: c.fp + c.vn};
}

function mesures(c) {
  return Object.freeze({
    precision: fraction(c.vp, c.vp + c.fp),
    rappel: fraction(c.vp, c.vp + c.fn),
    iou: fraction(c.vp, c.vp + c.fp + c.fn),
    f1: fraction(2 * c.vp, 2 * c.vp + c.fp + c.fn),
    tauxFauxPositifs: fraction(c.fp, c.fp + c.vn)
  });
}

function resume(lignes) {
  if (!lignes.length) return null;
  const groupes = new Map();
  const c = vide(), t = vide();
  for (const x of lignes) {
    ajouter(c, x.candidat);
    ajouter(t, x.temoin);
    if (!groupes.has(x.groupe)) groupes.set(x.groupe, {c: vide(), t: vide()});
    ajouter(groupes.get(x.groupe).c, x.candidat);
    ajouter(groupes.get(x.groupe).t, x.temoin);
  }
  const scoresCandidat = mesures(c), scoresTemoin = mesures(t);
  const iouGroupes = [...groupes.values()].map(g => mesures(g.c).iou).filter(n => n !== null);
  return Object.freeze({
    images: lignes.length, groupes: groupes.size,
    scoresCandidat, scoresTemoin,
    differenceIoU: scoresCandidat.iou === null || scoresTemoin.iou === null ? null :
      +(scoresCandidat.iou - scoresTemoin.iou).toFixed(6),
    macroIoUCandidat: iouGroupes.length ? +(iouGroupes.reduce((a,b) => a+b, 0) / iouGroupes.length).toFixed(6) : null,
    groupesAvecIoU: iouGroupes.length
  });
}

function evaluerMasquesVerifies(lignes) {
  if (!Array.isArray(lignes) || !lignes.length || lignes.length > 10000)
    throw new RangeError("Jeu de comparaison invalide");
  const repartition = {validation: [], test: []};
  const partitionParGroupe = new Map(), imagesVues = new Set();
  for (const x of lignes) {
    if (!x || typeof x !== "object" || Array.isArray(x) ||
        Object.keys(x).length !== CHAMPS.size || Object.keys(x).some(k => !CHAMPS.has(k)))
      throw new TypeError("Champs non autorisés : jamais de chemin, nom, masque ou pixel");
    if (typeof x.groupe !== "string" || !/^[A-Za-z0-9_-]{1,24}$/.test(x.groupe) ||
        !entier(x.image) || x.image > 1_000_000 ||
        !["validation", "test"].includes(x.ensemble) || x.annotationHumaineVerifiee !== true)
      throw new TypeError("Groupe, partition ou preuve déclarative d'annotation invalide");
    const ca = comptes(x.candidat), te = comptes(x.temoin);
    if (ca.positifs !== te.positifs || ca.negatifs !== te.negatifs)
      throw new RangeError("Candidat et témoin n'utilisent pas la même vérité terrain");
    const ancien = partitionParGroupe.get(x.groupe);
    if (ancien && ancien !== x.ensemble) throw new Error("Fuite de scène entre validation et test");
    partitionParGroupe.set(x.groupe, x.ensemble);
    const cle = x.groupe+":"+x.image;
    if (imagesVues.has(cle)) throw new Error("Image évaluée deux fois");
    imagesVues.add(cle);
    repartition[x.ensemble].push(x);
  }
  const resultat = Object.freeze({
    images: lignes.length, groupes: partitionParGroupe.size,
    validation: resume(repartition.validation), test: resume(repartition.test),
    annotationsControleesExterieurement: false,
    restaurationOriginaleProuvee: false,
    promotionAutomatique: false, entrainementAutomatique: false,
    publicationDeMedias: false
  });
  productions.add(resultat);
  return resultat;
}

function bilanPublicMasques(resultat) {
  if (!resultat || !productions.has(resultat)) throw new TypeError("Résultat du banc requis");
  const section = r => r === null ? null : Object.freeze({
    groupes: r.groupes, images: r.images,
    // 5 scènes et 50 images : seuil de discrétion, non une garantie d'anonymat.
    scoresDiffusables: r.groupes >= 5 && r.images >= 50,
    candidat: r.groupes >= 5 && r.images >= 50 ? r.scoresCandidat : null,
    temoin: r.groupes >= 5 && r.images >= 50 ? r.scoresTemoin : null,
    differenceIoU: r.groupes >= 5 && r.images >= 50 ? r.differenceIoU : null
  });
  return Object.freeze({validation: section(resultat.validation), test: section(resultat.test),
    donneesReellesNonConfirmees: true, entrainement: false, activation: false, publicationDeMedias: false});
}

module.exports = Object.freeze({evaluerMasquesVerifies, bilanPublicMasques});
