# Rapport — Protection du cycle de mise à jour PWA / SmallMotion

Date : 15 novembre 2026 · branche : `lab-3d-smallmotion-pwa-safe-update-v1` · base : `lab-3d-smallmotion-pwa-offline-v1` (PR #24).

## Problème constaté

Le Service Worker v83 précharge ses ressources puis appelle `self.skipWaiting()` dans le même événement d'installation. Cette instruction peut provoquer le changement du contrôleur Service Worker alors que d'anciennes pages exécutent encore leurs scripts. Dans ce cas, de nouvelles requêtes de scripts pourraient recevoir la génération la plus récente. Le protocole de version SmallMotion résiste à certains mélanges en refusant les résultats, mais le risque reste inutile. Ce n'est pas une preuve qu'un utilisateur a déjà perdu une vidéo : c'est un risque architectural concret.

## Remédiation

Cache v84, même liste `F` que v83, même empreinte SHA-256 des ressources `ab91e6220da20c81` (l'empreinte sera **recalculée sur le dépôt entier dans la CI**). Suppression **uniquement** du `skipWaiting()` de l'installation. L'installation conserve `Cache.addAll` atomique ; l'activation conserve la suppression ciblée des caches applicatifs et la mise à disposition des fichiers lourds existants. Aucun changement à `app.js` ou `index.html` ; le véritable rendu reste identique.

## Validation locale

- Simulation d'installation atomique de `sw.js` : **21 contrôles** passés ; zéro appel à `skipWaiting` ; cache ancien préservé avant activation.
- Simulation de deux clients dont un avec un projet non exporté : **12 assertions** passées. Le nouveau cache est prêt ; aucun changement de version forcé ; le cache ancien n'est supprimé qu'au passage explicite à l'activation après fermeture des clients.
- Validation statique du manifeste et des marqueurs des trois scripts du Worker : réussie hors calcul de l'empreinte globale, impossible sans tous les fichiers du dépôt.
- Le navigateur Chromium local bloque les connexions localhost par politique administrateur. **Aucun vrai test navigateur local de cette transition** n'est déclaré réussi.

## Tests distants à confirmer

Le workflow GitHub Actions, qui dispose du dépôt complet, doit recalculer `H`, exécuter les tests de non-régression, répéter le redémarrage hors ligne antérieur, puis exécuter le nouveau scénario de deux fenêtres avec tout le manifeste F. Les résultats positifs et les échecs resteront distincts.

## Références générales

- MDN : Service Worker lifecycle et activation en attente : https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
- web.dev : risque de versions mélangées lorsque `skipWaiting()` force la prise de contrôle : https://web.dev/learn/pwa/service-workers

## Confidentialité et périmètre

Scènes de mouvement synthétiques uniquement, aucune image utilisateur, aucun appel à des API de GPU externes. Aucun déploiement, aucune fusion ; Safari physique non testé.