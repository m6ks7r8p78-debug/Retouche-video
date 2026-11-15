# Retouche Neural Engine — RNE 0.2 temporel (14 novembre 2026)

**Statut : prototype expérimental privé pour l'entraînement, code générique public sur la branche de PR #1. Pas d'intégration dans RetoucheProAI, pas de fusion ni déploiement.**

## Objectif et architecture

RNE 0.2 est **notre moteur vidéo neuronal indépendant**, et non une version, une copie ou une implémentation du SDK propriétaire DLSS 5 de NVIDIA.

Le réseau `RNETemporal2x` apprend une correction **de luminance ×2** à partir de :
- l'image vidéo courante à basse résolution ;
- l'image précédente réalignée vers la courante par flux optique arrière estimé (Farneback) ;
- une carte de confiance locale rejetant les incohérences, les bords et les coupures de scène ;
- la reconstruction `RNE2x` de RNE 0.1 **gelée** comme référence.

Ce second réseau comporte **9 244 paramètres** appris en plus des **13 692** paramètres de RNE 0.1. L'inférence est causale : elle n'utilise ni images futures ni vecteurs de mouvement d'un moteur 3D. Elle s'exécute par tuiles CPU, borne l'entrée à 1280×720, réinitialise l'état à une coupe et préserve les zones protégées par la référence bicubique. Le décodage/encodage MP4 est effectif ; le remux audio FFmpeg est optionnel et le rapport ne prétend pas qu'un flux audio existe lorsqu'il est absent.

**Fichiers** : `outils/rne/temporal.py`, `outils/rne/train_temporal.py`, `tests/test_rne_temporal.py`. Ils complètent RNE 0.1 sans modifier son fonctionnement. Workflow : `.github/workflows/rne-cpu.yml` (36 tests synthétiques RNE 0.1 + 0.2).

## Entraînement et mesures réellement exécutés

Bibliothèque personnelle ChatGPT : les fichiers originaux sont gardés privés et n'ont jamais été envoyés sur GitHub. Le script de formation exige **autorisation explicite et contrôle SHA-256** de chaque média, ainsi que séparation train/validation/test par groupes d'images/scènes (groupes issus d'un catalogue heuristique, pas garantie d'unicité sémantique).

- **Apprentissage :** 12 vidéos, 24 **paires de frames réellement consécutives**, 600 étapes, batch 8, poids RNE 0.1 gelés.
- **Validation :** 4 autres vidéos, 8 paires, 32 patches. Meilleur jalon sur validation : 600 étapes, **35,07790 → 35,28490 dB** de PSNR (RNE 0.1 → 0.2), soit **+0,20700 dB**.
- **Test exploratoire :** 5 autres vidéos, 10 paires, 40 patches. RNE 0.1 **36,06042 dB** ; RNE 0.2 **36,22694 dB** (**+0,16652 dB**). 30/40 patches meilleurs, aucune régression supérieure à 0,5 dB.
- **Contrôle supplémentaire réellement distinct du manifest RNE 0.1 / 0.2 :** 4 vidéos, 8 paires, **48 patches**, empreintes vérifiées, groupes isolés selon le catalogue et non utilisés pour le choix du meilleur modèle. **Bicubique 37,13346 dB ; RNE 0.1 36,64589 dB ; RNE 0.2 36,92373 dB**. RNE 0.2 bat RNE 0.1 de **+0,27784 dB**, mais **perd 0,20973 dB face au bicubique** ; **1 patch** subit une régression > 0,5 dB vs RNE 0.1.

Les paires proviennent de deux frames successives de vidéos réelles, mais la création de l'entrée basse résolution utilise une **dégradation synthétique** (réduction ×2, bruit/JPEG occasionnels). Les références peuvent déjà présenter des effets de compression ou des filtres. Ces mesures ne prouvent pas la fidélité d'une vraie restauration et **ne démontrent aucune qualité visuelle comparable à NVIDIA DLSS 5**.

## Tests fonctionnels

**36/36 tests locaux réussis** (17 tests de RNE 0.1 + 19 tests RNE 0.2), uniquement sur des images/vidéos entièrement synthétiques : géométrie, poids, causalité, coupe, alignement, limites de taille, intégrité des entrées, protection hors zone, refus d'écraser la source, refus du contenu privé dans Git, production et lecture d'un vrai MP4.

Démonstration vidéo **synthétique** : 24 frames, **128×96 → 256×192**, 12 fps, 23 transitions temporelles, MP4 décodable. La source n'a pas de piste audio : le remux ne prétend plus à tort en avoir conservé une. Une démonstration aussi petite ne valide ni iPhone Safari ni 4K, ni temps réel, ni 8K.

La **CI GitHub Actions** a été mise à jour mais ses résultats distants doivent être vérifiés séparément : ne pas confondre tests locaux et succès du workflow.

## Confidentialité et reprise

Les nouveaux poids `rne_02_temporal_prive.pt`, le modèle initial RNE 0.1, les rapports détaillés et les scripts sont dans l'archive personnelle `RetoucheNeuralEngine_RNE_v0_2_prive.zip` mise à disposition dans ChatGPT. Aucun fichier média original, aucune trame personnelle, aucun manifest, hash individuel ou poids personnalisé n'a été déposé sur GitHub.

**Verdict : PAS D'ACTIVATION AUTOMATIQUE.** Sur le lot de contrôle supplémentaire, le bicubique reste en moyenne meilleur. Le Directeur IA ne doit pas remplacer ce témoin simple par RNE 0.2 sans démonstration indépendante d'un gain significatif et d'une absence de régression. Les traitements AR, la fidélité des visages et la cohérence des mouvements naturels restent des sujets ouverts.

## Prochaine itération prévue

1. Construire de véritables triplets temporels (plusieurs frames), estimation d'occlusion et de mouvement avec évaluation sur des scènes naturellement mobiles.
2. Améliorer le modèle **sur apprentissage/validation uniquement**, puis créer un nouveau test final scellé pour éviter d'optimiser sur les quatre vidéos de contrôle déjà consultées.
3. Comparer **bicubique, RNE 0.1, RNE 0.2 et une baseline temporelle classique** par PSNR, SSIM, perceptuel, stabilité temporelle, identités et zones protégées. Consigner aussi les contre-exemples.
4. Examiner une implémentation iPhone Safari/WebGPU ou un calcul privé activé par consentement distinct ; respecter budget RAM, autonomie et taille des modèles.
5. Préserver l'original et proposer une reconstruction créative *explicitement identifiée* si des pixels inconnus doivent être inventés.

Références NVIDIA pour le contexte technique, non comme dépendance : https://research.nvidia.com/labs/adlr/DLSS5/ .
