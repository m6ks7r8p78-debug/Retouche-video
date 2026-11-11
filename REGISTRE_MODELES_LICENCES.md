# Registre des modèles et licences (v6.6)
Empreintes calculées sur les fichiers de l’archive. Licences : celles des fichiers `LICENSE-*.txt` du dépôt ; **non revérifiées à la source dans cette session** — à confirmer avant tout usage commercial élargi.

| Fichier | Rôle | Licence déclarée | SHA-256 |
|---|---|---|---|
| `sr.bin` | super-résolution | Real-ESRGAN (BSD-3-Clause) | `96811c8c90fcc4c373706cb528508d63cdb8780a00a37a7da37c8894c72b8e46` |
| `modeles/edgetam_encodeur.onnx` | sélection au toucher | EdgeTAM (Apache-2.0) | `ed068218eba96760fe02d04ce899c449660ac813a088d80ed7f42c8bb01e7cec` |
| `modeles/edgetam_decodeur.onnx` | sélection au toucher | EdgeTAM (Apache-2.0) | `d3668299ec3edf70fbb139ec642b54bf3d4be453fd1b688a6b5938e0856fe546` |
| `filtres.png` | tables de couleurs apprises | interne | `804891ac561e22c02d9873afd39a53b96b075ba57ee5b48e9351628fdd063ed4` |
| `rnnoise.mjs` | débruitage voix | rnnoise-wasm | `05a553f523d59502d133a6d05dbf1878137c9e7bcff06edf5561f7001b62f95f` |
| `modeles/lourds/gfpgan14_int8w.onnx` (v6.9, téléchargé à la demande) | restauration des visages | GFPGAN v1.4 (Apache-2.0 déclarée ; voir ci-dessous) | `40407c8037bd34a7718b9ea60257354c87eafecd6845aa98951dd760a5b33ff9` |
| `mp4-muxer.js` | conteneur MP4 | mp4-muxer (MIT) | `bba88082053511b898c921e71a865478821a674d779ba0c7028c78c921fecaf6` |
| `modeles/yunet.onnx` | repérage du visage (boîte + 5 repères), v6.8 | MIT — `LICENSE-YuNet.txt`, source : OpenCV Zoo `face_detection_yunet_2023mar.onnx` (fichier identique sur le dépôt GitHub et sur Hugging Face `opencv/face_detection_yunet`) | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` |

MI-GAN (effacement) : téléchargé à la demande, voir `MODELES.md` / `LICENSE-MI-GAN.txt`.

## Évalués, non intégrés
SwinIR, HAT, BasicVSR++, RVRT, restauration de visage (GFPGAN/CodeFormer) : non intégrés. Raisons : poids de plusieurs dizaines à centaines de Mo, pas d’export web validé sur Safari iOS, et licences de certains poids non commerciales (CodeFormer notamment) ou à vérifier. Aucun poids n’a été téléchargé.

## Restauration de visage (v6.8) : évaluée, non intégrée
GFPGAN et RestoreFormer : environ 300 Mo de poids, trop lourds pour Safari sur iPhone. CodeFormer : licence non commerciale, incompatible avec un site à abonnement. GPEN : licence non vérifiée. Aucun n’a été téléchargé ni intégré. Piste réaliste : GFPGAN sur le serveur facultatif (Kaggle), à tester sur une vraie carte graphique avant d’être proposé.

## Restauration de visage (v6.9) : intégrée en essai
GFPGAN v1.4 retenu après mesure (`REGISTRE_LIVRAISON_PERMANENT.md`, fiche F13). Poids officiels `GFPGANv1.4.pth` (SHA-256
`e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad`, release v1.3.0 du dépôt TencentARC/GFPGAN), exportés en ONNX
puis quantifiés int8 (86 Mo au lieu de 345 Mo, qualité mesurée identique) : la taille n'est donc plus bloquante. Licence vérifiée à
la source (`LICENSE-GFPGAN.txt`) : Apache-2.0 pour GFPGAN, **sauf composants tiers** dont StyleGAN2 (licence NVIDIA, recherche et
évaluation seulement) ; le modèle est entraîné sur FFHQ (CC BY-NC-SA 4.0). **Décision juridique requise avant tout usage
commercial** (publicité, abonnement, boutiques). CodeFormer reste exclu (licence S-Lab non commerciale).
