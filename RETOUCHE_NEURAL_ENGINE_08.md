# Retouche Neural Engine 0.8 — Directeur IA expérimental par scène

**14 novembre 2026. Travail réellement exécuté ; non déployé.**

## Objectif

Plutôt que d'ajouter une correction neurale systématique après les expériences RNE 0.5–0.7 peu convaincantes, concevoir un premier **sélecteur prudent** de rendu bicubique ou RNE 0.4. Seule l'entrée LR, la confiance du mouvement, le rendu bicubique et le rendu neuronal sont consultés **à l'inférence**. L'original HR intervient uniquement pour fabriquer les étiquettes d'apprentissage privées (différence de PSNR).

**Aucune vidéo, image privée, poids neuronal personnalisé, étiquette par fichier, nom ou empreinte de média n'est publiée.**

## Corpus et contrôle d'absence de fuite au niveau du sélecteur

- Corpus **historique uniquement** : 157 fichiers préalablement autorisés, **157 empreintes SHA-256 revérifiées**, 154 contenus distincts et 3 copies exactes non surpondérées.
- Entrées déjà préparées : **1 232 exemples LR ×2** = 154 contenus × deux instants × quatre simulations : *clean area*, JPEG55, bruit + flou, encodage/décodage H.264 CRF34. Les checkpoints RNE 0.4 restent gelés.
- **616 exemples au premier instant** utilisés uniquement pour ajuster le sélecteur ; **616 exemples au second instant** réservés pour la validation croisée **par groupe conservateur de scènes**. Les 41 vidéos nouvellement reçues **n'ont été ni utilisées pour l'apprentissage du sélecteur ni consultées pour cette expérience**.
- Les familles regroupent 41 groupes conservateurs ; la validation `GroupKFold(5)` garantit qu'un groupe destiné à l'évaluation n'est pas présent dans l'ajustement du sélecteur pour ce pli. Certains groupes regroupent beaucoup de clips ; cela limite la représentativité statistique.
- **Limitation fondamentale :** le réseau RNE 0.4 initial a déjà appris sur les 157 vidéos. La séparation par groupes protège l'apprentissage du **sélecteur** seulement, pas celui du réseau de super-résolution. La validation de RNE 0.8 n'est **pas un test de généralisation sur des vidéos inconnues**.

## Premier modèle de décision réalisé

`outils/rne/rne08/adaptive_selector.py` extrait **19 caractéristiques numériques sans image HR de référence** : luminance, gradients, activité haute fréquence, contraste, proportions sombres et claires, blocs de compression, confiance d'alignement des deux images précédentes, écarts avec le rendu bicubique et cohérence de sous-échantillonnage. Le module ajuste une **régression linéaire régularisée** (ridge λ=35) qui prédit le gain de PSNR, sans personnalisation du rendu par visage.

Le seuil de démonstration a été **prédéterminé à +0,20 dB** : un gain estimé inférieur entraîne un repli bicubique. Le module **refuse par défaut** d'exécuter la voie RNE sans une demande de **prévisualisation manuelle de laboratoire** et n'autorise jamais l'export ou le déploiement automatique. Les poids privés du sélecteur sont stockés en JSON **hors dépôt Git**.

### Résultats de validation groupée du sélecteur

| Métrique — 616 exemples déjà issus des vidéos historiques | Toujours RNE 0.4 | Sélecteur RNE 0.8 |
|---|---:|---:|
| Gain PSNR moyen sur bicubique | **+0,20554 dB** | +0,16442 dB |
| Forte perte supérieure à 0,5 dB | 4 | **3** |
| Exemples rendus par le réseau | 616 | 323 |
| Exemples en repli bicubique | 0 | 293 (**47,56 %**) |

Découpage par dégradation : le sélecteur conserve +0,37899 dB sur entrée propre (contre +0,39249 dB systématique), mais seulement +0,04820 dB avec H.264 (contre +0,09137 dB) et +0,06788 dB avec JPEG (contre +0,10532 dB).

**Décision : RNE 0.8 non promu.** Il évite une perte importante supplémentaire, mais dégrade trop la qualité moyenne et conserve trois fortes régressions. Ni la fiabilité des visages ni les mouvements temporels réels ne sont validés. Le choix des paramètres **ne doit pas être recalibré après consultation de ces résultats** puis présenté comme une nouvelle validation indépendante.

## Nouveau garde-fou temporel

`outils/rne/rne08/scene_router.py` ajoute une **hystérésis causale** : trois prédictions favorables de suite pour entrer en mode RNE, deux défavorables pour en sortir. Une coupe, une perte de protection de l'original, une mémoire insuffisante ou l'absence d'autorisation manuelle entraîne immédiatement le bicubique. C'est une protection **contre l'alternance incontrôlée des traitements**, **pas la preuve que les détails sont fidèles**. Elle n'a **pas été activée dans RetoucheProAI**.

### Livrables et contrôles
- Source générique : `outils/rne/rne08/adaptive_selector.py`, `scene_router.py`.
- Reproduction privée : `build_private_dataset.py`, `evaluate_private.py`. Les fichiers étiquetés et les coefficients ajustés demeurent hors Git.
- Tests : `tests/test_rne08_adaptive.py` — **29 tests synthétiques CPU réussis localement** (caractéristiques finies, erreurs et consentements explicites, chargement de politique, refus automatique, coupures, hystérésis, ressources mémoire). Workflow RNE CPU mis à jour ; **la CI GitHub distante doit être vérifiée avant toute affirmation de succès**.
- Archive personnelle : `RetoucheProAI_RNE08_Directeur_Adaptatif_Privé.zip` — scripts, code, test, rapport agrégé, paramètres ajustés et référence RNE 0.4, sans vidéo brute ni frame.

## Etape suivante

Conserver RNE 0.4 comme modèle neuronal de référence dans le laboratoire, et le bicubique comme repli. Pour faire progresser réellement le Directeur IA, remplacer la simple prédiction de gain moyen par une **estimation du risque de perte grave** et de l'incertitude par scène, entraînée **uniquement sur les 157 vidéos consenties** et prévalidée par groupes. Ne pas surexploiter les **41 vidéos récentes**, déjà consultées dans les recherches précédentes et encore destinées à l'évaluation. Un **nouveau jeu réellement inédit**, des vérifications d'identité/texture et une mesure sur Safari iPhone physique sont indispensables avant un déploiement.

**Ce moteur est indépendant de NVIDIA DLSS 5.**
