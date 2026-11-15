# RetoucheProAI — Édition One V4 / Obsidian Optical

**Prototype autonome uniquement. Ne pas fusionner ni déployer avant validation explicite de l'utilisateur.**

## Changements
- V3 validée comme base ; évolution du matériau des boutons, typographie, composition de l'atelier et navigation.
- Comparaison **original réel** (volet gauche sans filtre artificiellement dégradant) / **aperçu local** (volet droit avec réglages CSS).
- « Voir l'original » : maintenir le doigt, la souris ou Espace/Entrée ; restauration de la position précédente à la fin du geste.
- Mode « Immersion » : image plein écran et commande de sortie, touche Échap.
- Réglages, presets, import local, lecture des vidéos, options taille des textes / réduction animations.
- Aperçu photo exportable en JPEG, PNG, mode « Pour X » (publication manuelle, qualité non garantie après X).

## Tests et limites
Automatisation Chromium sur 320×700, 375×812, 390×844, 430×932 et 768×1024 : aucun débordement horizontal ni erreur JS sur les parcours import/navigation/comparaison/immersion/choix style/réglages/export et préférences. Import et lecture locale d'un MP4 synthétique vérifiés ; export vidéo désactivé honnêtement.

Aucune restauration IA, aucun retrait de filtre AR et aucun export vidéo réel dans cette maquette. La vidéo reste un média local. Les traitements photo sont des ajustements colorimétriques locaux, **pas une IA ni une garantie 4K ou 8K**. Pas de test physique Safari iPhone à ce stade. Pas de média privé dans le dépôt.

## Avant toute mise à jour de l'application publique
Valider l'esthétique sur iPhone ; auditer l'architecture de `app.js` et des modules ; créer l'intégration progressive sans casser les moteurs, consentements, exports, PWA ni historique ; réaliser des tests Safari réels et de non-régression ; demander l'autorisation explicite de fusion/déploiement.

La V3 demeure archivée dans `prototypes/edition-one-v3/`. V4 dans `prototypes/edition-one-v4/index.html`.