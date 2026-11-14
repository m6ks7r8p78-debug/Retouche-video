# RNE 0.11 — deuxième observateur du mouvement inspiré des forums spécialisés

**14 novembre 2026 · laboratoire privé · aucune activation utilisateur.**

## Recherche externe (sources, non preuves propres au projet)

J'ai recherché des retours techniques sur **r/computervision**, **r/TopazLabs**, **r/upscaling**, **r/StableDiffusion**, des pistes d'archives **4chan /g/** et la documentation OpenCV/CVPR.

Pistes vérifiables :
- https://www.reddit.com/r/computervision/comments/1o222hi/ — les points répartis spatialement et la vérification de cohérence du mouvement sont proposés dans un contexte d'objets mobiles ; il s'agit d'une discussion, pas d'une évaluation scientifique de RNE.
- https://www.reddit.com/r/TopazLabs/comments/1ip8bit/ — plusieurs utilisateurs signalent la distorsion des petits visages après upscaling : éviter d'affirmer que la netteté représente la vérité d'identité.
- https://www.reddit.com/r/upscaling/comments/1ruxr5x/ — des utilisateurs recommandent de traiter bruit, blocs et scintillement avant l'upscale ; hypothèse de pipeline à tester, pas un réglage universel.
- https://www.reddit.com/r/StableDiffusion/comments/1kov1dl/ — la restauration image par image sans contexte temporel peut scintiller.
- https://docs.opencv.org/5.0/extra_modules/optflow.html — OpenCV documente le contrôle *forward–backward* et son surcoût de calcul.
- https://openaccess.thecvf.com/content/CVPR2024/papers/Jeong_OCAI_Improving_Optical_Flow_Estimation_by_Occlusion_and_Consistency_Aware_CVPR_2024_paper.pdf — recherches sur les occultations et la cohérence du flux.

**Aucune piste 4chan technique vérifiable et suffisamment fiable n'a été retenue.** Ne pas traiter des opinions communautaires comme des résultats empiriques de RNE.

## Pourquoi il fallait éviter de refaire la même chose

Le fichier préexistant `outils/rne/triad.py` calcule **déjà** le flux Farneback *current→previous*, le flux inverse *previous→current*, leur cohérence, la concordance des pixels et l'exclusion des bords. Ajouter une seconde fois ce même contrôle serait redondant.

Le nouveau module `outils/rne/rne11/sparse_motion_audit.py` effectue un **contrôle différent** :
- jusqu'à 8 points Shi–Tomasi dans chacune des 16 zones de l'image ;
- suivi des points avec Lucas–Kanade pyramidal, puis suivi en sens inverse pour retirer les points instables ;
- exigence de 12 suivis fiables couvrant au moins 4 zones, sinon **abstention** ;
- confrontation du déplacement des points au **champ dense Farneback déjà calculé** ; possibilité de le recalculer seulement en laboratoire ;
- alerte en cas de différence médiane supérieure à 0,75 pixel ou de plus de 35 % des points dont l'écart dépasse 1,5 pixel ;
- aucun poids neuronal modifié, aucune image exportée ni télémétrie personnelle. Sans option manuelle de recherche explicite, **abstention immédiate**.

**Attention :** l'accord des deux méthodes n'est PAS une preuve du bon mouvement. Les deux peuvent se tromper ensemble sur textures répétitives, occultations, flous, faible lumière, rolling shutter, zooms ou membres fins.

## Tests locaux

**23/23 tests synthétiques réussis** : mouvements connus, désaccord grossier et faible, image uniforme sans points, anomalie de forme/type, NaN, dimensions, historique non modifié, absence de déploiement et refus sans consentement de recherche.

**Banc exploratoire sans entraînement** sur 41 paires de frames de **41 fichiers historiques** du dossier privé de 157 vidéos, choisi par hachage déterministe de noms et extraction à environ 24 % du clip. Les frames sont recadrées/redimensionnées à 192 × 192 pour une mesure CPU rapide, **sans les sauvegarder**. Ces vidéos appartiennent à l'ancien corpus déjà appris, donc **aucune indépendance** et aucun apprentissage sur les 41 uploads récents.

| Décalage artificiel ajouté au champ Farneback | Accords provisoires /41 | Désaccords /41 |
|---|---:|---:|
| 0 pixel (champ naturel) | 41 | 0 |
| +0,5 pixel horizontal | 41 | 0 |
| +1 pixel horizontal | 0 | 41 |
| +2 pixels horizontaux | 0 | 41 |
| +5 pixels horizontaux | 0 | 41 |

Le seuil initial de 1,5 pixel avait raté les +1 pixel ; un seuil de recherche de **0,75 pixel** a été retenu **après** cette observation. Les chiffres qui en résultent sont donc une **ablation post-hoc / test sur échantillon de calibration**, jamais un taux de détection prouvé sur des erreurs naturelles et inédites. Le cas +0,5 pixel n'est pas signalé et des faux refus restent possibles.

Aucune de ces mesures ne teste la fidélité d'un visage, l'inversion de filtres AR ou la qualité d'un rendu UHD/8K.

## Coût CPU mesuré localement, images synthétiques (médianes de 5 passages)

| Dimensions | Flux Farneback réutilisé | Nouveau Farneback recalculé |
|---|---:|---:|
| 192 × 192 | 2,32 ms | 9,40 ms |
| 640 × 360 | 4,36 ms | 57,39 ms |
| 1280 × 720 | 12,61 ms | 224,57 ms |

Ce benchmark exclut le décodage et le réseau neuronal et **n'est pas un benchmark Safari iPhone**. Il suggère de rendre le champ Farneback calculé dans `triad.alignment` disponible au détecteur indépendant plutôt que de refaire l'estimation ; cela nécessite une intégration et des tests supplémentaires.

## Décision de recherche

- **RNE 0.4 reste la référence expérimentale** ; le bicubique reste le repli.
- Le capteur indépendant RNE 0.11 **n'est pas connecté** au rendu, à RNE 0.10 ni au site RetoucheProAI. La règle de refus reste une suggestion de laboratoire, sans promotion automatique.
- **Les 41 nouvelles vidéos sont restées exclues de l'entraînement ET de ces tests**, pour ne pas empirer les biais de sélection d'un banc déjà examiné.
- Publier uniquement le module générique, les tests synthétiques, ce document et le workflow GitHub CPU. **Ne pas publier de médias privés, captures, identifiants ni poids personnels.**
- Prochaine validation : données à mouvement réel difficile et occultations correctement annotées, différentes textures et vitesses, échecs des deux estimateurs concordants, faux positifs, coût mémoire et exécution réelle sur iPhone. CI GitHub distante à confirmer ; aucune fusion ni déploiement.
