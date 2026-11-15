# RetoucheProAI — RNE 0.16 « ANCRE »

**15 novembre 2026. Laboratoire expérimental, version non déployée.**

## Objectif

Après les échecs ou gains limités des contrôles régionaux RNE 0.13–0.15, création d'un **petit modèle propre entraîné à partir de zéro**, plutôt qu'une couche supplémentaire de refus du mouvement. ANCRE signifie *Architecture Neuronale Causale à Résidu Encadré* (dénomination interne du prototype).

**Il ne s'agit pas d'une nouveauté scientifique démontrée face à l'état de l'art**. L'originalité ici est une implémentation autonome et légère destinée au projet, inspirée de principes publics de la super-résolution vidéo. Aucun modèle, checkpoint, poids, ni code de diffusion tiers n'a été repris.

## Travaux consultés

- [Xu et al., DGAF-VSR, CVPR 2026](https://openaccess.thecvf.com/content/CVPR2026/html/Xu_Rethinking_Diffusion_Model-Based_Video_Super-Resolution_Leveraging_Dense_Guidance_from_Aligned_CVPR_2026_paper.html) : compensation alignée et fidélité des caractéristiques.
- [Reang et al., UDA-VSR, 2026](https://www.sciencedirect.com/science/article/abs/pii/S0923596526002596) : incertitude dans une architecture causale trois images.
- [Xu et al., VideoGigaGAN, CVPR 2025](https://openaccess.thecvf.com/content/CVPR2025/html/Xu_VideoGigaGAN_Towards_Detail-rich_Video_Super-Resolution_CVPR_2025_paper.html) : difficultés simultanées de détail et stabilité temporelle.
- [Chan et al., BasicVSR++, CVPR 2022](https://openaccess.thecvf.com/content/CVPR2022/html/Chan_BasicVSR_Improving_Video_Super-Resolution_With_Enhanced_Propagation_and_Alignment_CVPR_2022_paper.html) : propagation et alignement.
- [Discussion r/TopazLabs, novembre 2026](https://www.reddit.com/r/TopazLabs/comments/1xpxde6/) : déformations de petits visages et importance de contrôler la fidélité plutôt que multiplier les traitements. Commentaires communautaires, pas preuve expérimentale.

## Architecture réelle développée

**RNE16-ANCRE**, **9 592 paramètres**, implémentation PyTorch CPU avec deux têtes convolutives de faible largeur. Chaque tête comprend trois convolutions 3×3 et PixelShuffle×2 ; derniers filtres initialisés à zéro, pour commencer exactement au bicubique.

\[
HR = clip(Bicubic(LR) + 0.10\tanh(S(LR)) + 0.05\,Erode7(Trust)\,\tanh(T(LR,AlignedPrior,Trust)),0,1)
\]

Le prior est neutralisé dans les régions sans confiance **avant d'entrer dans la branche temporelle**. La carte de confiance est érodée d'un rayon de 3 pixels LR : tout voisinage temporel qui pourrait voir une zone invalide revient à la branche spatiale. **Zéro confiance signifie une sortie strictement égale à celle de la branche spatiale**, et le masque de protection utilisateur renvoie exactement le bicubique.

La correction spatiale et temporelle est bornée en amplitude par construction, mais cette borne **ne prouve pas l'absence d'hallucinations ni l'identité correcte d'un visage**. La carte de confiance est **fourni par le banc**. RNE16 ne sait pas, à lui seul, l'estimer à partir d'une vraie vidéo.

## Entraînement effectué

- Aucun fichier vidéo privé utilisé, ni du corpus ancien de 157 vidéos ni des **41 vidéos réservées**. Les seuls exemples sont des **images entièrement synthétiques** construites ici.
- **450 couples synthétiques d'apprentissage**, motifs lignes, polygones et taches. Simulations de translation, bruit indépendant entre vues et petites occultations dont la vérité est connue.
- Réseau **initialisé à zéro-résidu**, entraîné **280 étapes** avec Adam, seed 16, batch 12, perte MSE de la sortie complète + 0,4 MSE de la branche spatiale + régularisation faible de correction. Aucune perte générative.
- Checkpoint privé stocké séparément, uniquement avec les tensors de poids, chargé via `weights_only=True`.
- Après une revue du code, correction structurelle des fuites de contexte près des zones d'incertitude puis **réentraînement complet**. Le premier score préliminaire plus élevé ne correspond plus au checkpoint final.

## Résultats du checkpoint **final**

### Première évaluation — 150 images synthétiques, motifs différents de l'apprentissage

| Bicubique | ANCRE spatial | ANCRE spatial + temporel |
|---:|---:|---:|
| 22,67933 dB | 22,89540 dB | **22,96738 dB** |

Gain moyen spatial + temporel **+0,28805 dB** versus bicubique. **121/150** meilleurs PSNR, **113/150** meilleurs que la branche spatiale. **1** régression supérieure à 0,5 dB. Ces images utilisent des **familles de motifs différentes, mais le même moteur procédural** ; elles ne constituent pas un test sur des vidéos réelles.

### Deuxième évaluation, checkpoint gelé — nouveau générateur, autres fonctions de synthèse

| Famille synthétique | Bicubique | ANCRE spatial + temporel | Gain moyen | Fortes pertes >0,5 dB |
|---|---:|---:|---:|---:|
| Spirales | 28,40587 | **28,96291** | +0,55704 dB | **15/50** |
| Mosaïques de caractères | **24,88932** | 24,87107 | **−0,01826 dB** | **11/50** |
| Texture ondulée | 21,53370 | **22,42028** | +0,88658 dB | 0/50 |

Ce second contrôle n'a servi **ni à ajuster les poids ni à sélectionner les seuils**. Les **26 fortes pertes sur 150 images** et le recul sur les caractères montrent que le modèle **n'est pas généralisable sans risque**. Un gain moyen positif ne suffit pas pour la production.

### Coût de calcul

**37,14 ms** médiane sur CPU local, entrée 256×256 → sortie 512×512, sans décodage, sans calcul de flux, sans export. **Pas de benchmark iPhone Safari** et ne pas extrapoler le débit à la vidéo 4K.

## Tests et décision

- **30/30 tests du modèle réussis**, notamment protection des zones masquées et absence de contamination par des pixels précédents non fiables.
- **10/10 tests du garde de publication réussis**. Refus systématique de la production en l'absence de vrais couples vidéo avant/après, de stabilité temporelle démontrée et de test Safari.
- **Décision : rejeter toute promotion automatique de RNE16**. On conserve les poids et le code comme première base d'un modèle propriétaire à améliorer, non comme remplacement de RNE0.4 dans l'application.
- Ancien RNE0.4 demeure la référence expérimentale ; le bicubique reste la solution de repli.
- Pas de diffusion de vidéo ou de poids personnels sur GitHub, PR en brouillon, `main` inchangée, retoucheproai.com inchangé.

## Reproduction

Environnement local avec PyTorch CPU, NumPy, OpenCV :

```bash
python -m unittest test_rne16.py test_quality_gate.py -v
python train.py --out ./private_results --steps 280
python stress_frozen.py --weights ./private_results/rne16_ancre_synthetic_only_weights.pt --out ./private_results/frozen_stress_report.json
```

Pour créer une amélioration véritablement mesurable, la suite doit **s'attaquer aux petits caractères, aux textures périodiques et aux mouvements réels**, valider la cohérence temporelle sur une séquence indépendante, vérifier la correspondance avec la source d'origine et tester Safari iPhone. Éviter toute fuite du banc des 41 vidéos dans l'entraînement et toute affirmation d'inversion d'un filtre AR non observé.
