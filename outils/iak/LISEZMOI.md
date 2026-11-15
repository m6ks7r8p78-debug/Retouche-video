# Banc v8.3 — fidélité, épreuve de vérité, IA par images clés

Reproduire (Python 3, numpy, opencv, torch CPU, lpips) :
- `ref_ia.py VIDEO SORTIE.npz N` : IA de l'app (sr.bin, Real-ESRGAN general v3) sur chaque image, sur processeur.
- `banc_verite.py` / `lp.py SORTIE.npz` : bicubique, IA complète, IA + verrou, IA clés (K8), IA clés + verrou, contre la vraie image
  (vidéo HD réduite ; LPIPS AlexNet, plus bas = mieux ; PSNR).
- `epreuve.py *.npz` : épreuve de vérité (extrait réduit ×2 puis reconstruit, comparé à l'extrait réel).
- `mesure_fidelite.py image.png` : écart de couleur (ΔE Lab) d'un aperçu de l'app contre l'image source.
- `iak.py` : prototype de référence de `iak.js` ; `verrou.py` : émulation du shader « verrou de fidélité ».

Résultats du 15/11/2026 : voir CHANGELOG v8.3. Aucune vidéo personnelle utilisée (médias de test libres du dépôt + captures d'écran
envoyées par le propriétaire pour le diagnostic des couleurs, non versionnées).
