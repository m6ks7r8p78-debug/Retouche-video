# RetoucheProAI — RNE 0.15 : ambiguïtés de correspondance et banc de décision

**15 novembre 2026 — Recherche uniquement, non déployée.** Aucun poids de RNE 0.4 n'a été modifié, aucun média personnel n'a été ouvert ni publié. Les 157 vidéos anciennes et les 41 vidéos récemment reçues n'ont **pas** été utilisées dans cet essai : il est entièrement synthétique.

## Besoin technique

RNE 0.11–0.14 compare flux optiques, points suivis et concordance locale, mais les textures régulières peuvent présenter plusieurs correspondances plausibles. La littérature sur le flux optique décrit l'ambiguïté des motifs répétés ; OpenCV fournit une mesure de corrélation locale normalisée `cv2.matchTemplate` (`TM_CCOEFF_NORMED`). Sources : https://doi.org/10.1016/j.cviu.2024.104160 et https://docs.opencv.org/4.13.0/df/dfb/group__imgproc__object.html .

## Code nouveau

- `ambiguity_guard.py` : pour chacune de **16 régions**, compare un patch courant à toutes les translations dans une fenêtre ±12 px de l'image précédente, mesure la meilleure et la seconde meilleure hypothèse (hors voisinage de ±3 px), le contraste du patch et l'écart au flux dense existant. Retient un *accord provisoire* uniquement si le pic est isolé, corrélation ≥0,70, écart à la deuxième hypothèse >0,06, et écart au flux ≤1,75 px. **Seuils expérimentaux fixés avant la seconde phase de tests**, non validés sur du contenu réel. Les motifs périodiques sont `ambiguous`, les images plates `insufficient`.
- `veto_only` : ne peut **jamais promouvoir** une région auparavant refusée par RNE 0.14. Aucun rôle dans le rendu automatique.
- `procedural_bench.py` : cinq familles procédurales (textures aléatoires, bandes, damiers, points réguliers, deux couches en translation différente), éclairage, flou, JPEG ; connaissance exacte du déplacement de chaque couche ; occultations et bords incertains exclus des labels binaires.
- `evaluate_pair.py` : comparaison appariée sans réajustement de seuils entre les verdicts RNE 0.14 existants et RNE 0.14 + nouveau veto.
- `evidence_gate.py` : politique qui rejette une complexité ajoutée sans amélioration nouvelle des erreurs et avec >5 % de perte de zones correctes auparavant acceptées. Ce blocage concerne la **recherche**, ne constitue jamais une autorisation de mise en production.

## Banc de mise au point (graines 4000–4014, 75 scènes)

Le module classe les bandes/damiers comme ambiguës et les vraies images sans texture comme insuffisantes ; le test de translation de textures aléatoires est reconnu. Ce jeu a été utilisé pour vérifier l'implémentation et ne constitue pas une validation indépendante.

## Banc séparé, détecteur isolé

- **200 scènes / 3 200 régions**, autres graines 12000–12039, avec perturbation de flux de ±4 pixels par axe sur certaines régions. **858 régions artificiellement erronées : 0 accord provisoire**, 2 342 autres régions correctes dont **1 244 acceptées**. Les autres sont refusées ou marquées ambiguës.
- **100 scènes / 1 600 régions**, autres graines 18000–18019, perturbation de ±1 pixel par axe (erreur de vecteur √2 px). **508 régions erronées : 264 accords provisoires**, et 1 092 correctes dont **569 acceptées**.

Ces chiffres sont des performances dans un simulateur connu, pas sur des personnes filmées, des vrais occultants ou une restauration fidèle.

## Comparaison appariée avec RNE 0.14 : résultat décisif

**Les seuils du détecteur restent inchangés.** Autres scènes/graines, avec les mêmes étiquettes exactes pour les deux variantes.

| Lot | Erreurs acceptées par RNE 0.14 | Erreurs acceptées après ajout RNE 0.15 | Régions correctes acceptées par RNE 0.14 | Régions correctes conservées après ajout |
|---|---:|---:|---:|---:|
| **250 scènes** avec ±4 px | 0/1 150 | 0/1 150 | 2 041/2 850 | 1 342/2 850 |
| **200 scènes** avec ±1 px | 0/973 | 0/973 | 1 597/2 227 | 1 047/2 227 |
| **450 scènes total** | **0/2 123** | **0/2 123** | **3 638/5 077** | **2 389/5 077** |

L'ancienne chaîne RNE 0.14 refuse déjà toutes les erreurs de mouvement injectées dans **ces** scènes, y compris lorsque le nouveau capteur autonome pouvait les accepter. L'ajout de RNE 0.15 n'empêche donc **aucune erreur supplémentaire** mais écarte **1 249 régions correctes de plus** (34,33 % des régions correctes précédemment conservées). Ces défauts ne doivent pas être masqués en ne rapportant que l'audit autonome.

**Décision : REJET de RNE 0.15 comme garde-fou additionnel**, pas de promotion de modèle ni de fusion dans le moteur. Le module demeure un instrument autonome de recherche pour diagnostiquer les ambiguïtés. Le nouveau `evidence_gate.py` protège les futurs projets contre l'ajout de complexité non prouvée.

## Tests et coût

**50/50 tests unitaires locaux réussis** : 32 sur détection/ambiguïté/protection des données, 18 sur appariement et règle de sélection. Une comparaison n'est valable que si elle utilise des labels de même définition pour les deux branches. Le script conserve les métriques sans fichier/identité personnelle.

Mesure CPU locale, médiane de dix passages, audit 16 régions uniquement, sans flux dense, décodage, inférence RNE ni export : **3,35 ms à 192²**, **5,42 ms à 640×360**, **11,94 ms à 1280×720**. Aucun test iPhone Safari ; ne pas extrapoler ces temps au navigateur.

## Futur chantier prioritaire

Plutôt que multiplier les veto, développer une vraie mesure par **région et sous-région avec vérité géométrique** : rotations, déformations articulées, mélanges de profondeur, objets occultants, changements d'apparence et textures répétées. Pour chaque module mesurer conjointement **vraies erreurs empêchées** et **bonnes régions conservées** sur une famille indépendante de celle de conception. Réserver les 41 nouvelles vidéos pour une évaluation distincte non optimisée, et ne jamais prétendre retrouver des pixels invisibles sans référence vérifiable.

Site `retoucheproai.com` non modifié, PR GitHub expérimentale maintenue en brouillon, RNE 0.4 demeure le checkpoint expérimental de référence, bicubique le repli.