# Retouche Cinema Director P1 — démonstrateur hors ligne (15 novembre 2026)

Le fichier [`director-p1.html`](./director-p1.html) contient l'intégralité du prototype d'atelier de film, sans dépendances réseau. Pour le tester, télécharger le fichier, l'ouvrir avec Safari iPhone ou un navigateur de bureau compatible, puis saisir une idée.

## Fonctions réellement implémentées

- Description française découpée en plans par règles déterministes, **pas par modèle de langage**.
- Personnages structurés par ID, objets et décors reconnus par dictionnaire.
- Édition du contenu, des durées, de l'ordre et des cadrages des plans.
- Animatique dessinée localement en Canvas 2D (marche, tasse, téléphone, cigarette en illustration simplifiée, dialogue, décor).
- Export JSON du storyboard et import JSON validé ; aucun octet de photo ou vidéo de référence dans le JSON.
- Export vidéo de **l'animatique dessinée seulement**, via MediaRecorder lorsque le navigateur le permet. Ce n'est pas le rendu final d'un film ni une génération IA audiovisuelle.
- Photos et vidéos locales affichées en aperçu uniquement ; attestation explicite des droits requise avant création d'un projet depuis référence ; aucune transmission réseau.

## Validation effectuée

- 11 tests Node ciblés sur le cœur du directeur : extraction, durées, continuité, droits, protections JSON, IDs uniques, déterminisme.
- Tests d'interface Chromium 390×844 et 1240×820 : ajout/suppression de plans, lecture, export JSON, aucune exception JavaScript ni requête externe.
- Chromium : import photo et protection par droits, import/export JSON, portrait 9:16.
- Enregistrement d'une animatique synthétique : fichier MP4 valide vérifié par ffprobe (~4 s). La disponibilité de MediaRecorder sur Safari physique **n'est pas établie**.

## Limites explicites

Le système **ne produit pas** de films IA photoréalistes et ne préserve pas réellement l'identité d'un humain importé. Un média importé **n'influence pas encore les dessins** de l'animatique ; il reste un simple aperçu local et des métadonnées de projet. Les liens entre personnage/objet/plan sont principalement structurels. La décomposition du texte est heuristique et peut échouer sur les descriptions complexes. Aucun moteur distant GPU ni modèle texte-vers-vidéo n'est branché.

## Sécurité et confinement

- Aucun média privé ni modèle privé n'est inclus dans le dépôt GitHub.
- Fonctionnalité expérimentale isolée dans la branche `chatgpt-cinema-ai-rfc-v01`, sans modification de `main`.
- Pas de téléversement, publication, utilisation pour entraînement ou journalisation distante dans ce prototype.
- Ne pas promouvoir dans l'application de production avant tests Safari physique, accessibilité et consentements adaptés à un éventuel moteur distant.

## Prochain incrément P2

Brancher une interface de rendu réelle et interchangeable **après** audit de licences, coût GPU, droits sur les médias, sécurité et contrôle qualité. Mesurer la cohérence multi-plans et le mouvement des mains/objets. Conserver un mode démonstration hors ligne quand un moteur de rendu n'est pas disponible.
