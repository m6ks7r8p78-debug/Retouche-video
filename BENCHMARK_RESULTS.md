# Résultats des bancs et journal d'expériences — Directeur IA

Seuls des résultats réellement exécutés figurent ici. Aucun résultat sur la bibliothèque privée de 157 vidéos
n'existe encore : les médias ne sont pas accessibles depuis Claude et aucune autorisation `evaluation_benchmark`
n'a été enregistrée.

## Résultats constatés (branche `chatgpt-ai-director-v01`)

| date | banc | données | résultat | limites |
|---|---|---|---|---|
| ≤ 13 nov. 2026 | A/B adaptatif vs global (`directeur-browser.test.mjs`) | 1 vidéo synthétique bruitée/propre | 18 images décodées sur 90 différentes ; protection de netteté non déclenchée (écart de bruit insuffisant) | synthétique ; aucune mesure perceptuelle |
| ≤ 13 nov. 2026 | laboratoire 1D (`directeur-laboratoire.cjs`) | 18 cas train / 18 validation synthétiques | gain sur validation, 0 famille dégradée > 5 % | signal 1D : ne prouve rien sur vraie image |
| ≤ 13 nov. 2026 | export 8K hors navigateur (`directeur-8k.test.mjs`) | 1 image vidéo synthétique + audio | 7680×4320 H.264 + AAC vérifiés par ffprobe | Lanczos : aucun détail recréé ; pas d'iPhone |
| 14 nov. 2026 | catalogueur (`catalogue_medias_test.py`) | 6 médias synthétiques | 16/16 : SHA-256, doublon exact, réencodage 160×120 rapproché, bruit +45 mesuré > +3 σ, partition sans fuite, consentements, refus d'écriture dans Git, export accepté par `directeur-banc-reel.cjs` | seuils non calibrés sur corpus réel |
| 14 nov. 2026 | priorisation (`directeur-priorites.test.mjs`) | cas construits | 7/7 ; état réel : toutes qualités inconnues → action « mesurer », filtres AR en tête | aucune mesure réelle encore |

## Journal d'expériences

- **E-2026-11-14-01** — Catalogueur : dHash 9×8 par échantillon, distance moyenne symétrique. Sur mires testsrc2,
  `blocs_8x8` vaut ≈ 2,4 même en CRF 15 (motif aligné sur la grille) → seuil 1,25 à recalibrer sur vidéos réelles.
- **E-2026-11-14-02** — Priorisation : première version, la faisabilité modulait aussi le classement des modules non
  mesurés (débruitage passait devant filtres AR). Corrigé : sans mesure, l'ordre suit l'importance seule.

## À produire ensuite

1. Catalogue réel (ChatGPT ou propriétaire) → résumé non nominatif partageable (`resume`, défauts par catégorie).
2. Banc retrait de filtre AR/beauté sur couples **vérifiés** et dégradations synthétiques → premières valeurs
   `qualite_mesuree`/`taux_echec` pour `filtres_ar` et `filtres_beaute`.
