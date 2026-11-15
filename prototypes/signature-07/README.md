# RetoucheProAI — Signature 07 / Direction éditoriale tactile

Prototype alternatif créé après un retour utilisateur : les versions précédentes restent trop marquées par le vocabulaire visuel courant des interfaces générées par IA (dégradés flashy, grands objectifs, chrome, halos, boutons holographiques).

## Parti pris
- Interface lumineuse et éditoriale à formes imprimées / découpes géométriques, tons craie, citron, corail et bleu papier.
- Hiérarchie intentionnelle : **Ajouter un média** en première action, comparaison d'une photo, trois étapes claires, réglages secondaires.
- Typographie contrastée et lisible avec polices système ; pas de police ou asset externe.
- Petite signature graphique originale, icônes en SVG intégrées et navigation directe.

## Fonctions dans la démonstration
- Photo et vidéo locales (Object URL ; aucun envoi réseau) ; lecture vidéo seulement.
- Démo d'image NASA intégrée dans le HTML.
- Comparaison originale/aperçu locale au doigt et au clavier, styles CSS « Naturel », « Chaleur », « Éclat », maintien sur original.
- Export d'un *aperçu* photo JPEG/PNG et profil « Pour X » non intégré à X ; aucune promesse d'absence de recompression.
- Agrandissement de texte, réduction des animations, libellés explicites.

## Ce que ce prototype **ne fait pas**
Aucune restauration IA réelle, aucune suppression de filtre AR, aucune super-résolution, aucun traitement/export vidéo, aucune bibliothèque persistante.

## Tests effectués
Chromium avec contenu autonome : 320×700, 390×844, 430×932, 768×1024, sans overflow horizontal ni erreur JS ; navigation studio/drawer; import PNG, changement de rendu, comparaison au clavier, téléchargement PNG et taille de texte. Pas de test Safari physique.

## Déploiement
Branche indépendante, PR à laisser **en brouillon**. Ne pas modifier l'app publique, ne pas fusionner avant validation visuelle explicite, branchement aux véritables moteurs et tests iPhone / régression.
