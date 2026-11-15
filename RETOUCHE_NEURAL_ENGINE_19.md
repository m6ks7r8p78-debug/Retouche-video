# RetoucheProAI — RNE 0.19 « OBSERVABLE ARTICULÉ »

**15 novembre 2026 — laboratoire de recherche, données 100 % synthétiques, aucun déploiement.**

## Livrable effectif

Création d'un **simulateur 3D original articulé** pour éprouver la conservation des preuves visuelles d'une surface à l'autre. Il produit :

- Un mannequin synthétique de **11 primitives ellipsoïdales indépendantes** : torse, tête, bras supérieurs/avant-bras/mains, deux jambes et objet tenu.
- Une articulation déterministe du bras droit, une interaction « objet tenu » puis « objet relâché » ; **distance de contact calculée en géométrie synthétique**, sans inférence vidéo.
- Un rendu orthographique logiciel par **intersection rayon–ellipsoïde et tampon de profondeur**. Chaque pixel conserve son étiquette de pièce, son UV canonique, sa profondeur et son incidence. Les parties cachées et un cache externe sont exclus de l'atlas.
- Un **atlas séparé pour chaque pièce**, qui compte les points de vue *relatifs à la pièce* et non une simple orientation globale de caméra. Les vues dupliquées dans le même intervalle angulaire ne comptent qu'une fois pour la corroboration.
- Un résultat explicite **observé / corroboré / contesté / inconnu** et un aperçu sur vue nouvelle n'affichant **aucune couleur quand l'atlas correspondant est inconnu**.
- **Deux modèles 3D GLB réellement exportés**, avec 11 objets séparés, pose « tenu » et pose « relâché », testés par réimportation avec trimesh. **Ce sont des objets synthétiques statiques, non un squelette animé ni les personnes des vidéos.**

Les fichiers GLB affichent le *maillage complet connu du simulateur* et leur couleur **procédurale originale** ; les parties de surface inconnues dans les vidéos synthétiques sont réservées **aux atlas UV de preuve**, et non au fichier GLB de géométrie source. Il ne faut pas confondre le modèle synthétique source avec une reconstruction observée.

## Inspirations techniques vérifiées

- **ArtHOI**, CVPR 2026 : suivi des parties articulées, prise en compte de la visibilité et alignement main-objet. https://openaccess.thecvf.com/content/CVPR2026/papers/Wang_ArtHOI_Taming_Foundation_Models_for_Monocular_4D_Reconstruction_of_Hand-Articulated-Object_CVPR_2026_paper.pdf
- **How Do I Do That?**, CVPR 2025 : contact main-objet distingué des masques d'objet et des poses. https://openaccess.thecvf.com/content/CVPR2025/papers/Prakash_How_Do_I_Do_That_Synthesizing_3D_Hand_Motion_and_CVPR_2025_paper.pdf
- **Track, Articulate, Act**, arXiv 2026 : indices de mouvement pour estimer les articulations à partir de vidéos réelles, un objectif encore hors de portée de ce prototype. https://arxiv.org/abs/2609.19119
- **SHOW3D**, CVPR 2026 : besoin d'évaluation hors des scènes de studio, notamment autour des occultations main-objet. https://openaccess.thecvf.com/content/CVPR2026/papers/Rim_SHOW3D_Capturing_Scenes_of_3D_Hands_and_Objects_in_the_CVPR_2026_paper.pdf

**Ce projet n'utilise pas leurs modèles, données, poids ou code ; il teste une composante propre, beaucoup plus simple, avec les vérités 3D fournies par son propre simulateur.**

## Banc principal — 12 poses et vues, atlas 64 × 128 par pièce

Images 320 × 320 synthétiques, angles de caméra répartis sur 360°, bras animé, 7 états « tenu » et 5 états « relâché », occultations extérieures par moments.

| Vues | Cellules UV observées | Cellules corroborées | Cellules toujours inconnues |
|---:|---:|---:|---:|
| 1 | 15,558 % | 0,000 % | 84,442 % |
| 4 | 29,498 % | 14,547 % | 70,502 % |
| 8 | 52,024 % | 31,206 % | 47,976 % |
| 12 | 60,147 % | 44,088 % | 39,853 % |

**Attention :** ces taux sont calculés sur les *cellules de l'atlas UV* de 11 ellipsoïdes, **pas** sur la surface métrique réelle ou une silhouette humaine reconstruite. Les surfaces derrière le mannequin peuvent rester inconnues ; le modèle 3D synthétique complet est déjà connu du simulateur.

## Banc de provenance, erreur de calibration provoquée

- Un seul frame reçoit une erreur volontaire de **+0,13** sur la coordonnée U de la **tête** ; les couleurs ne sont pas modifiées.
- Avec les vraies coordonnées synthétiques : **0 cellule de tête contestée**.
- Avec cette coordonnée falsifiée : **635 cellules de tête contestées**.
- Répétition sur **8 autres textures entièrement synthétiques, graines 101–108** : 580, 590, 598, 592, 598, 581, 592 et 584 cellules contestées supplémentaires. Aucune modification de seuil entre ces cas.
- Un unique atlas UV partagé entre les 11 pièces est une baseline volontairement invalide : **93,764 %** de ses cellules alimentées contiennent des observations provenant de pièces distinctes. Ce chiffre illustre l'obligation d'identifier les pièces, et non une comparaison avec une méthode humaine reconnue.

**Limite :** des données falsifiées de façon cohérente entre vues peuvent rester indétectées ; la détection de conflit de couleur peut aussi être trompée par la lumière, le bruit, des textures unies ou le flou.

## Vérifications d'exécution

- **50/50 tests nouveaux réussis**, y compris dans un miroir de l'arborescence GitHub (rejets d'entrées invalides, contacts 3D, duplications de vues, profondeur, occultations, absence de remplissage UV, fichiers GLB importables).
- **47/47 tests RNE 0.18 relancés**, tous réussis.
- Export de **2 fichiers .glb** : une pose objet tenu et une pose objet relâché, **11 parties** chacun, environ 40 Ko par pose. Import possible dans les logiciels compatibles glTF/GLB. **Safari Quick Look n'a pas été testé** ; ces fichiers ne sont pas fournis en USDZ.
- Aucun apprentissage, aucune estimation de squelette humain depuis vidéo, aucune vidéo historique des 157 ni des 41 récentes ouverte, utilisée ou transmise. Aucun accès à un service d'image/vidéo externe.
- CI GitHub CPU mise à jour avec le dépendance légère `trimesh`, mais les **Actions distantes restent à confirmer**. PR brouillon, `main` et site inchangés.

## Étape véritablement nouvelle à développer

1. Déterminer **les poses, pièces et leur profondeur depuis les pixels seuls**, sans accès aux étiquettes fournies par le simulateur.
2. Comparer l'estimation à la **vérité synthétique de ce banc** sur mouvements articulés et occultations ; ajouter des jeux publics à licence compatible avant utilisation réelle.
3. Séparer les surfaces **observées** des surfaces **inférées** et **non observables** dans des objets 3D persistants, avec traçabilité et consentement.
4. Valider sur de véritables interactions main-objet et sur iPhone avant tout déploiement. Conserver les 41 vidéos récentes hors entraînement/calibration.

**Statut :** nouveau socle géométrique 3D de laboratoire, pas un modèle capable de reconstruire le corps ou le visage d'une personne réelle.