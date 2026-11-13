# REPRISE — module « AI Adaptive Video Reframing » (changement de format)

**À lire en premier à chaque nouvelle session. Ne pas repartir de zéro.**

- Branche de travail : `travail-format` (le site en ligne = `main`, NON modifié par ce travail).
- Cahier des charges : « PROMPT MAÎTRE FINAL — MODULE AI ADAPTIVE VIDEO REFRAMING » (17 sections).
- Reprendre : `git fetch && git checkout travail-format`, lire ce fichier, puis continuer.

## Déjà écrit (sauvegarde du 14 nov. 2026, 00 h 35)
- `format-analyse.js` — analyse du média, scènes, sujets, mouvements
- `format-directeur.js` — directeur IA (choix de stratégie par scène)
- `format-moteur.js` — moteurs de transformation (recadrage, extension, hybride)
- `format-qualite.js` — contrôle qualité
- `format.js` — interface + orchestration
- Intégration en cours dans `app.js`, `index.html`, `models.js`, `sw.js`
- Modèle ajouté : `modeles/lourds/objets/efficientdet_lite0.tflite` (détection d'objets, Apache-2.0)
- Tests : `tests/format.test.mjs`, `tests/format_app.test.mjs`, banc `tests/format/`
  (vidéos de test générées par `tests/format/creer_videos.sh`, non versionnées)

## Reste à faire (à vérifier dans l'ordre)
1. Lancer les tests (`node --test tests/format*.test.mjs`) et corriger ce qui échoue.
2. Vérifier l'interface dans un navigateur (Playwright, y compris gabarit iPhone/WebKit).
3. Tests de non-régression de l'app existante.
4. Documentation (NOTES.md, CHANGELOG.md, REGISTRE_LIVRAISON_PERMANENT.md, licences).
5. Publier sur `main` seulement quand tout est validé (créer d'abord `sauvegarde-v7.6`).

Mettre à jour ce fichier et pousser après chaque étape terminée.
