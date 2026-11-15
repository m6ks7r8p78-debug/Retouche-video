# RNE 0.3 — moteur vidéo neuronal indépendant, corpus privé de 157 vidéos
Date de l'expérience : **14 novembre 2026**. Statut : laboratoire seulement, branche `chatgpt-ai-director-v01`, PR #1 brouillon. Aucun modèle activé dans l'application.

## Objectif
Créer notre propre moteur 2D de super-résolution **x2** et de cohérence temporelle, sans SDK, modèle, marque ou code NVIDIA DLSS 5. Cette technologie ne dispose pas des buffers d'un moteur 3D ; elle **estime** son mouvement à partir de vidéos importées. Le fait d'avoir trois frames ne suffit pas à démontrer le photoréalisme ou une capacité de restauration de visages occultés.

## Corpus : les 157 vidéos ont été utilisées sans publication
- Bibliothèque privée ChatGPT : **157/157 fichiers récupérés**, environ **2,46 Go**.
- **157/157 SHA-256 identiques au catalogue** ; aucune absence, aucune erreur de décodage des trames testées.
- Groupes anti-fuite conservateurs : **37 composantes de scènes**, calculées hors Git à partir du groupe catalogue, des doublons exacts et des rapprochements suspects. Le regroupement reste une **heuristique** et non un certificat parfait d'indépendance.
- Partitions : **127 vidéos, 27 groupes pour l'entraînement ; 12 vidéos, 4 groupes pour la validation ; 18 vidéos, 6 groupes pour le test**. Aucune vidéo des deux dernières partitions n'avait été utilisée parmi les 21 fichiers des essais RNE 0.1/0.2.
- Trames de **vrais mouvements de fichiers vidéo** : 254 triplets d'entraînement, 12 de validation, 18 de test, soit **284 triplets** échantillonnés sur les 157 vidéos. Le corpus complet n'a pas été parcouru frame par frame : il s'agit d'un **échantillonnage**, pas de 157 entraînements complets. Les vidéos très longues sont sous-échantillonnées.
- Les paires basse/haute résolution ont été obtenues par **réduction d'échelle, bruit et JPEG artificiels** à partir des trames originales reçues. Ces dernières peuvent déjà contenir des filtres. Il n'existe pas de vérité terrain de détails perdus ou d'accessoires AR réels.
- Consentements d'apprentissage privé du propriétaire vérifiés ; origine de tiers ou droits de redistribution non automatiquement acquis. Aucun média, hash individuel, manifeste avec chemin, poids spécialisé ou masque privé enregistré dans le dépôt public.

## Implémentation RNE 0.3
- Nouveau modèle neuronal **13 684 paramètres**, 11 canaux d'entrée : image courante (RGB3), deux images précédentes recalées par flux optique (RGB3+RGB3), deux cartes de confiance (1+1).
- Convolutions apprenantes, PixelShuffle, résiduel borné x2 sur l'agrandissement bicubique. Le flux estimé Farneback est évalué **dans les deux sens** pour détecter un alignement incertain et les occultations probables ; repli bicubique quand la confiance est nulle.
- **Causal** : seules les images passées et l'image actuelle sont utilisées. Réinitialisation approximative en cas de différence importante de plan, protection de zones au pixel près, traitement par tuiles. Pas de nouvelle identité ni de détails originaux garantis.
- Sortie MP4 réelle : test sur **24 frames entièrement synthétiques**, 128x96 → 256x192, 22 frames avec trois images disponibles. MP4 relu avec succès. Un essai **entièrement synthétique avec piste AAC** a confirmé 24 frames vidéo + piste AAC conservée via le remux FFmpeg ; cela n'établit pas une compatibilité universelle avec tous les codecs.
- **19 tests** du moteur et **11 tests** des consentements/partitions = **30 nouveaux tests** ; **66/66 tests locaux** de RNE 0.1, 0.2 et 0.3 réussis. La CI GitHub distante est à vérifier.

Code dans `outils/rne/triad.py`, `outils/rne/prepare_triad.py`, `outils/rne/train_triad.py` et les deux nouveaux fichiers `tests/test_rne_triad*.py`. Aucun script public ne connaît les noms ni chemins des médias privés.

