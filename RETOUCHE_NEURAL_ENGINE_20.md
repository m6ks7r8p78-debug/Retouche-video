# RetoucheProAI — RNE 0.20 « INVERSE-OBSERVABLE »

**Date : 15 novembre 2026. Statut : laboratoire synthétique exclusivement ; aucune personne réelle reconstruite, aucun entraînement ni déploiement.**

## Différence majeure depuis RNE 0.19

Le simulateur RNE 0.19 dispose d’une géométrie 3D et de paramètres connus. Jusqu’ici, les atlas utilisaient ces paramètres **directement** comme vérité. RNE 0.20 implémente une première **inversion d’image** : son API `ArticulatedInverse.fit(bgr, manual_research_opt_in=True)` n’accepte **que des pixels BGR uint8**, et aucune étiquette `part_id`, profondeur, coordonnées UV, phase, angle de caméra, contact ni masque du simulateur.

Le prototype cherche la meilleure explication d’une image parmi les rendus d’un **mannequin synthétique connu**. Les trois inconnues recherchées sont : l’orientation `yaw` d’une caméra orthographique, la phase d’un bras articulé, et l’hypothèse binaire « objet tenu / relâché ». La topologie 11 éléments, les dimensions, les textures procédurales et la famille de caméra sont connues **à l’avance**. Ainsi, ce n’est pas de la reconstruction 3D arbitraire, de la photogrammétrie humaine ni une restauration d’identité.

Une banque de 384 rendus à basse résolution couvre 16 angles de vue × 12 phases × deux hypothèses de contact. Les meilleures hypothèses sont affinées par comparaison des pixels et de la silhouette. Le masque d’occlusion reconnaît **uniquement la couleur spéciale connue d’un obstacle synthétique** ; il n’est pas un détecteur d’occultation général. Les régions insuffisamment différenciées peuvent produire une abstention ; les marges et le seuil de qualité sont **heuristiques**, non des probabilités calibrées.

## Inspiration de recherche externe (aucun code/poids tiers intégré)

- CARI4D (CVPR 2026) : optimisation conjointe des poses et du contact après initialisation de reconstructions personne–objet : https://openaccess.thecvf.com/content/CVPR2026/papers/Xie_CARI4D_Category_Agnostic_4D_Reconstruction_of_Human-Object_Interaction_CVPR_2026_paper.pdf
- PICO (CVPR 2025) : ajustement de maillages personne–objet avec indices de contact et silhouettes : https://openaccess.thecvf.com/content/CVPR2025/papers/Cseke_PICO_Reconstructing_3D_People_In_Contact_with_Objects_CVPR_2025_paper.pdf
- SDFit (ICCV 2025) : *render-and-compare* pour une forme et une pose dans une image, nécessité de reconnaître les ambiguïtés : https://openaccess.thecvf.com/content/ICCV2025/papers/Antic_SDFit_3D_Object_Pose_and_Shape_by_Fitting_a_Morphable_ICCV_2025_paper.pdf

Ces travaux concernent de vrais modèles bien plus complexes : leurs résultats ne sont pas attribués à RNE.

## Résultats reproductibles (modèle et seuils figés avant le contrôle)

Les images sont **100 % synthétiques**, produites par le moteur RNE 0.19 : essais avec graines indépendantes pour la texture, occultations synthétiques et poses aléatoires. Les mesures de vérité viennent du simulateur **uniquement après** l’estimation, jamais dans `fit()`.

| Algorithme | 16 vues de contrôle : erreur moyenne caméra | Erreur moyenne de l’articulation | Moins de 10° (bras) |
|---|---:|---:|---:|
| Recherche grossière silhouette/rendus | 4,54° | 27,84° | 8/16 |
| **Recherche affinée par rendu et couleurs RNE20** | **0,74°** | **5,12°** | **12/16** |

