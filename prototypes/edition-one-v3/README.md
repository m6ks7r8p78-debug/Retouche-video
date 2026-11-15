# RetoucheProAI — Édition One V3 : « Optique »

## Refonte visuelle

Prototype autonome, **sans substitution des moteurs existants**, situé dans `prototypes/edition-one-v3/index.html`.

- Accueil entièrement reconçu : univers nocturne, optique vectorielle animée, boutons nacrés tridimensionnels, logo et icônes travaillés.
- Navigation flottante, 4 espaces sobres : Accueil, Atelier, Créations, Options.
- Atelier image plein cadre avec comparateur tactile avant/après, préréglages de style de démonstration et réglages avancés.
- Import local image/vidéo ; la vidéo est lisible dans la maquette, sans traitement/export.
- Export d'**aperçu photo non-IA** via canvas en JPEG ou PNG ; option « Pour X » sans publication ni garantie de non-compression.
- Préférences agrandissement de texte et réduction des animations, safe areas iPhone, fichiers en mémoire de session uniquement.

**IMPORTANT :** la comparaison du côté « avant » est une dégradation artificielle pour présenter le geste ; elle n'est pas le résultat d'une restauration IA. « Restauration » et « Visages » sont ici des préréglages visuels, sans reconstruction.

## Contrôles effectués

Chromium/Playwright : **320×700, 375×812, 390×844, 430×932, 768×1024**. Navigation, effets, comparateur, panneau des réglages, export réel de l'aperçu photo, import local, préférences, galerie temporaire et suppression de session. Pas d'erreurs JavaScript ni de débordements horizontaux sur ces scénarios.

Vidéo synthétique : import + lecture locale ; traitement IA et export désactivés, conformément au message de l'interface.

## Conditions d'intégration

Ne pas fusionner directement ce fichier dans l'application en production. Adapter les composants aux véritables API existantes : import, analyse, restauration, défiltrage AR, Directeur IA, sauvegarde, historique, exports, consentements, PWA et tests hors ligne. Revue Safari iPhone réelle et non-régression indispensables. **Attendre la validation explicite de l'utilisateur avant toute mise à jour sur main et toute publication.**

## Références

- Apple, [Materials](https://developer.apple.com/design/human-interface-guidelines/materials) — maîtrise des couches matérielles et de la lisibilité.
- Darkroom, [Interface overview](https://darkroom.co/help/guide/interface-overview) — image immersive, gestes et boucle bibliothèque / éditeur / export.

Le dessin de l'optique et des commandes est original pour cette maquette ; aucune interface tierce n'est copiée.
