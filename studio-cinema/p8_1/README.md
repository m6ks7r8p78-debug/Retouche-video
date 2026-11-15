# Retouche Cinema P8.1 — Cadence et provenance (15 novembre 2026)

## Résultat livré

`RetoucheCinema_P8_60fps_iPhone.mp4` : H.264 Constrained Baseline 720×540, 60 i/s constant, AAC-LC silencieux, `faststart`, 8,3167 secondes, 499 images décodées sans erreur par FFmpeg.

Source : **16 images originales fictives en GIF**, chaque pose dure environ 520 ms, soit **1,923 pose originale par seconde**. Les 483 autres images vidéo sont interpolées/retenues à partir des mêmes 16 poses. La sortie 60 i/s n'implique **aucune amélioration vérifiée de la bouche, des joues ou de la main**. Une nouvelle génération de mouvements réels reste nécessaire.

## Commande portable

```bash
python render_60fps.py --source chemin/vers/spritesheet_fiction_16_images.gif --output rendu.mp4 --fps 60
```

Pré-requis : Python, Pillow, numpy, opencv-python, FFmpeg, FFprobe. En alternative, `--fps 45` est pris en charge.

## Validation

- `ffprobe` : flux H264 60/1, 499 images, audio AAC-LC.
- `ffmpeg -xerror -i video.mp4 -f null -` : décodage complet sans erreur.
- `python -m unittest -v test_render_60fps.py` : deux tests réussis, incluant un test avec GIF synthétique rendu à **45 et 60 i/s**, métadonnées de provenance vérifiées.
- Aucun média privé, aucune donnée des 157 vidéos, aucun entraînement de réseau neuronal et aucune exportation vers un fournisseur distant.

## Recommandation

Le futur moteur vidéo doit produire **45 à 60 mouvements cohérents et nouveaux par seconde** (ou un modèle temporel natif qui les produit), avec contrôle anatomique de la bouche, des joues, de la prise de la cigarette et de la fumée. L'interpolation peut être utilisée comme optimisation **après** l'obtention de mouvements suffisamment détaillés ; elle ne doit jamais remplacer la génération des micro-actions manquantes.

L'évaluation sur Safari physique iPhone et la qualité visuelle subjective ne sont pas validées par ces essais informatiques.