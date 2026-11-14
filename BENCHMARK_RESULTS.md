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
| 14 nov. 2026 | **retrait de filtre AR, vrai module de l'app** (`tests/banc_filtres_app.mjs`, Chrome, vrais modèles YuNet / détecteur v3 / MI-GAN / GFPGAN) | 8 vidéos 480×640, 36 images, portraits NASA × filtres simulés chien / chat / éléments au hasard | part de l'erreur du filtre supprimée : chien 0,66 / 0,64 / 0,29 ; hasard 0,49 / 0,37 / 0,51 ; **chat 0,00 / 0,02** ; scintillement réduit dans 8/8 ; LPIPS tête amélioré dans 8/8. Normalisé : qualité 0,37, **échecs 62,5 %**, gravité 0,77 | synthétique ; GPU simulé ; pas de vrais filtres Snapchat ; pas d'iPhone |
| 14 nov. 2026 | `tests/rfv.test.mjs` (non-régression du module) | `filtre_video.mp4` | run 1 : 6/7 (fondu entre reconstructions : saut non réduit) ; run 2 : 7/7 ; fondu isolé, 4 essais : saut 8,9 → 3,1 (réussi) | échec intermittent non reproduit : à surveiller |
| 14 nov. 2026 | priorisation (`directeur-priorites.test.mjs`) | cas construits | 7/7 ; état réel : toutes qualités inconnues → action « mesurer », filtres AR en tête | aucune mesure réelle encore |

## Journal d'expériences

- **E-2026-11-14-01** — Catalogueur : dHash 9×8 par échantillon, distance moyenne symétrique. Sur mires testsrc2,
  `blocs_8x8` vaut ≈ 2,4 même en CRF 15 (motif aligné sur la grille) → seuil 1,25 à recalibrer sur vidéos réelles.
- **E-2026-11-14-02** — Priorisation : première version, la faisabilité modulait aussi le classement des modules non
  mesurés (débruitage passait devant filtres AR). Corrigé : sans mesure, l'ordre suit l'importance seule.

- **E-2026-11-14-03** — Banc multi-cas du retrait de filtre AR dans l'app. Résultat principal : le filtre « chat »
  (petit nez rose + moustaches blanches fines) n'est **pas retiré en vidéo** (retrait 0–2 %), alors que l'outil photo
  atteignait 77 % de rappel. Diagnostic (détecteur seul, `banc_video.py`) : sur la séquence vidéo, probabilité ≈ 0 dans la
  zone du filtre chat (p07, p11) ; sur image fixe 75 px entre les yeux, rappel 56–97 % sans compression, mais p07 tombe à
  0 % dès JPEG 60 ou bruit σ 2,5 ; p11 détecté sur image fixe compressée (73–84 %) mais pas sur la séquence (rotation ±6°,
  zoom ±8 %). **Le goulot est le détecteur (robustesse compression / pose / petits éléments clairs), pas la reconstruction.**
- **E-2026-11-14-04** — Priorisation : un module mesuré faible (filtres AR) passait derrière des modules inconnus (score
  d'inconnu 0,5 non modulé). Corrigé : modulation constante 0,6 pour l'inconnu ; filtres AR → « améliorer » en tête.

## À produire ensuite

1. Catalogue réel (ChatGPT ou propriétaire) → résumé non nominatif partageable (`resume`, défauts par catégorie).
2. Détecteur d'éléments AR v4 (expérimental) : réentraînement avec compression JPEG 40–90, bruit, rotation ±10°, zoom,
   visages petits, éléments clairs et fins ; critères : chat ≥ 50 % de retrait en vidéo, chien/hasard sans recul, vidéo sans
   filtre inchangée ; puis validation sur les 74 vrais clips Snapchat privés (validation croisée par vidéo) avant intégration.
3. Banc filtres beauté (lissage, maquillage, déformations) — aujourd'hui sans mesure.
