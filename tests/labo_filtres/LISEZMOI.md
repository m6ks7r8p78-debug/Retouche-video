# Laboratoire des filtres (F15)

- `noyau.py` : repères MediaPipe (478 points), filtres simulés (grands yeux, visage et nez affinés, lissage, maquillage, museau et
  moustaches de chien, nez et moustaches de chat), reconstruction guidée par une photo sans filtre, finition GFPGAN.
- `labo.py` : 12 paires (deux photos différentes de la même personne, domaine public NASA, `paires/sources.json`) × 7 filtres.
  Chaque expérience garde original, photo filtrée, masque exact, paramètres, résultat, carte et mesures (`tests/sorties/labo_filtres/`).
  `SEULEMENT=aucun,chien PYTHONPATH=tests/visage_ia/faux python3 tests/labo_filtres/labo.py`
- `face_landmarker.task` : modèle MediaPipe (Apache-2.0), SHA-256 64184e22…bc9ff.
- Résultats et décisions : `REGISTRE_LIVRAISON_PERMANENT.md`, fiches F11, F12, F15, F29.

## v7.1 — détecteur v3 et veto « mains » (12/11/2026)
- `entrainer_ajouts_v3.py` : repart du v2 ; mélange visages publics (labo + NASA, `telecharger_nasa.py`, domaine public) avec éléments
  simulés, **vrais clips filtrés** (données PRIVÉES du propriétaire, jamais versionnées : `--prive X.npz`), et éléments réels découpés
  puis recollés sur d'autres visages. Validation croisée **par vidéo** (`--val`) : on entraîne sur une vidéo, on mesure sur l'autre.
  Reprise automatique après coupure (`<sortie>_reprise.pt`).
- Veto « mains » : MediaPipe Hand Landmarker (`hand_landmarker.task`, Apache-2.0, non versionné ici ; copie servie par l'app dans
  `modeles/lourds/mains/`). Une composante repérée posée à plus de moitié sur une main n'est pas effacée. Zone de la main : os des
  doigts épaissis (0,28 × poignet→majeur), paume, bout des doigts prolongé de 1,6 phalange (ongles longs).
- Les scripts d'évaluation sur les clips privés et les clips eux-mêmes restent hors du dépôt.
