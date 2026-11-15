# RetoucheProAI — RNE 0.18 « OBSERVABLE 3D »

**15 novembre 2026 — laboratoire privé, preuve de concept 3D synthétique, aucun déploiement.**

## Ce qui change réellement de direction

Après les RNE 0.13–0.17 centrés sur la super-résolution, les seuils et le mouvement, la nouvelle architecture vise une **mémoire de preuves visuelles par élément de surface**. Elle sépare les détails réellement vus des parties jamais observées, en vue d'une future reconstruction 3D des personnes, des mains et des objets. Les parties manquantes ne sont pas silencieusement présentées comme authentiques.

La littérature 2025–2026 confirme la nécessité de modéliser les occultations et la confiance :
- Guo et al., **USplat4D**, ICLR 2026 : https://proceedings.iclr.cc/paper_files/paper/2026/hash/26300457961c3e056ea61c9d3ebec2a4-Abstract-Conference.html
- Zhao et al., **IA-3DGS**, Sensors 2026 : https://pmc.ncbi.nlm.nih.gov/articles/PMC13469390/
- Mir et al., **AHOY!**, ECCV 2026 : https://miraymen.github.io/ahoy/
- Xue et al., **RHINO**, CVPR 2026 : https://lxxue.github.io/RHINO/

Ces projets ont des objectifs ambitieux de reconstruction vidéo. **OBSERVABLE 3D ne reproduit pas leurs performances et ne reprend pas leur architecture.** Il réalise une première composante indépendante et testable : la provenance des couleurs 3D observées.

## Implémentation effective

- Surface **sphérique 3D** avec texture originale synthétique et coordonnées UV exactes fournies par le simulateur ; vues en rotation, bords, occultations mobiles.
- Les pixels sont projetés vers une **carte UV** au moyen de la géométrie connue du simulateur. Les pixels occultés, hors champ, ou trop tangents à la surface sont **exclus**.
- Chaque cellule conserve une couleur moyenne pondérée, le nombre de **points de vue distincts** (bins de 15°) et la dispersion des observations.
- Deux frames de la même orientation ne constituent **pas** deux preuves indépendantes. Un désaccord marqué entre deux observations (écart-type couleur > 16/255, seuil de laboratoire) rend une cellule **contestée**, et non corroborée.
- Une cellule jamais observée reste **inconnue**, vaut zéro dans l'atlas brut et apparaît comme une zone inconnue dans les prévisualisations synthétiques.
- Prévisualisations de la surface connue aux nouveaux angles, sans inpainting. Les métriques de PSNR sont calculées **uniquement sur les pixels observés** : elles ne sont pas une mesure de fidélité d'une reconstruction 3D complète.

## Banc A : visibilité de surface

Texture de 160 × 320 cellules UV, images 192 × 192, 10 angles de vue avec occultations artificielles (bande/ellipse) ; six nouveaux angles pour le contrôle de rendu.

| Vues synthétiques calibrées | Cellules UV observées | Cellules UV corroborées | Image nouvelle : pixels de surface observés, moyenne |
|---|---:|---:|---:|
| 1 | **21,1 %** | **0 %** | **34,7 %** |
| 4 | **47,1 %** | **27,7 %** | **66,7 %** |
| 10 | **76,0 %** | **65,2 %** | **97,8 %** |

Les pixels de surface inconnus représentent encore **24 % de l'atlas UV** après 10 vues. La couverture surfacique UV n'est pas proportionnelle à la surface physique d'une sphère (déformation des pôles), ni à la visibilité sur une nouvelle image. Les pourcentages ne doivent pas être interprétés comme une précision de reconstruction humaine.

Le PSNR sur les **seuls pixels déjà observés** peut dépasser 40 dB ici, parce que la géométrie et les angles sont exacts et la texture est synthétique. Il n'évalue **pas** les zones inconnues et ne justifie pas une promesse de vidéo/3D photoréaliste.

## Banc B : provenance et calibration falsifiée

**8 textures synthétiques inédites**, 2 vues distinctes, puis décalage **erroné de +0,12 dans la coordonnée U** de la seconde vue, sans retoucher les couleurs.

- Avec la calibration correcte, moyenne de **0 cellule contestée** sur ces 8 textures.
- Avec la calibration volontairement erronée, moyenne de **6 081,25 cellules contestées** (même grille UV 128 × 256).
- Les duplications d'un angle de vue ne produisent **aucune** cellule corroborée.
- Cette détection est une heuristique photométrique, **pas une preuve que la calibration est correcte** : plusieurs erreurs identiques, du flou, de l'éclairage ou des couleurs peu discriminantes peuvent la tromper.

## Tests et garanties

**47 tests locaux synthétiques PASS** : surface inconnue non inventée, backside invisible depuis l'avant, élimination des pixels cachés, conservation des informations source, dédoublement de vue, divergence de couleurs, coordonnées/identifiants invalides, refus de déploiement.

Fichiers : `observable_atlas.py`, `bench_observability.py`, `stress_provenance.py`, deux jeux de tests, JSON de mesures, démos PNG **entièrement synthétiques**. Aucune des 157 vidéos historiques ni des 41 vidéos récentes n'a été ouverte, décodée, entraînée ou évaluée dans cette étape. Aucun poids, visage ni voix réels.

## Limitations, avant de parler de vraies personnes 3D

1. **La géométrie, le masque de visibilité, l'angle de caméra et les coordonnées UV sont fournis par le simulateur**. Nous ne savons pas encore les estimer fiablement depuis une vraie vidéo.
2. Une sphère rigide n'est pas une personne articulée. La peau, les cheveux, les vêtements, les mains et les objets tenus nécessitent segmentation, maillage déformable et suivi de pose.
3. Les surfaces **jamais observées** ne peuvent pas être récupérées avec certitude d'un simple point de vue. Tout éventuel rendu par prior génératif devra rester **explicitement étiqueté estimé**, conservé séparément des preuves observées.
4. La calibration exacte et l'absence de bruit limitent la généralisation. Les scores de rendu sur parties visibles ne mesurent ni identité, ni fidélité morphologique, ni filtre AR inversé.
5. Pas de benchmark Safari iPhone, pas de production, pas de modèle humain, pas de 3DGS / NeRF entraîné.

## Feuille de route conditionnelle

- Étape suivante : créer un banc 3D synthétique **articulé** (tête, torse, bras, main, objet tenu), masques de visibilité et de contact réels du simulateur.
- Puis estimer angles de caméra / profondeur / pose depuis une image, **sans** se servir des étiquettes synthétiques au moment de l'inférence. Séparer les pixels ancrés aux observations de ceux déduits.
- Évaluer un suivi caméra/objet indépendant et une cohérence multi-vues sur des données publiques autorisées, avant de toucher aux médias privés.
- Les médias historiques autorisés peuvent servir plus tard, **après le contrôle de provenance et confidentialité** ; les 41 vidéos récentes restent réservées à l'évaluation.
- Aucun envoi vers un service externe ni publication de médias, images, visages ou poids privés ; pas de merge sur `main`, pas d'activation du site sans validation.

**Décision :** RNE 0.18 = jalon d'architecture OBSERVABLE 3D validé seulement comme démonstrateur synthétique. RNE 0.4 et ANCRE restent les références expérimentales de super-résolution ; ce travail ne prétend pas les surpasser.