- **Contact** : 4 bonnes décisions sur les 4 décisions explicites ; **12/16 abstentions**. Point crucial : **les quatre décisions explicites sont toutes « objet tenu » ; aucun exemple « objet relâché » n’est affirmativement identifié dans ce contrôle**. Cela ne démontre pas la classification des états relâchés.
- **Ambiguïté de pose signalée** : 9/16 images de contrôle.
- **Huit stress tests supplémentaires** avec variations d’éclairage, flou ou JPEG : erreur moyenne d’articulation **9,91°**, erreur moyenne caméra **0,77°** ; quatre images sont rejetées par l’heuristique de qualité, **7/8 contacts indéterminés**.
- Les 8 cas de développement sont distincts des 16 cas de contrôle ; aucun seuil n’a été modifié ensuite. Échantillons petits, **même géométrie et même moteur de rendu** : ne pas confondre nouvelles graines synthétiques et généralisation indépendante sur humains réels.
- L’absence de vérité de profondeur inférée, les risques de symétrie de pose, les masques synthétiques et la caméra connue restent des limites structurelles.

## Livraison réelle : GLB estimé depuis pixels

`demo/RNE20_POSE_INVERSEE_MODELE_SYNTHETIQUE.glb` contient les **11 primitives 3D connues** à la phase de bras estimée (et non à la phase véritable). Pour cette seule démonstration synthétique `locked-10` : erreur angulaire mesurée **1,286°** pour la phase et **0,597°** pour la caméra. L’état « holding » a été prédit, sans ambiguïté signalée par notre heuristique. Le GLB ne sauvegarde pas le réglage de caméra, consigné dans `demo/RNE20_DEMO_PROVENANCE.json`.

Le GLB n’est **pas** un scan, n’est **pas animé**, ne contient aucun visage réel ni texture privée, et ne prouve aucune capacité d’identification de personne. `demo/RNE20_image_vers_pose_3D_DEMO_SYNTHE.png` permet de comparer l’image d’entrée procédurale, la restitution de la pose estimée et l’erreur par pixel.

## Validation et politique de données

- **26 tests unitaires/protocolaires locaux réussis** (formats, tailles, cache, correspondance de silhouette, erreurs de type, options de recherche, métriques angulaires, absence d’export ou de confirmation d’identité).
- Code générique, tests et simulateur synthétique publiables dans la **branche expérimentale uniquement** ; GitHub Actions distant à confirmer.
- **157 vidéos historiques NON utilisées ; 41 vidéos récentes NON utilisées**. Aucun apprentissage sur des personnes ni publication de vidéos, frames, voix ou poids personnels.
- RNE 0.4 reste la référence de super-résolution, ANCRE/AEGIS restent des expériences séparées. Ce module d’inversion 3D n’est pas intégré au site RetoucheProAI.

## Suite prioritaire

1. Pour estimer la pose réelle, remplacer les **textures et géométries exactement connues** par un modèle paramétrique capable de s’ajuster à de nouvelles proportions et silhouettes, avec détecteur de poses non identifiables.
2. Ajout d’un **suivi multi-vues temporel** et de correspondances visuelles indépendantes, sans prétendre observer ce qui est masqué.
3. Développement d’un **module d’incertitude par articulation** et d’un calcul de contact basé sur la géométrie ajustée, pas sur l’hypothèse de contact du gabarit.
4. Tests sur des données publiques licenciées et des captations réellement inédites avec vérité de référence, avant d’envisager l’utilisation des vidéos privées consenties, puis validation Safari iPhone.

### Exécution locale

```bash
python -m pip install numpy opencv-python-headless trimesh
python -m unittest test_inverse_pose -v
python evaluate_inverse.py dev --start-index 0 --count 4 --output-dir results
python evaluate_inverse.py locked --start-index 0 --count 4 --output-dir results
python aggregate_evaluation.py results  # nécessite les 8+16+8 essais, par morceaux de quatre
python demo_inverse_glb.py demo
```

Aucun appel réseau ou export de média personnel n’est nécessaire. Toutes les images générées sont procédurales et identifiées comme telles.