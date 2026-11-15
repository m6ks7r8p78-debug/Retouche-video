# RetoucheProAI / RNE 0.17 « AEGIS » — contrôle des corrections neuronales

**Date : 15 novembre 2026.** Statut final : **REJET du nouveau réseau de contrôle pour intégration**, mais poids, tests et contre-exemples conservés pour la recherche. Aucune modification des poids RNE 0.16 ni intégration du moteur sur le site. Aucune vidéo personnelle employée, aucune consultation du jeu réservé de 41 vidéos.

## Motivation et sources externes

L'architecture ANCRE RNE 0.16, entraînée sur des scènes entièrement synthétiques, améliore certains motifs mais produit encore des pertes de PSNR sur de petits caractères et spirales. Pour tester une solution différente de l'empilement de vérificateurs optiques, j'ai construit un **modulateur neuronal local d'amplitude** du résidu existant, sans réseau génératif supplémentaire :

`RNE17(x) = clamp(Bicubic(x) + alpha(x) × (ANCRE(x) − Bicubic(x)), 0, 1)`

Le réseau `alpha(x)` est un CNN de **2 305 paramètres**. Sa carte alpha est bornée par sigmoïde dans `[0,1]`, déterminée par l'image courante, les résidus, la confiance temporelle et des statistiques locales. Les pixels des régions protégées restent exactement bicubiques. La différence temporelle entrante est masquée lorsque la confiance vaut zéro. Cette restriction ne garantit ni l'exactitude des détails ni l'identité d'une personne.

Pistes académiques ayant orienté les choix de méthode et l'importance des baselines :
- NeurIPS 2025, **One-Step Diffusion for Detail-Rich and Temporally Consistent Video Super-Resolution** : https://proceedings.neurips.cc/paper_files/paper/2025/hash/fc28053a08f59fccb48b11f2e31e81c7-Abstract-Conference.html
- ICCV 2025, **DiffVSR** : https://openaccess.thecvf.com/content/ICCV2025/papers/Li_DiffVSR_Revealing_an_Effective_Recipe_for_Taming_Robust_Video_Super-Resolution_ICCV_2025_paper.pdf
- 2026, **How Accurate are Video Quality Models for Diffusion-Based Video Super-Resolution?** : https://arxiv.org/abs/2605.25940

Ce prototype est notre propre implémentation de recherche, pas une reproduction ou une revendication de supériorité sur ces travaux.

## Protocole exécuté

- Poids RNE 0.16 ANCRE **gelés** ; entraînement uniquement du contrôleur AEGIS et à partir de nouveaux exemples synthétiques.
- **600** exemples d'entraînement : `microprint`, `filaments`, `weave` ; **180** exemples de mise au point : `topography`, `medallions`, `silhouettes`.
- 500 étapes d'optimisation calculées ; checkpoint choisi à l'étape **25**, à partir de la MSE sur le jeu de mise au point.
- **270** exemples d'une évaluation finale gelée, jamais utilisés pour les gradients ni la sélection d'étape : `diagram`, `facade`, `foliage` (90 chacun). Les 3 familles et les graines étaient définies dans le générateur avant apprentissage. Les motifs diffèrent mais **le cadre de simulation et le dégradeur sont communs**, donc il ne s'agit pas d'un véritable domaine visuel indépendant.
- Un contrôle supplémentaire obligatoire : comparer le CNN de contrôle à une **simple amplitude fixe 0,70**, valeur issue de sa sortie moyenne sur le jeu de mise au point ; **aucune recherche d'amplitude sur le jeu final**. Les poids sont figés pendant ces évaluations.
- Tous les fichiers créés et utilisés sont synthétiques, sans image, voix, vidéo privée, modèle de personne ni média AR.

### Développement (180 exemples)

| Mesure | ANCRE brut | ANCRE + AEGIS |
|---|---:|---:|
| Gain PSNR moyen vs bicubique | +0,46389 dB | +0,48590 dB |
| Fortes pertes PSNR >0,5 dB contre bicubique | 7 | 0 |
| Images meilleures que bicubique | 125/180 | 136/180 |

