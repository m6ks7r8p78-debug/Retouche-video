# RetoucheProAI — SmallMotion Device Budget (laboratoire)

Extension prudente de l'expérience SmallMotion in-app (PR #18). **Aucune fusion dans `main` ni déploiement du site.** Le code ne transmet aucun média et ne prétend pas tester physiquement Safari iPhone.

## Livrables

- `smallmotion-resource-guard.js` : politique JS pure, reproductible, indépendante du matériel ; 160×120 pixels maximum pour deux observations. Seuil **80 ms** : mention de lenteur et profil réduit lors du prochain essai ; **500 ms** de calcul ou **6000 ms** de prélèvement : abstention (suppression des candidats). Ce sont des seuils expérimentaux, pas une spécification de vitesse iPhone.
- `smallmotion-director-local.js` : évolution conservatrice du pont précédent ; prélèvement et calcul mesurés séparément, adaptatif **160×120 → 128×96** après ralentissement, refus des conclusions hors budget, aucune interaction avec export, télémetrie ou les options du Directeur IA. Un portrait très étroit peut être rejeté en profil réduit : on préfère un refus à un redimensionnement excessif.
- `RetoucheMotionBudget_iPhone_Local.html` : démonstrateur autonome avec import privé et export manuel du diagnostic JSON, sans images ni nom de fichier. Sans CDN, zéro téléchargement de poids et CSP interdisant `connect-src`.
- `tests/test_resource_guard.cjs` : assertions déterministes sur les budgets, l'absence de fausses mesures batterie/température, la réduction et l'abstention.
- `tests/browser_check.py` : vrai fichier synthétique décodé sous Chromium (H.264 si disponible, VP8 sinon), mode local aux deux formats d'écran, trois essais (normal, ralentissement simulé, dépassement simulé) et rejet de tout candidat en cas de dépassement.
- `tests/test_safari_harness.py` : test du fichier HTML autonome et export des seuls diagnostics.

## Instructions d'essai iPhone (à réaliser physiquement)

1. Ouvrir le fichier HTML **dans un navigateur qui peut exécuter du HTML local**. L'aperçu dans l'application Fichiers peut ne pas le permettre ; ne pas supposer que le test fonctionne avant essai.
2. Importer une vidéo non confidentielle de préférence, puis toucher *Analyser localement*.
3. Ouvrir *Diagnostic de l'analyse* ; noter `captureMs` et `processorMs` ainsi que le `status`, puis répéter trois fois sur la même vidéo, sans mettre l'application en arrière-plan.
4. Tester une vidéo portrait, annuler une analyse, mettre la page en arrière-plan pendant une analyse, et faire un import multiple.
5. Si souhaité, choisir *Exporter uniquement le diagnostic JSON* et partager **le JSON seulement**, jamais la vidéo privée.

Les valeurs `estimatedCpuOwnedBytes` comptent les tableaux de deux images RGBA, le canvas RGBA et deux tableaux de niveaux de gris **selon une estimation de stockage CPU JS**. Elles **n'incluent pas** la mémoire du décodeur natif, la GPU, les copies internes et les autres modules. Les champs `nativeVideoDecoderBytes`, `deviceTemperatureC` et `batteryConsumption` sont volontairement `null`.

`requestVideoFrameCallback` livre des trames présentées mais pas forcément toutes les images ni des temps de décodage isolés ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)). La durée `captureMs` couvre lecture + attente + décodage éventuel et ordonnanceur. L'empreinte mémoire et l'autonomie ne sont pas validées.

## Tests

```bash
node tests/test_resource_guard.cjs
node tests/test_director_local.cjs
python tests/browser_check.py
python tests/test_safari_harness.py
```

Depuis GitHub, les tests sont sous `research/3d-smallmotion/tests/` et s'appuient sur `smallmotion-local.js`. Dépendances navigateur: `playwright`, `opencv-python-headless`, `numpy`, FFmpeg et un navigateur Chromium disponible. Les tests H.264 et VP8 sont fictifs et ne sont jamais committés.

## Ce qui n'est **pas** démontré

Pas de Safari physique, pas de WebGPU utilisé, pas de résolution 4K, pas de tracking 60 images/s, pas de mesure de température ou de batterie, pas de reconnaissance de main, de suivi d'identité, de contact ou de reconstruction anatomique 3D. Aucune des 157 vidéos privées et aucun modèle entraîné n'ont été utilisés.