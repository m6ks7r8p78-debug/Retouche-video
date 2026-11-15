# RetoucheProAI — SmallMotion in-app local bridge (laboratoire)

Prolongement de la branche expérimentale `lab-3d-smallmotion-local-first`. Ne modifie PAS `app.js`, le moteur d'export, la PWA publique, ni le Directeur IA sur sa branche indépendante. L'intégration est une **preuve d'observation consultative**, dans le véritable parcours d'import vidéo de l'application de cette branche.

## Intégration

Dans `index.html`, **après** le chargement différé de `app.js` et avant les scripts finaux :

```html
<script defer src="research/3d-smallmotion/smallmotion-local.js"></script>
<script defer src="research/3d-smallmotion/smallmotion-director-local.js"></script>
<script defer src="research/3d-smallmotion/smallmotion-app-bootstrap.js"></script>
```

Le module se rattache à `#f` (input vidéo existant) et `#pick` (bouton existant) sans modifier leurs gestionnaires. Après sélection d'une seule vidéo, l'utilisateur **peut** lancer l'analyse par un bouton séparé. Aucun démarrage automatique coûteux. Un import multi-clips suspend volontairement l'analyse. La fonction `window.RetoucheMotionLabUI.observe()` retourne seulement la dernière preuve géométrique structurée en mémoire de la page, ou `null`. **Elle n'appelle pas** `DIRECTEUR_IA.planifier`, `DIAG.send`, la restauration, l'export, ni la PWA.

## Calcul local et coût

- Source `File` du sélecteur ; URL `blob:` locale temporaire, vidéo muted/playsinline en DOM 2 px pour décodage local.
- Images effectivement présentées obtenues via `video.requestVideoFrameCallback`, et horodatages `metadata.mediaTime` distincts d'au moins 105 ms. Pas de `seek()` estimatif, pas de métadonnée inventée.
- 160 × 120 au maximum, 2 images RGBA (153 600 octets à 160 × 120, hors tampon vidéo/décodeur et JavaScript).
- Video de 120 Mio maximum et timeout 6 s. AbortController lors de l'annulation, du remplacement de fichier ou de l'occultation de l'onglet. `pause`, révocation Blob, suppression de l'élément vidéo.
- 2D block matching + déplacement dominant issus de SmallMotion. Les boîtes sont des candidats **non calibrés**. Aucun mouvement indépendant, geste, visage, contact, reconstruction 3D ou meilleure qualité démontrée.
- Aucun WebGPU nécessaire, ni modèle, ni service distant. Les performances Chromium ne sont pas celles de l'iPhone.

## Tests

Depuis la racine du dépôt GitHub :

```bash
node research/3d-smallmotion/tests/test_smallmotion_local.cjs
node research/3d-smallmotion/tests/test_director_local.cjs
python research/3d-smallmotion/tests/test_app_wiring.py
python research/3d-smallmotion/tests/browser_check.py
```

Le test navigateur requiert `playwright`, `numpy`, `opencv-python`, `ffmpeg` avec `libx264`, et Chromium/Google Chrome. Le MP4 est synthétisé localement et ne contient aucun média personnel. Les tests browser ciblent un **harnais reproduisant les identifiants d'import** plutôt qu'une exécution complète de l'application (celle-ci nécessite des dépendances et services non simulés ici).

## Interdictions de diffusion

Aucune donnée privée ni poids de modèle ne doit être committé. Aucun déploiement sur `retoucheproai.com` et aucune fusion vers `main` sans essai Safari iPhone physique, audit de l'intégration complète, revue de confidentialité et performances/batterie réelles.