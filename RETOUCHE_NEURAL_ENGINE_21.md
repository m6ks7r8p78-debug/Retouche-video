# RetoucheProAI — RNE 0.21 « ANCRAGE »

**15 novembre 2026 — prototype original de recherche synthétique, sans déploiement**

## Motivation et recherche

Après RNE 0.20, l'inversion restait contrainte à une géométrie de mannequin connue et à une caméra orthographique idéalisée. Les publications sur la pose humaine et la reconstruction personne–objet soulignent la confusion entre paramètres de caméra, pose et morphologie, ainsi que l'ambiguïté des contacts lorsque des parties sont masquées :

- CVPR 2026, *Mocap-2-to-3*: https://openaccess.thecvf.com/content/CVPR2026/html/Wang_Mocap-2-to-3_Multi-view_Lifting_for_Monocular_Motion_Recovery_with_2D_Pretraining_CVPR_2026_paper.html
- CVPR 2025, *MV-SSM*: https://openaccess.thecvf.com/content/CVPR2025/html/Chharia_MV-SSM_Multi-View_State_Space_Modeling_for_3D_Human_Pose_Estimation_CVPR_2025_paper.html
- CVPR 2026, *CARI4D*: https://openaccess.thecvf.com/content/CVPR2026/papers/Xie_CARI4D_Category_Agnostic_4D_Reconstruction_of_Human-Object_Interaction_CVPR_2026_paper.pdf
- CHOIR (2026): https://arxiv.org/abs/2605.20992
- Communauté r/computervision, défauts de pose sous mouvements rapides: https://www.reddit.com/r/computervision/comments/1xe69qw/any_suggestionstools_to_solve_this_issue_post/

Ces références inspirent les priorités, **mais RNE 0.21 n'est pas l'implémentation de leurs modèles**. La géométrie, les fiduciaux, le solveur et les tests ci-joints ont été réalisés spécifiquement pour ce prototype. Les techniques de projection et d'optimisation robuste sont connues ; aucune revendication de nouveauté scientifique mondiale.

## Ce qui a été codé

- `anchorage.py` : **simule** dix repères colorés sur un mannequin articulé ; génère des images BGR 192×192 sous plusieurs angles de caméra, tailles relatives de bras, articulations et zooms. La vérité géométrique n'est jamais transmise aux solveurs.
- `find_fiducials()` : détecte les repères **uniquement dans les pixels**, sans lecture de pose ou métadonnées du simulateur. Cette segmentation très simple est propre à nos repères synthétiques ; elle ne détecte **pas** les articulations d'une personne réelle.
- `solve_single()` : témoin image par image, proportions inconnues, caméra inconnue, optimisation robuste des correspondances 2D.
- `solve_sequence()` : optimise une morphologie **partagée entre 2 à 12 images** et, pour chaque image, orientation caméra, phase d'articulation et échelle d'image. Utilise SciPy `least_squares` avec une perte soft-L1, plusieurs amorçages, un étalon de torse fixé. Il estime des **proportions relatives**, jamais la taille métrique.
- `evidence_audit.py` : confronte les solutions multi-images aux images indépendantes, exige des angles divers et plusieurs observations du poignet. S'abstient lorsque la preuve manque. **L'accord reste provisoire**, non certifié.
- `export_inverse_glb.py` : exporte 5 poses statiques de mannequin 3D à partir **des paramètres ajustés sur les pixels** et relit les fichiers pour vérifier qu'ils sont bien interprétables. Aucune identité humaine ni forme organique détaillée reconstruites.

## Évaluation A — 42 séquences synthétiques, 210 images, code sans réentraînement

18 séquences propres, 12 avec occultations partielles, 12 avec repères perturbés. Vérité géométrique **réservée exclusivement au calcul des scores**. Même famille de générateur pour toutes les conditions, mais graines numériques différentes de celles des tests unitaires.

