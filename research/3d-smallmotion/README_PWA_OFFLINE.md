# RetoucheProAI — SmallMotion PWA Offline Safety (experimental)

Branche expérimentale, fille de `lab-3d-smallmotion-worker-first` (PR #22). Aucune fusion ou déploiement, aucun média privé.

## Problème réellement constaté

`sw.js` v82 ne préchargeait aucun des six fichiers requis pour SmallMotion. Une page déjà visitée ne pouvait donc **pas garantir** un redémarrage Worker hors réseau. Il faut couvrir **le Worker classique et son import `smallmotion-local.js`**, en plus des scripts de l'interface.

## Corrections

- Cache `retouche-v83` et six fichiers SmallMotion dans `F`, avant l'activation. Le test existant `tests/sw.test.mjs` vérifie l'empreinte SHA-256 de `F + LOURDS`. Une modification de fichier impose une nouvelle empreinte (et la version de cache appropriée).
- Protocole explicite `smallmotion-pwa-bundle-v1` dans détecteur, orchestrateur et Worker. Un ancien Worker ou un détecteur chargé depuis une autre génération ne peut pas produire un `local_motion_candidate` accepté. Résultat : `abstain_worker_version_mismatch`, zéro région.
- `tests/test_sw_atomic.cjs` : teste les callbacks réels `install`, `activate`, `fetch` dans un simulateur CacheStorage. Échec de `addAll` → aucune activation du nouveau Worker ; l'ancien cache reste conservé ; les caches de modèles et de l'application Radar ne sont pas supprimés.
- `tests/test_pwa_offline.py` : tests **réels du cycle de Service Worker dans Chromium** avec serveur `127.0.0.1` et un mini-manifeste SmallMotion dérivé de `sw.js`. Teste installation, rechargement hors réseau, création de Worker et `importScripts` hors connexion, comparaison de résultats, version cachée falsifiée et refus. Le reste du code SW est identique ; le test simplifie seulement `F` et `LOURDS` pour éviter de copier une soixantaine d'actifs applicatifs dans le banc.
- `tests/test_pwa_manifest.cjs` : vérifie le manifeste PWA **complet**, la présence et l'ordre des scripts, les builds compatibles et l'empreinte réelle du dépôt.
- Tests Node et Chromium hérités, plus test autonome `blob:` sans CDN.

## Reproduire

Depuis la racine du dépôt GitHub :

```bash
node tests/sw.test.mjs
node research/3d-smallmotion/tests/test_pwa_manifest.cjs
node research/3d-smallmotion/tests/test_sw_atomic.cjs
node research/3d-smallmotion/tests/test_worker_runner.cjs
node research/3d-smallmotion/tests/test_worker_import.cjs
python research/3d-smallmotion/tests/test_pwa_offline.py
```

`test_pwa_offline.py` requiert Chromium, Playwright, et la possibilité d'ouvrir `127.0.0.1` sur le runner. Certains environnements administrés bloquent tous les ports locaux. **Un échec dû à cette interdiction ne valide ni n'invalide l'algorithme** ; la CI GitHub doit le confirmer. Le test n'effectue aucun accès Internet.

## Limites

Safari iPhone 15 Pro Max **non testé physiquement**, PWA complète non installée sur appareil, batterie/thermique non mesurées. Le banc de navigateur réduit le manifeste pour contrôler précisément les six scripts SmallMotion ; l'installation de **tous** les autres assets est contrôlée statiquement par la CI mais n'est pas simulée dans ce test. Un Service Worker peut être évincé ou son CacheStorage supprimé par le système : première installation et premier préchargement requièrent du réseau. Les URL `blob:` ne doivent jamais être interprétées comme des uploads. Aucune garantie de traitement 60 i/s, de profondeur 3D, de geste ou de contact.