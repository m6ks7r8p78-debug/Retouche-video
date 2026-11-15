# Cinema P26 — seconde compression H.264 sur 480 images fictives

**Statut : laboratoire expérimental, aucun média privé.** La branche `chatgpt-cinema-p26-recompression-20261115` hérite directement du travail P25. Aucun changement à `main`, retoucheproai.com, aux outils NOVA/SmallMotion/AURA ou aux documents de la branche commune.

## Pourquoi

P25 a comparé CRF 18/25/32 depuis deux sources **sans perte** (P19 original et P23 procédural avec quatre gestes). Cependant, une vidéo destinée au partage est souvent encodée à nouveau par un autre système. P26 ne simule **pas X** : il teste expérimentalement **une deuxième génération H.264 contrôlée**, uniquement avec des clips vectoriels entièrement synthétiques.

## Travaux réels

Le programme `src/p26_recompression.py` importe les **vrais** modules P19/P21/P23/P25 et leurs validations ; aucune copie simplifiée de leurs moteurs.

1. P25 génère les trois vidéos P23 fictives de **8 s, 60 images/s et 720×720**, aux CRF 18, 25 et 32. Audio AAC fabriqué de toutes pièces.
2. P26 réalise **neuf recompressions successives** : chaque première génération 18/25/32 est recompressée à CRF 18/25/32. Les paramètres de la seconde compression sont fixes : `libx264`, `yuv420p`, `ultrafast`, GOP 60, 60 i/s, 8 s.
3. **L'audio AAC est copié sans réencodage** via `-c:a copy`. Après chaque sortie, FFmpeg décode la piste sonore originale et la piste de sortie en **PCM mono 24 kHz s16le** et compare leurs SHA-256 et tailles. Toute différence est bloquante.
4. La première et deuxième génération sont **toutes deux décodées image par image**. P26 reconstruit chaque image P23 de référence avec les véritables moteurs du laboratoire, puis mesure l'erreur moyenne de couleur dans la bouche à chaque image, le **95e percentile**, les variations entre images et les quatre moments de pic des gestes.
5. Le rapport conserve également la taille de fichier de chaque encodage, la différence relative, le nombre exact des **480 images** et des **479 transitions**, et signale quand une nouvelle compression peut modifier la qualité même avec un CRF nominal inférieur.
6. Les huit sorties de référence secondaires restent en répertoire temporaire ; **un seul film fictif démonstratif CRF25 → CRF32** et un rapport JSON technique sont publiés en artefact CI à durée limitée.

## Reproduire

Depuis la racine du dépôt expérimental :

```bash
python -m pip install 'numpy<3' 'opencv-python-headless>=4.9,<5'
node studio-cinema/p22/src/build_p22_controls.cjs studio-cinema/p22/results/controls.json
python studio-cinema/p25/src/p25_crf_matrix.py --data studio-cinema/p22/results/controls.json --out studio-cinema/p25/results/proof
python -m unittest discover -s studio-cinema/p26/tests -p 'test_p26_contracts.py' -v
python studio-cinema/p26/src/p26_recompression.py --data studio-cinema/p22/results/controls.json --source-dir studio-cinema/p25/results/proof --out studio-cinema/p26/results/proof
```

Dépendances librement disponibles : Node 22, Python 3.11, NumPy, OpenCV, FFmpeg avec libx264/AAC/FFV1. La CI `.github/workflows/ci-cinema-p26.yml` réexécute les tests P15–P25 puis les nouveaux tests P26, recalcule la matrice complète et archive seulement **des preuves synthétiques**.

## Distinctions de preuve cruciales

- L'erreur entre deux images décodées n'est **pas** un test de saccades observées sur l'appareil ; `p95_adjacent_frame_change_perturbation` mesure la perturbation des changements de pixels provoquée par le deuxième encodage, et non des images perdues par Safari.
- Le CRF est un paramètre d'encodeur, **pas un réglage universel** ; un fichier recompressé peut changer de taille de manière contre-intuitive.
- Les pixels différents autour des quatre gestes ne certifient ni leurs véritables apparences humaines, ni leur bonne perceptibilité. Une deuxième compression peut même réduire une erreur sur une image isolée, sans prouver qu'elle améliore la vidéo.
- P26 ne simule pas X/TikTok, ne donne aucune promesse de suppression de leur compression et ne sélectionne aucun profil d'export utilisateur.
- Aucune génération vidéo neuronale, aucun entraînement, aucun média personnel, aucune donnée biométrique. Seules des formes vectorielles fictives sont décodées.
- **Pas d'essai Safari iPhone physique**. Les résultats sont du niveau `synthetic-tested` seulement si la CI du commit exact est verte.
- **Aucune fusion, publication, intégration UI/PWA ni modification de vidéo automatique.**

## Contrats de coordination

**NOVA :** Peut réutiliser les tests de conservation AAC et comparaisons de transcodage, sur un environnement séparé. Cela ne signifie ni que le pipeline d'export NOVA traite déjà nos vidéos ni que l'iPhone prend les codecs en charge.

**AURA :** P26 est un banc technique, aucun nouvel écran ni bouton proposé à l'utilisateur de l'application.

**SmallMotion :** L'observation 2D sur deux images ne permet toujours pas de déduire un geste de lèvre ou de langue.

**Directeur IA :** Le rapport `synthetic_second_generation_measured` est *consultatif*. Ne pas le transformer en choix automatique de compression ni en décision de reconstruction.

**Coordinateur :** La branche `coordination-retoucheproai-v1` et son registre ne sont pas édités ; relever les preuves de la PR après vérification du SHA et de la CI.
