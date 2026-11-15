# Retouche Neural Engine — QA temporelle sur mouvements naturels (14 novembre 2026)

**Statut : laboratoire RNE 0.3+, aucune intégration dans la PWA, aucun déploiement, aucune fusion.**
Moteur vidéo 2D entièrement indépendant : aucun SDK, code ni poids NVIDIA DLSS 5.

## Problème évalué
Le checkpoint RNE 0.3+ entraîné sur 157 vidéos (154 fichiers distincts) avait obtenu un gain de PSNR sur ses **propres données d'apprentissage**, avec quelques régressions. Ce résultat ne prouvait ni la fidélité des visages ni la stabilité des vidéos. Cet audit mesure uniquement les **variations entre images compensées par un mouvement optique estimé** ; il ne prouve pas la restitution des détails originaux.

### Mesure réalisée sur des vidéos naturellement mobiles
- Corpus privé conservé : **157 vidéos**, déjà utilisées pour l'apprentissage ; **37 groupes conservateurs**. Un représentant choisi à l'avance par groupe, 9 images consécutives après le point situé vers 18 % de la vidéo, réduites pour le budget CPU. **333 images réellement décodées**, **296 transitions exploitables** ; aucune coupe détectée dans ces fenêtres.
- Groupes sélectionnés selon le catalogue, **pas selon leur résultat**. Les variations sont celles de vidéos filmées, pas une animation synthétique. L'audit couvre toutefois seulement une très courte fenêtre par vidéo, et le modèle avait déjà pu apprendre ces mêmes contenus.
- Flux arrière Farneback sur les **images d'entrée**, puis transformation du résultat et de la référence bicubique par le même champ de mouvement. Sont exclus les déplacements hors champ ou zones à mauvaise correspondance photométrique.
- Métrique : moyenne, sur 37 groupes, de la **médiane d'erreur temporelle MAE RGB 0–255**, après compensation du mouvement ; plus faible signifie une meilleure stabilité selon **ce seul indicateur**.

| Système | MAE temporelle | Segments refusés par le garde-fou |
|---|---:|---:|
| Bicubique, témoin classique | **1,38190** | référence, pas de classification |
| RNE 0.3 tout corpus (checkpoint avant RNE 0.3+) | 1,44168 | 29/37 |
| **RNE 0.3+**, 919 triplets et entraînement équilibré | 1,41158 | 24/37 |
| RNE 0.3+ avec stabilisation locale de son résidu de détails, **α = 0,25** | 1,41094 | 20/37 |

**Interprétation :** l'entraînement équilibré réduit modestement l'instabilité de RNE par rapport à son ancien checkpoint, mais ne dépasse pas le bicubique en stabilité dans cette mesure. Le lissage résiduel expérimental améliore de très peu la valeur moyenne. Il ramène de 24 à 20 le nombre de segments signalés, mais **27 transitions** franchissent toujours le seuil local de risque. Le seuil est exploratoire (augmentation supérieure à max(0,2 sur 255 ; 3 % de l'erreur bicubique), ou coupe, ou différence de médiane excessive), pas calibré sur jugements humains ; **20/37 n'est donc pas un taux d'échec perceptuel**.

## Nouveau code — aucun média personnel versionné

- `outils/rne/temporal_safety.py` : mesure indépendante des résidus temporels RNE et bicubique, rejet des correspondances incertaines et des coupes, puis **proposition de repli par segment**. Sans décision humaine, seul le bicubique est proposé ; même un aperçu manuel ne vaut pas autorisation de déploiement.
- `outils/rne/residual_temporal.py` : correction sur **la différence RNE − bicubique**, et non sur l'image complète. Reprojection du résidu précédent avec flux avant/arrière, confiance photométrique et géométrique, α limité à 0–0,35, protection exacte des pixels hors zone via masque explicite, réinitialisation en présence d'une coupure de scène. Ce modèle **n'identifie pas les visages** : aucun masque de visage automatique n'est encore validé.
- `outils/rne/bench_natural_motion.py` : exécutable offline qui lit localement le manifeste et les poids privés, vérifie consentement et SHA des vidéos retenues, calcule les statistiques brutes et corrigées **sur les mêmes fenêtres**, et écrit le rapport détaillé **hors de tout dépôt Git**.
- `tests/test_rne_temporal_safety.py` et `tests/test_rne_residual_temporal.py` : **26 tests unitaires synthétiques réussis localement** (flux, coupe, seuil, masques, sorties, refus, non-mutation). En parallèle, **80 tests RNE préexistants ont été relancés localement et ont réussi**. Le résultat des jobs GitHub Actions sur le nouveau HEAD doit être contrôlé séparément.

Aucune vidéo privée, frame, miniature, visage, chemin de fichier personnel, empreinte de vidéo, résultat par groupe, manifeste ou poids entraîné n'a été commité. Seuls le code et les **statistiques agrégées non identifiantes** sont publics.

## Reproduire en privé, avec autorisation du propriétaire

Dépendances CPU : `python`, `numpy`, `opencv-python(-headless)`, `torch`. Aucun transfert réseau durant l'analyse. Attention : l'argument `--output` doit pointer vers un dossier privé **en dehors du checkout GitHub**.

```bash
python outils/rne/bench_natural_motion.py \
  --manifest /DOSSIER_PRIVE/manifest_prive_157.json \
  --weights /DOSSIER_PRIVE/rne03_balanced_private.pt \
  --output /DOSSIER_PRIVE/qa_temporal_prive.json \
  --groups 37 --alpha 0.25 --private-evaluation-authorized

python -m unittest discover -s tests -p 'test_rne*.py' -v
```

## Décision et recherche suivante

**Pas d'activation automatique.** RNE 0.3+ demeure une technologie expérimentale qui peut altérer des détails et n'a aucune preuve indépendante de préservation des visages ou d'absence d'hallucination. Ne pas sélectionner un traitement uniquement en diminuant le scintillement : une image lissée ou constante peut être stable mais fausse.

Avant la suite produit : obtenir **de nouvelles scènes indépendantes** du préentraînement sur les 157 vidéos, tester des références authentiques lorsqu'elles existent, évaluer traits/visages et bords, comparer avec des jugements humains, mesurer occultations/coupes rapides et valider sur iPhone Safari réel. Sans masque explicite vérifié, ne pas promettre une protection automatique des visages.

Les détails et modèles restent dans l'archive privée ChatGPT ; RNE est un moteur vidéo 2D indépendant, **pas NVIDIA DLSS 5**.
