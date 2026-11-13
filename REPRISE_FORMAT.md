# REPRISE — module « AI Adaptive Video Reframing » (changement de format)

**À lire en premier à chaque nouvelle session. Ne pas repartir de zéro.**

- Branche de travail : `travail-format` (le site en ligne = `main`, NON modifié par ce travail).
- Cahier des charges : « PROMPT MAÎTRE FINAL — MODULE AI ADAPTIVE VIDEO REFRAMING » (17 sections).
- Reprendre : `git fetch && git checkout travail-format`, lire ce fichier, puis continuer.

## Déjà écrit (sauvegarde du 14 nov. 2026, 00 h 35)
- `format-analyse.js` — analyse du média, scènes, sujets, mouvements
- `format-directeur.js` — directeur IA (choix de stratégie par scène)
- `format-moteur.js` — moteurs de transformation (recadrage, extension, hybride)
- `format-qualite.js` — contrôle qualité
- `format.js` — interface + orchestration
- Intégration en cours dans `app.js`, `index.html`, `models.js`, `sw.js`
- Modèle ajouté : `modeles/lourds/objets/efficientdet_lite0.tflite` (détection d'objets, Apache-2.0)
- Tests : `tests/format.test.mjs`, `tests/format_app.test.mjs`, banc `tests/format/`
  (vidéos de test générées par `tests/format/creer_videos.sh`, non versionnées)

## État au 14 nov. 2026, 01 h (v8.0 prête sur la branche)
- FAIT : tests du module 16/16 + 16/16 (`PW=<chemin playwright>/index.mjs node tests/format_app.test.mjs`).
- FAIT : documentation (CHANGELOG v8.0, fiche F32 du registre, NOTES, licences, guide).
- FAIT : empreinte du service worker (`node tests/sw.test.mjs --maj`).
- EN COURS : suite de non-régression (`tests/lancer_tests.sh`) puis publication sur `main`.

## Ensuite (par ordre d'intérêt mesuré)
1. Intégrer LaMa (Apache-2.0) pour les côtés : mesuré nettement meilleur que MI-GAN (voir REGISTRE_MODELES_LICENCES.md).
2. Vertical → horizontal « vrai » : génération lourde sur le serveur Kaggle gratuit.
3. Essai sur iPhone (WebKit absent de l'environnement de test) ; HDR.

Mettre à jour ce fichier et pousser après chaque étape terminée.
