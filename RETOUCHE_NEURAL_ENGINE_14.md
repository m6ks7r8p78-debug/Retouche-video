# RetoucheProAI — RNE 0.14, comparaison Census robuste à la lumière

**15 novembre 2026 — Recherche CPU uniquement, non déployée.**

## Objectif et origine

RNE 0.13 analyse le mouvement en **16 régions (4×4)**, mais rejette à tort toutes les zones même géométriquement correctes lorsque l'illumination change. L'erreur venait en partie d'un veto utilisant l'écart brut des intensités RGB entre image courante et précédente compensée.

La littérature sur le flux optique recommande des contraintes alternatives, notamment les descripteurs d'ordre relatif comme **Census / rank**, moins sensibles aux transformations monotones d'intensité. Ils perdent cependant de l'information et échouent sur les textures homogènes ou répétitives ; ce n'est pas un estimateur de mouvement suffisant à lui seul.

- MIT Foundations of Computer Vision — https://visionbook.mit.edu/optical_flow.html
- Demetz et al., ECCV 2014 — https://www.mia.uni-saarland.de/Publications/demetz-eccv14.pdf
- Hafner et al., SSVM 2013 — https://www.mia.uni-saarland.de/Publications/hafner-ssvm13.pdf
- Review 2021 — https://link.springer.com/article/10.1007/s42452-021-04227-x

## Réalisation

Module `outils/rne/rne14/illumination_census.py` :

- Recalcule **en interne**, depuis les mêmes images brutes et le même flux, l'audit RNE 0.13. Il ne reçoit pas de résultats Lucas–Kanade précalculés par un autre appel ou une autre vidéo.
- Conserve toute décision positive déjà prise par RNE 0.13 et tout refus lié aux preuves de mouvement ou à la couverture spatiale insuffisantes.
- Réexamine **seulement les régions précédemment rejetées sur l'écart brut des intensités** alors que les suivis Lucas–Kanade et Farneback concordent.
- Compare huit voisins à un pixel central sur les deux images alignées, évalue la différence moyenne des signatures Census, élimine les régions trop peu contrastées, fortement saturées ou manifestement périodiques à 14 pixels.
- Seuils expérimentaux fixés avant les contrôles secondaires : Census ≤ 0,05 ; contraste gris ≥18 /255 ; corrélation périodique ≤0,90 ; saturation <40 % ; autres seuils provenant de RNE0.13.
- **N'invente aucun détail, n'entraîne aucun modèle et n'autorise aucun export ni déploiement.** Sans option explicite de recherche, l'audit refuse par défaut.

Le contrôle périodique à 14 pixels a été choisi après examen d'un motif répétitif de la famille de développement ; il peut être trop spécifique et **n'est pas une détection universelle de textures répétées**.

## Mesures internes — développement (144 scènes synthétiques)

2 graines déjà présentes dans les contrôles historiques, 4 structures, 3 translations, 6 conditions : **144 scènes**. Sous changement de lumière : **40 zones de déplacement correct récupérées et aucune fausse acceptation supplémentaire** dans ce sous-ensemble. Cette étape a servi au développement et ne constitue pas un test indépendant.

## Contrôle secondaire avec graines non utilisées pour les seuils (288 scènes)

4 graines nouvelles, 4 styles, 3 déplacements, 6 conditions : **288 scènes**. La vraie translation synthétique est connue ; une région est considérée erronée si erreur médiane de flux > 1 pixel ou P90 > 2 pixels (hors occultations et bordures sans vérité valide).

| Condition | RNE0.13 : mauvaises zones acceptées | RNE0.14 | RNE0.13 : bonnes zones acceptées | RNE0.14 |
|---|---:|---:|---:|---:|
| Sans défaut ajouté | 132/309 | 132/309 | 317/459 | 317/459 |
| Flou | 80/313 | 80/313 | 60/455 | 60/455 |
| Occultation | 123/279 | 123/279 | 260/369 | 260/369 |
| **Lumière +52** | **0/309** | **2/309** | **0/459** | **95/459** |
| JPEG qualité 30 | 162/335 | 162/335 | 332/433 | 332/433 |
| Coupe | pas de vérité géométrique valable | pas de vérité géométrique valable | — | — |

