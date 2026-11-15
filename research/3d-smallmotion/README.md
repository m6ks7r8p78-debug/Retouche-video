# RetoucheProAI — SmallMotion Local First (EXPÉRIMENTAL)

Ce projet poursuit **CameraGuard v4.3 → MultiMotion → DepthMotion**. Il cible une faiblesse observée : les petits objets mobiles manqués par le seul suivi de points remarquables. Aucun modèle neuronal n'a été entraîné, aucune des 157 vidéos privées n'a été lue, et rien n'est envoyé vers un serveur.

## Deux implémentations distinctes

- `smallmotion_evidence.py` : nouvelle passe **CPU OpenCV Farneback**, comparée au flux attendu à partir de profondeur et mouvement de caméra indépendants, *uniquement avec oracle synthétique* dans les expériences contrôlées ; sinon abstention.
- `smallmotion-local.js` : passe **JavaScript pure** de recherche de mouvements locaux par comparaison de blocs et rejet du mouvement dominant. Pas de carte de profondeur. **Ne donne aucune preuve de mouvement indépendant**.
- `RetoucheSmallMotion_Local_iPhone.html` : véritable prototype HTML autonome sur iPhone (import d'un fichier vidéo choisi par l'utilisateur, extraction de deux images, calcul local CPU, visualisation d'hypothèses, page avec politique CSP bloquant les requêtes réseau). Aucune importation CDN, poids de modèle, police externe ou service.

> Le moteur JS et le moteur Python sont différents ; les scores Python ne peuvent pas être attribués à la version navigateur. Les tests Safari physique sur iPhone n'ont pas été effectués.

## Réexécuter les expériences

Dépendances Python : `numpy opencv-python-headless pytest` (aucune dépendance GPU). `node` pour les tests JS.

À partir de la branche GitHub expérimentale, ajouter les dossiers existants dans `PYTHONPATH` :

```bash
export PYTHONPATH="$PWD/research/3d-camera-v43:$PWD/research/3d-multimotion:$PWD/research/3d-depth-evidence:$PWD/research/3d-smallmotion"
python -m pytest -q research/3d-camera-v43/tests research/3d-multimotion/tests research/3d-depth-evidence/tests research/3d-smallmotion/tests/test_smallmotion.py
node research/3d-smallmotion/tests/test_smallmotion_local.cjs
python research/3d-smallmotion/benchmark_smallmotion.py --seeds 12 --offset 0 --out /tmp/smallmotion-0-11.json
python research/3d-smallmotion/js_crosscheck.py
```

Les scripts `browser_check.py` et `build_local_demo.py` sont facultatifs pour vérifier le lecteur : Playwright Python + Chromium/FFmpeg sont requis pour le premier. Le MP4 est intégralement synthétique.

## Principales observations

- Sur 12 graines 0–11 : `local_object` **12/12** détecté en candidat 2D avec Farneback, contre **0/12** pour DepthMotion ; **0/60** fausses propositions « petit objet » sur 5 scènes statiques ; une autre partition (100–105) donne **6/6**, **0/30**.
- Sur ces bancs CPU, SmallMotion (5 transitions 320×240) prend environ **120–137 ms** par séquence contre **41–49 ms** pour DepthMotion ; n'extrapoler ni les performances iPhone ni la batterie.
- Le contrôle navigateur pour deux images RGB redimensionnées (intervalle de 2 images) détecte **3/3** petits objets sur les mêmes scènes artificielles, **0/3** sur le décor fixe et **0/3** sur la parallaxe. Un essai de seuil abaissé détectait aussi trop de faux mouvements : **rejeté**.
- Chromium 390×844 et 1280×800 : import et décodage d'un MP4 H.264 fictif dans le navigateur, analyse et cadre affichés, 0 erreur JS et aucune requête HTTP(S) ; calcul JS observé 3,7–4,4 ms par paire après décodage (sur Chromium de cette machine, pas sur iPhone). La latence vidéo et le coût de décodage ne sont pas compris.

## Limites et décisions

1. **Pas de reconnaissance d'objet**, pas de mains/gestes, pas de preuve de contact, préhension ou reconstruction humaine 3D.
2. La version JS n'a pas d'estimation métrique de profondeur ; la parallaxe reste un risque général, même si les scénarios locaux choisis passent.
3. Détection possible de scènes lentes seulement avec échantillonnage temporel adapté ; ces délais restent heuristiques. Pas de suivi stable au long cours, pas de qualité perceptuelle.
4. Ne pas déployer sur `retoucheproai.com` ni fusionner cette PR avant des tests sur Safari physique, des scènes réelles annotées, une revue confidentialité/licences et une analyse thermique/énergétique.
5. **Politique locale par défaut :** calcul sur iPhone en priorité. WebGPU iOS Safari 26+ est une option future à mesurer, le prototype actuel fonctionne sur CPU JS. GPU externe uniquement pour recherche optionnelle avec données synthétiques ou publiques autorisées.