Le développement ne prouve rien sur l'indépendance des nouvelles scènes, car il a servi à sélectionner les poids.

### Évaluation gelée (270 nouveaux exemples synthétiques)

| Famille | ANCRE vs bicubique | AEGIS vs bicubique | Amplitude fixe 0,70 vs bicubique | Graves pertes ANCRE → AEGIS |
|---|---:|---:|---:|---:|
| Diagrammes avec petits caractères | −0,26877 dB | −0,16400 dB | **−0,16384 dB** | 12 → 3 |
| Façades répétitives | −0,06840 dB | +0,00249 dB | **+0,00258 dB** | 3 → 0 |
| Branches et traits organiques | +0,00699 dB | +0,01683 dB | **+0,01684 dB** | 1 → 0 |
| **Ensemble des 270** | **−0,11006 dB** | **−0,04823 dB** | **−0,04814 dB** | **16 → 3** |

Différence de PSNR AEGIS vs ANCRE : **+0,06184 dB** sur l'ensemble de ce jeu, IC bootstrap exploratoire par image **[+0,05371 ; +0,07004] dB**. Ce bootstrap ne prend pas en compte les dépendances possibles entre les familles de synthèse et ne justifie aucune extrapolation aux vrais contenus.

### Ablation décisive : le « nouveau réseau » n'apporte pas de complexité justifiée

- Sortie moyenne alpha du CNN sur l'évaluation : **0,70049**.
- Écart-type spatial moyen de sa carte alpha : **0,000076** ; sa variation locale est en pratique négligeable.
- **Une simple amplitude 0,70 obtient +0,000083 dB de plus que le CNN**, avec le **même nombre de trois graves pertes** dans le contrôle final.
- AEGIS reste en dessous du bicubique en moyenne sur ce jeu (**−0,04823 dB**) et sur les diagrammes (**−0,164 dB**).

**Décision conforme à notre règle RNE 0.15 :** `REJECT_LEARNED_HEAD`. Le CNN est conservé à des fins de recherche, mais **n'est pas recommandé pour insertion dans le moteur**. La règle de sélection prévue pour ce contrôle exige que le nouveau réseau batte **aussi** la solution fixe peu coûteuse d'au moins +0,02 dB, ne régresse pas sur une famille, soit meilleur que bicubique sur chaque famille, et n'augmente pas les pertes graves. Les résultats échouent à plusieurs de ces critères.

Le fichier `research_limiter.py` contient l'amplitude simple uniquement comme **témoin reproductible à activation manuelle en laboratoire** et revient au bicubique sans activation explicite ; il n'est pas intégré au site.

## Exécution, code et confidentialité

- Fichiers `rne17.py`, `procedural17.py`, `train_gate.py`, `evaluate_locked.py`, `ablation_constant.py`, `research_limiter.py`, `promotion_gate.py`, `test_rne17.py`.
- **41 tests synthétiques locaux réussis** : formats, confiance nulle, absence d'influence d'une image précédente non fiable, masques protégés, baseline simple, refus d'une promotion non fondée et absence de permissions d'export/déploiement.
- Checkpoint de 2 305 paramètres stocké dans l'**archive privée** uniquement. Code générique et tests reproductibles publiables sur la branche `chatgpt-ai-director-v01`, PR n°1 en brouillon ; **aucun checkpoint privé sur GitHub**.
- 157 anciennes vidéos et 41 vidéos récentes : **0 utilisées** pour l'entraînement, les tests ou le réglage ; aucun média extrait.
- Pas d'essai sur vidéo naturelle, suivi temporel, vrais petits visages, retrait de filtre AR, performances de l'iPhone, ni mesure de fidélité d'identité.
- GitHub Actions distant à vérifier ; ne pas fusionner ni déployer automatiquement.

## Suite de recherche

Créer un *vrai* contrôleur local d'incertitude mesurable, ou abandonner l'ajout de réseau s'il ne bat pas un simple contrôle scalaire sur des scènes réelles annotées ; intégrer un test de stabilité temporelle native indépendant avant toute promotion.