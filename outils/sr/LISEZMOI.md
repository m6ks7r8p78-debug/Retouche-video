# Banc v9.5 — choix du modèle IA de l'app et de la mesure de l'épreuve de vérité

- `donnees.py` : 20 images de vérité (5 vidéos : 4 libres intel-iot-devkit/sample-videos CC BY 4.0 + video_portrait du dépôt), réduites ×2
  puis compressées en H.264 (CRF 24 et 30, comme un vieux téléphone) ; la vraie image est la version non réduite.
- `banc_sr.py MODÈLES…` : LPIPS (AlexNet), PSNR, avec et sans verrou de fidélité, temps processeur.
- `accord.py` : l'épreuve de vérité (extrait réduit ×2 puis reconstruit, comparé au réel) prédit-elle le vrai gain ? SSIM / LPIPS / GMSD.

Résultats (21/11/2026), LPIPS plus bas = mieux :
| modèle | LPIPS | PSNR | s/image (2 cœurs) |
|---|---|---|---|
| agrandissement simple | 0,172 | 33,70 | 0 |
| Real-ESRGAN general v3 (ancien modèle de l'app) | 0,114 | 33,90 | 2,59 |
| **2xNomosUni_compact_multijpg (retenu)** | **0,106** | 33,58 | **1,21** |
| 2xNomosUni_compact_multijpg_ldl | 0,106 | 33,45 | 1,26 |
| 2xNomosUni_span_multijpg | 0,109 | 29,73 | 1,10 |
| 2xNomosUni_span_multijpg_ldl | 0,111 | 31,68 | 1,14 |
| 2xNomosUni_compact_otf_medium | 0,133 | 31,40 | 1,31 |

Accord de l'épreuve avec le vrai gain (20 cas) : avec l'ancien modèle et le SSIM (v8.3) : 4/20 — l'IA était retirée presque
toujours, même quand elle aidait ; avec le nouveau modèle : SSIM 12/20, LPIPS 18/20, **GMSD 19/20 (retenu, calculable sur iPhone)**.
Conversion : `sr.bin` = poids ×2 posés dans la grille ×4 du moteur (chaque point ×2 recopié en bloc 2×2) — sortie identique au
modèle d'origine (écart 0), 16 couches au lieu de 32.
