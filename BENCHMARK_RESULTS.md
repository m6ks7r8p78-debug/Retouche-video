# Résultats des bancs et journal d'expériences — Directeur IA

Seuls des résultats réellement exécutés figurent ici. Des expériences privées distinctes ont été effectuées chez ChatGPT sur les vidéos autorisées du catalogue, avec consentements contrôlés localement ; elles ne sont ni accessibles automatiquement à Claude, ni reproductibles par la CI publique. Seuls les agrégats non identifiants figurent dans GitHub. Les métriques sur incrustations AR simulées ne constituent pas une validation de vrais filtres AR.

## Résultats constatés (branche `chatgpt-ai-director-v01`)

| date | banc | données | résultat | limites |
|---|---|---|---|---|
| ≤ 13 nov. 2026 | A/B adaptatif vs global (`directeur-browser.test.mjs`) | 1 vidéo synthétique bruitée/propre | 18 images décodées sur 90 différentes ; protection de netteté non déclenchée (écart de bruit insuffisant) | synthétique ; aucune mesure perceptuelle |
| ≤ 13 nov. 2026 | laboratoire 1D (`directeur-laboratoire.cjs`) | 18 cas train / 18 validation synthétiques | gain sur validation, 0 famille dégradée > 5 % | signal 1D : ne prouve rien sur vraie image |
| ≤ 13 nov. 2026 | export 8K hors navigateur (`directeur-8k.test.mjs`) | 1 image vidéo synthétique + audio | 7680×4320 H.264 + AAC vérifiés par ffprobe | Lanczos : aucun détail recréé ; pas d'iPhone |
| 14 nov. 2026 | catalogueur (`catalogue_medias_test.py`) | 6 médias synthétiques | 16/16 : SHA-256, doublon exact, réencodage 160×120 rapproché, bruit +45 mesuré > +3 σ, partition sans fuite, consentements, refus d'écriture dans Git, export accepté par `directeur-banc-reel.cjs` | seuils non calibrés sur corpus réel |
| 14 nov. 2026 | **retrait de filtre AR, vrai module de l'app** (`tests/banc_filtres_app.mjs`, Chrome, vrais modèles YuNet / détecteur v3 / MI-GAN / GFPGAN) | 8 vidéos 480×640, 36 images, portraits NASA × filtres simulés chien / chat / éléments au hasard | part de l'erreur du filtre supprimée : chien 0,66 / 0,64 / 0,29 ; hasard 0,49 / 0,37 / 0,51 ; **chat 0,00 / 0,02** ; scintillement réduit dans 8/8 ; LPIPS tête amélioré dans 8/8. Normalisé : qualité 0,37, **échecs 62,5 %**, gravité 0,77 | synthétique ; GPU simulé ; pas de vrais filtres Snapchat ; pas d'iPhone |
| 14 nov. 2026 | `tests/rfv.test.mjs` (non-régression du module) | `filtre_video.mp4` | run 1 : 6/7 (fondu entre reconstructions : saut non réduit) ; run 2 : 7/7 ; fondu isolé, 4 essais : saut 8,9 → 3,1 (réussi) | échec intermittent non reproduit : à surveiller |
| 14 nov. 2026 | priorisation (`directeur-priorites.test.mjs`) | cas construits | 7/7 ; état réel : toutes qualités inconnues → action « mesurer », filtres AR en tête | aucune mesure réelle encore |

## Journal d'expériences

- **E-2026-11-14-01** — Catalogueur : dHash 9×8 par échantillon, distance moyenne symétrique. Sur mires testsrc2,
  `blocs_8x8` vaut ≈ 2,4 même en CRF 15 (motif aligné sur la grille) → seuil 1,25 à recalibrer sur vidéos réelles.
- **E-2026-11-14-02** — Priorisation : première version, la faisabilité modulait aussi le classement des modules non
  mesurés (débruitage passait devant filtres AR). Corrigé : sans mesure, l'ordre suit l'importance seule.

