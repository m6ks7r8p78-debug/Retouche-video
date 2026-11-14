# Retouche Neural Engine (RNE) v0.1 — notre propre moteur vidéo neuronal

**État au 14 novembre 2026 :** prototype réel, indépendant, exécutable en Python local avec PyTorch + OpenCV + FFmpeg facultatif. **Pas de SDK NVIDIA, pas de DLL/poids propriétaires, pas de résultat DLSS 5 revendiqué.** Aucune activation dans la PWA Safari, aucun déploiement ni fusion sur `main`.

## Objectif
Créer notre moteur de traitement vidéo 2D, inspiré des **problèmes techniques** du neural rendering moderne (stabilité temporelle, fidélité structurelle, budget de calcul, contrôle des zones), et non copier le code, les modèles ni la marque DLSS. DLSS 5 NVIDIA repose sur des buffers d'un moteur 3D et sur des vecteurs de mouvement moteur que nos vidéos importées n'ont pas. Le RNE doit estimer ces informations à partir des images.

## Ce qui fonctionne effectivement dans RNE 0.1
- **Modèle neuronal entraînable maison** `RNE2x`, 13 692 paramètres : convolutions 3×3, sortie PixelShuffle ×2, prédiction résiduelle bornée par rapport à l'interpolation bicubique, chrominance de référence protégée.
- **Traitement réel frame par frame** de fichiers vidéos locaux ; blocs avec marge pour borner la mémoire ; sortie 2× la résolution, conservation de l'original ; MP4 vidéo encodée et piste audio recopiée/convertie localement par FFmpeg quand possible.
- **Cohérence temporelle causale :** flux optique arrière Farneback entre frame courante et précédente (aucune frame future), détection conservatrice de rupture, pondération fondée sur la concordance photométrique ; images strictement identiques réutilisées sans jitter.
- **Zones protégées** : le masque facultatif conserve exactement les pixels de la référence bicubique hors de la zone éditable, y compris en présence d'historique.
- **Modes de repli :** sans poids privés fournis, traitement bicubique + temporel seulement, jamais présenté comme de l'IA entraînée.
- **Confidentialité :** aucun réseau ; `torch.load(..., weights_only=True)` ; vérification de la structure des poids ; refus de sortie média dans un checkout Git. Le script d'apprentissage exige indicateurs de consentement privé, empreintes SHA-256, groupes de scène disjoints et dossier de sortie extérieur à un dépôt.
- **17 tests locaux réussis** : forme des sorties, déterminisme, zones protégées, coupes, vidéo MP4 vraiment décodable, poids valides/invalides, absence d'écrasement, consentements, entrées invalides.

Fichiers : `outils/rne/engine.py`, `outils/rne/train.py`, `tests/test_rne_engine.py`.

## Premier entraînement privé
Le modèle RNE a été **initialisé de zéro** (pas de poids NVIDIA ni de modèle générique réutilisé) et entraîné sur des paires haute/basse résolution obtenues par dégradation synthétique d'images de vidéos autorisées et intactes dans la Bibliothèque privée ChatGPT.

| Partition | Clips distincts | Frames sources |
|---|---:|---:|
| Apprentissage | 12 | 24 |
| Validation | 4 | 8 |
| Test séparé | 5 | 10 |

La séparation repose sur les groupes « isolé » du catalogue privé ; ces groupes sont des **heuristiques**, pas des preuves de scènes indépendantes universelles. Les références d'image peuvent déjà être filtrées ou compressées. Chaque image source produit plusieurs petits patchs, avec sous-échantillonnage ×2, JPEG et bruit simulés. Consentements et empreintes des fichiers vérifiés localement ; aucun nom, média, image, empreinte, poids entraîné, manifest privé ou résultat individuel dans GitHub.

