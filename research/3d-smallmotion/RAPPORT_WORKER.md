# Rapport d'expérience — RetoucheProAI SmallMotion Worker First
Date : 15 novembre 2026. Statut : **expérimental, non publié**.

## Hypothèse testée

Déplacer **le calcul local de correspondances de blocs** de SmallMotion dans un Web Worker, tout en maintenant l'import vidéo par `blob:` et le décodage sur le fil principal, peut libérer l'interface pendant le calcul et permettre l'annulation sans exposer des médias.

## Ce qui a réellement été développé

`smallmotion-worker.js` appelle le détecteur existant (même algorithme) sur deux images RGBA de taille bornée. `smallmotion-worker-runner.js` transfère des **copies de deux RGBA** au Worker, attend un résultat asynchrone, termine le thread et élimine les réponses tardives. Crash ou timeout => abstention. Faute de création du Worker => repli local ponctuel, non permanent. L'algorithme de détection n'est pas modifié.

La passerelle d'application crée un diagnostic avec `processingPath`, `processingWallMs`, `workerComputeMs`, `transferredBytes`, sans fichier, image, nom de média ni identifiant personnel. Aucun diagnostic n'est transmis à la télémétrie. Les observations restent des **hypothèses 2D consultatives**.

## Tests contrôlés réussis localement

- **139/139 tests Python historiques** de CameraGuard / MultiMotion / DepthMotion / SmallMotion.
- **20 assertions Node** orchestrateur, dont parité moteur, transferts, données sources conservées, sans Worker, constructeur bloqué, transfert refusé, erreur runtime, timeout et annulation.
- Runtime Worker classique et `importScripts` exécutés dans un vrai `node:worker_threads`, comparaison JSON stricte avec le moteur principal.
- **25 assertions** ResourceGuard et **27 assertions** pont conservées, plus tests SmallMotion JS historiques.
- Import d'un **vrai MP4 H.264 entièrement synthétique** dans Chromium 390×844 et 1280×800, traitement du fichier local via Worker en mode `blob:` : une région proposée, aucune requête HTTP et aucune erreur JS. Injection de ralentissement : profil réduit 128×96 ; surcharge : abstention, zéro candidat. Test de repli main-thread après blocage de `Worker`.
- Diagnostic offline autonome dans Chromium aux deux tailles d'écran : 2/2, export volontaire JSON sans pixels.
- Test de réactivité : Worker volontairement occupé ~210 ms, timer du fil principal répond après 40 ms ; annulation et terminaison réelles vérifiées.

## Résultats de latence (environnement de développement, PAS iPhone)

Pour les deux essais du MP4 synthétique en Worker, la durée totale inclut création Worker, transfert et réponse : les résultats exacts sont dans `results/browser_check.json`. Les temps Worker sont dans `workerComputeMs`. Les mesures ne comprennent pas les attentes décodage dans `processorMs`, mais l'échantillonnage séparé dans `captureMs`.

## Vulnérabilités testées et limites

- Si le Worker échoue après construction, la décision est **abstention** plutôt qu'une reprise qui bloquerait l'interface.
- Si le Worker ne peut pas être construit (CSP ou API manquante), repli synchrone **borné** (max 320×240 deux images) après une tâche différée : il peut toujours momentanément figer l'interface ; c'est une concession explicite.
- Toute réponse tardive est ignorée dès que le Worker est annulé ; les buffers d'origine restent intacts car ce sont des copies qui sont transférées.
- Le budget du DeviceGuard est basé sur le **temps mur** (pas consommation CPU prouvée) et sur les copies RGBA explicitement ajoutées.
- La CSP d'un fichier offline autorise uniquement les Workers `blob:` et interdit les connexions réseau. Sur hébergement normal, la CSP réelle doit autoriser le Worker même origine (`worker-src 'self'`) : **elle n'a pas été validée en production**.
- Aucun Safari physique, aucun 4K, aucune autonomie, aucune thermométrie, aucun traitement sémantique, aucune preuve de causalité 3D ni vitesse 60 FPS démontrée.
- Données utilisées : uniquement sources synthétiques ; **aucune des 157 vidéos personnelles**, aucun entraînement ni location de GPU externe.

## Critères avant promotion

Tester Safari physique (iPhone 15 Pro Max), vérifier `requestVideoFrameCallback`, Worker `blob:` et same-origin, politique CSP et cache PWA, annulation pendant changement d'application, mémoire et consommation avec Instruments/Xcode si disponible, compare visuellement faux positifs sur vidéos autorisées. Ne pas fusionner ou déployer avant revue.