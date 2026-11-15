# RNE 0.5 — Réentraînement textures / cohérence temporelle

**14 novembre 2026 — RetoucheProAI — recherche privée, non déployée.**

## Travail réellement effectué

1. Corpus d'entraînement original : **157 vidéos vérifiées par SHA-256**, soit **154 fichiers distincts** et 3 copies exactes (copies non réapprises comme nouveaux contenus). Toutes les sources sont disponibles localement dans le laboratoire privé. Le catalogue historique comporte d'anciennes mentions de refus d'entraînement antérieures à la **nouvelle autorisation explicite du propriétaire** ; le travail respecte celle-ci, sans en déduire une quelconque autorisation de publication.
2. **308 triplets** de trois images naturellement consécutives, deux par contenu distinct (environ 19 % et 61 % de chaque vidéo), extraction réussie sur 154/154 contenus. Ces triplets sont dérivés des **157 vidéos historiques**, pas des 41 fichiers transmis ultérieurement.
3. RNE 0.4 temporel, déjà entraîné antérieurement sur le corpus, utilisé comme point de départ **identique** de deux branches. Chaque branche a été entraînée **260 étapes**, batch 8, avec les mêmes 308 triplets présentés à l'optimiseur et le même ordre pseudo-aléatoire ; dégradations LR/JPEG/bruit synthétiques. Les poids RNE ont une architecture de réseau 2x à trois images.
4. Témoin : perte MSE spatiale et résidu de détail temporel à coefficient 0,025 ; candidat : mêmes pertes, plus erreur du Laplacien pondérée par la magnitude du détail de la référence (coefficient 0,018), à l'intérieur de l'image pour éviter l'artefact de bord.
5. **14 tests unitaires locaux réussis** sur des tableaux synthétiques : perte haute fréquence, gradient différentiable, vérification de forme, blocage de toute publication / promotion automatique, refus de réutiliser les 41 vidéos. Les mêmes tests sont ajoutés au workflow GitHub Actions, dont le succès distant **reste à vérifier**.

## Chiffres — strictement sur les triplets d'apprentissage

| Mesure | Témoin | Candidat textures |
|---|---:|---:|
| PSNR moyen | 30,95481 dB | **30,95643 dB** |
| PSNR vs bicubique | +0,21653 dB | **+0,21815 dB** |
| Perte de détails Laplacien | 0,055932 | **0,055861** |
| Erreur résidu temporel | **0,002218** | 0,002262 |

A/B **+0,00162 dB de PSNR** pour la perte textures et **+0,000044 d'erreur temporelle** (plus haut = pire). 203 des 308 triplets gagnent en PSNR, **sans gain moyen suffisant pour la promotion**. Ces scores ne sont pas des tests indépendants : le corpus complet a déjà servi lors d'entraînements antérieurs.

**Décision de recherche :** conserver **RNE 0.4 temporel** comme référence. Les nouveaux poids RNE 0.5 (témoin et candidat) sont sauvegardés dans l'archive privée, **pas promus ni déployés**. Le garde-fou `assess_candidate()` applique un seuil conservateur de préférence expérimentale (+0,05 dB et aucune dégradation temporelle) mais ne permet **jamais** de déployer automatiquement, même si les chiffres sont favorables.

## Protection des 41 nouveaux uploads et confidentialité

Les **41 nouvelles vidéos** restent exclues du nouvel entraînement et **n'ont pas été consultées pour calculer ce nouveau score**. Leurs audits antérieurs ont déjà orienté le type de problème étudié : un test aveugle véritable nécessiterait de nouveaux contenus indépendant de ces décisions de conception. Ne pas prétendre qu'aucune influence indirecte n'existe.

Dans GitHub : seulement `outils/rne/texture_temporal_v05.py` (fonction de perte et contrôle de sélection), `tests/test_rne_v05_texture_temporal.py` et cette documentation, plus le workflow CI. L'**exact script d'entraînement reproductible**, le script d'échantillonnage, le code de base et les **trois checkpoints tensoriels privés** sont dans l'archive personnelle `RetoucheProAI_RNE05_texture_temporel_prive.zip`. Celle-ci ne contient **aucune vidéo ni image source, aucun manifeste privé, aucun hachage individuel**.

Le propriétaire garde le contrôle de la bibliothèque ; aucun média n'a été transmis à une API d'entraînement tierce ou vers GitHub dans ce cycle.

## Suite de recherche

- Mieux mesurer les textures **sur des scènes jamais apprises** et sur des paires véritables avant/après filtres AR, lorsqu'elles sont disponibles avec autorisation.
- Ajouter une validation de stabilité et de géométrie par zones avec masques vérifiés, plutôt que d'optimiser une moyenne PSNR.
- Tester la mémoire et les performances Safari sur un véritable iPhone avant toute activation dans la PWA. Aucun résultat 4K/8K démontré.
- RNE est un moteur vidéo 2D maison **indépendant de NVIDIA DLSS 5** ; aucun modèle ou SDK NVIDIA DLSS 5 n'a été utilisé.
