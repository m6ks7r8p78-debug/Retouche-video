# RetoucheProAI — Édition One, revue de design v2

> **Statut : prototype d'interface interactif, non publié en production.** Aucune restauration IA, analyse AR ou export vidéo n'est exécuté dans ce document HTML. Les préréglages n'ajustent que le rendu affiché dans le navigateur. L'option « Pour X » est un choix d'interface sans encodage réel.

## Direction artistique validée comme base

- Accueil éditorial lumineux, photographie dominante, typographie chaleureuse, appel à l'action unique.
- Atelier photo immersif sombre, image occupant la majorité de l'écran, comparateur tactile.
- Navigation flottante compacte ; absence d'écran saturé de contrôles ; zones tactiles généreuses.
- Accompagnement en langage courant sans jargon, options avancées dans un panneau secondaire.
- Un seul parcours commun pour adolescents et seniors ; préférences de grands caractères et mouvements réduits.

## Ajouts de cette version

1. Signature visuelle raffinée (micro-typographie, couleurs, reliefs, boutons et navigation).
2. Bandeau « parcours » : sélectionner amélioration, restauration, filtre AR, ou adaptation de format dans une feuille modale au toucher.
3. Trois aperçus de rendu (Naturel, Doux, Éclat) réellement interactifs, basés sur des réglages CSS *non génératifs*.
4. Import local d'une image ou d'une vidéo, avec désactivation des aperçus photo sur une vidéo.
5. Comparateur avec glisser tactile, clavier et bouton pour voir l'original.
6. Choix d'export standard / maximum / X (préconfiguration esthétique uniquement).
7. Options gros caractères et mouvement réduit ; maquette utilisable sans abonnement ni service externe.

## Tests effectués

Chromium automatisé en 320×700, 375×812, 390×844, 430×932, 768×1024 ; aucune erreur JavaScript ou débordement horizontal. Vérification du parcours de navigation, des styles, de la modale d'objectif, de l'export fictif, des préférences, et de l'import local d'un JPEG.

**Non encore validé :** comportement sur iPhone Safari physique, VoiceOver, contraste WCAG audité, vidéos longues 3–10 minutes, mémoire en conditions réelles, intégration aux moteurs de RetoucheProAI, traitement IA, qualité d'export, préservation des sauvegardes, et tests de non-régression complets.

## Intégration proposée après validation explicite de l'utilisateur

1. Conserver la version actuelle et les branches expérimentales intactes ; préparer une branche d'intégration nouvelle.
2. Exposer la navigation et les étapes existantes sous l'habillage Édition One, sans réécrire les moteurs internes ; relier les boutons à l'état réel de `app.js`.
3. Brancher les contrôles de la fiche média aux fonctions existantes (import, analyse, aperçu, édition, export), avec indications honnêtes des fonctionnalités indisponibles.
4. Intégrer le Directeur IA seulement après son propre cycle de validation indépendant ; ne jamais annoncer de traitement AR s'il ne fonctionne pas.
5. Préserver les réglages experts et les chemins de secours, y compris les anciens formats de projets et la confidentialité.
6. Tester sur Safari iPhone, les médias réels et les cas d'échec ; conserver un retour arrière simple.
7. **Ne déployer et ne fusionner vers `main` qu'après autorisation explicite**, rapport de tests et vérification de la page d'accueil et des exports. Claude n'est pas nécessaire pour ces opérations : elles sont réalisables directement avec les accès GitHub appropriés.

## Fichiers

- `index.html` : le prototype autonome à ouvrir dans un navigateur.
- `v2-accueil.png`, `v2-atelier.png`, `v2-reglages.png`, `v2-export.png` : captures générées par Chromium, taille 430×932.

