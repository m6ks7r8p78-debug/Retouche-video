# RetoucheProAI — PWA Safe Update, laboratoire v1

Suite de la **PR #24** SmallMotion PWA Offline. Cette expérimentation vérifie la **cohérence des versions quand plusieurs fenêtres de l'application sont encore ouvertes**, y compris lorsque des médias ont été importés ou que des réglages ne sont pas exportés.

## Changement de comportement

Le Service Worker passe de `retouche-v83` à `retouche-v84` et **n'appelle plus `skipWaiting()` lors de l'installation**. Une nouvelle génération est précachée mais **attend la fermeture de tous les clients contrôlés par l'ancien Service Worker** avant de devenir active. L'ancien cache et les scripts SmallMotion restent disponibles pendant cette attente. À l'activation, seul le cache applicatif obsolète est supprimé ; les caches des modèles IA et des autres applications restent préservés.

La PWA **ne force pas** un rechargement pendant une restauration ou un montage. Le Worker de mouvement garde par ailleurs ses contrôles de génération : si des fichiers de versions incompatibles sont rencontrés, l'analyse s'abstient au lieu de présenter une région plausible mais incohérente.

## Reproduction

À la racine du dépôt GitHub complet :

```bash
node tests/sw.test.mjs
node research/3d-smallmotion/tests/test_sw_atomic.cjs
node research/3d-smallmotion/tests/test_sw_update_policy.cjs
node research/3d-smallmotion/tests/test_pwa_manifest.cjs
python research/3d-smallmotion/tests/test_pwa_offline.py
python research/3d-smallmotion/tests/test_pwa_update_two_clients.py
```

Les tests Python de navigateur demandent `playwright` et un Chromium système ou Playwright. Le dernier test fonctionne sur un serveur HTTP **uniquement local** dans le runner GitHub, sert **l'ensemble du manifeste `F` réel du dépôt** (à l'exception d'un `index.html` minimal afin d'isoler le cycle de mise à jour) et désactive le téléchargement différé des gros poids, qui n'est pas l'objet de ce banc. Il ne publie ni vidéo ni données.

Le test simule deux générations cohérentes des trois scripts critiques du Worker (`bundle-v1` → `bundle-v2`) et confirme :

1. ancienne génération active et cache v84 conservé lorsque deux clients restent ouverts ;
2. v85 entièrement installé **mais en attente**, y compris après fermeture d'un seul client ;
3. les travaux non exportés restent présents et l'ancien Worker répond encore avec les anciennes ressources, réseau déconnecté ;
4. après fermeture du dernier client, v85 est activé ; les nouvelles fenêtres fonctionnent **hors ligne** avec le nouveau Worker cohérent et l'ancien cache est nettoyé.

## Limites non négociables

- La **vraie PWA RetoucheProAI complète** n'est pas exercée comme une interface utilisateur dans ce banc : son manifeste complet est précaché, mais l'index est remplacé par un client minimal de test.
- Pas de Safari réel, pas de mesure de RAM/température/batterie ni de preuve de fluidité 4K/60 ips.
- Première installation : réseau nécessaire. Cache supprimable par le navigateur. L'activation différée peut aussi rester **en attente longtemps** si une ancienne fenêtre n'est jamais fermée.
- Le code historique de `demarrage.js` désactive le Service Worker pour certains comptes non Premium : cette expérimentation ne change **pas** les règles de souscription.
- Pas de transfert de vidéos privées, pas d'entraînement, pas de GPU loué, pas de changement de rendu ou d'export.
- PR en brouillon, basée sur la PR #24. Ni fusion dans `main`, ni mise en production.

## Résultat GitHub CI vérifié

[GitHub Actions #43699604844](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43699604844) : **succès**. 65 entrées réelles du manifeste précachées sur le runner, ancienne version en attente avec deux clients actifs, travail d'édition simulé conservé, accès au Worker ancien hors réseau, puis migration vers la nouvelle génération après fermeture du dernier client. Aucun test Safari physique n'est inclus.