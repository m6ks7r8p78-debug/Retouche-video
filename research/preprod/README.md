# RetoucheProAI — préproduction intégrée (premier audit de l'application complète)

**Branche expérimentale** fondée sur `lab-3d-smallmotion-pwa-safe-update-v1` (PR #26), qui contient déjà CameraGuard, MultiMotion, DepthMotion, SmallMotion, son Web Worker, les protections de ressources et la PWA offline avec mise à jour prudente.

Cette livraison franchit une étape différente des bancs de recherche : elle teste **l'authentique `index.html`, l'authentique `app.js` et la vraie entrée de fichier `#f`**, servis depuis un HTTP local sur un clone GitHub Actions. Elle **ne remplace pas l'éditeur par un faux écran**.

## Tests proposés

- Démarrage de toute la page, ordre des scripts SmallMotion, accès aux commandes existantes.
- Génération d'une **vidéo entièrement synthétique** (H.264 ou VP8 selon le décodeur de Chromium), import via le vrai `#f`.
- Attente de l'éditeur principal `#app` et du panneau consultatif SmallMotion.
- Appui réel sur « Analyser localement » et vérification de `processingPath=worker`, de `no_automatic_change`, de la provenance et de l'absence de sortie vidéo fabriquée par le module.
- Import d'une deuxième vidéo : résultat de l'analyse précédente effacé.
- Réseau public bloqué durant le test ; tentative externe consignée **sans envoi possible de média**.
- Capture d'écran de chaque viewport, uniquement après import de l'image synthétique.
- Contrôles de manifeste Service Worker et des anciennes suites conservés dans leurs workflows indépendants.

## Hypothèses et limites

L'analyse SmallMotion est une **observation de seulement deux images**, pas une nouvelle restauration ou un suivi 3D. La présence du bouton d'export n'atteste **pas** qu'un MP4 exporté a été encodé : un test de conversion audiovisuelle doit le confirmer séparément. Chromium ≠ Safari iPhone physique, et les timings éventuels ne sont pas des mesures de batterie.

La mise en ligne n'est **pas** comprise dans cette PR. Aucune adresse de préproduction ne doit être annoncée tant qu'un hôte séparé n'est pas réellement configuré. Ne pas activer GitHub Pages sur la même branche de production au risque d'altérer le domaine existant.

Exécution dans un checkout complet du dépôt :

```sh
python -m pip install playwright
python research/preprod/tests/test_preprod_wiring.py
python research/preprod/tests/test_full_app_smoke.py
```

FFmpeg et un Chromium fonctionnel sont nécessaires. Les données privées et les modèles entraînés ne sont jamais nécessaires à ce test.