- Essai initial : 160 étapes, fonction de perte L1 ; 40 patchs de test : **−0,0188 dB** vs interpolation bicubique. **Écarté**.
- Nouvelle version : **900 étapes, MSE**, batch 12, paramètres 13 692 ; validation sur 32 patchs : bicubique **35,0616 dB**, RNE **35,6231 dB** (+0,5615 dB).
- Test sur **40 patchs** (5 vidéos) : bicubique **37,4311 dB**, RNE **37,5269 dB** (**+0,0958 dB** en moyenne). Le premier essai ayant déjà regardé ce lot, il s'agit d'une **contre-évaluation exploratoire**, pas d'un test final scellé vierge de toute sélection d'hyperparamètres.
- Un clip **entièrement synthétique de 24 frames** (128×96, 12 fps) a effectivement été converti en 256×192, 24 frames, flux temporel actif sur 23 transitions, sans défaillance de décodage. Sur cette très petite taille, le CPU a pris environ 0,47 s pour 24 images, **ce qui ne permet aucune extrapolation à 4K**, mobile ni vidéo réelle.

**Décision de recherche :** poids RNE conservés **privés et non déployables**, aucune intégration PWA avant preuve substantielle de qualité et tests d'appareil. Les améliorations perceptuelles, visages, textures difficiles et cohérence naturelle n'ont pas été validées.

## Exécution dans un environnement Python équipé
Dépendances : Python 3.11+ avec `torch`, `numpy`, `opencv-python` et, facultativement, `ffmpeg` pour les pistes audio. Pas d'appel réseau pendant le traitement.

```bash
python outils/rne/engine.py entree.mp4 sortie_2x.mp4 --weights /CHEMIN_PRIVE/rne_2x_prive_non_deployable.pt
python -m unittest discover -s tests -p test_rne_engine.py -v
```

Le modèle personnel n'est **jamais fourni dans le dépôt public**. Pour un essai sans modèle : retirer `--weights` ; l'export utilisera l'agrandissement bicubique avec suivi temporel, et indiquera clairement qu'aucun modèle neuronal n'a été chargé.

L'entraînement reproductible exige un manifest JSON **privé**, contenant `path`, `group`, `split`, `sha256`, `private_training_consent` et `private_evaluation_consent` pour chaque vidéo. Ce manifest doit résider hors Git.

```bash
python outils/rne/train.py --manifest /DOSSIER_PRIVE/manifest.json --out /DOSSIER_PRIVE/poids --private-training-authorized --steps 900 --batch 12
```

## Architecture cible : RNE 1 → RNE 5 (feuille de route, **non implémentée**)
1. **RNE 1 :** super-résolution ×2 locale et causalité simple — **prototype réalisé**.
2. **RNE 2 :** réseau temporel réellement entraîné avec estimation confiance/occlusion, flux fiable et pertes de stabilité inter-frame ; benchmark scènes naturellement mobiles.
3. **RNE 3 :** spécialiste adaptatif compression / bruit / visages / mouvements, sous contrôle du Directeur IA et avec modèles de repli sûrs.
4. **RNE 4 :** reconstruction d'apparence et éclairage **facultative**, entraînement distinct et licence de données adaptée ; contrôle fidélité / créativité / géométrie et identification des pixels inventés.
5. **RNE 5 :** moteur adaptatif haute résolution GPU/serveur local ou cloud privé opt-in, WebGPU / WASM iPhone selon capacités validées, export 4K/8K seulement si mesures et mémoire le permettent.

**Ne jamais appeler RNE « DLSS 5 » dans l'interface utilisateur** ni prétendre atteindre ses performances. Une technologie indépendante ne peut pas garantir une véritable inversion d'un filtre ou récupérer des détails définitivement occultés.

Sources officielles du cadrage comparatif : https://research.nvidia.com/labs/adlr/DLSS5/ ; https://developer.nvidia.com/blog/whats-new-for-game-developers-dlss-5-with-3d-guided-neural-rendering-nvidia-ace-updates-and-new-rtx-kit-capabilities/
