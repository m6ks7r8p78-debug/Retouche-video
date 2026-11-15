# Retouche Neural Engine RNE 0.6 — gradients temporels à confiance contrôlée

**14 novembre 2026 · Branche expérimentale · Aucun déploiement.** RNE reste un moteur vidéo 2D indépendant, sans SDK ni poids NVIDIA DLSS 5.

## Question examinée

Le précédent candidat RNE 0.5 améliorait très légèrement les textures, au détriment du mouvement. Cette expérience teste une autre perte : au lieu de lisser l'image complète, pénaliser uniquement les **variations des gradients du résidu neuronal** entre deux images, alignées par flux optique, et uniquement dans les zones où **deux pixels voisins** possèdent tous deux une confiance de mouvement élevée.

Code générique : `outils/rne/temporal_gradients.py`. Les masques ne reconnaissent aucun visage et la perte n'établit pas que des détails sont authentiquement récupérés.

## Entraînement réel, isolé des 41 nouvelles vidéos

- Manifeste privé du corpus historique : **157/157 vidéos revalidées par SHA-256**, **154 contenus uniques** et **308 triplets**. Aucune vidéo des **41 nouveaux téléchargements** n'a été utilisée pour ce travail.
- Initialisation identique des deux variantes à partir de **RNE 0.4 temporel**. Même ordre de batches, **260 étapes** par modèle, **batch 8**, mêmes dégradations LR ×2 simulées sur les triplets. Perte témoin : MSE reconstruction + 0,025 × cohérence temporelle de résidu. Candidat : même perte + 0,012 × pénalité de gradients temporels avec confiance optique.
- **Les 157 vidéos avaient déjà été utilisées pour préentraîner RNE 0.4** : toutes les métriques de ce cycle sont internes à l'apprentissage et ne constituent pas un véritable test inédit.

| Mesure sur les 308 échantillons historiques | Témoin | Candidat RNE 0.6 |
|---|---:|---:|
| PSNR, dB | **30,63414** | 30,63230 |
| Gain PSNR sur bicubique, dB | **+0,19254** | +0,19070 |
| Erreur temporelle de résidu | 0,002255 | **0,002225** |
| Erreur des gradients temporels | 0,000546 | **0,000531** |
| Erreur des gradients spatiaux vs référence | **0,018783** | 0,018787 |
| Échantillons en recul de plus de 0,5 dB vs bicubique | 1 | 1 |

**Décision avant toute autre mesure : candidat non retenu.** Il améliore un indicateur temporel, mais diminue le PSNR et détériore légèrement les gradients spatiaux, alors que le critère de promotion préenregistré exigeait de meilleurs résultats **sur tous ces axes**. Cette contrainte évite de sélectionner une vidéo floue simplement parce qu'elle scintille moins.

## Contrôle descriptif supplémentaire sur vidéos naturellement filmées

Les **41 fichiers récents** demeurent exclus de l'entraînement. Le même jeu de **29 candidats provisoires**, après tri de 2 copies de l'ancien catalogue, 1 doublon interne et 9 fortes correspondances de scènes avec l'ancien corpus, a été réutilisé pour un contrôle **en lecture seule**. Il s'agit de scènes qui ont **déjà été observées pendant les recherches antérieures**, et dont l'indépendance visuelle vis-à-vis du catalogue ancien n'est pas complètement certifiée : **ne pas qualifier ceci de holdout neuf ni recalibrer le modèle à partir de ces scores**.

Sur deux fenêtres de vrais mouvements par vidéo, LR ×2 simulée **sans JPEG ajouté**, **290 reconstructions** et **232 transitions** :

| Mesure | RNE 0.4 de référence | Nouveau candidat RNE 0.6 |
|---|---:|---:|
| Gain PSNR vs bicubique | **+0,48028 dB** | +0,46444 dB |
| MAE des contours, RGB /255 | **7,32808** | 7,37048 |
| MAE des textures, RGB /255 | 3,59620 | **3,57606** |
| Pertes supérieures à 0,5 dB | 3 | 1 |
| Écart temporel moyen des médianes par vidéo vs bicubique, RGB /255 | **−0,01203** | −0,01191 |

Le candidat améliore marginalement la MAE des textures et passe de 3 à 1 forte régression **dans ces exemples déjà examinés**, mais son PSNR et sa fidélité des contours régressent ; l'écart temporel n'est pas meilleur que RNE 0.4. Le témoin RNE 0.6 de même durée d'entraînement fait aussi moins bien que RNE 0.4 sur PSNR, ce qui montre qu'une partie des écarts est due au simple réentraînement.

Le contrôle a également utilisé des dégradations LR artificielles produites à partir des images filmées. **Aucune source avant filtre AR vérifiée, aucune fidélité d'identité mesurée et aucun test iPhone Safari.**

## Livraison et confidentialité

- **16 tests unitaires entièrement synthétiques**, réussis localement ; les 14 tests RNE 0.5 existants ont aussi été relancés avec succès. Workflow `.github/workflows/rne-cpu.yml` complété pour les 16 tests, résultat CI distant à vérifier.
- Source publique : `outils/rne/temporal_gradients.py`, `tests/test_rne06_temporal_gradients.py`, cette documentation. Script complet d'entraînement, checkpoints du modèle de référence et des deux bras, protocole détaillé et rapports d'évaluation disponibles dans **l'archive privée remise au propriétaire** `RetoucheProAI_RNE06_gradients_temporels_prive.zip`.
- Aucune vidéo originale, image extraites, nom de média personnel, empreinte individuelle ni poids privés dans GitHub.
- **PR #1 toujours brouillon**. Les résultats ne justifient ni promotion du modèle RNE 0.6, ni intégration dans RetoucheProAI.

### Priorité de recherche après cet échec de sélection

Ne pas multiplier les fines corrections sur un jeu de test déjà regardé. Construire, à partir des 157 sources consenties, des dégradations plus réalistes et plus variées et des métriques alignées avec la perception humaine, puis tester **une nouvelle version figée** sur un lot véritablement inédit. Ne pas confondre restauration fidèle de pixels visibles, reconstruction spéculative de pixels occultés, ni stabilité obtenue par flou. Le bicubique reste le repli sûr.
