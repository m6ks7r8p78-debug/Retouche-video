# Guide — Effacer une zone (reconstruction par IA), v3.3

**Ce que fait l’outil :** tu désignes une zone d’une photo (objet, passant, accessoire, élément d’un filtre AR, tache) ;
l’IA la remplit avec un contenu **plausible** tiré des alentours.

**Ce qu’il ne fait pas :** retrouver ce qui était réellement caché. Les pixels de la zone sont **inventés**.
C’est pourquoi l’app les marque sur une carte, que tu peux voir, exporter et conserver.

## Utilisation

1. Accueil → **« Effacer une zone d’une photo (IA) »**, puis choisis une photo (Photos ou Fichiers ; JPEG, PNG, HEIC).
   Ou, après avoir amélioré une photo : **« 🩹 Effacer une zone de la photo d’origine (IA) »** (l’outil repart de la photo choisie, pas de la version améliorée).
2. Désigne la zone :
   - **🖌️ Peindre** : passe le doigt sur ce que tu veux retirer (déborde légèrement). Règle la taille avec « Pinceau ».
   - **👆 Toucher** : touche l’élément ; l’IA propose son contour (en rose). La première fois, elle lit la photo (quelques secondes).
   - **🧽 Gommer** : retire une partie du masque (si le contour proposé déborde).
   - **✋ Déplacer** ou **deux doigts** : zoomer et se déplacer ; double-tap (ou double-clic) : vue entière.
   - **Recommencer** : efface le masque ; **↶ Annuler** : défait la dernière action (trait, sélection, reconstruction).
3. **✨ Reconstruire la zone**. La proposition de l’IA s’affiche, marquée « Proposition de l’IA (zone inventée) ».
   Maintiens **Original** pour comparer.
4. **✓ Garder** ou **✗ Refuser**. Tu peux effacer d’autres zones à la suite.
5. Affichages : **Original**, **Résultat**, **Zones inventées** (carte rayée rose, opacité réglable).
6. **Enregistrer la photo** (JPEG haute qualité). **Plus…** : PNG sans perte, **carte des zones** (image), **fiche de provenance** (fichier texte JSON),
   **Revenir à l’original**.

## Conseils pour un meilleur résultat

- **Plusieurs petits coups valent mieux qu’un grand** : le modèle travaille à 512×512 px autour de la zone ; une très grande zone devient floue ou répétitive
  (recommandation des auteurs de MI-GAN).
- Le modèle a appris sur des **scènes** (Places2) : il remplit bien du décor (mur, ciel, table, herbe, sol, tissu).
  Sur un **visage**, des **mains** ou du **texte**, le remplissage est souvent faux : l’app ne prétend pas reconstruire un visage.
- **Filtres AR** (oreilles, museau, lunettes virtuelles) : touche l’élément, vérifie le contour, corrige à la gomme, puis reconstruis.
  Ce qui était sous le filtre n’existe plus dans le fichier : le résultat est une **invention**, à présenter comme telle.

## Confidentialité

- Tout le calcul se fait **sur ton téléphone**. Aucune photo n’est envoyée.
- Seuls les modèles sont téléchargés, une fois, après ton accord (autorisation « Télécharger un modèle IA », révocable dans ⚙️ Paramètres) :
  effacement 28 Mo ; sélection au toucher 40 Mo (facultative — le pinceau marche sans elle).
- L’historique (⚙️ Paramètres) note la date, la taille et le nombre de pixels inventés — jamais l’image.

## Limites connues (v3.3)

- Photo de plus de 16 mégapixels : réduite pour l’édition (Safari limite la taille des images) ; c’est indiqué à l’écran.
- L’original reste intact, mais une édition en cours est perdue si Safari ferme l’app (pas de reprise après fermeture).
- La photo enregistrée ne garde pas les métadonnées d’origine (date, lieu) — choix de confidentialité, non modifiable pour l’instant.
- Pas encore de traitement **vidéo** (voir RAPPORT_v3.3.md, « Extension vidéo »).
- **Vitesse et mémoire non mesurées sur iPhone** (voir GUIDE_IPHONE.md, vérifications à faire).
