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

## Essais du 22/11/2026 — rien de retenu (ne pas refaire sans idée nouvelle)
Même banc (LPIPS contre la vraie image ; modèle actuel 0,106 sur 20 images, 0,0943 sur 30 images de séquences) :
- **Affinage du modèle sur un vrai codec vidéo** (`ft_paires_video.py`, `ft_affinage.py`) : 366 paires tirées de 13 vidéos libres
  (réduites ×2, H.264 CRF 20–34 avec images P/B, bruit parfois), vidéos du banc exclues. L1+0,2 LPIPS, 2e-5 : 0,116 → 0,114 ;
  0,1 L1 + LPIPS, 5e-6 : 0,1135. Toujours moins bon que le départ : trop peu de données pour améliorer un modèle déjà bien entraîné.
- **Gros modèle** 2xNomosUni_esrgan_multijpg (RRDB, 33 Mo) : 0,1024 (−3 %) mais 5,4 fois plus lent : inutilisable sur iPhone,
  gain trop faible pour ajouter un second moteur sur Kaggle.
- **Fusion de plusieurs images avant l'IA** (`sequences.py`, `fusion_temporelle.py`, alignement par flux optique, poids selon
  l'erreur) : ±1 image 0,0980, ±2 images 0,0989 contre 0,0943 sans fusion : l'alignement imparfait floute plus qu'il ne débruite.
Conclusion : sur le téléphone, le modèle actuel est au plafond de ce qu'on sait mesurer ; le prochain vrai saut passe par un modèle
vidéo (SeedVR2, « Moteur Cinéma » sur Kaggle) et par les mesures sur l'iPhone.

## v10.1 — IA en cascade pour les grands agrandissements (retenu)
`cascade.py` : vérité 1280×720 (4 vidéos 1080p libres, 8 images × CRF 24/30), entrée 320×180 (×4). LPIPS :
bicubique ×4 0,3484 · IA ×2 + bicubique ×2 (avant) 0,2698 · + Lanczos 0,2736 · + netteté 0,2818 · IA sur bicubique ×2 0,2918 ·
**IA ×2 puis IA ×2 0,2578** ; mélange des deux à 50 % 0,2597, 75 % 0,2600, 125 % 0,2749. En ×3 (vérité 960×540) :
0,2480 → 0,2335 (cascade ×4 puis réduction). Seuil retenu : ×2,6.

## v10.2 — petit réseau dédié à la 2e passe (retenu : `sr2.bin`)
`casc_donnees.py` (train : 13 vidéos Intel hors banc + 30 vidéos Pexels, 310 images ; val : 10 autres vidéos Pexels, 20 images ;
HR ≤ 960 px → ×¼ (filtre au hasard, bruit parfois) → H.264 CRF 20–33 → 1re passe de l'app = MID), `casc_entrainer.py NF NC IT [lr]`
(MID → HR, L1 + 0,3 LPIPS, patchs 48 px), `casc_export.py` (→ sr2.bin, écart avec PyTorch ≤ 1 niveau).
LPIPS banc cascade.py / val Pexels : sans cascade 0,2698 / 0,3181 · grand réseau ×2 (v10.1) 0,2578 / 0,2975 ·
**nf32 nc8 (750 itérations) 0,2113 / 0,2809**, PSNR 32,51 / 29,78 · nf16 nc8 0,2188 / 0,2816 · nf32 lr 2e-4 0,2114 / 0,2824.
Au-delà de ~1500 itérations le score remonte (peu de données) : on garde le meilleur point.
