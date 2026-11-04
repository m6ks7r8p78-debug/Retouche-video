# Modèles IA — fiches (v3.3)

Le registre qui fait foi est dans `models.js` (objet `REG`) : nom, version figée, rôle, taille, empreinte SHA-256, licence, source,
moteur, mémoire, limites, solution de secours. Fenêtre **🧠 Modèles IA** de l’app pour l’état sur l’appareil.
Historique des essais et mesures des versions précédentes : MODELES.md.

## Tous les modèles

| id | Modèle | Livré / téléchargé | Taille | Licence | Ajouté |
|---|---|---|---|---|---|
| `sr` | Real-ESRGAN general v3 (FP16) | livré (`sr.bin`) | 4,9 Mo | BSD-3-Clause | v2.48 |
| `depth` | Depth Anything V2 Small (ONNX int8) | téléchargé, rév. 4472b73 | 27,3 Mo | Apache-2.0 | v2.4x |
| `voix` | RNNoise | livré | 1,9 Mo | BSD-3-Clause | v2.3x |
| `filtres` | 25 tables de couleur | livré | 0,5 Mo | propre à l’app | v2.38 |
| **`migan`** | **MI-GAN 512 Places2, pipeline ONNX v2** | téléchargé, rév. 406830d | **28,1 Mo** | **MIT** (code et poids) | **v3.3** |
| **`edgetam`** | **EdgeTAM, encodeur d’image (float32)** | poids téléchargés, rév. 9c77c7b ; structure livrée | **19,5 Mo** + 0,2 Mo | **Apache-2.0** | **v3.3** |
| **`edgetam_dec`** | **EdgeTAM, encodeur de points + décodeur de masque (float32)** | idem | **21,0 Mo** + 0,2 Mo | **Apache-2.0** | **v3.3** |

## MI-GAN (effacement)

- **Source** : README officiel de Picsart AI Research (github.com/Picsart-AI-Research/MI-GAN), section « For Developers », qui renvoie au fichier
  `huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx` (dépôt de l’auteur principal). L’app utilise l’adresse figée sur la révision
  `406830d0fa60666da0071c342ad2fbc8f30c5c64`.
- **Empreinte** : `6f1f3530a1a2324b19752018ce756088b07973cda8d7d890034ace5c8a48c40b` (identique à l’empreinte LFS publiée par Hugging Face, 28 079 181 octets).
- **Licence** : MIT pour le code (`LICENSE`) **et** pour les poids (`LICENSE-WEIGHTS`), Copyright 2024 Picsart AI Research — copie : `LICENSE-MI-GAN.txt`.
  Jeu d’entraînement : Places2 (scènes) ; ses conditions concernent le jeu de données, pas les poids publiés.
- **Entrées / sorties** : `image` uint8 [1,3,H,W], `mask` uint8 [1,1,H,W] (255 = garder, 0 = reconstruire, binaire) → `result` uint8 [1,3,H,W].
  Le pipeline recadre autour du masque, travaille en 512×512, recolle. Opset 17, opérateurs standard (dont NonZero, ScatterND), exécutable par ONNX Runtime Web 1.22 (WebAssembly).
- **Ce que l’app ajoute** : recadrage préalable (zone + marge ≥ 96 px), élargissement du masque de 0,3 % du grand côté (contours flous de l’objet),
  recollage **seulement** des pixels du masque élargi (hors zone : identique au pixel près, testé), carte des pixels inventés, provenance.
- **Mesures (Chrome sans écran, processeur, 1 fil, pas un iPhone)** : 2,3 à 3,2 s par reconstruction, y compris sur une photo 12 Mpx (le calcul se fait à 512 px).
- **Le modèle complet `migan.onnx`** (sans recadrage, 29,5 Mo) a aussi été essayé : résultat semblable, mais il redimensionne toute l’image à 512 px ; non retenu.
- **WebGPU** : non utilisé. L’app embarque la version WebAssembly d’ONNX Runtime ; la version WebGPU ajouterait ≈ 20 Mo et le pipeline contient des opérations
  (NonZero, ScatterND) qui retomberaient sur le processeur. Avec 2–3 s mesurés en processeur, le gain ne justifie pas le poids ; à revoir après mesure sur iPhone.

## EdgeTAM (sélection au toucher)

- **Source** : Meta, `facebook/EdgeTAM` (Apache-2.0) → conversion Transformers `yonigozlan/EdgeTAM-hf` (Apache-2.0) → export ONNX `onnx-community/EdgeTAM-ONNX`
  (Apache-2.0), révision figée `9c77c7bff7fd0f3079585fa17af7f730ddc531ed`. Texte de licence : `LICENSE-EdgeTAM.txt`.
- **Fichiers** (empreintes identiques à celles publiées) :
  - `onnx/vision_encoder.onnx` → livré tel quel : `modeles/edgetam_encodeur.onnx` — `ed068218…7cec`
  - `onnx/vision_encoder.onnx_data` → téléchargé (`edgetam`) — `21e75dba…528e`
  - `onnx/prompt_encoder_mask_decoder.onnx` → livré tel quel : `modeles/edgetam_decodeur.onnx` — `d3668299…e546`
  - `onnx/prompt_encoder_mask_decoder.onnx_data` → téléchargé (`edgetam_dec`) — `dfa2125e…1be8`
- **Pourquoi EdgeTAM plutôt que SAM 2.1 tiny** : mêmes entrées/sorties, mais encodeur de 19,5 Mo contre 134 Mo (SAM 2.1 tiny, float32 ; 52 Mo en int8) ;
  conçu par Meta pour tourner sur téléphone. La version pleine précision est gardée (qualité) : les versions int8 / 4 bits de l’encodeur n’ont pas été évaluées.
- **Préparation exacte** : photo étirée à 1024×1024, normalisée (moyenne 0,485/0,456/0,406, écart 0,229/0,224/0,225) ; point touché ramené à l’échelle 1024 ;
  **un point de remplissage (0,0) d’étiquette −1 est ajouté** (sans lui, SAM 2 donne des masques faux — constaté : la cuillère touchée sélectionnait la soucoupe) ;
  des 3 masques proposés, celui au meilleur score est gardé ; le masque 256×256 est agrandi **avant** le seuil, puis seule la partie touchée est gardée et ses trous bouchés.
- **Mesures (Chrome sans écran, processeur, 1 fil, pas un iPhone)** : lecture de la photo 2,8 s (une fois par état de la photo), contour 0,3 s par toucher ;
  test : cuillère touchée → contour de 2,3 % de la photo, confiance 0,96, entièrement dans la cuillère.

## Écartés (licence ou matériel)

| Modèle | Licence vérifiée à la source (4 nov. 2026) | Raison |
|---|---|---|
| ProPainter (remplissage vidéo) | S-Lab License 1.0 — non commercial (`LICENSE` du dépôt sczhou/ProPainter) | licence ; 3 à 19 Go de mémoire GPU |
| CodeFormer (visages) | S-Lab License 1.0 — non commercial | licence ; ~350 Mo |
| CompleteMe (corps, avec référence) | CC BY-NC-SA 4.0 — non commercial (`LICENSE.md` du dépôt LIAGM/CompleteMe) | licence ; modèle à diffusion (GPU de plusieurs Go) |
| SAM 2.1 tiny | Apache-2.0 | utilisable, mais 7× plus lourd qu’EdgeTAM pour le même usage |
| LaMa (big-lama) | Apache-2.0 | meilleur sur les grandes zones mais ≈ 200 Mo ; candidat pour un traitement cloud facultatif, non intégré |