## Entraînement réel et résultats indépendants
- Initialisation RNE 0.3 depuis zéro (aucun poids NVIDIA ; le banc de comparaison recharge séparément les modèles RNE 0.1/0.2).
- **600 étapes**, batch 8 ; meilleur checkpoint choisi uniquement sur les 12 vidéos de validation, à l'étape 600.
- Sur **48 petits patchs de validation (12 vidéos)** : bicubique 35,05058 dB ; RNE 0.3 35,50851 dB = **+0,45793 dB**.
- Sur **72 patchs de test (18 vidéos, 6 groupes conservateurs)**, consultés après le choix de checkpoint :

| Référence sur mêmes cas | PSNR moyen (dB) |
|---|---:|
| Bicubique | 33,07405 |
| RNE 0.1 | 32,75664 |
| RNE 0.2 | 33,07820 |
| **RNE 0.3** | **33,50619** |

- RNE 0.3 : **+0,43214 dB face au bicubique ; +0,42798 dB face à RNE 0.2**.
- **5 des 6 groupes de test** gagnent en moyenne contre le bicubique, mais **1 des 72 patchs** perd plus de 0,5 dB contre le bicubique et **5 des 72** perdent plus de 0,5 dB contre RNE 0.2.
- Une contre-épreuve séparée de reproductibilité a réussi après l'expérience, sur les mêmes 157 fichiers avec paramètres réduits (20 étapes) : **ce n'est pas une seconde preuve indépendante** et ne modifie pas les métriques du modèle principal.

**Décision : conserver RNE 0.3 en recherche**, ne pas activer de moteur universel : il subsiste des régressions individuelles, les vraies dégradations ne sont pas garanties identiques aux simulations, la stabilité perceptuelle sur longues vidéos n'est pas mesurée et l'usage sur Safari iPhone n'est pas validé. Le faible nombre de groupes de test impose de rester prudent.

## Reproduction privée sur ordinateur Python
Dépendances locales : `torch`, `opencv-python`, `numpy`, `ffmpeg` facultatif pour audio. Le manifeste privé comprend pour chaque vidéo `id` opaque, `path` local, `group`, `split`, `sha256`, `private_training_consent`, `private_evaluation_consent`, et `publication=false`.

```sh
python outils/rne/prepare_triad.py --manifest /DOSSIER_PRIVE/manifest.json --out /DOSSIER_PRIVE/cache --expected-count 157 --authorized-private-training

python outils/rne/train_triad.py --manifest /DOSSIER_PRIVE/manifest.json --cache-dir /DOSSIER_PRIVE/cache --output /DOSSIER_PRIVE/poids --base-weights /DOSSIER_PRIVE/rne_2x_prive_non_deployable.pt --temporal-weights /DOSSIER_PRIVE/rne_02_temporal_prive.pt --expected-count 157 --steps 600 --batch 8 --authorized-private-training

python outils/rne/triad.py entree.mp4 sortie_2x.mp4 --weights /DOSSIER_PRIVE/rne03_triframe_private.pt
```

**Le CLI local est exécutable** avec `--weights` (obligatoire pour éviter un rendu IA aléatoire). Depuis un environnement Python, la même fonction est disponible :
```py
from triad import render_video
render_video('entree.mp4','sortie_2x.mp4','/DOSSIER_PRIVE/rne03_triframe_private.pt')
```
L'archive privée remise au propriétaire conserve les poids entraînés, les scripts exacts de ce cycle et les résultats détaillés agrégés. La CI publique n'a accès à aucun vrai fichier d'entraînement.

## Priorités de suite
1. **Tests hors-domaine et mouvement réel** : tests visuels de scintillement, ghosting, coupes, occultations, visages, grain et compression native. Mesures du coût CPU/énergie sur durées longues.
2. **Aiguillage non régressif** entre bicubique / RNE 0.1 / 0.2 / 0.3, sans oracle connaissant la vraie référence. Pas d'activation automatique avant validation sur groupes supplémentaires.
3. Version **RNE 0.4** : plusieurs échelles, confiance apprise, régularisation temporelle contrôlée, données calibrées et recul des régressions.
4. Portage WebGPU/WASM et test sur vrai Safari iPhone 15 Pro Max, ou traitement distant **seulement avec consentement de transfert séparé**.
5. Préserver la priorité des **filtres AR**, et recueillir des masques humains vérifiés, sans entraîner sur des pseudo-masques comme vérité terrain.

Aucun modèle NVIDIA DLSS 5 n'a été intégré. RNE est un moteur de recherche propre à RetoucheProAI, à ne pas présenter comme équivalent en qualité ou en vitesse.
