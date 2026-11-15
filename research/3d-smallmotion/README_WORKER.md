# RetoucheProAI — SmallMotion Worker First (recherche, branche isolée)

Suite de CameraGuard → MultiMotion → DepthMotion → SmallMotion Local First → In-App → DeviceBudget (PR #19). **Aucun déploiement, aucune fusion dans `main`.**

## Changements réels

- `smallmotion-worker.js` : exécute **le détecteur SmallMotion existant**, sans le modifier, dans un Web Worker dédié. En hébergement normal, `importScripts('smallmotion-local.js')` ne charge que le script présent sur le même domaine.
- `smallmotion-worker-runner.js` : crée un Worker par analyse, transfère deux tableaux RGBA **bornés**, retourne `processingPath`, `computeMs` et temps total, termine le Worker après chaque analyse ou annulation. Aucune vidéo complète ni nom de fichier transmis.
- `smallmotion-director-local.js` : attend le calcul Worker sans bloquer l'interface, conserve les protections ressources et `no_automatic_change`, ne transmet rien à `DIAG`, `fetch`, télémétrie ou export.
- `smallmotion-resource-guard.js` : estimation mémoire CPU temporaire **14 octets/pixel de référence + 8 octets/pixel de copies de transfert**. Pas de mémoire native du décodeur/GPU mesurée.
- `RetoucheMotionWorker_iPhone_Local.html` : démonstrateur **autonome** pouvant ouvrir une vidéo locale. Worker `blob:` construit à partir des sources intégrées ; CSP `connect-src 'none';worker-src blob:`. En cas de blocage de création du Worker, exécution ponctuelle sur fil principal, toujours locale.
- `index.html` sur branche uniquement : une balise `defer` supplémentaire avant le pont. `app.js`, `sw.js`, le pipeline de restauration et l'export ne sont pas modifiés.

## Validation reproductible

```sh
node tests/test_worker_runner.cjs
node tests/test_worker_import.cjs
node tests/test_resource_guard.cjs
node tests/test_director_local.cjs
python tests/browser_check.py
python tests/test_worker_browser.py
python tests/test_safari_harness.py
```

Pour les tests navigateur : `playwright`, `opencv-python-headless`, `numpy`, Chromium, FFmpeg. Sur GitHub Actions ces dépendances CPU gratuites sont installées. La suite Python historique de **139 tests** est exécutée également.

## Échecs et restrictions connus

1. Le navigateur réel Safari iPhone **n'a pas été testé** ; son autonomie, sa RAM native, sa température, la présence de politiques CSP de production et la prise en charge de `requestVideoFrameCallback` restent à mesurer.
2. Chromium de l'environnement local interdit les navigations HTTP, y compris `127.0.0.1`. L'essai hors ligne `blob:` est passé ; le chemin Worker classique avec `importScripts` est vérifié dans un vrai thread Node, mais **pas comme Worker d'une page hébergée**, à ce stade.
3. En cas d'échec d'exécution du Worker **déjà créé**, le système s'abstient ; il ne relance pas silencieusement un calcul long sur le fil principal. Si le constructeur `Worker` est indisponible ou bloqué, un repli ponctuel local s'exécute après avoir rendu le contrôle à l'interface.
4. Échantillonnage : seulement **deux** trames au maximum 160×120 ; aucun suivi temporel continu, aucun masque sémantique, aucune preuve de profondeur, mains, gestes ou contacts.
5. Les transferts sont des copies pour préserver les deux images si l'envoi échoue. Cette allocation supplémentaire est explicitement comptabilisée dans l'estimation CPU ; la mémoire réelle du Worker, des tables JS, du décodeur et du GPU n'est pas accessible par cette API.
6. Les tests mesurent le calcul sur une machine d'exécution, pas les FPS, la batterie ou la fluidité d'un vrai iPhone. Le test d'interface avec Worker artificiellement occupé vérifie la **réactivité du fil principal**, pas 60 FPS.

Un simple refus d'accès à `Worker`, une fermeture de la page, une annulation ou un changement de média ne doit jamais déclencher un envoi réseau ni modifier les réglages de restauration.