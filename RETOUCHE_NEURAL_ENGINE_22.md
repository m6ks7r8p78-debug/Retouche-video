# RetoucheProAI — RNE 0.22 « MASKFIT » (15 novembre 2026)

**Statut : recherche synthétique seulement. Aucune vidéo privée ouverte, aucun déploiement, aucun entraînement de poids, aucune preuve de reconstruction d’une personne réelle.**

## Nouvelle étape

RNE 0.21 (ANCRAGE) détectait des pastilles colorées posées artificiellement aux articulations et utilisait une caméra orthographique. RNE 0.22 propose un premier **ajustement de silhouettes sans repères colorés**, à partir de trois rendus monochromes de mannequin articulé. Le modèle géométrique reste **connu et extrêmement simplifié** : tiges, tête ronde, un bras animé ; ce n’est pas un modèle humain complet.

- Images BGR/RGB personnelles : **aucune** dans ce lot. Les seules images créées sont 100 % synthétiques, en niveau de gris 128×128.
- Le solveur ne reçoit que **les pixels** de la silhouette. Les poses, longueurs, angles et caméras cachés servent uniquement **après la prédiction** aux scores. Aucun repère 2D n’est transmis au solveur.
- Premier candidat : optimise les longueurs relatives du bras, une magnification **f/d** commune et les angles de caméra/bras pour chaque vue. Perte de distance *chamfer* bilatérale, optimisation robuste SciPy, comparaison obligatoire contre exactement le même problème résolu image par image.
- Second candidat : ajuste en plus un **décalage du centre optique commun** aux images. Une amélioration de recouvrement des pixels ne certifie pas la pose : les paramètres peuvent compenser les erreurs les uns des autres.
- Évènements sans opt-in explicite, mauvais formats et copies exactes du même angle : refus ou marquage d’insuffisance. Pas d’export de média privé ni fonction de déploiement.

## Sources scientifiques consultées

1. Wang et al. **BLADE: Single-view Body Mesh Estimation through Accurate Depth Estimation**, CVPR 2025, https://openaccess.thecvf.com/content/CVPR2025/papers/Wang_BLADE_Single-view_Body_Mesh_Estimation_through_Accurate_Depth_Estimation_CVPR_2025_paper.pdf — dépendance entre profondeur, focale, pose ; notre approche n’implémente pas leur modèle.
2. Gao et al. **ViCGA**, *Neurocomputing*, octobre 2026, https://www.sciencedirect.com/science/article/pii/S0925231226014608 — optimisation jointe caméra / avatar ; notre méthode est bien plus simple.
3. Revue **Markerless Vision-Based Motion Analysis**, 2018, https://pmc.ncbi.nlm.nih.gov/articles/PMC5986692/ — silhouette ambiguë pour le sens du corps et la profondeur. Ces résultats limitent nos prétentions.

Ce sont des inspirations, **pas une preuve de nouveauté scientifique mondiale** ou de supériorité par rapport aux méthodes publiées.

## Banc A — développement, 27 séquences / 81 images

| Dégradation | Proportions (image seule) | Proportions (multivues) | Angles (image seule) | Angles (multivues) |
|---|---:|---:|---:|---:|
| Silhouettes propres | 0,0608 | **0,0557** | **2,24°** | 3,09° |
| Apparence modifiée | 0,0713 | **0,0572** | **2,84°** | 3,14° |
| Parties masquées | 0,1212 | **0,0950** | **3,55°** | 4,41° |

Le banc de développement montre l’intérêt des vues multiples pour la morphologie mais pas pour la précision angulaire.

## Banc B — 27 nouvelles séquences / 81 images, paramètres figés

| Dégradation | Proportions (image seule) | Proportions (multivues) | Angles (image seule) | Angles (multivues) |
|---|---:|---:|---:|---:|
| Silhouettes propres | 0,0716 | **0,0543** | 1,97° | **1,53°** |
| Apparence modifiée | 0,0593 | **0,0386** | 2,84° | **2,34°** |
| Parties masquées | 0,0841 | **0,0386** | 3,44° | **2,43°** |

Toutes ces silhouettes proviennent de la **même famille de modèle 3D et de code de rendu**. Les graines sont distinctes ; il ne s’agit PAS d’une généralisation vérifiée à des personnes photographiées ou d’une démonstration sur médias privés.

## Banc C — échecs de transfert, 18 nouvelles séquences

| Violation de la scène connue | Erreur des proportions | Erreur angulaire | Ajustements marqués « provisoires » |
|---|---:|---:|---:|
| Contours épaissis | 0,0404 | 5,10° | 6/6 |
| Centre optique décalé (+8, −5 px) | **0,3072** | **28,48°** | 5/6 |
| Forte occultation | **0,2559** | **11,84°** | 5/6 |

**Constat majeur : un bon score de silhouette peut cacher une erreur 3D grave.** La décision de qualité affichée par le solveur n’est qu’une qualité d’ajustement d’image. Aucun critère d’acceptation en production n’en découle.

## Banc D — expérience de centre optique, 24 nouvelles séquences / 72 images

| Groupe | Méthode | Erreur proportions | Erreur angles |
|---|---|---:|---:|
| Caméra centrée | Sans décalage estimé | **0,0638** | **1,25°** |
| Caméra centrée | Centre optique estimé | 0,0757 | 2,16° |
| Centre déplacé (+8, −5 px) | Sans décalage estimé | 0,2939 | 26,80° |
| Centre déplacé (+8, −5 px) | Centre optique estimé | **0,0955** | **2,84°** |

Le modèle enrichi estime une translation moyenne **(+8,01, −5,09 px)** pour la caméra décalée, mais dégrade les scènes centrées. **Pas de promotion générale.** L’ajout de deux paramètres augmente les compensations possibles.

## Ambiguïté de focale / distance

En perspective, les profondeurs distinctes des articulations fournissent parfois un faible indice permettant de distinguer focale et distance. Mais sur des silhouettes proches d’une projection faible perspective, **focale et distance sont mal identifiables ensemble**, d’autant que l’échelle corporelle absolue n’est pas observée. MASKFIT produit donc **f/d** et **aucune focale ou distance absolue certifiée**. Il conserve explicitement des indicateurs faux (`unique_camera_calibration_proven`, `metric_body_scale_known`, `pose_certified`, `production_ready`).

## Tests, confidentialité et livrables

- **43 tests unitaires synthétiques réussis** : validation d’entrée, preuves distinctes, abstention, mise hors ligne, contraintes d’échelle, résultat sans identité, variations du centre optique et tests de projection.
- Générateurs et deux contrôles gelés sont inclus, avec métriques détaillées sans images ni noms de fichiers personnels.
- Démonstration « 100 % SYNTHETIC » en PNG et code pour la reproduire.
- Les **157 anciennes vidéos et les 41 vidéos plus récentes n’ont pas été consultées ni utilisées**. Les 41 nouvelles restent exclues de l’entraînement et de la calibration.
- **RNE 0.21 reste référence des inversions à repères synthétiques ; RNE 0.20 référence des poses de mannequin connu ; RNE 0.4 référence neuronale de restauration.** Aucune validation iPhone Safari ; aucune fusion sur `main` ni activation sur retoucheproai.com.

## Prochain obstacle

Développer l’extraction **réelle** des silhouettes et des articulations, au milieu d’un fond complexe et de membres occultés, sans pastilles et sans connaître au préalable un corps simplifié. Évaluer un modèle multi-hypothèses caméra/pose sur des rendus d’une **autre famille de géométrie** avant de passer aux vidéos personnelles autorisées, en gardant un protocole indépendant et des attentes réalistes.