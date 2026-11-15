# RetoucheProAI — Édition One

## Statut
Prototype interactif autonome, sans dépendance réseau, créé le 15 novembre 2026. **Ce n’est pas une version livrée de retoucheproai.com et aucun traitement IA réel n’est exécuté.** Ne pas fusionner aveuglément avec `main`.

## Vision de design
La photo ou vidéo dirige l’interface. Identité éditoriale premium : papier chaud et encre profonde pour découvrir, atelier charbon pour manipuler le média, une couleur signature corail sur l’action d’import ; un accent citron très limité pour la sortie/validation.

Inspiration de principes, sans copier d'interface : Apple Photos (priorité au contenu), Adobe Lightroom (outils par besoin à une main), VSCO (prévisualisation immersive), Linear (cohérence et retrait du superflu). Pas de robots, halos « IA », pavés de fonctionnalités, ni dégradés bleu-violet omniprésents.

## Parcours
1. Accueil : promesse éditoriale, photographie de démonstration, seul appel à l’action « Ajouter une photo ou vidéo », deux entrées simples « Embellir » et « Restaurer ».
2. Atelier : média pleine largeur, comparaison avant/après à la glisse horizontale, maintien « Voir l’original », réglages secondaires dépliables, choix de sortie.
3. Créations : reprise d’un média importé dans la session, vue lisible ; prévoir la vraie persistance de projets dans l’application.
4. Options : taille du texte et réduction d’animation, conformément à l’accessibilité iOS.
5. Sortie : Qualité maximale, Standard, Pour X (publication X manuelle par l’utilisateur). Aucun de ces choix n’exécute d’export dans le prototype.

## Réalisation actuelle
- Un `index.html` autonome, CSS et JS intégrés, image CC0 intégrée en base64, import local image ou vidéo.
- Pour la photo, avant/après **simulation par filtres CSS**, non sauvegardée, sans supposer de vraie récupération de détails.
- Pour la vidéo, lecteur HTML5 local compatible avec les codecs du navigateur, sans conversion.
- Comparateur accessible au clavier, commandes au doigt, appui prolongé pour l’original, tiroir de sortie.
- Quatre tailles de fenêtre contrôlées en Chromium (320×700, 390×844, 430×932, 768×1024) : navigation, réglages, import PNG, choix « Pour X » et absence de débordement horizontal.
- Il n’y a pas eu de test sur un iPhone physique / Safari ; ceux-ci restent nécessaires.

## Étapes d’intégration à confier à Claude ou à l’équipe
1. **Garder le moteur et les données du projet existants** (`app.js`, import, traitements, modèles, consentements, service worker). Ne pas remplacer `index.html` de production par la maquette brute.
2. Isoler le design en composants CSS/JS de présentation ; brancher à la machine d’états réelle (import, analyse, traitement, projet, validation visuelle, export).
3. Ne jamais afficher une restauration comme « terminée » sans succès du moteur ; distinguer la prévisualisation du fichier exporté.
4. L’utilisateur doit pouvoir facilement forcer la fidélité originale, annuler toute modification et afficher la provenance des reconstructions.
5. Reprendre les exports « normale », « maximale », « pour X » existants. Ne pas promettre de suppression de compression par X.
6. Conserver import multiple, suivi AR, restauration visages, audio, projets, données de recherche et modes avancés, sous une couche intuitive.
7. Ajouter tests de non-régression PWA, clavier/VoiceOver, réduction des animations, contraste, petite largeur, gros texte, orientation, performances sur iPhone 15 Pro Max.
8. Ne pas publier les 157 vidéos privées ni leurs modèles ; pas de télémétrie ou transfert média sans consentement et traçabilité.
9. Faire valider captures réelles iPhone avant de fusionner ; ne pas modifier la branche expérimentale en cours sans coordination.

## Image de démonstration
Photographie de café CC0, Rachel Michetti / Pikolo Espresso Bar, distribuée dans `skimage.data.coffee` (documentation : pas de restrictions de copyright). Elle est intégrée localement pour que la maquette soit utilisable sans réseau.
