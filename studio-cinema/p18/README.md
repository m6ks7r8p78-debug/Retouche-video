# Retouche Cinema P18 — Garde de continuité sur tout le mouvement

**15 novembre 2026 · Prototype autonome iPhone/ordinateur · Hors production.**

## Réutilisations prouvées
- Le directeur de personnages P16 planifie les attitudes et expressions ; le planificateur P2 crée des clips ; le pont P17 conserve les événements lorsqu'ils traversent une coupe.
- Un audit P18 des **raccords P17** compare les actions reportées entre clips, les personnages et les accessoires, ainsi que les contradictions de direction.
- Un second audit P18 examine des **trajectoires 2D horodatées** : main, cigarette, bouche, clignement, regard, mouvement observé des joues, fumée et origine de son apparition. Il signale les sauts de position, le contact mal aligné, une émission prématurée de fumée et des absences d'information.
- Les preuves sont fournies par un fichier de **positions annotées** ou, dans les démonstrations, par une série de **151 observations mathématiques entièrement fictives à 30 Hz**. Aucun suivi anatomique automatique n'est revendiqué.
- Un atelier HTML autonome est livré avec scénario cigarette, café, conversation et marche, choix 30/45/60 images **visées** par seconde, validation de raccords et import de JSON local. **Aucune vidéo générée.**

## Composants antérieurs examinés (sans fusion ni activation)
- NOVA PR #3 : audit chronologique AAC, BT.709 et export expérimental ; l'ancien pilote NOVA exporte au plus 15 i/s et 640 px, ce n'est donc pas une chaîne Cinema 60 i/s.
- CameraGuard v4.3 : estimation de mouvement de caméra 2D avec abstention ; ne reconnaît ni main ni lèvres.
- SmallMotion PWA PR #26 : service worker qui attend les clients actifs avant mise à jour, non installé dans l'atelier P18.

## Exécution

```bash
node --test tests/test_p18_motion.cjs
python -m pytest -q tests/test_p18_browser.py
node --test ../RetoucheCinema_P17/tests/test_acting_clip_bridge.cjs ../RetoucheCinema_P17/tests/test_cross_lab_handoff.cjs
python -m pytest -q ../RetoucheCinema_P17/tests/test_private_review_queue.py
```

## Résultats locaux
- P18 : **22/22** tests Node ; deux tests Playwright Chromium système (390×844, 1240×820) réussis après solution de repli depuis l'installation incomplète Playwright.
- Non-régression P17 : **51/51** JS et **12/12** Python.
- Aucune requête HTTP(S) ni exception JavaScript observée dans les deux tailles d'interface. **Safari physique non testé**.
- Les cas adversariaux « téléportation », « fumée prématurée », « mauvais contact » sont volontairement signalés.

## Limites scientifiques
- Les coordonnées de démonstration sont des points synthétiques, et l'acceptation ne prouve ni mouvement humain, ni séduction, ni respiration, ni réalisme photoréaliste.
- La vitesse en coordonnées normalisées n'est pas compensée de manière robuste pour le zoom ou le mouvement de caméra ; résultats nécessitant examen manuel.
- Les 157 vidéos d'origine et leurs dérivés identifiables restent privés ; **aucun nouveau passage du corpus n'est étiqueté ou entraîné dans P18**.
- Aucun GPU, modèle de synthèse de film, repère MediaPipe réel, montage vidéo ou sortie 60 nouvelles images/s dans cet incrément.

## Suivant
Raccorder un détecteur local fiable visage/mains, recueillir des annotations indépendantes d'événements, puis comparer les modèles vidéo sur de véritables séquences à la cadence native plutôt que sur l'interpolation seule.