RNE0.14 améliore la conservation de 95 régions correctes sous lumière, **mais crée 2 nouvelles fausses acceptations**. La technologie n'a pas passé le critère sans régression. Il ne faut pas présenter l'amélioration de couverture comme une validation de sécurité.

## Contrôle avec une autre famille de générateurs (120 scènes)

Ce banc a été créé **après fixation des seuils**, avec des motifs distincts (formes larges, caractères, rayures diagonales, ondes), translations 2/5/12 pixels et 5 conditions.

| Condition | Bonnes régions conservées RNE0.13 → RNE0.14 | Mauvaises régions acceptées RNE0.13 → RNE0.14 |
|---|---:|---:|
| Ombre progressive | 22/226 → **58/226** | 0/158 → 0/158 |
| Correction gamma | 87/200 → **94/200** | 0/184 → 0/184 |
| JPEG + lumière | 0/258 → 0/258 | 0/126 → 0/126 |
| Flou directionnel | 139/149 → 139/149 | 5/235 → 5/235 |
| Objet occultant dynamique | 148/156 → 148/156 | 18/132 → 18/132 |

Ces chiffres ne décrivent **que les mouvements mesurables** de deux séquences synthétiques. Les textures périodiques, les personnes et les filtres AR réels ne sont pas validés. Les images occultées sans déplacement de référence ont été exclues des scores ; les compter comme correctes serait invalide.

## Calcul / validation

22 tests unitaires synthétiques locaux réussis. Sur CPU du laboratoire avec flux Farneback déjà disponible (médianes de cinq passages), coût **incluant le calcul RNE0.13 interne** :

| Dimensions | Audit RNE0.13 | Audit RNE0.14 | Surcoût |
|---|---:|---:|---:|
| 192×192 | 7,10 ms | 8,77 ms | +1,67 ms |
| 640×360 | 23,05 ms | 34,23 ms | +11,18 ms |
| 1280×720 | 79,20 ms | 116,67 ms | +37,47 ms |

**Ne comprend ni décodage, ni calcul initial du flux dense, ni inférence neuronale. Aucun test sur véritable iPhone/Safari.** La CPU locale ne prédit pas les performances de l'appareil de l'utilisateur.

## Confidentialité et décision

- **Aucune des 41 vidéos réservées** n'a été utilisée, ouverte, réentraînée ou évaluée dans cette étude.
- Aucune des 157 anciennes vidéos n'a été nécessaire : **uniquement des générateurs synthétiques**.
- Les poids RNE0.4 sont inchangés ; aucun média, image, visage, nom de fichier privé, empreinte ou poids dans le dépôt ou l'archive technique.
- Les scripts et données de synthèse restent reproductibles, avec limitation claire des générateurs.
- **RNE0.14 NON PROMU** : 2 nouvelles mauvaises zones acceptées sur le contrôle secondaire, absence d'amélioration sous JPEG+éclairage/flou, coût CPU élevé et aucune vérité réelle de mouvement humain complexe.
- RNE0.4 reste référence neuronale expérimentale, bicubique repli. `main`, le site et les 41 vidéos restent inchangés. CI GitHub à vérifier.

### Prochain essai recommandé

Évaluer un détecteur plus général d'ambiguïté de texture (plusieurs périodes et directions) et descripteurs complémentaires robustes sous compression et flou, **sans retoucher les seuils à partir des contrôles déjà examinés**. Puis créer un jeu distinct avec mouvement articulé, occultations et vérité géométrique ; mesurer le taux de fausses acceptations avant de considérer tout raccord au rendu.