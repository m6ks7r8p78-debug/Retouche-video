# Retouche Cinema AI — P14 : chronologie multi-canaux

Version expérimentale P14 — 15 novembre 2026. **L'atelier P14 est un outil de recherche, pas un générateur de film.**

## Progrès constatés

1. Comparaison à 12 échantillons/s des variations d'image dans cinq régions **estimées relativement à la boîte faciale P13** : bouche, joue gauche, joue droite, yeux et visage.
2. Flux optique résiduel sur toute l'image, découpée en grille 3×3 (pas une détection du bras ou de la main). Compensation par la translation médiane du champ optique.
3. Courbes RMS des pistes audio synchronisées approximativement aux fenêtres visuelles ; **pas de reconnaissance des respirations**.
4. Détection du cas de données où une vidéo est représentée par plusieurs passages : association stricte **par ordre, ID, split et horodatages** plutôt que par un dictionnaire ne retenant que l'ID vidéo.
5. Atelier iPhone sans serveur : chargement local du JSON privé et éventuellement de la vidéo correspondante, examen des courbes, annotation provisoire de 11 canaux corporels ou sonores, export JSON sans pixels/son.

## Résultats du premier audit P14 (PRIVÉS, pas dans ce dépôt)

- **60/60 fenêtres** analysées, 44 identifiants vidéo distincts répartis en 38 groupes de scènes ; séparation conservée 33 entraînement, 13 validation, 14 test.
- **2 038 images vidéo**, à une cible de 12 échantillons/s, sans erreur de décodage.
- **1 978 comparaisons de flux optique plein cadre** sur neuf zones.
- **1 183 images avec boîte faciale candidate héritée de P13** et **1 103 comparaisons consécutives de patchs faciaux**.
- **52 fenêtres avec piste audio lisible**, toutes les mesures audio conservées en valeurs RMS, sans samples PCM exportés.
- Ces chiffres ne représentent pas les 157 vidéos en analyse approfondie. L'analyse rapprochée concerne la sélection P10/P11 de 60 passages ; les 157 originaux avaient été audités plus superficiellement dans P9.

## Limitations majeures

Les cinq régions faciales sont des **boîtes approximatives**, calculées à partir des rectangles de visage d'un détecteur Haar. Ce ne sont ni des landmarks anatomiques ni des mesures directes d'ouverture des lèvres. Le signal de « bouche relative aux joues » est une différence de texture/éclairage, pas une mesure du souffle ou de l'inspiration. Le flux optique plein cadre est un mouvement apparent, pas une classification des gestes, du bras ou de la cigarette.

La cadence 12 Hz est celle de l'**audit**, pas une nouvelle vidéo générée à 12 Hz ni un modèle 60 i/s. Aucun nouveau modèle génératif ni nouveau modèle supervisé n'a été entraîné en P14.

MediaPipe Python/Face/Hand Landmarker n'était pas installé et l'accès réseau aux paquets et modèles était bloqué. Le module MTCNN détecté localement n'était pas exécutable sans TensorFlow. **Aucune détection MediaPipe, main ou repères labiaux n'a été réalisée.**

## Reproduction avec données fictives

```bash
python -m unittest discover -s tests -v
node --test tests/test_p14_ui.cjs
python tests/check_p14_browser.py  # nécessite Chromium système + Playwright ; le navigateur n'est pas installé dans tous les environnements
```

Le fichier `p14_viewer.html` est autonome (JS et CSS inclus) ; importer le fichier `examples/p14_fiction_demo.json` pour reproduire l'interface sans données privées.

Pour refaire le calcul sur les **données personnelles autorisées**, utiliser un dossier de sources privé et les manifestes P11/P13 privés. Ne jamais publier ces manifestes :

```bash
python p14_multichannel.py --tasks /chemin/PRIVE/P11_REVIEW_TASKS_60_PRIVE.json --p13 /chemin/PRIVE/P13_cascade_60_PRIVATE.json --source-dir /chemin/PRIVE/Videos --out /chemin/PRIVE/P14_60_private.json --hz 12
```

## Confidentialité

- Le code et les exemples publics ne contiennent aucune vidéo réelle, aucun nom de média réel, aucun portrait, aucune voix, aucune empreinte personnelle ni métrique par personne.
- L'atelier iPhone n'appelle aucun serveur. Si un rapport privé est chargé, son contenu reste dans la mémoire du navigateur ; l'utilisateur doit protéger son export JSON, qui contient des noms de fichiers et des horodatages privés.
- Le chargement de vidéo compare seulement le **nom** ; il ne prouve pas l'authenticité par SHA-256. Pour l'entraînement, une vérification d'intégrité distincte reste indispensable.
- Les annotations ne deviennent pas « prêtes à entraîner » sans vérification de l'âge adulte, des droits, et de deux évaluations humaines indépendantes.
- Ne pas fusionner cette branche avec `main` et ne pas déployer sur retoucheproai.com sans tests Safari physique.

