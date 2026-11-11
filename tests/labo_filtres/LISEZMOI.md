# Laboratoire des filtres (F15)

- `noyau.py` : repères MediaPipe (478 points), filtres simulés (grands yeux, visage et nez affinés, lissage, maquillage, museau et
  moustaches de chien, nez et moustaches de chat), reconstruction guidée par une photo sans filtre, finition GFPGAN.
- `labo.py` : 12 paires (deux photos différentes de la même personne, domaine public NASA, `paires/sources.json`) × 7 filtres.
  Chaque expérience garde original, photo filtrée, masque exact, paramètres, résultat, carte et mesures (`tests/sorties/labo_filtres/`).
  `SEULEMENT=aucun,chien PYTHONPATH=tests/visage_ia/faux python3 tests/labo_filtres/labo.py`
- `face_landmarker.task` : modèle MediaPipe (Apache-2.0), SHA-256 64184e22…bc9ff.
- Résultats et décisions : `REGISTRE_LIVRAISON_PERMANENT.md`, fiches F11, F12, F15, F29.
