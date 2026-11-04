# Notes de travail — Retouche vidéo

À lire en premier pour reprendre le projet. État au 4 novembre 2026, version **v2.49** en ligne (GitHub Pages).

## Règles du projet
- Règle absolue : ne jamais sacrifier la qualité pour la vitesse ; viser le résultat le plus proche du parfait.
- Tout se calcule sur le téléphone (PWA), gratuit, utilisable par des débutants : réglages automatiques.
- Chaque changement est mesuré sur le banc de test avant publication, puis testé de bout en bout (aperçu, photo, photo animée, export vidéo, regroupement, avant / après) dans Chrome sans écran.
- Une version en test va d'abord sur une branche, puis sur `main` quand le test complet est réussi.
- Numéro de version : constante `VER` en haut du script de `index.html` (un seul endroit) ; changer aussi `C` dans `sw.js` quand des fichiers hors ligne changent.

## Ce que fait chaque pièce
| Pièce | Rôle |
|---|---|
| `index.html` | toute l'app : interface, rendu WebGL (shader `FS` : couleurs, filtres, protection des hautes lumières `hp`), analyse automatique `analyze()` / `REC`, export WebCodecs, son, outils |
| `sr.js` | « Qualité maximale » : Real-ESRGAN general v3 (64 canaux × 32 couches) en WebGL2 ; choisit `sr-gpu.js` (WebGPU) s'il marche, sinon WebGL2 |
| `sr-gpu.js` | même réseau en WebGPU (compute shaders), identique au WebGL2 à 0,02/255 près |
| `sr.bin` | poids du modèle en demi-précision (2 jeux : débruitage fort / faible, mélangés) |
| `depth.js`, `ort/` | effet de relief des photos animées (Depth Anything V2 Small via ONNX Runtime Web, 27 Mo téléchargés une fois) |
| `filtres.png` | 25 filtres Snapchat / Instagram (tables 17³ aller + retour) ; les 6 derniers appris sur de vraies paires avec / sans filtre |
| `serveur/worker.js` | serveur Cloudflare « retouche-serveur » (v4, en ligne) : récupère les vidéos depuis un lien ; origine limitée à l'app, redirections vérifiées, 40 demandes / min |

## Mesures clés (banc : 8 images Kodak abîmées, LPIPS plus bas = mieux)
| Méthode | Réseau social | Vieux téléphone | Filtre beauté |
|---|---|---|---|
| Simple agrandissement | 0,406 | 0,431 | 0,432 |
| App sans IA | 0,393 | 0,418 | 0,420 |
| Modèle IA (grand) | 0,341 | 0,346 | 0,371 |
| Modèle rapide (essayé, refusé) | 0,368 | 0,394 | 0,401 |

- Vitesse réelle de l'IA sur l'iPhone (iOS 27.2, WebGPU) : 26 à 42 s par mégapixel. Photo 720×1280 ≈ 30 s ; vidéo de plusieurs minutes : des dizaines d'heures → l'IA est décochée automatiquement au-delà d'1 h de calcul (on peut la recocher sur un extrait).
- Équilibre automatique des couleurs retiré (v2.49) : la règle « zones presque grises » voyait une fausse dominante sur 20 photos propres sur 24 et refroidissait l'image (peau prise pour du gris).
- Contraste automatique : le blanc n'est remonté que pour une image voilée ; une scène sombre voulue reste sombre (v2.46).

## Historique récent
| Version | Changement |
|---|---|
| v2.49 | équilibre auto des couleurs retiré ; IA décochée pour une vidéo de plus d'1 h de calcul ; durée estimée selon l'extrait |
| v2.48 | moteur IA WebGPU, repli WebGL2 |
| v2.47 | bouton « Copier le diagnostic pour Claude » (onglet Outils) |
| v2.46 | scènes sombres voulues plus éclaircies |
| v2.45 | protection des hautes lumières ; réglages appliqués dans le diagnostic |
| v2.44 | code simplifié (écriture MP4, encodeur, options) ; regroupement de vidéos avec son réparé |
| v2.43 | effet de relief ; contraste auto corrigé ; IA dans la photo animée ; serveur v4 |
| v2.39–v2.42 | arrivée de la qualité maximale (Real-ESRGAN), ancienne petite IA retirée |
| v2.38 | 6 filtres appris sur de vraies paires |
| v2.37 | son des exports réparé (configuration AAC) |

## Prochaines pistes
1. Optimiser le calcul WebGPU (aujourd'hui une petite part de la puissance de la puce) — conseillé en premier.
2. Modèle IA plus léger (moyen), à mesurer sur le banc.
3. Serveur avec carte graphique (payant, vidéos hors du téléphone) — à décider par le propriétaire.
4. Plus de paires photo avec / sans filtre (scènes variées) pour le retrait de filtre.
5. Simplifications restantes : un seul module de mesures d'image, un seul lecteur MP4, un seul thème CSS.

## Diagnostic
Onglet Outils → « 📋 Copier le diagnostic pour Claude » : nombres seulement (réglages appliqués, moteur IA, vitesse, temps d'export), aucune image.
