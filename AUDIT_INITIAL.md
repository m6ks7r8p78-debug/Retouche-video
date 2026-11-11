# Audit initial — mesuré, pas supposé
Réalisé sur l’archive « v6.5-contribution » reçue le 11/11/2026 (dérivée de la v6.4). Le site en ligne avait entre-temps ses propres v6.5 et v6.6 (hors-ligne, exports 4K) : la v6.7 part du site en ligne et y ajoute ce travail, sans rien écraser.

## Architecture réelle
Application web statique (PWA, GitHub Pages, domaine `retoucheproai.com`), sans build. Entrées : `index.html` → `models.js`, `sr-gpu.js`, `sr.js`, `kaggle.js`, `camera.js`, `app.js` (252 Ko, cœur), `studio.js`, `abo.js`, `pub.js`, `mp4-muxer.js`, `mode-simple.js`, `demarrage.js` ; `effacer.js` et `depth.js` chargés à la demande ; `sw.js` (cache hors ligne). Serveurs facultatifs : `serveur/worker.js` (Cloudflare Workers : lien vidéo, diagnostic chiffré), `serveur-ia/` (Kaggle).

## État réel des moteurs
| Fonction | État constaté |
|---|---|
| Retrait de filtre (`FLT`, app.js) | **Actif mais limité** : bibliothèque de tables de couleurs apprises (`filtres.png`), choix manuel sur miniatures. Couleur/lumière seulement. Vidéo seulement (en mode photo `FLT.open()` lève une erreur `getImageData` — bouton non proposé). Aucune détection automatique avant la v6.7. |
| Accessoires AR / autocollants | **Manuel** : `effacer.js` (MI-GAN + sélection EdgeTAM), photo uniquement. Aucune détection automatique, aucun suivi vidéo. |
| Déformations du visage, maquillage virtuel | **Absent**. |
| Super-résolution (`sr.js`, `sr-gpu.js`, `sr.bin`) | Actif (WebGPU/WebGL, tuiles). |
| Cohérence temporelle | Anti-scintillement et stabilisation existants (`o_defl`, `o_stab`) ; pas de suivi de masques. |
| Contribution volontaire (`studio.js`) | Registre local seulement ; aucun envoi. |
| Export « X » | Absent avant la v6.7. |

## Tests de référence (exécutés ici, Chromium sans carte graphique)
`sw` 7/7 · `gestionnaire` 24/24 (2 non testables) · `studio` 11/11 · `reassemblage` 5/5 · `v3` et `noyau` : **plantage du navigateur de test, identique sur l’archive d’origine** (environnement, pas une régression) · `effacer` : non exécuté (modèle `migan.onnx` absent des médias de test) · `app` : non exécuté dans le temps disponible.

## Risques et dette
1. Promesse « retrait de filtre » supérieure à la capacité réelle (couleur seulement). 2. `app.js` monolithique. 3. Aucune mesure iPhone réelle possible ici. 4. Aucun backend de consentement : toute collecte serait illégitime. 5. Licences des poids à revérifier à la source (voir `REGISTRE_MODELES_LICENCES.md`).

## Plan priorisé
P1 détection mesurée + honnêteté des sorties (fait en v6.7) → P2 segmentation visage/accessoires et suivi vidéo (modèle à choisir, licence à valider) → P3 pipeline restauration chaîné automatique → P4 backend de consentement (décision et hébergement requis).
