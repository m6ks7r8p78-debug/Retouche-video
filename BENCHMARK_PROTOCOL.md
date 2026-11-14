# Protocole des bancs d'évaluation — Directeur IA

Version 1 (14 nov. 2026). Complète les bancs existants : `tests/qualite.test.mjs` + `tests/qualite_mesures.py`
(PSNR/SSIM/LPIPS photo), `tests/rvv.test.mjs` + `tests/visage_ia/banc_video.py` (visages vidéo),
`tests/rfv.test.mjs` + `tests/labo_filtres/banc_video.py` (retrait de filtre vidéo), `tests/format/` (recadrage),
`tests/directeur-browser.test.mjs` (A/B adaptatif vs global, décodé image par image).

## 1. Données

| source | usage autorisé | statut |
|---|---|---|
| médias synthétiques générés (ffmpeg, scripts `tests/`) | tous les tests | disponible, en CI |
| images libres de droits de `tests/creer_medias.py` | bancs photo | disponible |
| bibliothèque privée (157 vidéos + 1 image, chez ChatGPT) | analyse ; évaluation **si** `evaluation_benchmark = oui` | **non accessible depuis Claude** |

Chaîne obligatoire pour la bibliothèque privée : `catalogue_medias.py analyser` → vérification humaine des
rapprochements utiles → `consentements.json` → `plan` → bancs sur partitions `validation` puis `test` uniquement.
Aucun média privé dans Git, dans les artifacts CI ou chez un service externe.

## 2. Séparation sans fuite

Regroupement par scène **avant** partition (doublons exacts + rapprochements dHash ≤ 16). Proportions 70/15/15 par
groupe, graine fixée. `test` n'est consulté qu'une fois par version candidate ; les réglages se font sur `validation`.

## 3. Catégories et métriques

| catégorie | avec référence (dégradation synthétique ou couple vérifié) | sans référence |
|---|---|---|
| bruit, compression, basse résolution, flou | PSNR, SSIM, LPIPS (alex) | σ Immerkær, blocs 8×8, variance du laplacien, inspection |
| colorimétrie / filtres couleur | ΔE moyen (CIEDE2000) sur zones stables, écart d'histogramme | saturation, dominante |
| filtres AR / beauté / masques | écart dans la zone + hors zone (doit rester ≈ 0), LPIPS zone | carte des pixels inventés, inspection obligatoire |
| visages | LPIPS visage, identité **non** revendiquée | inspection obligatoire |
| temporel | scintillement (écart image à image après compensation), stabilité des repères | variation inter-échantillons |
| faible luminosité | PSNR/SSIM sur version assombrie synthétique | p5/p95, noirs écrasés |
| export | durée, cadence, résolution, pistes, synchro audio (ffprobe), décodage complet | — |

PSNR/SSIM sont invalides après recadrage, changement de cadence ou reconstruction générative : dans ces cas,
seulement LPIPS sur zones alignées + évaluation humaine. Une sortie agrandie n'est jamais comparée comme une « vraie 4K ».

## 4. Évaluation humaine

Comparaison A/B en aveugle (ordre aléatoire), au moins 2 personnes si possible, échelle : pire / égal / meilleur +
« artefact inacceptable ». Les zones reconstruites sont montrées avec leur carte. Les avis sont consignés dans
`BENCHMARK_RESULTS.md` avec la version, la date et le nombre d'items.

## 5. Critères de remplacement d'une méthode stable

Gain sur `validation` **et** `test`, aucune famille dégradée de plus de 5 % (règle du laboratoire), pas d'artefact
inacceptable nouveau, coût iPhone mesuré (temps, mémoire, chaleur) acceptable, licence compatible
(`REGISTRE_MODELES_LICENCES.md`), retour arrière possible. Sinon la méthode reste expérimentale.

## 6. Du banc à la priorisation

Chaque banc produit, par module : `qualite_mesuree` (0–1, normalisation documentée), `taux_echec` (part des cas sous
le seuil d'acceptation), `gravite`, `nb_cas`, `source: "mesure"`. Ces valeurs remplacent les `null` de
`suivi/etat-modules.json` ; `node outils/directeur-priorites.cjs` en déduit la prochaine priorité (besoin mesuré
d'abord, faisabilité/coût/risque en modulation bornée, module satisfaisant = « maintenir »).

### 6.1 Normalisation figée — retrait de filtre AR (`outils/banc_vers_etat.py`)

Par cas : `retrait = 1 − écart_zone(avec) / écart_zone(sans)` borné à [0, 1] (part de l'erreur due au filtre supprimée,
mesurée contre la vraie vidéo). Pénalités ×0,5 si le scintillement dans la zone augmente de plus de 2 % ou si le LPIPS
de la tête n'est pas meilleur. **Échec** si `retrait < 0,5`, ou scintillement accru, ou LPIPS pire. Gravité d'un échec :
`max(1 − retrait, 0,5 si scintillement/LPIPS)`. Un cas en erreur = échec de gravité 1. `qualite_mesuree` = moyenne
des cas, `taux_echec` = part d'échecs, `donnees` = `synthetique` tant que les cas ne viennent pas de médias réels.
Un module mesuré seulement sur synthétique n'est jamais déclaré satisfaisant (`directeur-priorites.cjs`).

## 7. Traçabilité

Pour chaque exécution : commit, version des modèles (SHA-256), configuration, graine, matériel (CI simulée ≠ iPhone),
date, nombre de cas, limites. Les résultats obtenus en GPU simulé (SwiftShader) ne disent rien des durées sur iPhone.
