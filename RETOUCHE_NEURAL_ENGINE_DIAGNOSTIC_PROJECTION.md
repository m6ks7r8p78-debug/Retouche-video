# Retouche Neural Engine — diagnostic des pertes et projection de cohérence (14 novembre 2026)

**Statut : expérience post-hoc, sans déploiement.** Les vidéos et les poids sont privés. La PR reste un brouillon ; `main` et le site RetoucheProAI ne sont pas modifiés.

## 1. Origine de l'expérience

Le benchmark précédent, sur **41 vidéos téléchargées dans ChatGPT**, a exclu deux copies exactes d'anciennes vidéos, une copie exacte parmi les nouveaux envois et neuf autres fichiers montrant manifestement les mêmes scènes que des vidéos déjà apprises. Les **29 autres vidéos restent des candidates provisoires** : un recadrage ou un montage peut encore cacher une correspondance. Les 41 nouvelles vidéos restent **hors entraînement**.

Avec le modèle **RNE 0.4 temporel gelé**, l'audit initial sur 29 vidéos, 580 reconstructions à partir de vidéos réellement filmées mais **dégradées artificiellement en LR**, présentait **trois pertes PSNR supérieures à 0,5 dB**, concentrées sur une seule vidéo, en mode sans JPEG.

Cet examen ciblé a été conçu après observation des contre-exemples. **Il ne représente donc plus une validation indépendante du nouveau procédé.**

## 2. Localisation des régressions, modèle gelé

Un diagnostic supplémentaire a contrôlé **sept vidéos** — le cas problématique et six contrôles choisis par une fonction de hachage fixe des identifiants opaques — à **six instants nouveaux par vidéo**, trois reconstructions par instant et deux conditions (LR propre, LR + JPEG65), soit **252 reconstructions**.

| Gain PSNR par rapport au bicubique | Entrée LR propre | Entrée LR + JPEG65 |
|---|---:|---:|
| Vidéo présentant les anciens contre-exemples (18 essais par mode) | **−0,26304 dB** ; 5 pertes au-delà de −0,5 dB | **+0,02771 dB** ; 0 perte au-delà de −0,5 dB |
| Six autres vidéos sélectionnées (108 essais par mode) | **+0,70863 dB** | **+0,29896 dB** |

Sur le cas difficile en LR propre, la correction change la **MSE de luminance de +0,29104** par rapport au bicubique, contre une différence de **+0,00305** sur la chrominance. La MAE de texture augmente légèrement. C'est compatible avec une correction trop forte de luminance sur un clip déjà relativement propre. **Ce diagnostic ne prouve pas une cause unique ni une identité faciale.**

## 3. Première ablation : cohérence avec l'entrée basse résolution

Sans aucun entraînement ni changement de checkpoint, on projette une fois la correction de luminance pour que l'image ×2, **lorsqu'elle est rééchantillonnée par `cv2.INTER_AREA`**, se rapproche de la LR fournie.

Il s'agit d'une contrainte de formation d'image, **pas d'un récupérateur de détails cachés ni d'un défiltreur AR**. Elle suppose un processus de sous-échantillonnage connu ; avec une vraie vidéo ou une compression JPEG, l'hypothèse peut être fausse. Le code générique `outils/rne/data_consistency.py` refuse donc **par défaut** d'appliquer cette projection sans indicateur explicite `known_area_downsample=True`. Le moteur de production ne l'appelle pas.

L'évaluation **post-hoc** a rejoué les **580 reconstructions** des 29 vidéos candidates avec le modèle original inchangé, vérification des SHA-256 et reproduction numérique des scores de référence.

| Comparaison | RNE 0.4 initial | RNE + projection |
|---|---:|---:|
| Gain PSNR sur les 290 cas LR propres | +0,48028 dB | **+0,72250 dB** |
| Gain PSNR sur les 290 cas JPEG65 | **+0,20255 dB** | +0,08987 dB |
| Gain moyen sur l'ensemble des 580 cas | +0,34141 dB | +0,40619 dB |
| Cas en perte de plus de 0,5 dB face au bicubique | 3 | **0** |
| Erreur temporelle compensée (232 transitions, moins = mieux) | **1,70159** | 1,85807 |
| MAE des textures moins bonnes que bicubique (différence moyenne) | +0,13020 | **+0,39782** |
| MAE des contours meilleure que bicubique (différence moyenne) | −0,61676 | **−0,85674** |

L'erreur de luminance entre la LR et la HR rééchantillonnée diminue de **0,73272 à 0,24907** niveaux sur 255 : la projection remplit sa contrainte mathématique. Sur les **290 reconstructions propres**, elle améliore le PSNR face au RNE initial dans **290/290 cas**. En revanche, sous JPEG65, elle dégrade le PSNR par rapport au RNE initial dans **280/290 cas**.

La dispersion est **corrélée par vidéo** ; des intervalles bootstrap exploratoires par vidéo ont été calculés, sans prétendre que cet audit post-hoc est indépendant. Les pertes peuvent réapparaître sur d'autres scènes, lumières et mouvements.

## 4. Décision : module bloqué pour la production

**Ne pas activer la projection automatiquement, même sur un fichier qui semble « propre ».** L'inférence d'une source vidéo ne garantit pas le véritable opérateur de réduction LR. En outre, la projection aggrave la stabilité temporelle et la MAE sur textures dans ce protocole. Ce compromis ne correspond pas au rendu naturel et fidèle demandé.

Livrables publics génériques : `outils/rne/data_consistency.py`, `tests/test_rne_data_consistency.py` (**14/14 tests locaux synthétiques réussis**) et mise à jour de `.github/workflows/rne-cpu.yml`. La réussite GitHub Actions du nouveau HEAD est **à vérifier**.

Livrables privés (aucune image ni vidéo brute) : rapports détaillés et agrégés, diagnostics des sept vidéos, scripts du banc de 29 vidéos, tests, README, empaquetés dans `RetoucheProAI_RNE04_diagnostic_projection_posthoc_prive.zip`. Le rapport public ne contient aucun nom de fichier, empreinte individuelle, image, masque personnel, modèle entraîné, chemin privé ou donnée identifiable.

**Suite** : entraîner un module de cohérence temporelle **uniquement sur les anciennes 157 vidéos consenties**, plutôt que d'optimiser un post-traitement sur le holdout. Évaluer ensuite sans réajuster les paramètres sur le jeu de vidéos réservé, obtenir de vraies paires originals/filtrées si possible, mesurer les textures, visages, coupes, mouvement et Safari iPhone réel. Aucun SDK ni poids NVIDIA DLSS 5 n'a été utilisé.