| Méthode | Erreur moyenne longueur bras supérieur | Erreur avant-bras | Erreur caméra | Erreur articulation |
|---|---:|---:|---:|---:|
| Morphologie fixe, 5 images | 0,1495 | 0,1355 | 3,85° | 4,28° |
| Morphologie variable, image par image | **0,0048** | **0,0048** | **0,67°** | 0,79° |
| Morphologie commune aux 5 images | 0,0080 | 0,0078 | 0,69° | **0,54°** |

**Résultat contradictoire assumé :** la fusion multi-images améliore la précision moyenne de l'articulation sur ce banc, mais n'améliore PAS la précision des proportions face à la méthode image par image. Dans les 12 séquences avec repères perturbés, erreur de phase 1,117° contre 1,861° pour la méthode indépendante, **mais** la longueur relative est moins juste. Aucune promotion sur cette base.

## Évaluation B — 36 séquences supplémentaires / 180 images (audit gelé)

Contrôles avec nouveaux tirages de paramètres, après fixation du module d'abstention :

- 8 normales : 8 accords provisoires ; 0 abstention.
- 8 avec occultations partielles : 8 accords provisoires ; 0 abstention.
- 8 avec fausses positions d'un repère : 8 accords provisoires ; 0 abstention.
- 6 copies d'une seule vue : **6 abstentions** (absence de diversité géométrique).
- 6 séquences avec presque aucun poignet visible : **6 abstentions**.

Sur les **24 accords provisoires**, aucune erreur maximale de proportion n'a dépassé 0,10 dans ce deuxième petit banc. Les **36 séquences appartiennent toujours à la même famille synthétique** ; elles ne valident ni des scènes réelles, ni une distribution humaine générale. L'audit n'est pas calibré pour produire une probabilité de réussite.

## Modèles 3D effectivement créés

Les 5 fichiers `demo/RNE21_ANCRAGE_pose_0*.glb` contiennent chacun **16 maillages simples** dérivés de nos paramètres ajustés ; leurs exportations ont été relues avec trimesh. Leurs dimensions corporelles restent relatives à un mannequin synthétique. Le centre de l'objet suit une hypothèse géométrique de notre modèle et **son contact n'est pas établi à partir de véritables images**. Les fichiers ne constituent ni un scan d'identité ni une reconstruction humaine à partir de vidéo.

## Tests et confidentialité

- **42 tests locaux synthétiques réussis** : 29 sur la géométrie, la détection et le solveur, plus 13 sur l'audit de preuves.
- Aucun des **157 anciens médias privés** ni des **41 vidéos récentes réservées** n'a été ouvert, utilisé pour l'optimisation, la calibration, ou publié.
- Aucun entraînement sur médias personnels ; aucun poids privé ; aucun export de vidéo, visage ou voix.
- Opt-in local explicite pour les opérations d'inversion ; aucun rendu de production ni déploiement automatique.
- Bibliothèque SciPy utilisée pour l'optimisation CPU, numpy/OpenCV pour les points, trimesh uniquement pour la démo GLB. **Pas de test sur iPhone Safari.**

## Décision

**ANCRAGE = recherche uniquement.** L'implémentation démontre un ajustement multi-images avec morphologie partagée et un contrôle d'abstention, mais **ne surpasse pas systématiquement un solveur plus simple**. RNE 0.20 reste référence de l'inversion sur mannequin connu ; RNE 0.4 reste référence neuronale vidéo historique. Aucune intégration sur `main` ni sur retoucheproai.com.

## Prochain saut technique

1. Remplacer les pastilles colorées par une extraction automatique de points et masques sur des images **strictement synthétiques sans marqueurs**, avec occlusions et profondeur vraie pour score.
2. Ajouter le modèle de caméra perspective, inconnues intrinsèques, distorsion, et explicitement auditer l'ambiguïté échelle/profondeur.
3. Étendre à plusieurs articulations, contact main–objet avec états tenu/relâché et comparaison au sol simulé.
4. Concevoir un jeu de validation strictement distinct des générateurs ayant servi à choisir les seuils, avant tout essai iPhone ou média personnel.