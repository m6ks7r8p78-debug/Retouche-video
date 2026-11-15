# Rapport — SmallMotion PWA Offline Safety

## Périmètre

Extension **expérimentale** et **locale** des PR brouillon CameraGuard → MultiMotion → DepthMotion → SmallMotion → DeviceBudget → Worker First. Aucun déploiement de production, médias personnels exclus.

## Audit de l'état précédent

Le SW v82 préchargeait l'application et une liste de modules, mais aucun de :

1. `smallmotion-local.js`
2. `smallmotion-resource-guard.js`
3. `smallmotion-worker-runner.js`
4. `smallmotion-director-local.js`
5. `smallmotion-app-bootstrap.js`
6. `smallmotion-worker.js`

Le cache-first pouvait éventuellement mettre certains fichiers en cache à la demande, **sans garantie** d'un bundle complet au premier lancement hors ligne. Le Worker utilise `importScripts('smallmotion-local.js')` : ce second script doit être stocké lui aussi.

## Changement et menace de versions mélangées

Le manifeste v83 regroupe les six scripts pendant `install`; `Cache.addAll` doit résoudre avant `skipWaiting`. Le protocole explicitement versionné refuse les résultats si la version manque ou diverge. L'analyse demeure consultative ; la stratégie `no_automatic_change` et les plafonds de ressources de la PR précédente sont conservés.

La PWA précédente actualisait `demarrage.js` à partir du numéro de `app.js`. Le nouveau cache change indépendamment du numéro applicatif : l'activation n'entraîne **pas automatiquement de rechargement de la page en cours**. La vérification de version évite alors d'accepter un résultat provenant d'un ancien Worker, mais l'utilisateur doit rouvrir/recharger l'application pour prendre en compte le bundle installé. Une installation neuve en l'absence de réseau n'est pas possible.

## Résultats locaux déjà vérifiés

- `node tests/test_worker_runner.cjs` : **22 vérifications**, dont deux cas nouveaux de Worker dépourvu de version ou de version incorrecte.
- `node tests/test_worker_import.cjs` : correspondance stricte dans `worker_threads` Node.
- `node tests/test_sw_atomic.cjs` : **20 vérifications** des événements SW (avec CacheStorage simulé), y compris panne du préchargement, conservation d'un cache antérieur, exclusion des autres applications.
- `test_worker_offline.py` et `test_worker_browser.py` : Chromium `blob:` et interface tactile simulée **2/2** chacun.
- Le vrai navigateur Service Worker `127.0.0.1` est bloqué sur l'hôte de développement (`net::ERR_BLOCKED_BY_ADMINISTRATOR`). Le contrôle avec serveur local est déplacé vers GitHub Actions, **sans affirmer qu'il a réussi localement**.

## À vérifier dans GitHub Actions

- SHA-256 complet `sw.js` recalculé sur **tous** les fichiers F et LOURDS de la branche ; `tests/sw.test.mjs` doit rester vert.
- `test_pwa_offline.py` : nouvelle installation, cache, bascule hors connexion, redémarrage Worker/import, falsification d'une réponse Worker et abstention.
- Rejouer les **139 tests Python** précédents et les suites JS/browser Worker.

## Inconnues et restrictions

Aucun Safari physique, aucune mesure énergie/chaleur/mémoire décodeur, aucun besoin de GPU distant ; seules des images synthétiques de 160 × 120 sont comparées. L'empreinte SHA n'est pas une signature cryptographique d'un éditeur tiers : elle détecte les modifications accidentelles des ressources du dépôt. Une réponse Worker incompatible est rejetée, mais ceci ne constitue pas un audit global de cybersécurité. Pas de garantie que le système conservera son CacheStorage indéfiniment.