- **E-2026-11-14-03** — Banc multi-cas du retrait de filtre AR dans l'app. Résultat principal : le filtre « chat »
  (petit nez rose + moustaches blanches fines) n'est **pas retiré en vidéo** (retrait 0–2 %), alors que l'outil photo
  atteignait 77 % de rappel. Diagnostic (détecteur seul, `banc_video.py`) : sur la séquence vidéo, probabilité ≈ 0 dans la
  zone du filtre chat (p07, p11) ; sur image fixe 75 px entre les yeux, rappel 56–97 % sans compression, mais p07 tombe à
  0 % dès JPEG 60 ou bruit σ 2,5 ; p11 détecté sur image fixe compressée (73–84 %) mais pas sur la séquence (rotation ±6°,
  zoom ±8 %). **Le goulot est le détecteur (robustesse compression / pose / petits éléments clairs), pas la reconstruction.**
- **E-2026-11-14-04** — Priorisation : un module mesuré faible (filtres AR) passait derrière des modules inconnus (score
  d'inconnu 0,5 non modulé). Corrigé : modulation constante 0,6 pour l'inconnu ; filtres AR → « améliorer » en tête.

## Jalon ChatGPT : segmentation AR v4 et neural rendering (14 nov. 2026)

- **AR v4, entraînement privé** : poursuite du segmentateur antérieur pendant 180 étapes sur 12 vidéos autorisées comme fonds, 4 fonds de validation indépendants de ce nouveau cycle ; 96 cas d'effets procéduraux compressés/bruités/rotés. IoU chat 0,0963 → 0,3792 ; chien 0,0205 → 0,3371 ; lunettes 0,0707 → 0,1747. Faux positifs témoins : 35,3973 % → 0,2838 %. **Pas de vérité terrain de vrais filtres AR**.
- **Contre-évaluation scellée** : trois autres vidéos, 72 cas synthétiques, IoU chat 0,1025 → 0,2893 ; chien 0,0398 → 0,2226 ; lunettes 0,0468 → 0,0880 ; faux positifs après ajustement **1,4594 %**, au-dessus du seuil 1 %. **Candidat non admissible à l'activation**, sans essais iPhone ni masques corrigés. Ces vidéos sont indépendantes du nouvel ajustement, mais pas forcément de l'ancien préentraînement.
- **DLSS 5 — étude documentaire seulement** : principes de rendu neuronal guidé par structure/mouvement/état causal et contrôle de masques. Le SDK NVIDIA DLSS 5 n'est pas public au 14 novembre 2026, et les buffers d'un moteur de jeu manquent aux vidéos 2D de Safari iPhone. Aucune implémentation NVIDIA ni qualité de rendu mesurée. Voir `RECHERCHE_DLSS5_ET_AR_V4.md`.
- **Garde-fous** : `outils/directeur-garde-fou-neural.cjs` et 18 tests Node synthétiques réussis localement. Le module refuse la promotion du segmentateur AR v4 et ne fait aucune inférence, reconstruction, publication ou activation. Résultat des deux jobs de CI distante à confirmer après commit.

## Jalon ChatGPT — calibration AR v4 et fusion causale temporelle (14 nov. 2026)

- **Calibration par validation, sans réentraînement** : seuil AR v4 conservé à **0,50** sur 4 groupes / 96 cas d'incrustations synthétiques. Confirmation sur **5 autres groupes / 120 cas synthétiques** : IoU « chat » ancien **0,14895**, v4 **0,36219** ; pixels positifs sur témoins sans ajout AR **28,9299 % → 0,2718 %**. La confirmation précédente sur 3 scènes avait donné **1,4594 %** pour le modèle v4 : robustesse non démontrée sur tous les contenus. Les fonds peuvent déjà contenir de véritables effets ; « sans ajout » ne prouve pas « sans filtre ».
- **Stabilité temporelle en vidéo 2D simulée** : 4 groupes / **288 images** pour sélectionner un coefficient de fusion causale de **0,45** ; 5 autres groupes / **360 images synthétiques** pour confirmer. Flux optique arrière OpenCV Farneback estimé à partir du passé ; variation temporelle des probabilités **0,007026 → 0,003536** (−49,67 %) ; IoU **0,270691 → 0,266382** ; pixels positifs sur témoins **0,1503 % → 0,1381 %**. Ces séquences sont des translations synthétiques sur fonds de vrais clips, **pas des mouvements naturels filmés**. Aucun SDK NVIDIA DLSS 5.
- **Code expérimental** : `outils/directeur-fusion-temporelle-ar.cjs` + **17 tests Node réussis localement**. Ce module ne calcule pas son propre flux : il fusionne des cartes numériques fournies par un estimateur externe, limite les zones autorisées et rejette les transitions incertaines. Aucun branchement au moteur de rendu iPhone ; CI distante à vérifier.
- **Limites** : aucune annotation de filtre réel vérifiée, pas de récupération prouvée des pixels occultés, pas de test appareil Safari, et possible exposition historique des fonds au préentraînement initial. Détails : `LABO_AR_V4_FUSION_TEMPORELLE.md`.

## RNE 0.2 — vrai réseau temporel, prototype non déployable (14 novembre 2026)

- 12 vidéos privées autorisées (24 paires consécutives) pour entraîner un correcteur temporel de **9 244 paramètres** sur le modèle RNE 0.1 gelé ; 600 étapes. Les entrées LR ont une dégradation **synthétique**.
- 4 vidéos de validation, 32 patches : PSNR RNE 0.1 35,07790 dB → RNE 0.2 **35,28490 dB** (+0,20700 dB).
- 5 vidéos de test exploratoire déjà utilisées comme groupe de test RNE 0.1, 40 patches : **36,06042 → 36,22694 dB** (+0,16652 dB), 30/40 patches améliorés.
- **4 autres vidéos jamais utilisées pour le choix de RNE 0.1 ou 0.2 dans ce cycle**, groupes catalogués isolés et SHA vérifiés ; 48 patches synthétiques. Bicubique **37,13346 dB**, RNE 0.1 **36,64589 dB**, RNE 0.2 **36,92373 dB**. Gain RNE 0.2 vs RNE 0.1 : **+0,27784 dB** ; mais **−0,20973 dB vs bicubique**, une régression de plus de 0,5 dB sur 48 patches.
- **36/36 tests Python CPU locaux** des versions RNE 0.1 + 0.2 et export MP4 de démonstration **entièrement synthétique** (24 frames, 256×192) lisible. Résultats GitHub Actions distants à confirmer.
- Pas d'évaluation qualitative sur images de vrais filtres AR, pas de vrais détails perdus prouvés, pas de benchmark temps réel 4K/8K ou Safari iPhone. Le code public ne contient ni vidéos privées ni poids entraînés. Voir `RETOUCHE_NEURAL_ENGINE_02.md`.

**Décision : RNE 0.2 reste expérimental et n'est pas activé dans l'application.** Une meilleure comparaison au modèle initial ne suffit pas si le témoin bicubique reste meilleur.

## À produire ensuite

1. Catalogue privé de 157 vidéos déjà consolidé côté ChatGPT : exploiter les groupes et les consentements vérifiés, sans partager médias, chemins ou empreintes.
2. Détecteur d'éléments AR v4 (expérimental) : réentraînement avec compression JPEG 40–90, bruit, rotation ±10°, zoom,
   visages petits, éléments clairs et fins ; critères : chat ≥ 50 % de retrait en vidéo, chien/hasard sans recul, vidéo sans
   filtre inchangée ; puis validation sur les 74 vrais clips Snapchat privés (validation croisée par vidéo) avant intégration.
3. Banc filtres beauté (lissage, maquillage, déformations) — aujourd'hui sans mesure.
