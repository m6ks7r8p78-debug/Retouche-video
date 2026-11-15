# Cinema P25 — matrice H.264 de compression et conservation de micro-gestes

**Laboratoire : Cinema AI.** Cette étape expérimente **trois taux de compression** sur des **films vectoriels fictifs uniquement**. Branche expérimentale isolée `chatgpt-cinema-p25-crf-matrix-20261115`, basée sur la PR Cinema P24 #39. Ne touche pas à `main`, `retoucheproai.com`, AURA, NOVA, SmallMotion ou la coordination.

## Dépendances réutilisées réellement

- **P19** : 480 dessins vectoriels à 60 i/s, source synthétique fictive de 8 s.
- **P21** : quatre commandes de micro-gestes (morsure, léchage, langue visible, rétraction).
- **P23** : traits progressifs générés par le moteur P19 enrichi des effets de P21.
- **P24** : méthodes de vérification `ffprobe`, décodage de vidéo image par image et calcul des différences de pixels.

P25 **n'importe ni vidéo privée ni poids de modèles**. La comparaison n'est pas une extension du moteur de production.

## Méthodologie expérimentale

1. Génère les 480 images originales P19 et les 480 images P23 en appelant les fonctions **réelles** du dépôt.
2. Encode séparément chaque source dans un maître vidéo FFV1 lossless (pixel format BGR0, 60 i/s). Décode les 480 images de chaque maître et vérifie **7 images de contrôle identiques pixel par pixel** à leur génération BGR d'origine, pour détecter toute conversion non réversible. Refuse le traitement si les échantillons sont différents.
3. Depuis **les mêmes deux maîtres**, encode les profils H.264 CRF **18, 25 et 32** avec les mêmes paramètres de codec : `libx264`, `yuv420p`, `ultrafast`, GOP 60, 720×720, 60 i/s. La sortie P23 contient une piste audio AAC synthétique générée localement ; le témoin P19 est sans audio. Ces paramètres explicitement consignés permettent de reproduire la comparaison.
4. Décode les six films H.264 avec FFmpeg, **480 images par film**. Pour chaque couple de profils, compare P19 / P23 avant et après codec **sur les mêmes images et avec la même zone bouche**, et mesure les écarts sur **479 transitions**.
5. Publie dans le rapport : taille totale de chaque MP4, erreur moyenne/95e percentile dans la bouche par rapport au vrai dessin P23, erreur temporelle supplémentaire au 95e percentile, résidu pendant les images sans geste et pixels différents aux quatre pics de geste.
6. Compare empiriquement les tailles et signale lorsqu'un geste n'est plus représenté par le seuil de pixels. Aucune « meilleure qualité pour tous » n'est inférée ni appliquée automatiquement.

**Important :** le nombre de pixels différents entre deux clips compressés peut augmenter à cause des artefacts H.264. La fidélité au rendu original est appréciée séparément par l'erreur des pixels par rapport au maître sans perte. Ces mesures sont **exploratoires, non perceptuellement calibrées** : même un clip avec une bonne métrique peut paraître artificiel, et le CRF optimal de ce banc ne se généralise pas aux vidéos personnelles.

## Reproduction

```sh
python -m pip install 'numpy<3' 'opencv-python-headless>=4.9,<5'
node studio-cinema/p22/src/build_p22_controls.cjs studio-cinema/p22/results/controls.json
python -m unittest discover -s studio-cinema/p25/tests -p 'test_p25_contracts.py' -v
python studio-cinema/p25/src/p25_crf_matrix.py --data studio-cinema/p22/results/controls.json --out studio-cinema/p25/results/proof
```

FFmpeg doit disposer des encodeurs **FFV1, libx264 et AAC**. La CI `.github/workflows/ci-cinema-p25.yml` installe FFmpeg et les dépendances libres si nécessaire, réexécute les anciens tests P15–P24 et les nouveaux tests P25, produit un rapport JSON et trois MP4 **exclusivement synthétiques** en artefacts GitHub temporaires. Les maîtres FFV1 et les témoins P19 restent dans un dossier temporaire supprimé en fin d'exécution.

## Niveaux de preuve / limites

- `synthetic_matrix_measured` signifie que les **trois profils ont été effectivement encodés et décodés**, avec les tests, et non qu'un profil a été choisi ou validé sur un téléphone.
- Les vidéos sont vectorielles 720p et 8 s ; **pas de génération photoréaliste** ni preuve de naturel des micro-expressions.
- Les profils H.264 8 bits SDR ne représentent pas les parcours **HEVC, 4K, 8K, HDR/P3, export pour X** de l'application finale. On ne promet pas d'éliminer la compression ultérieure de X.
- Les paramètres `CRF 18, 25, 32` sont trois points de mesure, pas une recommandation universelle. La compression modifie parfois des régions hors du dessin de geste.
- Aucune lecture sur **Safari iPhone physique** n'est impliquée par le test FFmpeg. Les essais Chromium/WebKit Linux de P24 restent distincts.
- Aucun téléchargement depuis Internet de médias ou modèles personnels; pas de réseau pendant la génération; aucun entraînement; aucune fusion ni mise en production.

## Relais interlaboratoires

- **NOVA PR #3 :** comparer indépendamment les tailles, débits, conservation AAC et contraintes appareil; ne pas intégrer P25 au moteur d'export sur la seule base de ce banc.
- **AURA PR #31 :** ne pas exposer le choix CRF comme réglage utilisateur final sans protocole UX et validation d'intégration.
- **SmallMotion PR #28 :** aucun résultat des deux images observées ne constitue un événement sémantique des lèvres.
- **Directeur IA :** `synthetic_matrix_measured` est consultatif, **aucune modification automatique de média**.
- **Coordination :** seul le coordinateur met à jour `coordination/REGISTRE.json`. Cette PR contient les preuves/limites et le relais à indexer.
