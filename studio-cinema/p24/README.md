# Cinema P24 — qualité temporelle H.264 après décodage (synthétique)

**PR expérimentale isolée, issue de P23.** Aucune modification de `main`, AURA, NOVA, SmallMotion, registres de coordination ni de retoucheproai.com. Aucun fichier personnel, modèle privé ou vérité terrain réelle.

## Pourquoi

P23 lisse les traits des lèvres et de la langue dans **les images vectorielles avant compression**. L'encodeur H.264 peut lisser, déplacer ou masquer ces petits détails et introduire des différences d'image à image. La validation P23 ne suffisait pas à établir ce qui subsiste **après décodage réel du MP4**.

## Développement réel

`src/p24_h264_audit.py` conserve le film P23 généré par les vrais moteurs P19/P21/P22/P23 (8 secondes, 60 i/s, 720×720, H.264/AAC). Il encode aussi une vidéo témoin de **480 dessins P19 originaux**, avec les **mêmes paramètres vidéo H.264** (libx264, yuv420p, CRF 25, preset ultrafast, 60 i/s). Ensuite il décode **les deux vidéos par FFmpeg** en pixels BGR 8 bits, une image à la fois, sous mémoire bornée.

Pour chacune des 480 images, le module compare :
- les différences de pixels bouche P23 vs P19 **avant compression**;
- les différences P23 vs P19 **après compression et décodage**;
- les erreurs de couleur du décodage P23 vs sa propre image vectorielle originale;
- la différence temporelle supplémentaire causée par le codec, sur les **479 transitions** successives;
- les pixels distincts aux quatre pics de geste après décodage;
- les différences résiduelles quand aucun geste P21 n'était dessiné;
- les éventuels artefacts **en dehors de la zone bouche** aux pics, sans présumer que la compression préserve une région strictement locale.

**Important :** comparer deux encodages séparés peut créer un résidu même dans une image où les traits source sont identiques, du fait des prédictions temporelles et des macroblocs. Le rapport quantifie ce phénomène au lieu de prétendre « zéro pixel modifié hors bouche » après compression.

`ffprobe` vérifie les 480 images, la cadence exacte 60/1, le H.264, la résolution 720×720, la durée de 8 s et la piste **AAC synthétique conservée** dans P23. La vidéo témoin P19 doit au contraire être sans audio.

Le rapport anonymisé `p24_h264_temporal_report.json` est un diagnostic technique seulement. **Ni un score de naturel humain, ni une qualité perceptive calibrée, ni une autorisation de restauration automatique.**

## Exécuter

```bash
python -m pip install 'numpy<3' 'opencv-python-headless>=4.9,<5'
node studio-cinema/p22/src/build_p22_controls.cjs studio-cinema/p22/results/controls.json
python studio-cinema/p23/src/temporal_blend.py --data studio-cinema/p22/results/controls.json --out studio-cinema/p24/results/proof --render-preview
python -m unittest discover -s studio-cinema/p24/tests -p 'test_p24_unit.py' -v
python studio-cinema/p24/src/p24_h264_audit.py --data studio-cinema/p22/results/controls.json --movie studio-cinema/p24/results/proof/P23_temporal_blend_synthetic_60fps.mp4 --out studio-cinema/p24/results/proof
```

La CI `.github/workflows/ci-cinema-p24.yml` exécute également les tests hérités P15–P23, installe FFmpeg si nécessaire et produit un rapport JSON de preuve sans y inclure la vidéo personnelle d'un utilisateur.

## Portée / limites

- `synthetic_codec_measured` signifie **480 images correctement comparées** et chaque pic de geste encore représenté par au moins un pixel différent du témoin. Il ne signifie **pas** que ces gestes sont assez visibles à l'œil ou naturels. En cas de disparition totale, retour `review_required_lost_gesture`.
- Les chiffres H.264 CRF25 varient avec l'encodeur, la plateforme et la configuration. Cette première étude n'évalue pas encore les profils export X, H.265/HEVC ni HDR.
- Aucun test de lecture **dans Chromium, WebKit ou Safari iPhone physique** n'est implicite dans une vérification hors-ligne avec FFmpeg. Un banc navigateur séparé sera nécessaire.
- Les tests ne mesurent pas la respiration vraie, les lèvres humaines, la physiologie, la régularité subjective des gestes ni la qualité d'un modèle neural.
- Pour NOVA, le rapport peut servir de **fixture synthétique** de validation codec; aucun moteur NOVA n'a été importé, et la vraie compatibilité reste indépendante.
- Pour AURA, pas de changement d'interface. Pour SmallMotion, aucune promotion d'un indice 2D en geste sémantique. Pour le Directeur IA, **résultat consultatif exclusivement**.
- Le registre commun est sous la responsabilité du coordinateur; les relais sont consignés dans la PR de ce laboratoire.
