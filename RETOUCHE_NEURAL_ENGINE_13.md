# RetoucheProAI — RNE 0.13 : audit régional des mouvements et occultations

**Date : 15 novembre 2026. Statut : RECHERCHE UNIQUEMENT, non déployé, aucun réentraînement.**

## Problème traité

RNE 0.12 utilisait une corrélation de phase globale : sur des scènes à plusieurs couches, une décision pour l'image entière refusait de nombreux mouvements corrects et pouvait laisser passer des mouvements erronés. RNE 0.13 teste la **vérification indépendante du mouvement par régions**, sans recréer un réseau neuronal et sans modifier les poids RNE 0.4.

Le code `regional_motion_audit.py` découpe l'image en **16 cellules**. Dans chacune, il choisit jusqu'à 12 points Shi–Tomasi, les suit par Lucas–Kanade aller/retour, compare leur déplacement au champ dense Farneback fourni et vérifie que les pixels décalés demeurent photométriquement compatibles. Le statut de chaque cellule est **`supported` (accord provisoire)**, **`disagreement`** ou **`insufficient_evidence`**. Aucune décision « fiable à 100 % » n'est possible sans référence du vrai mouvement. Le masque n'est pas connecté au rendu vidéo.

L'algorithme exige une autorisation explicite de recherche par appel, sinon il retourne `research_disabled`. Il ne publie aucune image, ne produit pas de vidéo et ne donne aucune instruction de modification des poids ou de déploiement. Les seuils (.8 px médian, 30 % >1.5px, photométrie >25/255, ≥5 points stables par zone) sont des **hypothèses exploratoires** non calibrées sur les vidéos réelles.

## Sources externes et relation au code

- [OCAI, CVPR 2024](https://openaccess.thecvf.com/content/CVPR2024/html/Jeong_OCAI_Improving_Optical_Flow_Estimation_by_Occlusion_and_Consistency_Aware_CVPR_2024_paper.html) décrit la difficulté des occultations et les vérifications avant-arrière.
- [Jeong et al., arXiv 2025](https://arxiv.org/abs/2506.00324) étudient les difficultés spatiales et les régions dont les correspondances sont ambiguës.
- [r/computervision, suivi avec objets mobiles](https://www.reddit.com/r/computervision/comments/1o222hi/) suggère de répartir les points suivis dans l'image ; discussion communautaire, pas une validation de notre système.

Ces travaux orientent les tests ; aucun résultat scientifique externe n'est revendiqué comme mesure de RNE.

## Banc A — 54 nouvelles scènes procédurales à deux couches

- **54 scènes** : tailles d'objets 50/70/90, translations 5/9/15px, flou activé ou non, graines fixes 1107/1207/1307.
- Fond et objet bougent indépendamment ; le déplacement de référence et le masque de pixels visibles sont calculés par le générateur (`benchmark_layered_motion.make`, RNE 0.12). Évaluation par **840 cellules ayant ≥60 % de référence valide**.
- Cellule dite erronée si médiane EPE >1 pixel ou P90 EPE >2 pixels pour les pixels de vérité évaluables. Ce choix mesure l'erreur d'alignement, **pas** la qualité visuelle de l'upscale final.

| Méthode | Cellules erronées acceptées (sur 39) | Cellules correctes conservées (sur 801) |
|---|---:|---:|
| RNE 0.11 global | 39 | 801 |
| RNE 0.12 global | 24 | 443 |
| **RNE 0.13 régional** | **22** | **598** |
| RNE 0.12 ET RNE 0.13 | 19 | 318 |

RNE 0.13 montre un compromis plus utile que RNE 0.12 sur cette famille de scènes, **mais accepte encore 22/39 erreurs**. La combinaison de contrôles a peu d'intérêt pratique car elle écarte 483/801 régions correctes.

## Banc B — 288 scènes procédurales plus variées

Quatre styles de texture, trois translations, quatre graines *différentes* et six conditions : aucune perturbation, flou, occultation, décalage d'éclairage, JPEG et coupe. **288 scènes** au total, 48 par condition. Une coupe n'a aucune correspondance valide et n'est pas comptée dans les vrais/faux positifs.

| Condition | Zones erronées acceptées | Zones correctes conservées | Zones sans preuve suffisante |
|---|---:|---:|---:|
| Propre | 136/316 | 307/452 | 142/768 |
| Flou | 81/319 | 53/449 | 615/768 |
| Occultation | 122/297 | 258/371 | 295/768 |
| Éclairage changé | 0/316 | 0/452 | 615/768 |
| JPEG | 174/341 | 319/427 | 272/768 |
| Coupe (pas de vérité de flux) | s.o. | s.o. | 765/768 |

**Conclusion importante :** le contrôle photométrique refuse *toutes* les zones lors du changement de lumière. Le flou produit beaucoup d'abstentions. Les textures répétitives et JPEG permettent de laisser passer des flux inexacts. Cela interdit toute promotion sur la base du banc A seul.

## Coût CPU exploratoire

Médiane de **5 passages** après deux échauffements, sur des textures procédurales. Champ Farneback déjà calculé ; **hors décodage vidéo, calcul du flux dense et réseau neuronal**.

| Dimensions | Coût RNE 0.13 |
|---|---:|
| 192×192 | 9,63 ms |
| 640×360 | 27,29 ms |
| 1280×720 | 100,86 ms |

Aucun résultat iPhone Safari ; ces coûts ne permettent pas une intégration systématique.

## Décision et protection des données

- **26/26 tests unitaires synthétiques locaux réussis.** Aucun média personnel employé dans les deux bancs ci-dessus.
- Les **157 anciennes vidéos**, les **41 vidéos récentes** et leurs originaux **n'ont pas été ouverts pour ce cycle**. Les 41 fichiers restent exclus de l'entraînement et de la calibration ; RNE 0.4 reste référence expérimentale.
- Archive privée : code et tests, générateurs, mesures JSON anonymes, ce rapport. Aucune vidéo/image/poids privés.
- Déploiement interdit dans cet état ; PR GitHub en brouillon, `main` et retoucheproai.com inchangés. Vérifier séparément l'état de la CI GitHub Actions.

### Suite pertinente

Priorité à des **métriques de mouvement local robustes aux changements d'illumination**, au flou et aux textures périodiques, mesurées avec vraie référence indépendante. Ne pas faire un réentraînement répétitif sur les 41 vidéos réservées, ni appeler « récupération réelle » la création de détails absents ou masqués. Les visages doivent faire l'objet de tests de fidélité indépendants avant toute activation.