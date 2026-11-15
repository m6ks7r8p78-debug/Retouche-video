# RetoucheProAI — Édition One V5 « Atelier Objet »

Prototype autonome dans `prototypes/edition-one-v5/index.html`, créé après le retour utilisateur sur l'aspect encore trop générique des boutons V4.

## Rupture dans le langage des commandes
- Déclencheur principal en plaque nacrée **asymétrique**, avec actionneur sombre encastré et arêtes chanfreinées.
- Clés mécaniques graphite ou nacrées, avec états tactiles spécifiques.
- Molette optique crantée, LED d'état et noyau concave.
- Pont de navigation biseauté avec gâchette centrale, à la place d'une barre web générique.

## Comportements réellement testables
Import local photo/vidéo, lecture vidéo locale, comparaison photo avant/après avec **original intact**, drag tactile et clavier, maintenir pour original, styles de démonstration, préférences taille du texte et réduction du mouvement, téléchargement JPEG/PNG local, choix JPEG « Pour X » (publication manuelle et recompression possible). Aucune requête extérieure.

## Limites honnêtes
Les styles sont des filtres CSS **non-IA**. Pas de restauration, défiltrage AR, super-résolution, traitement ou export vidéo réel. Le fichier exporté est un simple aperçu photo de démonstration. Aucun média personnel ni modèle privé ne figure dans le dépôt.

## Vérifications
Tests Chromium 320×700, 375×812, 390×844, 430×932, 768×1024 : sans erreur JS ni débordement horizontal. Le CTA principal est entièrement au-dessus du dock en 320 px. Parcours import image, import vidéo synthétique, comparaison clavier et maintien, presets, export JPEG téléchargeable, blocage export vidéo, accessibilité et molette validés. **Safari iPhone physique non testé**.

## Avant déploiement
Attendre validation esthétique explicite, intégration progressive et tests de non-régression de l'application historique (import, moteurs IA, export, PWA, consentements, données privées). Ne pas fusionner ni publier automatiquement.