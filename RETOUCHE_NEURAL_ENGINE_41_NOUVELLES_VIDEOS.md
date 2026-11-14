# RNE 0.4 — première évaluation sur nouvelles vidéos naturellement filmées

**14 novembre 2026 — Projet RetoucheProAI — laboratoire de recherche, sans déploiement.**

## Protocole exécuté

Le propriétaire a transmis **41 nouvelles vidéos**, réservées aux tests, distinctes du corpus de 157 utilisé pour l'entraînement. Tous les 41 fichiers ont été contrôlés par SHA-256. **Deux** sont des copies octet pour octet de l'ancien corpus et **une** est un doublon exact entre les nouveaux envois. Les **38 fichiers** restants ont été analysés avec les poids privés **RNE 0.4 temporel gelés** (aucune mise à jour des poids).

Le premier audit sur 38 fichiers (532 images naturelles, 760 reconstructions) donne **+0,30339 dB de PSNR moyen** face au bicubique ; 722/760 reconstructions gagnantes. **Mais il ne s'agit pas encore de 38 scènes inédites.**

Une comparaison visuelle de premières images, suivie, pour les suspects, de comparaisons **non plates à 25 %, 50 % et 75 % du clip**, a identifié **9 fichiers supplémentaires présentant plusieurs images identiques à des scènes antérieurement apprises**, malgré des SHA différents. Après ces exclusions, **29 vidéos restent seulement candidates à l'indépendance** ; l'absence de correspondance ne suffit pas à exclure des recadrages, décalages temporels ou montages.

Les nouvelles vidéos restent **exclues de tout entraînement**. Aucun chemin, nom de fichier, média, empreinte individuelle, frame, vignette, piste audio ou poids privé n'a été poussé sur GitHub.

## Premier résultat sur les 29 candidats (non certifiés entièrement inédits)

- **406 images** provenant de vidéos réellement filmées, prélevées en deux fenêtres temporelles (33 % et 67 %). L'entrée LR a été **simulée** par sous-échantillonnage ×2 à partir des mêmes images, puis évaluée avec/sans JPEG qualité 65.
- **580 reconstructions** : **559 gains PSNR**, **21 pertes**, **3 régressions inférieures à −0,5 dB**.
- PSNR moyen : **32,65557 dB bicubique vs 32,99698 dB RNE**, différence **+0,34141 dB**.
- Intervalle exploratoire à 95 % du gain moyen, par **bootstrap de vidéos** plutôt que de frames corrélées : **[+0,26635 ; +0,42026] dB**.
- Erreur MAE sur les contours : **9,62319 → 9,00643** niveaux RGB sur 255 (amélioration).
- Erreur MAE sur les textures : **4,95882 → 5,08902** (dégradation légère, priorité de recherche).
- Sur les régions proposées par une cascade Haar comme « visage » : erreur moyenne **4,79035 → 4,65390**, mais **aucune identité, géométrie ou fidélité faciale n'est certifiée**, et les régions n'ont pas été vérifiées par des annotateurs.
- **232 transitions réellement filmées**, évaluées via un flux optique sur LR : MAE temporelle compensée **1,71223 bicubique vs 1,70159 RNE**. **18/29** vidéos plus stables selon cette mesure, 11 moins stables. L'intervalle de la différence temporelle moyenne des médianes par vidéo est **[−0,02058 ; +0,00029]** et inclut zéro ; l'avantage temporel n'est donc pas démontré au seuil de ce protocole.
- Le vrai flux de mouvement est bien filmé, **mais l'altération basse résolution et la compression sont artificielles**. Les images de référence peuvent déjà contenir des filtres AR. Rien ici ne démontre la récupération d'originaux avant filtre ni l'absence d'invention de détails.

## Décision : ne pas déployer

**RNE 0.4 reste non déployable** : 3 régressions spatiales importantes, textures encore en retrait, identité non validée, scène-indépendance provisoire, aucune vérification sur véritable iPhone Safari ni entrée/sortie avant-après filtre authentique. Le bicubique reste le repli.

La quantification des écarts utilise `outils/rne/holdout_reporting.py` et **16 tests synthétiques** dans `tests/test_rne_holdout_reporting.py`, avec agrégation par vidéo et refus explicite de promotion automatique. La CI GitHub CPU est mise à jour, **son état distant doit être vérifié séparément**.

Les **rapports complets, dossiers privés, candidats anonymisés et scripts exacts** sont sauvegardés exclusivement dans une archive privée ChatGPT du propriétaire, intitulée `RetoucheProAI_RNE04_evaluation_41_videos_privee.zip`. Elle n'inclut ni vidéo personnelle, ni image extraite, ni poids de modèle.

## Prochaine expérience

Corriger les cas de texture dégradée et les 3 pertes PSNR sans optimiser sur les vidéos tenues à l'écart. Poursuivre l'analyse de duplications par recadrage/décalage, demander des paires originales/filtrées vérifiables pour les filtres AR, et mesurer la compatibilité réelle de RNE sur Safari iPhone. **Ne jamais considérer 29 fichiers de hash uniques comme 29 scènes indépendantes prouvées.**

**Ce projet est un moteur 2D indépendant ; il n'emploie aucun SDK NVIDIA DLSS 5.**
