# Retouche Cinema AI P11 — Observatoire des micro-mouvements

**Statut expérimental — 15 novembre 2026.** Ce module est un instrument de recherche **CPU**, pas un générateur de vidéos.

## Nouveaux outils

- `p11_micro_motion.py` : mesure OpenCV des déplacements à 12 ou 30 relevés par seconde. Retire le mouvement médian du cadre, relève neuf régions de l'image et des zones faciales *approximatives* si le détecteur de visage trouve un rectangle. Aucun repère précis de lèvres, de yeux, de cigarette ou de doigts, aucune inférence de respiration.
- `p11_review_dataset.py` : transforme les 60 passages P10 en 60 tâches de revue P11 ; repères temporels d'activité, séparation des groupes de scènes et **refus de l'entraînement supervisé sans qualification**.
- `p11_ui_core.js` et `RetoucheCinema_P11_Atelier_iPhone.html` : interface iPhone hors ligne, import d'un dossier JSON local, choix de vidéo, visualisation des courbes, consultation d'instants, ajout et export d'annotations manuelles distinctes. Aucun serveur et aucune ressource externe.
- `tests/test_p11.py` et `tests/test_p11_ui.cjs` : jeux de tests exclusivement synthétiques, y compris erreurs de split, faux résultats d'identité, correspondance vidéo et mouvements factices.

## Résultats P11 exécutés en privé — ne figurent pas dans GitHub

- 60 passages P10 couverts : 33 entraînement, 13 validation et 14 test, sans fuite de groupe.
- Première passe à 12 Hz : 2 029 paires et 45 passages ayant un rectangle facial candidat.
- Deuxième passe à 30 Hz : **4 851 paires**, 4 911 images sources échantillonnées, 46 passages ayant un rectangle facial candidat et 233 réutilisations de même image évitées. 59 fichiers sources autour de 30 fps, 1 autour de 24 fps.
- 60/60 calculs terminés sur les fichiers originaux privés. **0 événement de cigarette validé indépendamment**, **0 passage éligible automatiquement pour un apprentissage supervisé**.
- Le visualiseur a été testé dans Chromium 390×844 et 1240×820 : import du dossier 60, export d'annotations fictives, blocage d'une vidéo dont le nom ne correspond pas au passage, aucune exception JavaScript et aucun accès HTTP(S) ; Safari iPhone physique non testé.
- Tests : **17 Python + 11 JavaScript = 28 P11 réussis**, puis 44 régressions P9/P10 réussies.

## Exécution locale (données privées)

```sh
python p11_micro_motion.py --worklist /CHEMIN/PRIVE/P10_FILE_ANNOTATIONS_PRIORITAIRES_PRIVE.json \
  --root /CHEMIN/PRIVE/VIDEOS --out /CHEMIN/PRIVE/P11_MICRO_60_SOURCE_FPS_PRIVE.json --sample-hz 30 --face
python p11_review_dataset.py --worklist /CHEMIN/PRIVE/P10_FILE_ANNOTATIONS_PRIORITAIRES_PRIVE.json \
  --probe /CHEMIN/PRIVE/P11_MICRO_60_SOURCE_FPS_PRIVE.json --out /CHEMIN/PRIVE/P11_REVIEW_TASKS_60_PRIVE.json
```

Ce code de référence nécessite Python, OpenCV et NumPy pour l'analyse hors ligne ; le téléphone utilise le **HTML autonome** pour examiner les résultats. Les données importées sont conservées en mémoire tant que la page est ouverte. Les observations sont exportées localement dans un JSON privé.

## Confidentialité et rigueur

Aucun média, son, visage, empreinte SHA-256, liste de noms privés, poids neuronaux ou horodatage issu des 157 vidéos n'est intégré dans ces sources publiques. Les métriques de flux optique ne sont pas des preuves de mouvement des lèvres, d'identité ou de respiration. Les zones faciales sont des rectangles heuristiques ; elles échouent sous occlusion, rotation et petits visages. La compensation du mouvement de caméra par médiane est imparfaite.

Pour entraîner un modèle supervisé d'actions, qualifier et valider les scènes admissibles, faire annoter les événements par deux personnes indépendantes, arbitrer leurs désaccords, vérifier les droits de formation et que les personnes concernées sont bien adultes, isoler les groupes entre entraînement/test et garder les vidéos privées. Le précédent modèle P10 est un autoencodeur de statistiques de flux optique, pas un modèle de gestuelle.

## Prochain chantier

Repères locaux précis bouche/joues, doigts, mains et regard avec un modèle de landmarks autorisé et **effectivement exécuté** ; couplage aux repères audio respiratoires, validation humaine, puis entraînement de séquences temporelles sur des exemples éligibles. Pour la génération finale, distinguer les 45/60 *images de sortie* des poses réellement produites et évaluer les contacts main–objet–bouche par intervalle.
