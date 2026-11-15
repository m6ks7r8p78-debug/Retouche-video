# NOVA — chemin H.264 PTS/AAC local existant : précontrôle + export synthétique

Branche expérimentale `chatgpt-nova-h264-local-path-v1-20261115`, issue du HEAD `e9c2b69541361f36b10b06180fe148853a96b7e6` de la [PR HEVC #50](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/50).

## Problème et résolution ciblée

Le vrai moteur `NOVA_EXPORT.exporter` possède déjà un chemin H.264 natif via `NOVA_PTS.creer` et un export MP4 H.264 avec tentative de copie AAC. Le précontrôle plus récent #42, exclusif HEVC, disait systématiquement `unsupported-video-codec` pour un H.264 valide. Il empêchait de connaître l'admissibilité réelle de ce **chemin existant**, alors que l'interface d'export le propose.

Le module `experiences/nova-h264-path.js` vérifie avant tentative, en **lecture seule** :

- Source MP4 H.264, dimensions source codées paires <= Full HD, au plus 5 000 images, 12 s et 60 Mio. Ces plafonds sont spécifiques au **pilote NOVA** (pas à Safari en général).
- Déclaration de couleur SDR BT.709 et pas d'indication de pleine plage ; aspect de pixel carré.
- Horodatages de présentation validés par `NOVA_PTS.planifier` et audit du début de source via `NOVA_GUARD`.
- `VideoDecoder.isConfigSupported` pour le H.264 source, `VideoEncoder.isConfigSupported` pour le H.264 de sortie sur la session réelle.
- `NOVA_EXPORT.plan`, budget mémoire conservateur et présence d'une copie AAC compatible avec `NOVA_AAC_COPY.planifier` et `NOVA_AVSYNC.verifier`. **Aucun repli muet** ou automatique.

Le module n'encode ni ne décode une vidéo lui-même. Le véritable export reste le bouton `Exporter un MP4 restauré` et l'implémentation déjà présente de `NOVA_EXPORT.exporter`, dont le code n'a pas été réécrit.

## Modifications

- Nouveau : `experiences/nova-h264-path.js`, module d'admission à l'export H.264 conservateur.
- Modifié : `nova-real-preflight.js` pour déléguer la branche H.264 au module au lieu d'annoncer `unsupported-video-codec` pour tous les H.264. Nouveau `sourceEngine: webcodecs-h264-native-pts` sérialisé par liste blanche.
- `nova-real-preflight-ui.js` et `nova.html` : texte compréhensible et chargement du module local sans CDN ni changement de l'accueil.
- `outils/build-nova-iphone-preview.mjs` : nouvelle mire synthétique H.264 **avec** piste AAC 48 kHz, distincte du témoin SmallMotion H.264 muet et du témoin HEVC/AAC historique.
- Tests Node `tests/nova-h264-path.test.mjs`, test de non-régression navigateur `tests/nova-real-preflight-browser.test.mjs` et banc d'export réel `tests/nova-h264-export-browser.test.mjs`.

## Résultat et frontières de preuve

- Niveau `code-present` avant les résultats CI. La présence d'un décodeur/encodeur configurables ne prouve ni le succès du décodage intégral, ni la fidélité perceptuelle. Le banc Chromium doit réellement vérifier le MP4 produit et les paquets AAC.
- Aucun traitement 4K/8K, vidéo de durée arbitraire, sauvegarde automatique, transfert de médias ni modèle IA nouveau. L'export NOVA reste plafonné à 640 px / 15 i/s / 12 s, indépendamment de la résolution d'entrée admise.
- Une source sans piste AAC ou avec AAC non préservable est **refusée** pour le parcours fidèle ; l'option historique d'export silencieux demeure uniquement sur demande explicite utilisateur, séparée du précontrôle favorable.
- Le panneau de précontrôle reste volontaire et génère un JSON anonymisé sans noms, chemins, paquets, pixels, audio, téléversement ou nouvelle persistance.
- Pas de test matériel iPhone Safari à ce stade ; un résultat positif CI Chromium n'en tient pas lieu.
- Pas de fusion de cette branche dans #50, #42 ou `main`. Pas de publication sur `retoucheproai.com` ni sur Cloudflare.

## Relais

NOVA #3 et #42 : le chemin H.264 natif était déjà présent dans l'export ; ce travail vérifie son admission et le protège côté UX. SmallMotion #44 : comparer séparément les métadonnées original/export, **sans** prétendre prouver la synchronisation perceptuelle. Directeur IA #1 : sélectionner les moteurs sur leurs capacités réelles, pas sur des limites génériques HEVC. AURA #31 : exposer le chemin fonctionnel, pas deux convertisseurs concurrents.

**Prochaine étape** : lire les résultats CI du HEAD précis ; corriger toute régression ; mesurer l'export sur Safari iPhone physique avec vidéo volontairement choisie et sur la préproduction isolée, sans modifier le site public.
