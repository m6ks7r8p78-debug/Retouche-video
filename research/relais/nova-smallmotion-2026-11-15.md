# Relais inter-laboratoires — NOVA × SmallMotion — 2026-11-15

**Laboratoires :** SmallMotion (recherche 3D) → NOVA (traitement vidéo local) → Directeur IA (contrat de sûreté proposé).
**Branche :** `chatgpt-nova-smallmotion-bridge-v1`
**PR :** [#35](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/35) (brouillon, base `chatgpt-studio-nova-v01`).

## Objet et provenance

Réemploi *sans changement* du détecteur 2D `smallmotion-local.js` de `lab-3d-smallmotion-local-first`, blob `f3a6d35a306c30da45f02567adb0eadc71ecd685`. Deux images sont extraites localement d'une vidéo choisie manuellement dans le navigateur ; le détecteur produit des hypothèses de régions mobiles. Le contrat `NOVA_SMALLMOTION` les convertit en rapport strict, limité et consultatif.

## Fichiers modifiés ou ajoutés

- `experiences/vendor/smallmotion/smallmotion-local.js` — copie du moteur source inchangé.
- `experiences/nova-smallmotion-bridge.js` — contrôles et liste blanche JSON.
- `experiences/nova-smallmotion-ui.js` — diagnostic déclenché explicitement.
- `experiences/nova.html` — panneau discret de recherche.
- `outils/build-nova-iphone-preview.mjs` — intégration des scripts au paquet hors ligne.
- `tests/nova-smallmotion-bridge.test.mjs`, `tests/nova-smallmotion-browser.test.mjs`, `tests/nova-iphone-preview.test.mjs` — tests.
- `.github/workflows/nova-smallmotion-check.yml` — CI autonome.
- `experiences/NOVA_SMALLMOTION_BRIDGE.md` — documentation.

## Résultat et preuve vérifiée

[GitHub Actions — exécution #43711168899](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43711168899) :
- **25/25 tests unitaires réussis**, incluant le détecteur local SmallMotion réel réutilisé, les refus de risque, la validation du paquet et des tests NOVA existants.
- **1/1 test navigateur Chromium réussi**, important un H.264 de test généré par FFmpeg et vérifiant la production d'un rapport sans téléchargement automatique ni transmission externe.
- Aucune preuve de test Safari physique, de performance thermique iPhone ou de prise en charge complète des MOV HEVC par le lecteur natif.
- Aucune modification automatique de source ou d'export ; confiance explicitement non calibrée.

## Limites / exclusions

Le système ne connaît ni main, ni geste, ni contact, ni identité, ni profondeur. Les boîtes possibles sont des indices 2D, pas des preuves de mouvement indépendant. La version Python du laboratoire SmallMotion ne peut servir de preuve à la version JavaScript. Le déclencheur navigateur refuse les formats non décodables. Aucun média privé n'a été publié.

## Conséquences pour les autres laboratoires

- **Directeur IA :** peut lire les rapports `smallmotion_local_2frame_v1` pour expliquer les limites, mais ne doit **pas** les traiter comme preuve suffisante de restauration, correction automatique, interpolation ou reconstruction.
- **Cinema P20/P21 :** conserver la distinction entre hypothèses de mouvement et vérité terrain de gestes.
- **NOVA :** la PR permet d'essayer ce diagnostic depuis l'interface labo ; ne pas remplacer le chemin HEVC/WASM existant sans nouvel essai.
- **Design AURA :** bouton avancé opt-in ; aucun ajout automatique au parcours principal.

**Données privées publiées : non.**
**Prochaine action :** test Safari sur un iPhone physique dans un aperçu HTTPS réellement isolé, puis évaluation sur scènes réelles autorisées et revue des faux positifs. Aucune fusion ni mise en production demandée.
