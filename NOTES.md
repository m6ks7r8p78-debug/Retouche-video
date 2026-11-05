# Notes de travail — Retouche vidéo

À lire en premier pour reprendre le projet. État au 4 novembre 2026 : **v3.3** (effacer une zone). Points de restauration : branches
`sauvegarde-v2.49`, `sauvegarde-v2.50`, `sauvegarde-v3.0`, `sauvegarde-v3.1`, `sauvegarde-v3.2`, `sauvegarde-v3.3` (les tags cités avant n'avaient jamais été créés :
l'envoi de tags est refusé par l'environnement de travail de Claude, d'où des branches). Serveur Cloudflare : **v5 en ligne**.

## Chantier en cours : v3.4 « IA rapide sur serveur (Kaggle) » — branche `serveur-ia` (pas encore sur `main`)
Pourquoi : l'IA « qualité maximale » prend ≈ 27–30 s par image sur l'iPhone du propriétaire (mesuré : 29,8 s/Mpx WebGPU ;
le calcul « 4 pixels par fil » n'y gagne que 12 %) → 50 h pour une vidéo 720×1280 de 4 min 40. Sur Kaggle (2 × T4 gratuites,
≈ 30 h/semaine) : 0,31 s/image sur une T4 en demi-précision.
- `serveur-ia/ia_serveur.py` : reproduction exacte de SR.run (mêmes poids sr.bin, mélange dn, ×4, RGBA8, réduction FRES).
  Mesuré contre l'app (6 cas) : PSNR 57–59 dB, écart max 2–6/255 (≤ 0,022 % des pixels > 2/255) → identique à l'œil.
- `serveur-ia/traitement_kaggle.py` : calcul Kaggle (2 GPU, une image par image du fichier dans l'ordre d'affichage,
  décodage BT.709 plage limitée, sortie H.264 qp 16 plage limitée, contrôles nombre d'images / tailles, info.json).
  Rang d'image : l'app convertit son numéro par `rdr.map(pl.a)` (l'horloge du fichier peut commencer après 0 : décalage
  de 2 images constaté sur les vidéos de test) ; le lecteur du résultat est un SeqReader avec setFps(0).
- `kaggle.js` (objet KG) : l'app pilote Kaggle directement (CORS OK pour api.kaggle.com et le dépôt GCS) avec le jeton
  gardé sur le téléphone (clé `kaggle_jeton`, jamais sauvegardée). Envoi accepté une fois transmis puis vérifié
  (ListDatasetFiles : nom + taille) car la réponse GCS n'est pas lisible par le navigateur. Jeu de données `<slug>-donnees`
  (titre distinct du calcul, sinon Kaggle refuse). Ménage : DeleteKernel + DeleteDataset.
- Relais `serveur-ia/relais.js` déployé : https://retouche-kaggle.retouche-ia.workers.dev (compte Cloudflare
  « Jmy.maelhys@gmail.com », 36afa5a6…, PAS celui du serveur des liens) — Kaggle ne sert pas ses sorties aux navigateurs.
- `index.html` : case `#o_srv`, `SRX.lancerServeur`, `SRX.remote.image(rang)` à la place de SR.run pendant l'export ;
  refus avec Time Repair / fluide / poussières ; erreurs distinctes (quota Kaggle). `studio.js` : jeton dans ⚙️ Paramètres,
  autorisation `cloud` + accord avant CHAQUE envoi.
- Tests : `tests/ia_serveur.test.mjs` (vrai Kaggle), `tests/serveur_ia_compare.py`, `serveur_ia_reference.mjs`, `serveur_ia_decodage.mjs`.
- Reste : test d'intégration complet réussi, vérifier que DeleteKernel est autorisé par le jeton, mesurer une vraie vidéo
  720×1280, documentation (README, CHANGELOG, SECURITE, AUTORISATIONS, GUIDE_IPHONE), fusion dans `main`.

## v5.6–5.7 (5 nov. 2026) — Premium et apps des stores, préparés et ÉTEINTS
Offres et prix : OFFRES.md ; allumer Premium : PREMIUM.md ; pubs : PUBLICITE.md ; apps : app-stores/README.md.
Interrupteurs : ABO_CONFIG.actif (abo.js), PUB_CONFIG.actif (site) et PUB_CONFIG.app.actif (apps).
Serveur des liens v6 (route /abo/verifier + origines de l'app) PAS encore déployé : il faudra une clé Cloudflare (Workers Scripts Edit).
Tests : abo (14), natif (10), pub (9), studio (11), sw (7). Compiler Android ici : SDK dans /home/claude/android-sdk (à réinstaller
dans une nouvelle session), Gradle avec --max-workers=1 (le proxy limite les téléchargements simultanés).

## v5.1 (5 nov. 2026) — domaine retoucheproai.com
Domaine acheté chez Cloudflare Registrar (compte « Jmy.maelhys », zone 2f6a5a7e…, jusqu'au 5 nov. 2027).
DNS : 4 A + 4 AAAA GitHub Pages sur la racine, CNAME www → m6ks7r8p78-debug.github.io, tous « DNS only » (pas de proxy).
Serveur des liens désormais sur ce même compte : retouche-serveur.retouche-ia.workers.dev (`LINK.SRV`).
Relais Kaggle redéployé avec l'origine retoucheproai.com. Fichier `CNAME` à la racine du dépôt.

## v5.0 (5 nov. 2026) — l'app s'appelle RetoucheProAI
Dépôt et adresse GitHub inchangés (Retouche-video). Format de sauvegarde inchangé (« retouche-sauvegarde ») pour garder les anciennes.
Domaines libres vérifiés le 5 nov. 2026 : retoucheproai.com / .fr / .app.

## v4.9 (5 nov. 2026) — publicités préparées, ÉTEINTES
`pub.js` (PUB_CONFIG en haut du fichier) ; mode d'emploi et étapes pour allumer : `PUBLICITE.md` ; tests : `tests/pub.test.mjs`.
Le propriétaire veut une app gratuite rentabilisée par des petites pubs + une pub de 3–5 s avant le téléchargement.
Note : `tests/v3.test.mjs` a 3 échecs (« Photo sombre … selectOption ») déjà présents en v4.8, sans lien avec les pubs.

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

## v3.5 (5 nov. 2026) — IA plus fidèle
Constat sur une vidéo test : avec l'IA seule (Équilibré, ai:1), peau lissée « plastique », reflets faux dans les yeux, virage orange.
- Mélange IA / version classique : Naturel 45 %, Équilibré 55 %, Détails 75 % d'IA (avant 70 / 100 / 100 %).
- Couleurs verrouillées sur la version classique (mode de fusion « color » à 85 %) : l'IA n'apporte que la netteté.
- Grain léger (motif 256 px, fusion « overlay » 35 %, décalé à chaque image pour ne pas rester figé).
- Code : SRX.compose dans index.html. Sauvegarde : tag sauvegarde-v3.4.

## v3.6 (5 nov. 2026) — réglage auto calé sur le style de la personne
Comparaison de ses réglages à la main avec le réglage auto (même vidéo, 0:01). Décalage appliqué après chaque réglage auto :
nettoyage −0,05 · luminosité −0,02 · contraste −0,10 · couleurs +0,17 · chaleur −0,06 · dominante ≥ 0,10 · netteté +0,33.
Code : bloc « v3.6 » juste après REC.apply(r) dans index.html. L'apprentissage existant (LEARN) continue par-dessus.

## v3.7 (5 nov. 2026) — réglages auto vraiment adaptés à chaque vidéo
Constat (diagnostics de 60 analyses) : netteté 0,3 et bruit 0,2 identiques partout (seuils de bruit jamais atteints),
chaleur −0,06 fixe, dominante 0,1 sans effet, nettoyage des couleurs qui dérivait de 0,7 à 0,05 (LEARN repartait du réglage précédent).
- Netteté = 1 − netteté mesurée / 70 (bornée 0,2–0,8) ; bruit = 0,1 + bruit mesuré × 0,6 (0,1–0,45) ;
  chaleur = −(gain bleu − gain rouge) × 0,15 (−0,08 à +0,02) : ne corrige que la dominante présente.
- Sur la vidéo de référence : 0,63 / 0,21 / −0,063, contre 0,67 / 0,20 / −0,057 réglés à la main par la personne.
- Contraste −0,10, couleurs +0,17, luminosité −0,02, nettoyage −0,05 restent appliqués par-dessus la base de l'analyse.
- LEARN.adapt : base fixe (sh 0,3, dn 0,2, cs 0,7) au lieu du réglage précédent → plus de dérive.

## v3.8 (5 nov. 2026) — fin de l'accumulation d'une vidéo à l'autre
Diagnostics v3.7 (5 vidéos) : netteté, bruit et chaleur varient bien selon la vidéo, mais luminosité −0,02 / contraste 0,90 /
couleurs 1,33 restaient identiques et le nettoyage baissait de 0,05 à chaque vidéo : ces réglages repartaient de la vidéo précédente.
Correctif : analyze() (lumière, contraste, couleurs de la vidéo courante) est relancée avant le style ; nettoyage repart de 0,7.

## v3.9 (5 nov. 2026) — moins froid, carrés de compression lissés
Retour : vidéo 848×480 (dominante 0,82/1,05/1,22, blocs 1,10) trop froide/bleue, carrés de compression gênants.
- Chaleur : −(bleu − rouge) × 0,10, bornée −0,04 à +0,02 (avant × 0,15, jusqu'à −0,08).
- Anti-blocs dès 1,08 (avant 1,25), force (r − 1)/0,25 (0,30 à 1) ; netteté × (1 − (r − 1,05) × 4), au moins × 0,55.
  Exemple blocs 1,10 : anti-blocs 0,40, netteté × 0,80.

## v3.10 (5 nov. 2026) — chaleur : juste un peu plus froid que l'original
Retour sur la vidéo 848×480 : correction −0,061 trop bleue, original « un tout petit peu trop orange ».
Chaleur = −(bleu − rouge) × 0,05, bornée −0,025 à +0,01. Cette vidéo : −0,02 ; vidéo de référence : −0,021.

## v3.11 (5 nov. 2026) — aperçu fluide
Depuis la v3.9, l'anti-blocs (2 passes GPU) est actif sur la plupart des vidéos → aperçu saccadé pendant la lecture.
Il est maintenant sauté pendant la lecture de l'aperçu seulement ; appliqué à l'arrêt, sur les photos et à l'export (qualité inchangée).

## v3.12 (5 nov. 2026) — noirs profonds conservés
Mesure sur captures v3.11 (vidéo sombre 848×480) : noirs 2 → 10, contraste 39,9 → 35,7 (image voilée), bleu−rouge −21 → −15, netteté +18 %.
Contraste −0,10 maintenant proportionnel à la hausse décidée par l'analyse (0 si contraste de base = 1) ; scène sombre (médiane < 0,25) : pas d'assombrissement.

## v3.13 (5 nov. 2026) — enregistrement du jeton Kaggle visible
Retour : « rien ne se passe » en touchant Enregistrer le jeton. Le message s'affichait tout en bas de la fenêtre Paramètres (hors écran).
Il s'affiche maintenant juste sous le bouton (avec défilement), et un jeton n'est effacé que si Kaggle le refuse (401/403), pas pour un souci réseau.

## v4.0 (5 nov. 2026) — mode simple par défaut
Demande : app plus simple pour débutant, peu de boutons, pas surchargée (« je m'y perds »).
- Mode simple (défaut, mémorisé dans localStorage « ui_mode ») : accueil = 3 étapes + « Choisir une vidéo » / « Choisir une photo » + lien.
  Écran de travail = aperçu, Lecture, Maintenir : original, taille (4K / Full HD / Origine), interrupteur « ⚡ Qualité IA », bouton Améliorer, puis Enregistrer.
- Masqués en mode simple : onglets Réglages/Outils, profils, analyse détaillée, assistant, rapports, regroupement, effacer une zone, Modèles IA, outils annexes.
- « ⚡ Qualité IA » pilote o_max ; avec un jeton Kaggle enregistré, il active aussi o_srv automatiquement (vidéos calculées sur Kaggle).
- Bouton « Mode expert » en haut : réaffiche toute l'app telle qu'avant (rien n'est supprimé).

## v4.1 (5 nov. 2026)
« Regrouper des vidéos » (collage) visible en mode simple, sur toute la largeur sous Vidéo / Photo.

## v4.2 (5 nov. 2026)
Mode simple : Vidéo / Photo / Regrouper côte à côte, par trois (demande de la personne).

## v4.3 (5 nov. 2026)
IA sur Kaggle aussi pour les vidéos déjà HD (1080p, 4K) : avant, l’IA y était sautée en silence (diagnostic : ia.actif null), donc Kaggle jamais appelé.
Sur Kaggle, l’image est ramenée à la moitié de la taille de sortie (params rw/rh), reconstruite ×2 par l’IA, puis mélangée à la version classique (compose).
Testé : script Kaggle en local (CPU) 1080×1920 → calcul 540×960 → sortie 1080×1920, 6/6 images ; export complet de l’app avec Kaggle simulé ; suites sw 7/7, studio 11/11. v3 : 3 échecs « photo sombre » déjà présents avant (sélecteur masqué par le mode simple v4.0).

## v4.4 (5 nov. 2026)
En-tête centré : la version (pastille bien lisible) est juste à côté du nom « Retouche », au milieu, au lieu d’être tout à droite. Si la place manque (texte agrandi), les boutons passent à la ligne, centrés.

## v4.5 (5 nov. 2026)
Kaggle en 4K : la lecture image par image exacte est toujours utilisée avec Kaggle (avant : limitée au Full HD, d’où « la lecture image par image s’est interrompue » après le calcul). Vérification de cette lecture AVANT tout envoi à Kaggle.

## v4.6 (5 nov. 2026)
Case Kaggle retenue entre deux ouvertures (avant : décochée à chaque ouverture, l’écran annonçait Kaggle mais l’IA tournait sur le téléphone ou pas du tout). Par défaut cochée dès qu’un jeton existe ; mode simple resynchronisé chaque seconde et juste avant l’export. Diagnostic : options.kaggle, options.jeton, options.ui.

## v4.7 (5 nov. 2026)
Barre de vitesse 0,75–1,30× (objet SPD dans index.html ; export via TR.go(vitesse), window.__planK garde vitesse et début pour le comparatif). Comparatif vidéo à curseur (#bsx, baSplit, baK) à la place de la grille côte à côte.

## v4.8 (5 nov. 2026)
Vitesse changée (barre ou Time Repair) : l'export lit la vidéo avec SeqReader (makeSeq) au lieu de la réserve de 3 lecteurs qui cherchent chaque image. Condition : plan qui avance (moins d'un retour en arrière pour 45 images) ; un retour en arrière relance makeSeq à cet endroit (prolongation). Lecture à l'envers : ancienne méthode. Image intermédiaire du ralenti : objet MFG (WebGL, une passe, déplacement interpolé entre les points de grille, bords répétés) ; repli automatique sur mfDrawWarped (2D) en cas d'échec, window.__mfg2d=true force l'ancienne méthode. mfFlow : copies bordées, résultat identique au bit près. « Voix plus claire » appliquée avant l'adaptation de durée (TR.audio).
Mesure faite par le propriétaire avant correctif (diagnostic du 5 nov., v4.7) : export à 0,85× d'une vidéo 624×1232 de 58 s non terminé.
