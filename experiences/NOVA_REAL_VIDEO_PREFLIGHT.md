# NOVA 0.25 expérimental — précontrôle local des vraies vidéos sur iPhone

**Statut : PR expérimentale non fusionnée, non déployée.** La validation physique déjà acquise porte sur le clip synthétique NOVA 0.24, et ne vaut pas validation du précontrôle des fichiers personnels.

## Pourquoi cette étape

L'utilisateur a confirmé sur iPhone que l'export MP4 synthétique NOVA 0.24 affichait l'image grise et émettait le bip. Avant de proposer de convertir une **vraie** vidéo MOV/MP4, l'application doit pouvoir dire si elle est actuellement compatible avec le pilote (et pourquoi elle serait refusée), **avant de lancer un export coûteux**.

## Fonctionnalité réalisée

Un nouveau panneau discret de l'interface `experiences/nova.html`, intitulé « Précontrôle d'une vidéo réelle · sans export », devient disponible après import d'une vidéo.

Sur appui explicite sur « Vérifier cette vidéo sans exporter », le code :

1. Vérifie localement la taille, le type de fichier et les fonctions navigateur requises.
2. Réutilise `NOVA_DEMUX.analyser` pour les tables ISO-BMFF vidéo et la détection HEVC.
3. Réutilise `NOVA_HEVC_RENDER.metadata` pour le contrat SDR BT.709, SPS/VUI, orientation, PTS, durée et résolution du pilote.
4. Réutilise `NOVA_EXPORT.plan` et `NOVA_GUARD.exigerBudget` pour une sortie maximale de 640 px, 15 images/s, 12 secondes, 60 Mio de source et le budget mémoire prudent existant.
5. Réutilise `NOVA_AAC_COPY.planifier` **sans lire les données AAC complètes pour les réencoder ni copier les paquets**, pour vérifier si la piste AAC peut être conservée (y compris la présentation temporelle). Aucun repli silencieux vers une exportation muette.
6. Rend un rapport JSON local, seulement après appui, avec catégorie vidéo, dimensions, durée, nombre d'images, admissibilité HEVC, audio AAC, estimation mémoire et raison de refus **codifiée**, jamais les messages d'exception contenant potentiellement un nom/chemin privé.

**Aucun export n'est lancé.** Le résultat `ready-for-export-attempt` signifie « vérifications préliminaires passées, essai d'export possible », pas « export garanti », ni « qualité certifiée ». Le rapport ne contient pas de noms de fichiers, d'octets média, d'informations GPS ni d'empreinte d'appareil.

## Fichiers

- `experiences/nova-real-preflight.js` — précontrôle en lecture seule et sérialisation JSON sur liste blanche.
- `experiences/nova-real-preflight-ui.js` — parcours utilisateur et gestion de sélection, annulation, révocation des Blob URLs.
- `experiences/nova.html` — panneau facultatif dans l'interface existante.
- `tests/nova-real-preflight.test.mjs` — cas positifs et refus en environnement injecté, protection contre les fuites, annulation.
- `tests/nova-real-preflight-browser.test.mjs` — vrai navigateur Chromium avec CSP, deux fichiers synthétiques HEVC/AAC et H.264, sans requête externe ni upload.
- `tests/nova-iphone-preview.test.mjs` — le paquet isolé inclut le précontrôle.
- `.github/workflows/nova-real-video-preflight.yml` — test + génération d'un ZIP Cloudflare **manuel**, sans publication.

## Ce qui n'est PAS réalisé

- Ni restauration des vidéos privées, ni entraînement IA, ni import automatique de la bibliothèque privée, ni publication de médias.
- Pas d'analyse de qualité perceptuelle ou de garantie audio à l'écoute ; le parseur AAC signale seulement une compatibilité de copie des échantillons.
- Les limites du pilote demeurent volontairement strictes. Une vidéo HDR, une source 4K, une édition complexe, une piste audio AAC non reconnue ou un format non pris en charge est **refusé**, pas converti en silence ni transformé à tort.
- Aucun test Safari physique sur une vraie vidéo à ce stade.
- Pas de fusion avec `chatgpt-nova-iphone-https-package-v1`, `main` ni déploiement automatique sur `retoucheproai.com` / `retoucheproai-labo.pages.dev`.

## Validation et promotion

Exécuter le workflow GitHub sur la branche; vérifier les tests unitaires et navigateur sous CSP avant de distribuer son ZIP manuel. Le laboratoire actuel reste inchangé jusqu'à ce que l'utilisateur choisisse d'installer un nouvel aperçu Cloudflare. Le passage à l'application principale nécessitera une revue d'intégration, des essais Safari physiques avec fichiers autorisés, et une décision de fusion/déploiement explicite.

**Prochaine expérimentation :** un clip HEVC/AAC réel court **choisi volontairement** dans Safari iPhone, premièrement via le précontrôle, puis un export distinct uniquement si les garde-fous passent, avec comparaison audio et couleur en local.
