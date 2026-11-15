# RetoucheProAI — Rapport scientifique : DepthMotion Evidence
**15 novembre 2026 · prototype expérimental privé et démonstration synthétique publique possible · non déployé**

## 1. Hypothèse et intervention

**Question :** les champs de mouvement 2D de MultiMotion peuvent-ils être classés plus précisément lorsqu'on dispose d'une **source indépendante** de profondeur métrique et de déplacement de caméra ?

**Hypothèse testable :** le flux observé par Lucas–Kanade doit correspondre au flux attendu pour des surfaces fixes d'une profondeur connue lorsque la caméra se déplace. Un résidu spatial cohérent indique un mouvement 2D non expliqué par ce modèle, **pas une reconnaissance d'objet ni une preuve de cause physique**.

Formule très simplifiée (plan de projection avec rotation dans l'image, translation horizontale `T_x`, focale `f` et profondeur `Z`) :

`p_pred = rotate_about_center(p, angle_deg) + [-f*T_x/Z, 0]`

Le prototype applique cette prédiction aux points LK suivis entre images, mesure les écarts, recherche des ensembles cohérents d'écarts supérieurs à 2,6 px, impose au moins 25 références statiques et 12 résidus supportés. Les points non vérifiables font l'objet d'une abstention. Les images non résolues ne sont jamais inventées.

## 2. Continuité et implémentation

Le code source existant n'a pas été remplacé : DepthMotion importe le module de tracking MultiMotion (ou une copie de référence inchangée, uniquement dans le ZIP hors ligne). Aucun modèle neuronal, jeu de données personnel, outil payant ou service distant. Trois modules nouveaux : `depthmotion_evidence.py`, `scenes_depthmotion.py`, `benchmark_depthmotion.py`, plus tests, scripts de consolidation, visualiseur et manifestes.

Protection scientifique :
- l'origine `rgb_inferred` refuse toute conclusion causale, même si des nombres de profondeur sont fournis ;
- un véritable capteur exige des incertitudes annoncées pour profondeur et déplacement de caméra, et le résultat est testé à ±celles-ci ;
- le modèle de projection ne couvre pas mouvement caméra 6-DoF, déformation optique, rolling shutter, rotation hors-plan ni corps articulés ;
- l'origine source est déclarée par le programme appelant et **pas authentifiée** ;
- `synthetic_oracle` n'a de sens que dans les scènes fictives et ne prouve jamais la qualité d'un capteur réel.

## 3. Données

11 scénarios déjà conservés depuis MultiMotion (`two_depths`, `two_depths_mimic`, `two_depths_rotated`, `two_depths_compressed`, `two_depths_low_delta`, `two_depths_cut`, `single_plane`, `local_object`, `broad_object`, `blank`, `occlusion`). Chaque scène possède 11 images 320×240 et des métadonnées synthétiques. 12 variantes de textures en entraînement expérimental et 12 autres seeds 100…111 en contrôle, **mais même algorithme de génération**. Aucun entraînement ML, aucune annotation humaine réelle et aucune vidéo privée.

Deux scènes `two_depths` et `two_depths_mimic` ont des **pixels strictement identiques** et des causes physiques artificielles distinctes : seul l'oracle de profondeur changé différencie leurs observations. Avec un estimateur de profondeur tiré uniquement des mêmes pixels, aucune preuve causale supplémentaire n'est apportée.

## 4. Résultats vérifiés localement

| Métrique | Seeds 0–11 | Seeds 100–111 | Total |
|---|---:|---:|---:|
| Scènes statiques expliquées (6 catégories) | 72/72 | 72/72 | 144/144 |
| Faux candidats sur scènes statiques, calibration exacte | 0/72 | 0/72 | 0/144 |
| Grands mouvements autonomes candidats (2 catégories) | 24/24 | 24/24 | 48/48 |
| Petits mouvements autonomes manqués | 12/12 | 12/12 | 24/24 |
| Coupure ou scène blanche → abstention (2 catégories) | 24/24 | 24/24 | 48/48 |

**Contre-expériences importantes :**
1. Depth map erronée (un seul plan) sur scène `two_depths` : 12/12 faux candidats en première campagne et 12/12 en seconde ; la profondeur est une source de risques, pas une garantie.
2. Caméra +40 % erreur de translation sur `two_depths_mimic` : 10/12 scènes deviennent "expliquées" et 2 s'abstiennent en première campagne ; 11 expliquées et 1 abstention en seconde. Le système peut masquer un mouvement indépendant.
3. Un petit objet mobile reste invisible au détecteur LK global malgré son déplacement de 4,2 px/image ; **échec réel du prototype** et prochaine faiblesse mesurable.
4. La garde de sensibilité peut s'abstenir lorsque des hypothèses d'étalonnage alternatives modifient la conclusion, mais elle dépend d'une **enveloppe d'erreur honnête** et ne certifie pas que l'étalonnage est exact.

## 5. Validation technique

- **37 nouveaux tests unitaires Python réussis** dans cette session ; **98/98** sur les suites compatibles CameraGuard v4.3 (34), MultiMotion (27), DepthMotion (37).
- Le HTML local contient 6 scènes entièrement artificielles, les images et les cartes de profondeur. Chromium 390×844 et 1280×800 : 6 boutons de cas, choix d'image, slider, zéro erreur JS et zéro requête externe, via `set_content()`.
- Un premier essai de navigateur a échoué car la distribution Playwright n'avait pas de Chromium packagé. Chromium `/usr/bin/chromium` existe ; accès à `file://` bloqué par politique, repli par injection du HTML local, sans serveur ni transfert.
- Pas de test Safari physique iPhone ; pas de neural MediaPipe, SAM2, Depth Anything V2 ni Video Depth Anything réellement exécutés ; aucun benchmark de réalité humaine.

## 6. Évaluation GitHub et limites de licence

- `DepthAnything/Video-Depth-Anything`, publication CVPR 2025 (https://arxiv.org/abs/2501.12375) : variantes relative et métrique ; le dépôt rapporte des coûts GPU A100 non transférables à un iPhone. La licence du modèle **Small** est Apache-2.0 selon README ; Base et Large CC-BY-NC-4.0. Le Small n'a pas été téléchargé.
- `DepthAnything/Depth-Anything-V2` tickets #85 et #228 : retours de scintillement temporel ; #320 : question récente sur licences des données d'entraînement, pas une conclusion juridique établie. Lecture critique seulement, **aucun code tiers copié ici**.
- L'utilisation de profondeur vidéo prédite à partir des mêmes images **ne représente pas une source d'observation indépendante** ; elle peut aider à régulariser, mais ne peut pas résoudre le contre-exemple à pixels identiques.

## 7. Suite autorisée et critères avant promotion

1. Ajouter véritable capteur de profondeur et pose synchronisés sous autorisation ; tester erreurs de calibration et décalages de trames. Sans source sensorielle indépendante, conserver l'abstention causale.
2. Améliorer le suivi des petits objets par couverture locale multi-échelle, avec faux positifs sous texture/compression/occultation mesurés.
3. Tester des séquences réelles annotées publiques sous licence compatible, sans mélanger entraînement/validation/test et sans présenter des sources de profondeur calculées par RGB comme vérité indépendante.
4. Mesurer CPU, batterie et Safari physique iPhone avant toute intégration.
5. Préserver les branches CameraGuard v4.3 et MultiMotion ; ouvrir une PR en **brouillon** sans fusion ni déploiement.

**Conclusion :** démonstration contrôlée d'une séparation géométrique mieux informée, **pas preuve de compréhension humaine, de profondeur métrique prédite ou de mouvement autonome dans des vidéos réelles**.