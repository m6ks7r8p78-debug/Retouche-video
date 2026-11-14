# RetoucheProAI — calibration AR v4 et cohérence temporelle 2D
Date : 14 novembre 2026. Recherche expérimentale seulement ; ni fusion, ni déploiement, ni entraînement dans GitHub Actions.

## 1. Contrôle du seuil AR v4 sur cinq nouvelles scènes
- Le modèle privé `detecteur_ar_v4_experiment_prive.pt` a été **réutilisé sans réentraînement**.
- Calibration sur 4 groupes de validation antérieurs, 96 échantillons d'accessoires **procéduraux** avec bruit, compression et transformations. Grille de seuils de 0,50 à 0,975 ; critère de limitation des pixels positifs sur des témoins **sans ajout procédural** à 0,5 %. Seuil choisi : **0,50 (inchangé)**.
- Confirmation du seuil gelé sur **5 autres groupes**, 10 images de fonds vidéo et 120 cas synthétiques ; ces scènes n'ont pas servi à l'ajustement AR v4 mais l'ancien modèle a pu déjà les voir lors de son préentraînement historique.
- Ancien modèle à 0,50 : IoU chat **0,14895**, chien **0,04012**, lunettes **0,04263** ; pixels positifs sur témoins sans ajout **28,9299 %**.
- AR v4 inchangé à 0,50 : IoU chat **0,36219**, chien **0,16768**, lunettes **0,12935** ; pixels positifs sur témoins sans ajout **0,2718 %**.
- La précédente confirmation sur 3 autres scènes avait mesuré **1,4594 %** de pixels positifs témoins. La variabilité importante entre scènes empêche de proclamer le problème résolu, et l'IoU chat 0,36219 reste sous le seuil expérimental de 0,50.

Ces témoins sont des fonds de vidéos personnelles auxquels **aucune nouvelle incrustation synthétique** n'a été ajoutée : ils ne certifient pas l'absence d'un éventuel véritable filtre déjà présent. Aucune évaluation d'un vrai masque Snapchat vérifié n'a eu lieu.

## 2. Banc de cohérence temporelle inspiré des principes du rendu neuronal
Le prototype privé crée sur des images réelles des **séquences artificielles** avec surimpressions AR procédurales, translation contrôlée, bruit et compression variable. Le mouvement est **simulé**, pas un mouvement réellement extrait d'une vidéo.

- Réglage causal : quatre groupes de validation, **288 images synthétiques** ; coefficients de lissage testés 0, 0,15, 0,25, 0,35 et 0,45.
- Coefficient retenu **0,45**, avant la confirmation, sous contrainte de ne pas perdre plus de 0,02 d'IoU et de ne pas augmenter les faux positifs de plus de 0,004.
- Confirmation : cinq nouveaux groupes, **360 images** ; flux optique arrière estimé entre l'image courante et la précédente avec OpenCV Farneback. Aucun accès au futur et réinitialisation à la rupture de séquence.
- Variation temporelle moyenne des probabilités, compensée par le mouvement connu de la simulation : **0,007026 → 0,003536**, soit **−49,67 %**.
- IoU moyen des masques AR : **0,270691 → 0,266382** (−0,43 point de pourcentage).
- Pixels positifs sur témoins sans ajout procédural : **0,1503 % → 0,1381 %**.

La métrique temporelle n'est pas une preuve esthétique. Un masque constamment nul serait stable sans être correct ; c'est pourquoi précision de détection et faux positifs sont mesurés en parallèle. Ces résultats **ne démontrent pas** une amélioration sur des scènes réelles en mouvement, des vrais AR, des visages ou Safari iPhone. Coût d'inférence et mémoire iPhone non mesurés.

## 3. Code générique versionné
`outils/directeur-fusion-temporelle-ar.cjs` démontre la fusion causale de cartes de probabilités, **à partir d'un flux arrière fourni par un estimateur externe**. Il réalise interpolation bilinéaire, limites de mémoire, confiance minimale du mouvement, remise à zéro après coupe et protection de la zone autorisée. Il ne calcule pas le flux optique lui-même, n'ouvre pas de fichiers, n'utilise pas un modèle neuronal, ne traite pas les images RGB et ne s'exécute pas dans l'application.

`tests/directeur-fusion-temporelle-ar.test.mjs` : **17 tests Node synthétiques réussis localement**. La CI doit être vérifiée après le commit de branche.

La documentation DLSS 5 de NVIDIA décrit un rendu neuronal guidé par des tampons 3D et des vecteurs de mouvement moteur : https://research.nvidia.com/labs/adlr/DLSS5/ . Le SDK DLSS 5 est **réservé aux partenaires à la date vérifiée** : https://forums.developer.nvidia.com/t/official-dlss-5-neural-rendering-plugin-access-for-unreal-engine-5-8-2/382731 . La recherche vidéo 2D RetoucheProAI n'est **pas une intégration de NVIDIA DLSS 5**.

## 4. Suite nécessaire
1. Constituer de vrais masques temporels AR corrigés et vérifiés, scènes sans filtre certifiées et références indépendantes, en séparant l'historique du préentraînement.
2. Confronter les différentes familles (chat, chien, lunettes, fleurs, beauté) et compression/rotation/taille de visage à des **vidéos naturellement mobiles**, sans sélectionner les paramètres sur le lot de test final.
3. Vérifier le flux optique sous occultation, mauvais alignement, zoom et coupes ; protéger les contours et pixels hors masque.
4. Mesurer mémoire/latence et qualité sur un **véritable iPhone Safari**, puis autorisation humaine distincte avant toute activation.
5. Conserver les scripts d'expériences, modèles personnalisés et résultats individuels **hors du GitHub public** ; ne jamais fusionner ni déployer automatiquement.
