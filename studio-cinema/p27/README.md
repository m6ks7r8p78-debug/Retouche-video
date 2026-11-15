# Cinema P27 — Avertissements consultatifs de fidélité (P25 × P26)

## Objectif et limites

Cette étape **n'optimise pas automatiquement les vidéos**. Elle vérifie que les deux rapports expérimentaux P25 et P26 décrivent réellement les mêmes **images vectorielles synthétiques P19/P23**, puis produit un **rapport factuel lisible en français** sur l'effet d'un deuxième encodage H.264.

**Branche :** `chatgpt-cinema-p27-fidelity-advisory-20261115` fondée sur la PR Cinema P26 #43, sans toucher à `main`, à la branche de coordination, aux fichiers d'autres laboratoires, à RetoucheProAI.com ni aux médias privés.

## Implémentation et contrôle de provenance

`src/p27_advisory.cjs` est un module Node.js autonome sans dépendance externe. Il lit les deux JSON **générés par les moteurs réels P25/P26**, sans ouvrir de film, parcourir les médias personnels, transférer un contenu ni utiliser le réseau.

Avant tout calcul, le module **refuse** les rapports non conformes : types/schema, provenance fictive, statut de validation, indicateurs de confidentialité/entraînement, matrice de 3 profils P25 et 9 couples P26 exacts, 480 images, 479 transitions, H.264 720×720 à 60 fps, piste AAC synthétique déclarée et contrôlée, métriques négatives/NaN/infinies, doublons, mauvais pourcentages de taille, valeurs de P25 qui ne correspondent pas au premier passage P26, et fausses déclarations de validation Safari/gestes réels.

Le rapport de sortie **projette uniquement des champs connus**. Il ne reprend jamais des noms de fichiers, chemins, identifiants de personnes ou métadonnées arbitraires injectées dans les fichiers d'entrée. Il fournit :

- 9 lignes avec CRF initial/suivant, tailles, erreur couleur P95 avant/après, delta de P95, **P95 de l'augmentation positive par image séparément**, perturbations de changements de pixels, preuves audio et codes d'avertissement.
- Un constat purement mesuré lorsque la deuxième compression **augmente l'erreur P95** sur le dessin d'origine, ou lorsqu'un fichier **devient plus lourd sans diminution de l'erreur P95**.
- L'absence d'autorisation d'action via `app_control_contract` : `may_autoselect_codec=false`, `may_automatically_change_video=false`, `may_upload_media=false`, `recommendation=null`.
- Un rapport Markdown français `p27_synthetic_advisory_fr.md` ainsi qu'un JSON anonyme `p27_synthetic_advisory.json`.

Aucun seuil de « naturel », évaluation humaine, avis personnalisé ou réglage universel n'est inventé. Les codes de constat sont basés sur les **mesures comparatives du banc**, pas une calibration de perception humaine.

## Reproduction

Avec Node 22, Python 3.11, OpenCV, NumPy, FFmpeg (libx264/AAC/FFV1) à partir de la racine du dépôt expérimental :

```bash
node --test studio-cinema/p27/tests/test_p27_advisory.cjs
node studio-cinema/p22/src/build_p22_controls.cjs studio-cinema/p22/results/controls.json
python studio-cinema/p25/src/p25_crf_matrix.py --data studio-cinema/p22/results/controls.json --out studio-cinema/p25/results/proof
python studio-cinema/p26/src/p26_recompression.py --data studio-cinema/p22/results/controls.json --source-dir studio-cinema/p25/results/proof --out studio-cinema/p26/results/proof
node studio-cinema/p27/src/p27_advisory.cjs studio-cinema/p25/results/proof/p25_crf_matrix_synthetic_report.json studio-cinema/p26/results/proof/p26_second_generation_synthetic_report.json studio-cinema/p27/results/proof
```

Le workflow `.github/workflows/ci-cinema-p27.yml` réexécute les tests historiques P15–P26, reconstruit le banc réel P25/P26 sur 480 images synthétiques, compare les JSON, lance les tests adversariaux P27 puis archive les deux rapports sources et les deux nouveaux rapports **sans média privé**.

## Interprétation correcte

- `synthetic-tested` signifie **validation reproductible sur dessin fictif** si la CI du HEAD est verte ; ce n'est **pas** `physical-iphone-tested`, `real-authorized-tested` ou `production-verified`.
- La **différence entre deux percentiles P95** et le **P95 des augmentations positives calculées par image** sont des nombres distincts. P27 les nomme explicitement et ne les additionne pas.
- Un score de couleur plus élevé indique une perte de fidélité **à notre dessin vectoriel de référence selon cette métrique**. Il ne mesure pas le naturel humain, la qualité HDR, l'absence de saccade d'un lecteur, ou le résultat après téléchargement sur X.
- Une seconde compression à CRF inférieur (plus généreux) **ne rétablit pas nécessairement les détails détruits au premier passage**.
- La précision décimale expérimentale n'est pas une précision perceptuelle ; même un rapport de neuf lignes n'autorise pas la sélection automatique d'un export.

## Coordination interlaboratoires

**NOVA / PR #3 :** Ce JSON est un exemple consultatif de vérification de fidélité H.264, non un composant intégré de son export local. Réutilisation éventuelle seulement après revue séparée des formats, licences, ressources et protocole iPhone physique.

**Directeur IA / PR #1 :** `read_only_diagnostic` uniquement. Interdiction de prendre une décision automatique à partir de ces chiffres ; aucune vidéo originale réelle n'a été évaluée.

**AURA :** si une PR d'intégration est envisagée plus tard, un texte compréhensible peut être proposé sans afficher neuf réglages techniques par défaut. Pas de changement de façade ici.

**SmallMotion :** ses deux images 2D ne servent pas à inférer un geste de langue ou lèvres ; P27 ne les utilise pas.

**Coordinateur :** la coordination GitHub est **asynchrone**, pas une communication directe entre conversations. Le registre central reste sous la responsabilité du coordinateur, les preuves et les réserves sont consignées en PR de laboratoire.

**Respect de la confidentialité :** dépôt public, aucun média personnel, aucune clé, aucune annotation privée, aucune fusion/déploiement automatique.
