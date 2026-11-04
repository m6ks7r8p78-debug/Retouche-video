# Notes de travail — Retouche vidéo

À lire en premier pour reprendre le projet. État au 4 novembre 2026 : **v3.3** (effacer une zone). Points de restauration : branches
`sauvegarde-v2.49`, `sauvegarde-v2.50`, `sauvegarde-v3.0`, `sauvegarde-v3.1`, `sauvegarde-v3.2`, `sauvegarde-v3.3` (les tags cités avant n'avaient jamais été créés :
l'envoi de tags est refusé par l'environnement de travail de Claude, d'où des branches). Serveur Cloudflare : **v5 en ligne**.

## Règles du projet
- Règle absolue : ne jamais sacrifier la qualité pour la vitesse ; viser le résultat le plus proche du parfait.
- Tout se calcule sur le téléphone (PWA), gratuit, utilisable par des débutants : réglages automatiques.
- Chaque changement est mesuré (banc de qualité) puis testé de bout en bout (`tests/`, voir `tests/README.md`) avant publication.
- Une version en test va d'abord sur une branche (`studio-ia` pour la v2.50), puis sur `main` quand le test complet est réussi.
- Numéro de version : constante `VER` en haut du script de `index.html` ; changer aussi `C` dans `sw.js` quand des fichiers hors ligne changent.
- Aucune fonction affichée sans traitement réel ; une piste qui ne gagne pas à la mesure est retirée et documentée (`MODELES.md`).

## Ce que fait chaque pièce
| Pièce | Rôle |
|---|---|
| `index.html` | interface, rendu WebGL (shader `FS`), analyse vidéo `REC` / photo `PHOTO`, profils `PROF`, IA `SRX`, export WebCodecs, comparateur photo `PV`, recette `recipe()` |
| `models.js` | gestionnaire central des modèles (registre, SHA-256, téléchargement avec reprise IndexedDB, installation atomique, versions, retour arrière, nettoyage, fenêtre « Modèles IA ») |
| `sr.js` / `sr-gpu.js` / `sr.bin` | Real-ESRGAN general v3 ; WebGPU avec 2 versions de calcul (1 ou 4 pixels par fil, choisie par appareil au premier usage, clé `sr_noyau`), repli WebGL2 |
| `depth.js` | relief (Depth Anything V2 Small, adresse figée révision 4472b73, empreinte vérifiée) |
| `filtres.png`, `rnnoise.mjs` | retrait de filtres, voix ; vérifiés par empreinte au chargement |
| `effacer.js`, `modeles/` | v3.3 : « Effacer une zone » (MI-GAN `migan`, EdgeTAM `edgetam` + `edgetam_dec`), carte des zones inventées `G`, provenance ; voir MODELES_IA.md |
| `serveur/worker.js` | serveur Cloudflare « retouche-serveur » (inchangé en v2.50) |

## Profils de rendu (v2.50)
Ils dosent ce que l'analyse automatique a réglé (`P` reste la base) : `PROF.T` dans `index.html`.
- Naturel : corrections de couleur ×0,5, netteté ×0,5, débruitage IA −0,12, 30 % de version classique mêlée à l'IA.
- Équilibré (conseillé, réglages mesurés depuis la v2.45) ; Détails : netteté ×1,7, débruitage IA +0,15.
- Conseil automatique : Naturel pour une source HD propre, sinon Équilibré ; Détails jamais imposé.
- Mesures (portrait abîmé, LPIPS) : Équilibré 0,186, Détails 0,190, Naturel 0,195 (meilleurs PSNR/SSIM), sans IA 0,348.

## Mesures clés
- Vitesse IA sur l'iPhone du propriétaire (v2.49, WebGPU) : 26 à 42 s par mégapixel. La v2.50 ajoute un calcul « 4 pixels par fil » :
  identique au pixel près, 1,9 à 2,4× plus rapide sur GPU simulé ; **gain réel sur iPhone à mesurer** (Modèles IA → Mesurer la vitesse).
- Protection des visages (UltraFace) essayée puis retirée : LPIPS visage 0,370 → 0,459 (voir `MODELES.md`).
- Analyse d'une photo 12 Mpx : 19,6 s → 5 ms (miniature faite une fois au chargement).

## Historique récent
| Version | Changement |
|---|---|
| v3.3 | outil « Effacer une zone » (MI-GAN, MIT) + sélection au toucher (EdgeTAM, Apache-2.0) ; carte des zones inventées, provenance, exports ; `tests/effacer.test.mjs` (19 cas) ; études de licences ProPainter/CodeFormer/CompleteMe |
| v3.2 | audit : service worker qui effaçait les modèles téléchargés (corrigé, `tests/sw.test.mjs`), faille d'injection par sauvegarde (corrigée, `esc()` dans `studio.js`), polices locales (`polices/`), SRI sur le secours mp4-muxer, autorisation `diagnostic` + bouton « Autoriser », branches de sauvegarde, AUTORISATIONS.md, RESTAURATION_IA.md |
| v3.1 | remise en ordre automatique des morceaux de vidéo (continuité d'image, date, doublons, confiance) |
| v3.0 | Time Repair (objet `TR` : plan d’images dans le temps de la source, son WSOLA / cassette / inversé), profils `nuit` et `jour` (uniforme `gm` du shader, gain ×3 max, noirs gardés), VFR et ralentis détectés, secours Opus (`audioCfg`), serveur v5 (à redéployer) |
| v2.50 | gestionnaire de modèles + fenêtre « Modèles IA » ; profils Naturel / Équilibré / Détails ; analyse mesurée des photos ; comparateur avec zoom 1–8× ; export PNG ; taille personnalisée ; vérification des fichiers exportés (relus : taille, format d'image, durée, cadence) ; recette du traitement ; calcul WebGPU 4 pixels/fil ; modèle de profondeur figé ; corrections : faux « images figées », double stabilisation (poussières + IA), réglages d'une vidéo repris par la photo suivante, téléchargements simultanés, analyse lente des grandes photos ; suite de tests |
| v2.49 | équilibre auto des couleurs retiré ; IA décochée pour une vidéo de plus d'1 h de calcul |
| v2.48 | moteur IA WebGPU, repli WebGL2 |
| v2.45–v2.47 | protection des hautes lumières, scènes sombres, diagnostic |

## Prochaines pistes
0. Découper `index.html` en modules (risqué sans iPhone de test, reporté). Serveur v5 : déjà en ligne (vérifié en v3.2).
0 bis. *(fait en v3.3)* Effacer une zone + sélection au toucher. Suite possible : mesurer sur iPhone ; points négatifs au toucher ; extension vidéo (masque suivi par EdgeTAM image par image) — voir RAPPORT_v3.3.md.
1. Lire sur l'iPhone la vitesse « 4 pixels par fil » (Modèles IA → Mesurer la vitesse, ou diagnostic) et décider s'il faut aller plus loin (demi-précision f16).
2. Serveur avec carte graphique (payant) pour les longues vidéos — décision du propriétaire, non engagée.
3. Plus de paires avec / sans filtre pour le retrait de filtre.
4. Vérifier sur iPhone : persistance du stockage (bouton « Demander la protection du stockage »), mémoire en 4K.

## Diagnostic
Onglet Outils → « 📋 Copier le diagnostic pour Claude » : nombres seulement (réglages, profil, moteur et version de calcul IA, vitesse, temps d'export), aucune image.
