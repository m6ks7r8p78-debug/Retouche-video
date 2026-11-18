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
- FAIT : non-régression (aucun échec nouveau par rapport à main v7.6 ; détail fiche F32).
- FAIT : v8.0 publiée sur `main` le 14 nov. 2026 (point de restauration : branche `sauvegarde-v7.7`).

## v8.4 « Zéro perte » (16 nov. 2026)
- Mode `zero` (par défaut) : FMD.MODES.zero (z = 0 seulement), FMD.tailleZero (échelle 1), FMM.placementZero (position entière),
  rendu sans fondu sur l'original (miroir du bord côté ajouté), FMQ.identiques / bilanZero (contrôle à l'export).
- Décor complet : `serveur-ia/extension_kaggle.py` (SDXL Inpainting 0.1 + raccord couleur + Real-ESRGAN), `KG.etendre` (kaggle.js),
  `etendreServeur` (format.js). Résultat renvoyé DANS info.json (le relais ne laisse passer que info.json et ia.mp4).
- Tests : `node --test tests/format.test.mjs`, `python3 tests/extension_kaggle_test.py`, `node tests/format_zero.test.mjs`.
- Reste : premier calcul réel sur Kaggle (qualité SDXL, durée), essai iPhone (encodeur 3414×1920, quantification fixe).

## v8.5 « Fidèle » (18 nov. 2026) — conversion SANS GÉNÉRATION (demande du propriétaire : « ne rien inventer »)
- Mode `fidele` = mode PAR DÉFAUT de Changer de format. Module de calcul `format-fidele.js` (FFI, testé dans Node).
- Méthode : déformation alignée sur l'axe (colonnes ou lignes) ; sujets (visages, personnes, animaux + marge) à s = 1 (copie exacte),
  fond étiré ≤ 10 % (seuil de perception), douceur entre colonnes (rampe ≤ 0,02/colonne près des sujets), UN calcul par scène (aucune ondulation).
- Variantes affichées avec leurs mesures, jamais activées sans choix : Proportions exactes, Remplissage accru (≤ 35 %), Remplissage total,
  Étirement uniforme, Recadrage. Côtés : bandes noires (défaut) ou flou de la vidéo elle-même.
- Contrôles : avant l'export (8 images/scène, visages sous une zone étirée → protégés, nouveau calcul) ; à l'export IMAGE PAR IMAGE
  (YuNet sur chaque image, copie pixel pour pixel des colonnes non étirées toutes les 12 images, stabilité) ; visage manqué → vidéo refaite.
- Analyse : profils par colonne/ligne (détails, mouvement) ajoutés ; version d'analyse en cache passée à 2.
- Tests : `node --test tests/format_fidele_calcul.test.mjs`, `node tests/format_fidele.test.mjs` (vraies vidéos : `tests/fidele/creer_videos.sh`),
  banc comparatif `python3 tests/fidele/banc_fidele.py` (naturel, fidèle, accru, total, uniforme, recadrage, seam carving ×2).
- Constat mesuré : en 9:16 → 16:9, « Fidèle » ne gagne que 0 à 2 points de remplissage (32 % au lieu de 31,6 %) — c'est la limite
  physique sans génération ; quand des sujets passent partout dans la scène, rien n'est étiré (et c'est dit).
- Reste : essai sur iPhone (vitesse du contrôle visage image par image, encodeur 3414×1920).

## Ensuite (par ordre d'intérêt mesuré)
1. Intégrer LaMa (Apache-2.0) pour les côtés : mesuré nettement meilleur que MI-GAN (voir REGISTRE_MODELES_LICENCES.md).
2. Vertical → horizontal « vrai » : génération lourde sur le serveur Kaggle gratuit.
3. Essai sur iPhone (WebKit absent de l'environnement de test) ; HDR.

Mettre à jour ce fichier et pousser après chaque étape terminée.
