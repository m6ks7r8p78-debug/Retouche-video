# RetoucheProAI / RNE 0.12 — troisième observateur du mouvement

**Date : 15 novembre 2026. Statut : recherche uniquement, NON déployé.**

## Objectif et base existante

RNE 0.11 compare Lucas–Kanade (points suivis par grille) à Farneback (flux dense). Comme les deux peuvent se tromper ensemble, ce prototype ajoute une estimation **indépendante par corrélation de phase**, utilisable uniquement lorsque la scène est compatible avec une **translation globale**. Ne remplace pas les gardes de provenance RNE 0.10. Le code refuse par défaut toute utilisation sans activation de recherche explicite, ne publie aucun média et n'agit pas sur le moteur utilisateur.

Pistes consultées :
- CVPR 2024, [OCAI](https://openaccess.thecvf.com/content/CVPR2024/html/Jeong_OCAI_Improving_Optical_Flow_Estimation_by_Occlusion_and_Consistency_Aware_CVPR_2024_paper.html) : l'occultation crée des ambiguïtés fondamentales dans la correspondance des pixels.
- CVPR 2026, [U²Flow](https://openaccess.thecvf.com/content/CVPR2026/papers/Sun_U2Flow_Uncertainty-Aware_Unsupervised_Optical_Flow_Estimation_CVPR_2026_paper.pdf) : une incertitude spatiale nuancée peut être utile ; les masques binaires naïfs présentent des limites.
- [Discussion de r/StableDiffusion (octobre 2026)](https://www.reddit.com/r/StableDiffusion/comments/1xha6jy/ive_tested_11_video_upscaling_methods/) : certains utilisateurs décrivent un lissage ou un miroitement des détails en mouvement, ce qui motive le suivi de la fidélité temporelle, sans constituer une preuve scientifique.

## Hypothèses de recherche figées avant le second lot de scènes

L'algorithme appelle le détecteur RNE 0.11. Il s'abstient si les points suivent mal, si la corrélation de phase est faible (**réponse < 0,35**), si le mouvement dense diffère de la translation globale (**écart médian > 0,75 pixel**) ou si plus de **15 %** des pixels intérieurs présentent une divergence supérieure à **2 pixels**. La sortie `provisional_agreement` signifie simplement « aucun désaccord observé ».

Le principe est restrictif : un vrai mouvement de personne ou de caméra non rigide peut être refusé même si son flux est correct. Aucune adaptation basée sur les 41 vidéos personnelles récemment reçues, qui restent **hors entraînement et hors calibration**.

## Banc A — translation et perturbations connues

Les cas sont des images **100 % générées procéduralement** (textures aléatoires, répétitives, peu texturées ou composées de formes). Les déplacements réels sont +1, +3 ou +10 pixels horizontalement, soumis à flou, occultation, JPEG, illumination, coupe de scène ou aucune perturbation. Les régions sans correspondance (bords et occultations) sont exclues pour le calcul d'EPE ; les coupes sont classées comme absence de flux fiable. Un flux est déclaré incorrect si **médiane EPE > 1 px OU P90 EPE > 2 px**. Ce choix de seuil est un critère technique du banc, pas une mesure de qualité perceptuelle.

| Lot | Cas | Flux déclarés incorrects | Acceptés à tort RNE 0.11 | Acceptés à tort RNE 0.12 | Flux corrects refusés par RNE 0.11 | Refusés par RNE 0.12 |
|---|---:|---:|---:|---:|---:|---:|
| Conception, graines 100/201 | 144 | 74 | 24 | 2 | 17 | 23 |
| Contrôle sur nouvelles graines 5007/5108 | 144 | 74 | 24 | **0** | 19 | 23 |

Le second lot change les **graines et les images**, mais pas la famille de scènes ni les dégradations. Ce n'est donc **pas** une validation hors distribution ni une preuve sur les vidéos réelles.

## Banc B — mouvements de deux couches et occultations

54 scènes procédurales supplémentaires : fond légèrement déplacé, rectangle de textures se déplaçant à une vitesse différente, avec/sans flou. Le véritable déplacement est connu pour les zones de visibilité cohérentes. 12 flux sont classés incorrects. **RNE 0.11 en accepte 12 ; RNE 0.12 en accepte encore 5.** Parmi les 42 flux corrects, RNE 0.12 n'en accepte plus que 24 (18 faux refus) contre 42/42 pour RNE 0.11. La corrélation globale ne remplace pas un contrôle spatial des occultations et des mouvements non rigides.

Ces 54 scènes ont été étudiées **après** le choix du protocole RNE 0.12. Aucun nouveau seuil n'a été réglé dessus : elles servent de contre-exemples pour une expérience future, et ne constituent pas un test impartial du choix de méthode.

## Coût CPU mesuré, six répétitions, champ Farneback déjà disponible

| Résolution | RNE 0.11 | RNE 0.12 | Surcoût |
|---|---:|---:|---:|
| 192 × 192 | 4,07 ms | 6,15 ms | +2,08 ms |
| 640 × 360 | 6,54 ms | 20,40 ms | +13,86 ms |
| 1280 × 720 | 21,61 ms | 79,99 ms | +58,38 ms |

L'évaluation **exclut** la lecture vidéo, l'estimation Farneback initiale et l'inférence neuronale. Elle a été effectuée sur CPU du laboratoire, **pas sur iPhone Safari**. Imposer ce contrôle à chaque frame sur mobile serait prématuré.

## Sécurité, livraison et décision

- **26 tests de base synthétiques passés** ; les 23 tests de RNE 0.11 ont été réexécutés sans erreur. Contrôles de typage, mouvement connu, flux faux, abstention, aucun export de média, aucun modèle entraîné.
- Les rapports, images de référence et médias **privés ne sont pas publiés** ; aucun fichier vidéo, image réelle, empreinte personnelle, nom de média, poids ou visage transmis à GitHub.
- Le code **n'est pas relié** au rendu du site ni à RNE 0.10 ; rien n'est fusionné dans `main`. Les poids du réseau RNE 0.4 demeurent la référence expérimentale ; repli bicubique pour les chemins validés.
- L'état GitHub Actions sera vérifié séparément ; absence de run visible ≠ succès.

**Décision : RNE 0.12 est un outil de diagnostic non promu.** Le contrôle de mouvements multicouches démontre qu'un accord global peut masquer des erreurs locales. Prochaine expérience : contrôle spatial des occultations sur scènes inédites + vraie validation sur les séquences naturellement filmées, en préservant strictement les 41 vidéos réservées.