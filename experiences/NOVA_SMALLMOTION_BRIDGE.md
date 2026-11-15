# NOVA × SmallMotion — pont consultatif v1

**État : pilote expérimental, sur branche dédiée, non fusionné, non déployé.** Aucun test Safari iPhone physique revendiqué.

## Provenance réelle

Ce pont réutilise une copie **inchangée** de `research/3d-smallmotion/smallmotion-local.js` depuis la branche `lab-3d-smallmotion-local-first` du même dépôt, blob Git `f3a6d35a306c30da45f02567adb0eadc71ecd685`. Le moteur réalise une recherche locale 2D entre deux images de taille réduite (blocs + rejet d'un mouvement dominant). Son résultat **n'est ni un geste, ni une segmentation, ni de la profondeur, ni une preuve de mouvement indépendant**. Aucun nouveau modèle d'IA n'est entraîné.

Fichiers du pont :

- `experiences/vendor/smallmotion/smallmotion-local.js` : algorithme SmallMotion repris sans changement.
- `experiences/nova-smallmotion-bridge.js` : contrat strict et liste blanche pour produire un diagnostic anonyme, borné et consultatif.
- `experiences/nova-smallmotion-ui.js` : déclencheur opt-in, sélection vidéo locale, deux images diminuées, rapport JSON téléchargeable explicitement.
- `tests/nova-smallmotion-bridge.test.mjs` : tests sur images synthétiques, abstentions, validation des boîtes, absence d'édition des images et protection contre fuites dans le JSON.
- `tests/nova-smallmotion-browser.test.mjs` : H.264 synthétique avec Chromium, import manuel, deux frames et rapport, sans requête sortante.

## Parcours utilisateur

1. Ouvrir le labo `experiences/nova.html` depuis un serveur de tests local (ou le paquet prévisualisé séparément).
2. Importer une **vidéo courte et compatible**. Le mouvement n'est ni calculé ni sauvegardé automatiquement.
3. Déplier « SmallMotion · mouvement local (recherche) », puis appuyer sur « Analyser 2 images sans modifier ».
4. Le navigateur tente de lire deux images à 0 et environ 0,117 s. Les images sont réduites localement, avec la dimension maximale 240 px et dimension minimale 64 px. Durée du pilote : 0,3 à 12 s, fichier au maximum 60 Mio, chaque dimension source au plus 1 920 px.
5. Lire le diagnostic. L'original et le plan d'export ne sont jamais modifiés, quel que soit le résultat. L'enregistrement JSON est volontaire.

**Limite majeure :** le lecteur natif du navigateur peut refuser un MOV HEVC selon l'OS et Safari ; aucun chemin magique de décodage HEVC n'est prétendu. En cas de refus, aucun résultat mouvement n'est inventé et NOVA garde l'original. Le banc HEVC/WASM de NOVA reste séparé et continue d'assurer les contrôles d'export. Une future intégration peut partager son décodeur après des essais explicites.

## Contrat de sortie

```json
{
  "version": 1,
  "provenance": "smallmotion_local_2frame_v1",
  "status": "local_motion_candidate",
  "action": "no_automatic_change",
  "confidence": "not_calibrated",
  "method": "local_2d_block_matching",
  "frames": 2,
  "frameTimesSeconds": [0, 0.1167],
  "analysisDimensions": [160, 120],
  "candidates": [{"box": [40, 30, 20, 20], "support": 3}],
  "processorMs": 12,
  "privacy": {"uploaded": false, "stored": false, "rawPixelsInReport": false}
}
```

*Exemple purement illustratif, **pas** le résultat d'un essai iPhone.* Le rapport réel peut comporter zéro candidat, un statut d'abstention et une durée différente.

## Promotion conditionnelle

Aucune correction automatique sur la seule base de SmallMotion. Toute action éventuelle devra être une fonctionnalité distincte, opt-in, avec consentement, vérité terrain, garde-fous, critères de précision et tests sur un iPhone physique. Les chiffres des tests Python OpenCV SmallMotion ne sont pas applicables par analogie au navigateur JS.

## Coordination

Ce pont est une démonstration réelle de relais depuis le laboratoire 3D vers NOVA. Le centre de coordination se trouve dans la **branche** `coordination-retoucheproai-v1` (PR #34). Ce module doit rester dans la PR de pont distincte et ne pas écraser les branches SmallMotion, NOVA ou `main`.
