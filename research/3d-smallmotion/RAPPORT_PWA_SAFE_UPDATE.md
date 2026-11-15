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

## Échec de validation découvert et protocole corrigé

La première CI a passé les contrôles de manifeste, d'installation, les 139 tests et le redémarrage hors ligne. Elle a ensuite détecté une course dans le nouveau test multi-fenêtres : un second cycle d'installation Chromium était encore en cours alors que la première fenêtre d'observation avait vu un état `waiting`. Le journal montrait simultanément les caches v84 et v85, la page ancienne v84 et `registration.installing` en cours ; **rien ne prouvait une activation prématurée**. Le test a été renforcé pour exiger trois relevés consécutifs `waiting=installed` et `installing=null` avant les assertions et la coupure du réseau.

## Validation distante obtenue — GitHub Actions #43699604844

La **troisième exécution du scénario** a réussi après une amélioration de synchronisation du test. Les contrôles d'empreinte PWA ont vérifié la totalité du dépôt, les 139 tests Python et les tests Node précédents ont réussi, et les deux expériences Chromium ont été exécutées. Artéfact vérifié : `SmallMotion_PWA_Safe_Update_GitHub_CI.zip`.

- Scénario `test_pwa_update_two_clients.py` : **65 ressources du manifeste réel F précachées** (index de test minimal, poids lourds différés exclus du protocole). Phase `waiting_two_clients` : ancienne cache conservée, nouvelle génération installée et en attente, état d'édition non exportée préservé, ancien Worker cohérent.
- Phase `waiting_one_client_offline` : première fenêtre fermée, deuxième encore ouverte, ancien cache et ancien Worker opérationnels malgré l'absence de réseau.
- Phase `new_client_offline` : dernière fenêtre fermée, activation v85, Worker nouvelle génération (`smallmotion-pwa-bundle-v2`) cohérent, cache v84 retiré, zéro requête externe, statut détecteur `no_supported_local_motion` sur une scène synthétique sans mouvement.
- Ancien test hors connexion : deux formats Chromium 390×844 et 1280×800, parité exacte avec le détecteur, origine du Worker correcte, rejet d'un Worker artificiellement obsolète, zéro requête externe.

**Contexte des échecs initiaux :** le nouveau test lisait un état transitoire de `registration.waiting` avant la fin d'une installation concurrente. La version corrigée exige trois contrôles consécutifs `waiting=installed` et `installing=null`, tout en vérifiant que l'ancien cache et le contrôleur restent actifs. Cette correction concerne le **banc de test**, pas une modification cachée du mécanisme de production.

Le résultat démontre le **cycle de mise à jour d'un Service Worker avec 65 ressources précachées**, pas l'absence de perte de travail dans tous les parcours du véritable éditeur vidéo. Safari physique reste à mesurer.

## Références générales

- MDN : Service Worker lifecycle et activation en attente : https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
- web.dev : risque de versions mélangées lorsque `skipWaiting()` force la prise de contrôle : https://web.dev/learn/pwa/service-workers

## Confidentialité et périmètre

Scènes de mouvement synthétiques uniquement, aucune image utilisateur, aucun appel à des API de GPU externes. Aucun déploiement, aucune fusion ; Safari physique non testé.