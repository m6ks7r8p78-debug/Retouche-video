# Retouche Neural Engine — audit fidélité spatiale et essai textures (14 novembre 2026)

**Statut : recherche RNE 0.4, PR brouillon, pas de déploiement dans RetoucheProAI.** Cette étape conserve la priorité : restauration naturelle, visages et contours non déformés, stabilité temporelle sans texture effacée. Notre RNE est un moteur vidéo 2D **indépendant de NVIDIA DLSS 5**.

## 1. Audit privé des contours, textures et régions faciales proposées

Après l'entraînement antérieur sur les **157 vidéos** (154 contenus distincts), nous avons vérifié SHA-256 et consentement privé sur les 157 entrées du manifeste, sélectionné **un représentant par chacun des 37 groupes conservateurs**, puis décodé **deux instants supplémentaires par groupe** (62 % et 83 % de la vidéo), trois images successives par instant. La référence HR est une image réelle redimensionnée au maximum 256 px, comparée à sa version LR ×2 créée artificiellement ; à 83 %, JPEG qualité 60 est ajouté à la LR. **74 comparaisons**, aucun échec de décodage, aucune publication d'images.

**Ces scènes appartiennent au corpus déjà appris.** Ce n'est pas un vrai jeu de test inédit. Le cadre authentique peut lui-même contenir un filtre AR, une compression ou une retouche préexistante ; la référence n'est pas la vérité avant filtre.

| Indicateur moyen sur 74 cas | Bicubique | RNE 0.4 témoin | RNE 0.4 temporel | Temporel + limiteur |
|---|---:|---:|---:|---:|
| PSNR dB, plus haut meilleur | 33,43385 | 33,88197 | **33,86264** | 33,78095 |
| MAE RGB /255, plus bas meilleur | 3,67147 | 3,54284 | **3,54309** | 3,57707 |
| MAE régions de contours | 9,07442 | **8,14628** | 8,23847 | 8,42311 |
| MAE régions à texture marquée | **4,58035** | 4,69313 | 4,60053 | 4,60536 |
| MAE dans propositions de ROI visage | 4,24439 | **4,07687** | 4,09015 | 4,09440 |

**Visages :** 30 des 74 images ont reçu une proposition de boîte faciale d'OpenCV Haar. Ce sont des **régions approximatives**, pas des masques humains corrigés, des identités certifiées ou une garantie de préservation du visage. Les 44 autres cas ne contribuent pas à cette métrique.

Le gain moyen RNE 0.4 temporel vs bicubique est **+0,42878 dB**, sans recul supérieur à 0,5 dB sur les 74 cas, mais quelques cas perdent du PSNR et la MAE de texture demeure légèrement moins bonne que bicubique. À l'instar du banc antérieur, la stabilité temporelle des vrais mouvements reste le défaut non résolu ; **ne pas généraliser** ces métriques spatiales à la stabilité vidéo.

### Limiteur expérimental

`outils/rne/fidelity_guard.py` borne la modification RNE par rapport au bicubique, avec un seuil plus serré sur les forts gradients (**8/255** sur les contours, **16/255** ailleurs) et un masque de protection binaire explicite donnant une préservation **pixel pour pixel**. Sans masque vérifié, il **ne garantit pas** la protection automatique des traits du visage.

Le limiteur réduit le gain moyen de +0,42878 à +0,34710 dB. Il améliore le PSNR sur **13 cas**, le réduit sur **48**, et laisse les autres presque inchangés. Sa fonction est le **contrôle conservateur des modifications**, pas une amélioration PSNR systématique. Aucune activation automatique.

## 2. Essai supplémentaire : apprendre les gradients de texture

`outils/rne/train_texture_detail.py` a exécuté un **A/B contrôlé** à partir du **même checkpoint RNE 0.4 temporel**, des **mêmes 919 triplets**, des mêmes 220 étapes, batch 8 et ordre d'échantillonnage. Les deux réseaux utilisent MSE + perte de détails temporels (coefficient **0,025**) ; un seul ajoute la perte de gradients de référence (coefficient **0,015**). Les poids privés restent hors GitHub.

Sur les **919 triplets d'apprentissage** :

| Réseau | PSNR | Résidu temporel |
|---|---:|---:|
| Témoin A/B | 31,30498 dB | **0,002625** |
| Candidat gradients | **31,30604 dB** | 0,002633 |

Même comparaison ultérieure sur les **74 instants de scènes du corpus** :

| Réseau | PSNR moyen | MAE contours | MAE textures |
|---|---:|---:|---:|
| Témoin A/B | 33,85586 dB | **8,21411** | 4,60838 |
| Candidat gradients | **33,85805 dB** | 8,21762 | **4,59641** |

Le candidat gagne **+0,00219 dB** sur les 74 cas (+0,00106 dB sur apprentissage), améliore marginalement la MAE des textures, mais recule légèrement sur les contours et l'erreur temporelle de l'apprentissage. L'écart est **trop petit** pour sélectionner ce modèle comme nouvelle version utilisable. Aucun test de vrai iPhone ni benchmark sur vidéos inédites. **Décision : candidat privé de recherche, pas de promotion.**

## 3. Code public / vérification

- `outils/rne/fidelity_guard.py` : aucune altération hors masque explicite ; changements bornés et gestion stricte des entrées. Ne comprend aucun modèle ou détection de visage.
- `outils/rne/audit_spatial_fidelity.py` : reproductibilité **hors dépôt** de l'audit sur le manifeste personnel consenti et ses checkpoints. SHA des 157 fichiers vérifiés et résultat par groupe consigné **uniquement en privé** ; le dépôt n'en contient que l'agrégat.
- `outils/rne/train_texture_detail.py` : A/B gradients contrôlé, contrôle de consentement et vérification des sources, aucun média personnel commité.
- `tests/test_rne_fidelity_guard.py`, `tests/test_rne_spatial_audit.py`, `tests/test_rne_texture_training.py` : **32/32 nouveaux tests locaux réussis** sur données synthétiques. Workflow `.github/workflows/rne-cpu.yml` mis à jour ; **CI GitHub distante à vérifier séparément**.

Aucun fichier vidéo privé, vignette, portrait, masque réel, chemin identifiable, manifeste privé, SHA individuel ni poids personnalisé ne doit être publié. Archive privée : `RetoucheNeuralEngine_RNE04_Fidelite_Textures_prive_2026-11-14.zip`.

## 4. Décision et suite

**RNE 0.4 demeure expérimental**, même si ses métriques spatiales sur ces scènes précédemment vues dépassent bicubique : les erreurs sur les textures, la fidélité fine et la stabilité des mouvements naturels ne sont pas suffisamment validées. Conserver le bicubique comme repli. L'autorisation d'une future intégration nécessitera de **nouvelles vidéos et références jamais vues**, des masques faciaux vérifiés, une revue des artefacts et des mesures sur véritable Safari iPhone. Ne pas confondre la reconstruction créative de régions cachées avec la restitution authentique d'originaux absents.
