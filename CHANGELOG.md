# Journal des versions

## v9.0 (18 nov. 2026) — « Plein écran, rien coupé » : l'IA dessine les côtés (choix par défaut)
Demande du propriétaire : « invente-le » — la génération est désormais autorisée pour remplir la télé sans rien couper.
- **Nouveau choix « Écran »** (mémorisé) : « Plein écran, rien coupé » (défaut) · « Plein écran, rien inventé » (coupe) · « Image entière ».
- « Plein écran, rien coupé » = mode Zéro perte avec décor généré : la vidéo filmée est posée telle quelle (1080×1920 → 3414×1920,
  contrôle pixel par pixel à l'export) et les côtés sont dessinés par Stable Diffusion XL Inpainting sur ton serveur Kaggle gratuit
  (un décor par scène, qui suit la caméra ; personnes et visages exclus du décor inventé). Avec ton accord à chaque envoi.
- Un décor demandé n'est plus jamais remplacé en silence par du flou quand un contrôle de qualité n'est pas satisfait : raccord élargi,
  contrôle affiché dans la fiche, et « Relancer la reconstruction » disponible.
- Sans jeton Kaggle : message clair (seuls les bords proches sont dessinés sur le téléphone, le reste flou).
- Tests : `tests/format_zero.test.mjs` 3/3 (nouveau parcours par défaut, serveur simulé), Fidèle 18/18, WebKit 3/3, calculs 29/29.
  **La génération SDXL n'a encore jamais tourné sur une vraie carte Kaggle** (aucun jeton disponible dans l'espace de test).

## v8.9 (18 nov. 2026) — Changer de format : curseur « Garder plus d'image », et ce qu'on a cherché pour réduire la perte
Demande : le plein écran perd trop d'image ; trouver une solution sans rien inventer.
- **Piste étudiée et mesurée : le décor réellement filmé à d'autres moments** (quand la caméra bouge, les côtés ont parfois été filmés
  plus tôt ou plus tard). Mesuré sur les 6 vidéos de test (dont deux panoramiques) : la part de côté disponible en vrais pixels pour
  CHAQUE image est de 0 à 2 % de la largeur (au début d'un panoramique, le côté qu'on découvrira n'a encore jamais été filmé).
  Gain trop faible : non retenu pour le plein écran.
- **Nouveau curseur « Garder plus d'image »** (sous « Écran ») : de 0 % (plein écran, ≈ 68 % coupé en 9:16 → 16:9) à 100 % (image entière).
  Entre les deux, l'image garde plus de hauteur et les côtés restants reçoivent l'ambiance ; le cadre suit toujours les visages,
  aucun visage coupé (vérifié image par image). Exemple mesuré à 50 % : 66 % de l'image gardée, image sur 49 % de la largeur.
- Tests : `tests/format_fidele.test.mjs` 20/20 (RAPIDE : 18/18), `tests/format_fidele_webkit.test.mjs` 3/3.

## v8.8 (18 nov. 2026) — Changer de format : « Plein écran » par défaut, la vidéo remplit toute la télé
Demande du propriétaire : plus aucune bande, la vidéo doit prendre tout l'écran de la télé (toujours sans rien inventer).
- **Plein écran** (par défaut, bouton « Écran ») : l'image couvre toute la sortie 16:9. Pour une vidéo verticale, le haut et le bas sont
  coupés (≈ 68 % en 9:16 → 16:9 : c'est la seule façon de remplir sans inventer ni déformer) ; une fenêtre suit les visages et les
  personnes comme un cadreur (fixe si les sujets restent dans une même bande, sinon mouvement lissé sans retard ; visage aux 2/5 du cadre).
  Le fond reste élargi de 10 % au plus là où rien d'important ne se trouve (variante Fidèle), ce qui réduit un peu la coupe.
- **Aucun visage coupé** : contrôle sur 8 images par scène avant l'export, puis image par image à l'export ; un visage coupé déplace
  le cadre et la vidéo est refaite (testé : cadre faussé exprès → 114 visages corrigés, 0 restant).
- Sortie « télé » : 1080 px de haut pour une vidéo 1080×1920 (1920×1080) ; l'agrandissement est indiqué (interpolé, aucun détail réel
  récupéré ; « ✨ Améliorer cette vidéo » peut ensuite affiner).
- « Image entière » (bouton « Écran ») garde tout, côtés en ambiance floue, comme en v8.6.
- Tests : `tests/format_fidele.test.mjs` 19/19 (5 nouveaux Plein écran), `tests/format_fidele_webkit.test.mjs` 3/3 (WebKit, émulation iPhone),
  calculs 29/29. **Pas encore essayé sur ton iPhone ni sur une télé.**

## v8.7 (18 nov. 2026) — Changer de format : la vidéo envoyée « prend » enfin sur iPhone
Problème signalé : une vidéo envoyée dans Changer de format ne se chargeait pas.
- **Cause** : l'outil attendait que le lecteur vidéo du navigateur ait décodé une image, sur une balise vidéo hors de la page. Safari
  (iPhone) ne décode rien tant qu'une telle vidéo n'est pas lue : l'attente ne finissait jamais (« la vidéo met trop de temps à s'ouvrir »).
  Reproduit avec WebKit (moteur de Safari) en émulation iPhone sur une vidéo 1080×1920.
- **Correction** : balise attachée à la page (invisible), attente des seules métadonnées, puis amorçage (lecture muette interrompue) pour
  l'aperçu. Si le lecteur du navigateur refuse ou tarde (> 8 s) mais que WebCodecs sait lire le fichier, l'outil continue avec un aperçu
  en image fixe et repasse sur la vraie vidéo dès qu'elle répond. Vidéos de téléphone avec rotation (portrait stocké couché) : redressées.
- **Analyse automatique** dès l'envoi (format choisi tout seul) : plus besoin d'appuyer sur « Analyser la vidéo ».
- Relecture du fichier créé : si le lecteur du navigateur ne répond pas, lecture du conteneur MP4 lui-même (plus de faux « fichier non relu »).
- Tests : nouveau `tests/format_fidele_webkit.test.mjs` 3/3 (WebKit, émulation iPhone 15 Pro Max, envoi depuis l'accueil, analyse
  automatique, export) ; `tests/format_fidele.test.mjs` 13/13, `tests/format_zero.test.mjs` 2/2, calculs 29/29. **Pas encore essayé sur ton iPhone.**

## v8.6 (18 nov. 2026) — « Fidèle » : rendu amélioré, plus de grandes bandes noires
- **Côtés « ambiance »** (par défaut) : au lieu de bandes noires, la vidéo elle-même très floutée (flou gaussien), couleurs assourdies,
  assombrie vers les bords et détachée de l'image par une ombre douce. Aucun décor ni aucune forme : mesuré sur l'export, 0 contour
  détecté dans les côtés ; lissée dans le temps (saut max d'une image à l'autre : 0,7 niveau sur 255), remise à zéro à chaque changement
  de plan. L'image filmée reste intacte au pixel près (contrôle à l'export inchangé). Bandes noires toujours disponibles (fiche de scène).
- Tests : `tests/format_fidele.test.mjs` 14/14.

## v8.5 (18 nov. 2026) — « Fidèle » : vertical → horizontal SANS GÉNÉRATION, rien d'inventé
Demande du propriétaire : adapter une vidéo verticale en 16:9 en n'utilisant que les images réellement filmées, sans rien perdre,
sans déformation perceptible, et sans jamais activer en silence un recadrage ou une déformation.
- **Nouveau mode « Fidèle »** (par défaut dans Changer de format, module `format-fidele.js`) : déformation alignée sur l'axe, calculée
  par scène. Visages, personnes et animaux copiés pixel pour pixel (étirement = 1) ; seul le fond peu détaillé est étiré, sous le seuil
  de perception (10 %), en douceur ; le reste en bandes noires (ou flou de la vidéo elle-même, au choix). 100 % de l'image gardée,
  taille d'origine conservée (1080×1920 → 3414×1920), son, durée et cadence d'origine.
- **La contradiction est dite, pas cachée** : 9:16 → 16:9 ne peut pas être à la fois complet, non déformé, plein écran et sans ajout.
  Les autres méthodes (Proportions exactes, Remplissage accru, Remplissage total, Étirement uniforme, Recadrage) sont comparées avec
  leurs mesures dans la fiche de chaque scène et ne s'appliquent que si on les choisit.
- **Vérification image par image à l'export** : visages détectés sur chaque image ; colonnes non étirées comparées pixel par pixel à
  l'original ; stabilité mesurée. Visage manqué sous une zone étirée → protégé et vidéo refaite automatiquement. Carte (turquoise =
  copié tel quel, rose = étiré).
- Banc comparatif sur vraies vidéos (`RAPPORT_FIDELE.md`) : seam carving étudié et écarté (géométrie cassée, tremblement, ×2 000 plus lent).
- Tests : `tests/format_fidele_calcul.test.mjs` 9/9, `tests/format_fidele.test.mjs` 13/13 (Chromium, vraie app), non-régression
  `tests/format.test.mjs` 20/20, `tests/format_zero.test.mjs` 2/2, `tests/sw.test.mjs` 8/8. **Non testé sur iPhone.**

## v8.4 (16 nov. 2026) — « Zéro perte » : changer de format sans perdre un seul pixel
Demande du propriétaire : passer une vidéo verticale en horizontale (et l'inverse) sans AUCUNE perte — ni partie coupée, ni zoom, ni réduction.
- **Nouveau mode « Zéro perte »** (par défaut dans Changer de format) : le recadrage et le zoom sont interdits ; la vidéo est posée
  **à l'échelle 1, à une position entière** (copie pixel pour pixel) dans une sortie bâtie autour d'elle : 1080×1920 → **3414×1920**,
  720×1280 → 2276×1280 (jamais réduite ; au-delà de 4096 px de côté, limite des encodeurs, la réduction est calculée et SIGNALÉE).
- **Aucun pixel filmé n'est recouvert ni fondu** : le raccord se fait du côté ajouté seulement (bord de l'image reflété en miroir sur
  quelques pixels, en fondu vers le décor).
- **Contrôle à l'export** : toutes les ~12 images, l'image d'origine est relue DANS le rendu et comparée pixel par pixel à l'image seule ;
  le bilan affiche le résultat (essai : 10 images, 2,3 millions de pixels, **0 différence**). Débit de fichier le plus haut
  (et quantification fixe fine quand l'appareil la propose) pour réduire au minimum la perte due à la compression.
- **Décor complet sur le serveur gratuit (Kaggle)** : avec un jeton Kaggle, les côtés ajoutés ne finissent plus en flou. Seuls les décors
  de scène partent (images fixes : vrais pixels retrouvés grâce au mouvement de la caméra + trous), jamais la vidéo ; chaque trou est rempli
  par **Stable Diffusion XL Inpainting 0.1** (Open RAIL++-M, usage commercial permis) fenêtre par fenêtre, couleurs recalées sur le réel,
  puis agrandi par le Real-ESRGAN de l'app pour avoir la netteté du centre (`serveur-ia/extension_kaggle.py`, `KG.etendre`). Le décor est
  calculé une fois par scène et suit la caméra (pas de scintillement). Visage apparu dans la zone inventée → retiré. Refus ou échec →
  reconstruction du téléphone (portée MI-GAN) puis prolongement flou, l'image filmée restant entière.
- Tests : `tests/format.test.mjs` 20/20 (4 nouveaux), `tests/extension_kaggle_test.py` 3/3, `tests/format_zero.test.mjs` 2/2 (Chromium,
  vraie app, serveur Kaggle simulé). **Jamais exécuté sur une vraie carte Kaggle ni sur iPhone.**

## v8.3 (15 nov. 2026) — Fidélité d'abord : la vidéo n'est plus dénaturée, l'IA n'est utilisée que si elle aide vraiment
Constat (capture du propriétaire, vidéo 640×360) : peau rougie, blancs brûlés, contours durs. Mesures :
- **Réglage automatique** : trois décalages systématiques hérités de la v3.6 dénaturaient TOUTES les vidéos : saturation +17 %,
  assombrissement −0,02, refroidissement « monde gris » (la peau était prise pour une dominante orange). Écart de couleur à
  l'original (ΔE Lab) : **7,0 → 3,0**, soit exactement l'écart de la vidéo non retouchée affichée par le navigateur (3,06) ;
  netteté, débruitage, anti-blocs gardés. Les réglages appris de tes retouches manuelles restent appliqués.
- **L'IA locale (Real-ESRGAN) dénature** : contre la vraie image (vidéo HD réduite), elle est MOINS fidèle qu'un simple
  agrandissement — LPIPS 0,120 contre 0,105 (vidéo compressée), 0,093 contre 0,033 (vidéo propre).
Nouveautés :
- **Épreuve de vérité** (à chaque vidéo, ~1 s sur iPhone) : 3 extraits sont réduits de moitié, l'IA les reconstruit et on les
  compare aux vrais extraits. Si l'IA ne fait pas mieux qu'un agrandissement, elle est retirée pour cette vidéo, avec un message
  chiffré : rendu fidèle et export qui passe de plusieurs heures à quelques minutes. Recochable à la main.
- **Verrou de fidélité** (dernière étape du rendu, aperçu et export, avec ou sans IA) : la forme et les tons restent ceux de la
  vidéo ; le traitement n'apporte que le détail fin, jamais hors de l'enveloppe locale de l'original (pas de halo, reflet ou tache
  inventés). IA + verrou : LPIPS 0,120 → 0,112 (compressée), 0,093 → 0,066 (propre).
- **IA par images clés** (`iak.js`, export vidéo) : l'IA n'est calculée que sur une image clé ; le détail qu'elle ajoute est
  déplacé selon le mouvement mesuré vers les images suivantes ; nouvelle clé si le mouvement devient incertain ou toutes les
  8 images. **3,5 à 7,5 fois moins de calcul IA**, et plus fidèle que l'IA sur chaque image (LPIPS 0,110 contre 0,120 ;
  0,056 contre 0,093) car le bruit propre à chaque image n'est plus « réinventé ».
- Tests : `tests/iak.test.mjs` (5), `tests/epreuve.test.mjs` (5) ; banc reproductible `outils/iak/`.

## v8.2 (15 nov. 2026) — Moteur Cinéma : contrôle qualité v2, issu des recherches RNE de ChatGPT
- Le contrôle du résultat SeedVR2 reprend les méthodes mises au point par ChatGPT (RNE 0.4 à 0.17) :
  - **par zone** (grille 4×4, RNE 0.13) : une zone inventée ou abîmée est repérée même si l'image entière semble correcte ;
    zones unies ignorées ;
  - **Census** (RNE 0.14) : seconde chance pour une zone quand seule la lumière a changé ; il peut sauver une zone, jamais en
    condamner une (leçon de RNE 0.15 sur les refus inutiles) ;
  - **stabilité dans le temps** (QA temporelle, RNE 0.4/0.9/0.10) : écart compensé par le mouvement entre images voisines,
    restauration contre vidéo d'origine ; coupes de plan et mouvements peu fiables écartés ;
  - **atténuation au lieu du tout-ou-rien** (RNE 0.17) : en cas de léger doute, seuls 70 % du détail ajouté sont gardés ;
    refus franc → IA standard.
- Lecture des images de contrôle à mémoire bornée (seules les images utiles sont gardées), utile pour les longues vidéos.
- Tests : `tests/cinema_kaggle_test.py` passe de 5 à 8 cas (scintillement ajouté refusé, zone inventée refusée, léger doute
  atténué à 0,70 ; résultat fidèle gardé à 100 %).

## v8.1 (15 nov. 2026) — Moteur Cinéma (essai) : restauration vidéo SeedVR2 sur le serveur Kaggle
- Nouvelle case **« Moteur Cinéma (essai) »** sous « IA rapide sur serveur gratuit (Kaggle) ». Au lieu de Real-ESRGAN
  (un réseau d'images de 2021, image par image), le serveur utilise **SeedVR2 3B** (ByteDance Seed, ICLR 2026, Apache-2.0) :
  un modèle de restauration **vidéo** par diffusion en une étape, entraîné sur de vraies vidéos, qui reconstruit textures,
  contours et visages en tenant compte des images voisines (pas de scintillement image par image).
- Pourquoi maintenant : la recherche de ChatGPT (moteurs maison RNE 0.1 → 0.20, 14–15 nov.) montre qu'un petit réseau
  entraîné de zéro sur nos 157 vidéos gagne au mieux +0,3 dB sur l'agrandissement simple, et qu'aucune variante n'a passé
  ses propres critères. Le saut de qualité ne viendra pas d'un réseau de 13 000 paramètres mais d'un modèle de 3 milliards.
- Sécurité qualité côté serveur (`serveur-ia/cinema_kaggle.py`) : couleurs recalées sur l'original (LAB), contrôle de
  structure sur ~32 images (SSIM de luminance contre l'image d'entrée), contrôle des couleurs, du nombre et de l'ordre exact
  des images, et du temps (session Kaggle de 12 h). **Au moindre doute, repli automatique sur l'IA standard** dans le même
  calcul ; l'app affiche quel moteur a réellement servi et pourquoi.
- Deux cartes graphiques : la vidéo est coupée en deux segments avec 8 images de contexte, recollés sans décalage (testé).
- Le résultat garde exactement le contrat de l'IA standard (une image par image du fichier, taille d'export) : couleurs,
  mélange avec la version classique, protection des hautes lumières, son et encodage restent ceux de l'app.
- Sans la case : rien ne change (même script, pas d'Internet pour le calcul — vérifié par test).
- Tests : `tests/cinema_kaggle_test.py` (5 cas : résultat fidèle accepté avec ordre exact à la jonction des 2 cartes, une
  carte, images inventées refusées, images manquantes refusées, couleurs déplacées refusées) ; `tests/kaggle_cinema.test.mjs`
  (2 cas : envoi Cinéma / Standard inchangé). **Pas encore exécuté sur une vraie carte graphique Kaggle** (pas de carte ni de
  jeton dans l'environnement de Claude) : premier essai réel = le tien.

## v8.0 (14 nov. 2026) — Changer de format (vertical ↔ horizontal, carré, 4:3, 21:9, sur mesure)
- Nouvel outil **« Changer de format »** (studio → outils, et bouton « 📐 Changer le format de cette vidéo » dans l'atelier) :
  importer → choisir le format (ou « Auto ») → analyser → prévisualiser (curseur avant/après, scène par scène) → exporter.
- **Directeur par scène** : la vidéo est découpée en plans ; pour chacun, l'app compare recadrage suivi, décor retrouvé,
  décor reconstruit, hybride et prolongement flou, et garde le moins coûteux (sujets perdus, image perdue, part inventée).
  Trois façons de faire : **Auto**, **Fidélité** (rien d'inventé), **Reconstruction max**.
- **Décor retrouvé** : quand la caméra bouge, les côtés manquants sont repris des autres images de la scène (vrais pixels).
  **Décor reconstruit** (MI-GAN, déjà utilisé par « Effacer une zone ») seulement jusqu'à la profondeur où il reste crédible ;
  au-delà, fondu vers un prolongement flou. Le décor est calculé une fois par scène et suit la caméra : pas de scintillement.
- **Suivi des sujets** : visages (YuNet) + personnes, animaux, objets (nouveau modèle EfficientDet-Lite0, 4,6 Mo, Apache-2.0,
  téléchargé à la demande) ; cadre lissé, pas de visage coupé.
- **Contrôle qualité mesuré** (raccord, lumière, scintillement, netteté, répétition, sujets, fluidité) : si un seuil est dépassé,
  une autre méthode est essayée. Les chiffres affichés sont des mesures ; la carte rose montre les pixels inventés.
- Bandes noires d'origine retirées avant conversion ; son d'origine recopié tel quel ; résolution et cadence réglables ;
  reprise de l'analyse si la même vidéo est rouverte ; passage direct vers « Améliorer cette vidéo ».
- Limite connue : une vidéo verticale filmée caméra à la main vers 16:9 demande d'inventer ~68 % de l'image ; aucun modèle
  gratuit tournant sur téléphone ne le fait de façon crédible → l'app choisit alors le prolongement flou ou l'hybride et le dit.
- Tests : `tests/format.test.mjs` (16, calcul pur) et `tests/format_app.test.mjs` (16, de bout en bout dans Chromium). Fiche F32.
## v7.7 (13 nov. 2026) — retrait de filtre en vidéo : moins de restes, transitions douces
- La zone retirée suit maintenant le liseré et l'ombre de l'élément : moins de traces sombres autour du nez ou des oreilles
  reconstruits (mesuré : zone 10 % plus proche de la vraie vidéo).
- Quand la tête tourne beaucoup et qu'une nouvelle reconstruction prend le relais, le passage se fait en fondu au lieu d'un saut.

## v7.6 (12 nov. 2026) — visages en vidéo : plus nets et plus stables
- « Restaurer les visages » en vidéo recale maintenant chaque image sur la première avant de reporter les détails (même recalage
  que le retrait de filtre). Mesuré sur 4 portraits à vérité connue : visage plus proche de la vraie image et scintillement en
  baisse de 18 % ; le résultat dépasse désormais la restauration image par image, pour 2,7 fois moins de calcul.

## v7.5 (12 nov. 2026) — retirer un filtre du visage en vidéo (essai)
- Nouvelle case « Retirer le filtre du visage (IA, essai) » à l'export vidéo (mode expert) : museau, oreilles, autocollants… sont
  retirés sur toute la vidéo avec UNE seule reconstruction qui suit la tête, au lieu d'une reconstruction différente à chaque image.
  Mesuré sur vidéos de test à vérité connue (filtres simulés) : zone 2,5 fois plus proche de la vraie vidéo, et scintillement
  divisé par 2,6 par rapport à l'outil photo appliqué image par image (qui, lui, scintille plus que la vidéo d'origine).
- Suivi du visage plus précis : chaque image est recalée finement sur la première (le repérage seul se trompait de plusieurs degrés).
- Les deux options vidéo se combinent : le filtre est retiré, puis les visages sont restaurés sur l'image nettoyée.
- Visages en vidéo : image encore plus stable (correction de lumière par les images voisines).

## v7.4 (12 nov. 2026) — visages restaurés en vidéo (essai)
- Nouvelle case « Restaurer les visages (IA, essai) » à l'export vidéo (mode expert) : le visage est suivi, une image sur 3 est
  restaurée par l'IA après fusion avec ses voisines, et les détails sont reportés sur toutes les images en suivant le visage.
  Mesuré sur une vidéo de test à vérité connue : visage 21 % plus proche de la vraie image, sans scintillement ajouté.
- Méthode choisie sur banc d'essai (5 méthodes comparées) : 2,7 fois moins de calcul qu'une restauration image par image, pour une
  qualité proche et une image plus stable. Calcul long sur téléphone : réservé aux vidéos courtes.

## v7.3 (12 nov. 2026) — outils plein écran au style du studio
- « Effacer une zone », « Retirer un filtre du visage » et « Restaurer les visages » reprennent le système du studio (toujours
  sombres pour juger l'image, accent ambre, boutons et curseurs identiques, commandes centrées sur ordinateur). Aucun changement de calcul.

## v7.2 (12 nov. 2026) — nouveau studio
- Accueil entièrement recomposé : la page de présentation devient un espace de travail. Zone d'import centrale (glisser-déposer
  sur ordinateur, boutons Vidéo / Photo) qui se replie quand un média est ouvert ; déroulé en 4 étapes qui suit l'état réel.
- Outils rangés par besoin (Restaurer / Reconstruire) avec badge IA ou essai ; colonne Activité = vrai historique de l'appareil.
- iPhone : une colonne, barre d'onglets en bas (Importer, Outils, Activité, Modèles), en-tête compact.
- Une seule feuille de styles (gris neutres pour juger l'image, accent ambre, sarcelle pour l'analyse IA) à la place de 6 couches.

## v7.1 (12 nov. 2026) — retrait de filtre appris sur de vrais filtres Snapchat
- « Retirer un filtre du visage » : nouveau détecteur (v3), entraîné aussi sur 74 vrais clips filtrés du propriétaire (avec son accord,
  jamais publiés) et sur 359 visages NASA du domaine public. Sur une vidéo jamais vue : précision 39 % → 93 %, éléments retrouvés
  27 % → 66 % ; sur l'autre : 13 % → 87 % et 12 % → 75 % ; pixels effacés à tort divisés par 6 à 10.
- Nouveau « veto mains » (MediaPipe, Apache-2.0) : ongles, doigts, cigarette, bague posés sur une main ne sont plus effacés.
- Mesuré et NON intégré (pas mieux que de ne rien faire sur les vraies paires) : retour de la texture de peau après lissage, retrait
  du maquillage des lèvres, correction automatique des proportions (le réglage guidé « Proportions » reste).

## v7.0 (12 nov. 2026) — retirer un filtre du visage (essai)
- Nouveau « Retirer un filtre du visage (IA, essai) » : repère automatiquement ce qu'un filtre a dessiné (museau, moustaches,
  oreilles, nez, autocollants, lunettes, couronne…), l'efface et reconstruit la peau et le visage en dessous, sur le téléphone.
  Carte rose de ce qui est reconstruit. Une photo sans élément de filtre n'est pas touchée.
- « Proportions » : curseurs yeux / nez / bas du visage pour défaire un filtre qui agrandit les yeux ou affine le visage, avec ta
  photo sans filtre affichée à côté pour comparer (elle reste sur ton téléphone).
- Détecteur appris dans notre laboratoire (1,5 Mo) ; mesuré sur des personnes jamais vues : écart à la vraie photo réduit de 57 %
  (museau de chien), 50 % (éléments variés), 25 % (moustaches de chat). Pas encore essayé sur de vrais filtres Snapchat/Instagram.

## v6.9 (11 nov. 2026) — restauration des visages sur photo (essai)
- Nouveau « Restaurer les visages d'une photo (IA, essai) » (accueil, et après le traitement d'une photo) : chaque visage est
  repéré, redressé, restauré par GFPGAN 1.4 sur le téléphone (86 Mo téléchargés une fois, avec accord), recalé en couleur puis
  recollé avec un bord fondu. Force réglable (80 % par défaut) sans relancer le calcul ; avant/après à glissière ; carte rose des
  détails inventés et pourcentage affiché. Un visage déjà net n'est pas touché (mesuré : le restaurer quand même le changerait).
- Mesuré sur 25 portraits du domaine public dégradés (vérité terrain connue) : ressemblance perçue (LPIPS) 0,45–0,59 → 0,19–0,21 ;
  forme du visage (5 repères) plus juste ; ≈ 8 % de la surface du visage inventée à 80 %. Chromium : ≈ 20 s par visage (1 fil).
- Nouveau `REGISTRE_LIVRAISON_PERMANENT.md` : état réel de chaque fonction, preuves, historique, prochaine tâche.
- Limites : photo seulement ; pas encore essayé sur iPhone (mémoire ≈ 0,75 Go mesurée sur ordinateur) ; licence des poids à
  trancher avant tout usage commercial (StyleGAN2 NVIDIA / FFHQ non commerciaux) — voir le registre, fiche F13.

## v6.8 (11 nov. 2026) — éléments de filtre proposés automatiquement, export pour X, nouveau thème
- **Effacer une zone** : nouveau bouton « 🎭 Proposer les éléments de filtre (visage) ». L'app repère le visage sur le téléphone
  (modèle YuNet, 233 Ko, licence MIT, livré avec l'app, empreinte vérifiée) et pré-remplit le masque là où la couleur n'est ni la
  peau, ni les cheveux, ni le fond : truffe/museau, oreilles, lunettes, langue, joues, couronne. Ce sont des hypothèses avec un
  niveau de confiance : rien n'est effacé sans validation, et tout se corrige au pinceau. Ne reconnaît personne.
- `visage.js` : suivi d'un visage dans une vidéo (trous courts comblés, coupes respectées, tremblement réduit) et report d'un
  masque d'une image à l'autre. **Calculé et testé, pas encore utilisé pour effacer dans une vidéo** (voir limites).
- **Préparer pour X** : deux cases dans les options d'export (720p, ou 1080p avec X Premium) ; H.264, débit entre 5 et 25 Mb/s.
- Serveur de consentement écrit et testé (`serveur-consentement/`), **non déployé** ; aucun média n'est envoyé.
- Nouveau thème « Néon » (clair et sombre) sur l'app et les pages ; aucune mise en page ni fonction modifiée.
- Tarifs : la phrase « tes vidéos ne quittent jamais ton appareil » devient « par défaut ; tout envoi facultatif demande ton accord ».
- Limites : zones réglées sur un seul visage de test avec des accessoires dessinés, pas sur de vrais filtres ; déformations du
  visage et maquillage non détectés ; pas d'effacement en vidéo ; pas de restauration de visage (aucun modèle à la fois assez
  léger pour l'iPhone et de licence vérifiée) ; export X non essayé sur un vrai iPhone. Détail : `RAPPORT_TESTS_FINAL.md`.

## v6.7 (11 nov. 2026) — diagnostic des filtres, tailles de sortie honnêtes, centre de contribution (sans envoi)
- Nouveau `analyse.js` : mesures de l'image, détection prudente des filtres de couleur/lumière (confiance, réversible ou non), modes
  Fidélité / Reconstruction IA, cibles 720p/1080p/4K étiquetées, tuiles sous budget mémoire, contrôle du scintillement, profil
  « Préparer pour X » (calculé et testé, pas encore relié à un bouton d'export).
- « Retirer un filtre » affiche ce diagnostic et la taille de sortie conseillée. Aucun calcul d'image ou d'export modifié.
- Centre « Contribution volontaire » dans ⚙️ Paramètres (accords par personne et par usage, enregistrés sur l'appareil) et
  `contribution.js` (cycle de vie, verrou d'envoi, invitations, registre chaîné). **Aucun média n'est envoyé.**
- Accueil : « 100 % privé » remplacé par « Local par défaut » (l'IA sur serveur, facultative, envoie la vidéo).
- Nouveau test `tests/v67.test.mjs` (18 cas, calculs réels). Non fait : retrait automatique des accessoires AR et déformations,
  restauration de visage, serveur de consentement. Détail : `RAPPORT_TESTS_FINAL.md`.

## v6.6 (11 nov. 2026) — exports 4K qui ne plantent plus quand l'iPhone manque de mémoire graphique
- Constat dans les diagnostics reçus (42 exports sur iPhone, 5–10 nov.) : 30 réussis, **12 échoués, tous sur des vidéos 4K**
  (2160×3840 et 2016×3840) : « Encoding task failed » puis « Canvas has no frame » sur chaque nouvel essai. L'iPhone retirait le
  moteur graphique (mémoire saturée) et l'app ne le récupérait jamais : il fallait la fermer.
- Le moteur est maintenant récupéré : l'export attend son retour et reprend **à la même image**, sans perte ni image noire
  (jusqu'à 4 reprises) ; s'il ne revient pas, message clair. L'aperçu se redessine tout seul.
- Moins de mémoire graphique : les textures de travail ne sont créées que pour les étapes qui tournent vraiment
  (avant : 5 × 33 Mo d'office pour une vidéo 4K) ; 4 images décodées gardées au lieu de 6 pour les grandes vidéos.
- Nouveau test `tests/moteur_graphique.test.mjs` : retire le moteur exprès (aperçu, milieu d'export, avant export, sans retour).
- Rendu inchangé (même calcul, pixels identiques vérifiés par le test).

## v6.5 (11 nov. 2026) — ouverture instantanée aux visites suivantes, téléphone moins sollicité
- Hors-ligne repensé (`sw.js`) : l'app s'ouvre depuis le téléphone sans attendre le réseau (avant : chaque fichier était redemandé au
  serveur à chaque ouverture). Chaque version est installée en entier avant d'être utilisée ; une nouvelle version s'installe en
  arrière-plan et la page se recharge toute seule, sauf si une photo ou une vidéo est ouverte (elle arrive alors à l'ouverture suivante).
  Les téléchargements venant d'autres sites (modèles IA, serveurs) ne passent plus par le service worker.
- Garde-fou : `sw.js` porte l'empreinte `H` de tous les fichiers hors ligne ; `node tests/sw.test.mjs` échoue si elle n'est plus à jour.
  **À chaque version : changer le numéro du cache `C`, puis `node tests/sw.test.mjs --maj`.**
- Nouveau test `tests/sw_reel.test.mjs` (vrai service worker dans Chrome, 9 cas) : deuxième ouverture sans aucune demande au serveur,
  ouverture sans connexion, mise à jour automatique, pas de rechargement pendant un travail.
- La démonstration avant/après de l'accueil n'anime plus rien dès qu'elle n'est plus visible (avant : 60 réveils par seconde pendant
  toute la séance, export compris). Les deux polices de l'accueil sont demandées dès le début du chargement.
- Vérifié avant de choisir : pas de code mort dans le noyau (207 déclarations, 1 inutilisée de 5 octets) ; retirer les commentaires
  ne gagnerait que 36 Ko compressés à la première visite, pour un dépôt illisible — non retenu.
- Aucun calcul d'image, de son ou d'export modifié.

## v6.4 (6 nov. 2026) — app allégée : ouverture plus rapide, rendu identique
- Le noyau (≈ 250 Ko de code) est sorti d'`index.html` vers `app.js` ; `index.html` passe de 313 Ko à 59 Ko.
- Tous les scripts sont différés (`defer`) : l'écran s'affiche avant que le code soit lu, même ordre d'exécution qu'avant.
- « Effacer une zone » (`effacer.js`, `marquage.js`) et le relief (`depth.js`) ne sont plus lus au démarrage : chargés à la demande,
  et préchargés quand le téléphone est libre (le gestionnaire « Modèles IA » les connaît comme avant).
- Hors-ligne : ~7 Mo de fichiers lourds (`sr.bin`, `rnnoise.mjs`, EdgeTAM) téléchargés en arrière-plan après l'installation au lieu de
  bloquer la première ouverture ; les fichiers du serveur Kaggle (.py), inutiles sur le téléphone, ne sont plus mis en cache.
- Secours MP4 (jsDelivr, empreinte vérifiée) chargé sans `document.write` ; mode simple dans `mode-simple.js`, fin du démarrage dans `demarrage.js`.
- Aucun calcul d'image, de son ou d'export modifié. Mesure (Chrome, processeur ralenti ×6) : page prête ~15–25 % plus tôt.

## v6.3 (6 nov. 2026) — l’export ne reste plus bloqué derrière l’analyse automatique : il attend 4 s au plus, l’analyse s’arrête net sans modifier les réglages, et chaque étape de l’analyse a une durée maximale.

## v6.2 — 5 novembre 2026 (IA rapide : vidéos que l'iPhone ne relit pas image par image)
- Avant : « IA rapide : cette vidéo ne peut pas être relue image par image sur ton iPhone » (vidéo HD/HDR récente), export refusé.
- Maintenant : l'original est lu par le lecteur vidéo, et le rang de l'image du serveur est recalé sur lui (SRX.caler :
  8 images loin des bords, décalage −4…+4, corrélation de la luminance, insensible aux couleurs HDR). Refus seulement si le
  fichier est illisible ou si la correspondance est < 60 %. Message d'erreur sans le conseil incohérent « Choisis Full HD ».
- Diagnostic : raison précise de l'échec de la lecture image par image et résultat du recalage (champ `seq`).
- Tests (lecture image par image coupée, NOSEQ=1) : 0,75× 43,9 dB (min 40,6) ; 1,30× 43,4 dB ; vitesse normale 43,8 dB.

## v6.1 — 5 novembre 2026 (IA rapide sur serveur + vitesse)
- L'IA rapide sur serveur marche maintenant avec la barre de vitesse (0,75× à 1,30×), Time Repair (ralenti, accéléré,
  lecture à l'envers) et « Mouvement plus fluide ». Avant, l'export s'arrêtait avec « ne fonctionne pas encore avec Vitesse et sens ».
- Images intermédiaires des ralentis : les deux images voisines restaurées par le serveur sont fondues avec le même
  mouvement estimé que la version classique.
- Lecture à l'envers : le serveur place des images clés toutes les 4 images (option `gop`), et l'app relit l'original
  et le résultat du serveur image par image, avec le même lecteur (aucun décalage entre l'image IA et l'image classique).
- Tests : tests/ia_serveur_vitesse.test.mjs (Kaggle simulé ; 0,75× et 1,30× : 44 dB contre l'export sans IA ;
  à l'envers : images alignées, corrélation 1,000 ; mouvement fluide : 44,5 dB).

## v6.0 — 5 novembre 2026 (caméra virtuelle, essai)
- **Caméra virtuelle** (`camera.js`, case « Caméra virtuelle (essai) » dans les options de la vidéo, décochée par défaut) :
  fiche de l'appareil qui a filmé (marque, modèle, année, format, codec, débit, lus dans le fichier : MP4, MOV, 3GP, AVI, AVCHD) et
  mesures de son objectif sur 6 images (coins sombres, franges colorées sur les bords, flou en pixels). Les défauts sont défaits dans
  l'ordre inverse de leur apparition : compression (anti-blocs) → capteur (débruitage) → objectif (franges et coins avant le nettoyage
  des couleurs, flou après le débruitage) → rendu de référence. Case décochée : rendu identique au pixel près (testé).
- Franges : correction étalonnée sur l'image elle-même (dans une vidéo compressée, la couleur est en demi-définition : le décalage
  mesuré ne se corrige pas 1 pour 1). Mesuré sur une vidéo simulée : franges 0,0019 / −0,0025 → −0,0003 / 0,0003 ; coins 0,61 → 0,75
  du centre ; flou 1,69 → 1,40 px.
- **Diagnostic anonyme** (facultatif, demandé une fois après un premier résultat) : envoi au serveur de l'app (route `/diag`, base D1,
  13 mois) des nombres seulement. Serveur v7 déployé le 5 nov. 2026 (voir DIAGNOSTIC.md).
- Tests : `tests/camera.test.mjs` (mesures sur images dégradées), `tests/camera_app.test.mjs` (de bout en bout dans Chrome),
  `tests/diag_serveur.test.mjs` (route /diag avec SQLite) ; simulateurs `tests/camera_simuler.py`, `tests/camera_video.py`.

## v5.9 — 5 novembre 2026 (premier écran)
- Avant / après réel sur la page d'accueil (photo de vieux téléphone traitée par l'app elle-même, sans retouche ; détails dans
  demo/LISEZ-MOI.txt) : le curseur glisse tout seul, s'arrête dès qu'on le touche ; immobile si « réduire les animations ».
- Engagements visibles : « 100 % privé · Gratuit · Sans compte ». Gros bouton « Choisir une vidéo », les autres en dessous.
- En-tête sur une seule ligne (le ⚙️ ne passe plus à la ligne) ; numéro de version masqué en mode simple.
- Carte « Ajouter à l'écran d'accueil » : seulement sur iPhone/iPad ; sur Android, vrai bouton « Installer ».
- « Copier le diagnostic » (sans « pour Claude »).
- Banc de qualité : passe en mode expert tout seul (les réglages sont cachés en mode simple).
- Idées des prochaines versions : ROADMAP.md.

## v5.8 — 5 novembre 2026 (partie légale complète, page Guide)
- Nouvelles pages : Mentions légales (régime non professionnel, LCEN art. 1-1 II), Conditions d'utilisation, Conditions de vente
  (prêtes, pas encore en vigueur, noindex), Licences et crédits ; Confidentialité réécrite (responsable, bases légales, cookies,
  transferts, droits, CNIL). Feuille de style commune pages.css. Pied de page de l'app avec tous les liens.
- Page Guide (étapes, rendus, astuces, questions fréquentes). robots.txt et sitemap.xml.
- marquage.js : les photos passées par « Effacer une zone » portent la mention IPTC « généré en partie par IA » (AI Act art. 50 §2).
- Premium : prix TTC, case d'accord avant paiement (perte du droit de rétractation), lien « Résilier un abonnement ».
- « Retirer un filtre de réseau social » (plus de marques tierces dans l'interface).
- Fiches App Store / Google Play prêtes : app-stores/FICHES_STORES.md. État légal : LEGAL.md.
- Tests : tests/pages.test.mjs (4 réussis) ; le serveur de test sert aussi CSS, polices, textes.
- Correctif : les polices de l'app ne se chargeaient pas en ligne depuis la v3.2 (chemins relatifs faux dans polices/polices.css,
  invisibles en test car le serveur de test ne servait pas le CSS) : le site s'affichait avec les polices du système.
  Le test des polices vérifie désormais qu'elles sont réellement chargées.

## v5.7 — 5 novembre 2026 (apps App Store et Google Play préparées)
- Dossier app-stores/ : app Capacitor 8 (com.retoucheproai.app) qui reprend l'app web ; APK Android d'essai compilé.
- natif.js : « Enregistrer » par le cache de l'app et la feuille de partage ; « Colle un lien » masqué dans l'app.
- pub.js : pubs AdMob dans l'app (bannière, pub récompensée, consentement Google, demande de suivi d'Apple), éteintes.
- abo.js : achats intégrés Apple / Google (RevenueCat), « Restaurer mes achats », Premium retrouvé au démarrage.
- Nouvelle icône (dégradé de la marque) pour l'app et le site ; écrans de démarrage.
- Compilation dans le cloud : .github/workflows/apps-stores.yml (Android + iPhone sur Mac GitHub, versions signées sur demande).
- Serveurs : origines de l'app (capacitor://localhost, https://localhost) ajoutées — à déployer avec la v6 du serveur.
- Tests : tests/natif.test.mjs (10 réussis).

## v5.6 — 5 novembre 2026 (offres Gratuit / Premium préparées, éteintes)
- Étude de marché et décisions : OFFRES.md (Pass 7 jours 2,99 €, Mensuel 5,99 €, Annuel 34,99 €).
- `abo.js` : droits Premium, cadenas sur 4K / IA / filtre / effacer / Time Repair / regrouper / lot, fenêtre d'offre,
  activation par code Polar, achats intégrés des stores (RevenueCat), hors ligne réservé à Premium, aucune pub pour Premium.
  Éteint (`ABO_CONFIG.actif = false`) : l'app ne change pas.
- Page tarifs.html (« Gratuit ou Premium »), liée en bas de l'app ; « Premium ouvre très bientôt ».
- Serveur des liens v6 : route /abo/verifier (clé de licence Polar) — à déployer le jour J.
- Tests : tests/abo.test.mjs (14 réussis). Mode d'emploi : PREMIUM.md.

## v5.5 — 5 novembre 2026 (pas de chargement par lien sur le site public)
- Sur retoucheproai.com, « Colle un lien ici » est masqué (classe `sans-liens` posée avant l'affichage) : les règles
  Google AdSense refusent les outils de téléchargement de vidéos d'autres plateformes. Le code et le serveur restent :
  la fonction marche toujours dans la version Claude et en test local.
- Textes de confidentialité mis à jour en conséquence (et mention de Kaggle ajoutée dans l'app).

## v5.4 — 5 novembre 2026 (compte AdSense relié)
- Identifiant éditeur ca-pub-4826284146220706 : balise meta « google-adsense-account » (vérification du site par Google)
  et fichier ads.txt à la racine. Aucun script de pub n'est chargé : les pubs restent éteintes (PUB_CONFIG.actif = false)
  jusqu'à l'accord de Google et la création des blocs d'annonces.

## v5.3 — 5 novembre 2026 (page Confidentialité)
- Nouvelle page confidentialite.html (traitement sur l'appareil, usages réseau, publicité Google et cookies, droits,
  hébergeurs), liée depuis le texte de confidentialité de l'app. Exigée par Google AdSense.

## v5.2 — 5 novembre 2026 (connexion sécurisée imposée)
- Certificat HTTPS de retoucheproai.com en place. Toute visite en http (ou via l'ancienne adresse github.io, qui
  redirige en http) est renvoyée vers https://retoucheproai.com, nécessaire pour la carte graphique et la version hors ligne.

## v5.1 — 5 novembre 2026 (adresse retoucheproai.com)
- L'app est servie à https://retoucheproai.com (fichier CNAME ; DNS chez Cloudflare, sans proxy, vers GitHub Pages).
  L'ancienne adresse github.io redirige vers la nouvelle.
- Serveur des liens réinstallé sur le compte Cloudflare du domaine : https://retouche-serveur.retouche-ia.workers.dev
  (même code v5, origine retoucheproai.com ajoutée). L'ancien (nfchb5hd9z) reste en ligne mais n'est plus utilisé.
- Relais Kaggle : origine retoucheproai.com ajoutée et redéployé.
- Version hors ligne active aussi sur le nouveau domaine.
- À savoir : réglages, jeton Kaggle et modèles IA téléchargés sont rangés par adresse dans le navigateur ;
  sur la nouvelle adresse, ils sont à refaire une fois.

## v5.0 — 5 novembre 2026 (nouveau nom : RetoucheProAI)
- L'app s'appelle désormais RetoucheProAI : titre, en-tête, nom sur l'écran d'accueil, nom dans les sauvegardes.
- Rien d'autre ne change : même adresse pour l'instant, anciennes sauvegardes toujours lisibles, réglages et modèles gardés.
- Noms de domaine libres au 5 nov. 2026 : retoucheproai.com, retoucheproai.fr, retoucheproai.app (pas encore achetés).

## v4.9 — 5 novembre 2026 (publicités préparées, éteintes)
- Nouveau `pub.js` : bannière discrète en bas de page, pub récompensée avant l'enregistrement, lien de consentement Google,
  « Coller un lien » masqué quand les pubs sont allumées. Tout est éteint : l'app ne change pas tant que ce n'est pas activé.
- Jamais bloquant : sans pub prête, l'enregistrement se fait directement. Jamais de pub hors du domaine choisi.
- Mode d'emploi pour allumer : PUBLICITE.md. Tests : tests/pub.test.mjs (8 réussis).

## v4.8 — 5 novembre 2026 (conversion accélérée des vidéos ralenties / accélérées)
- Même résultat qu'en v4.7, mêmes réglages : seule la façon de calculer change.
- Lecture de la vidéo en continu (décodeur de l'iPhone) aussi quand la vitesse est changée. Avant, chaque image
  était cherchée une par une dans 3 lecteurs vidéo, très lent sur iPhone. Idem pour la prolongation (repart de l'image
  clé voisine à chaque saut). Seule la lecture à l'envers garde l'ancienne méthode.
- Images intermédiaires du ralenti calculées par la carte graphique en une seule passe (WebGL), au lieu d'environ
  1 200 petits dessins par image ; résultat identique à l'œil (PSNR > 50 dB contre l'ancienne méthode), bords plus propres.
  Ancienne méthode gardée en secours automatique.
- Recherche du mouvement : mêmes calculs sans tests de bord dans la boucle (résultat identique au bit près, vérifié).
- « Voix plus claire » est désormais gardée quand la vitesse change (elle était ignorée).
- Tests : tests/vitesse.test.mjs complété (lecture continue vérifiée, image intermédiaire GPU = ancienne méthode).

## v4.7 — 5 novembre 2026 (barre de vitesse, comparatif à curseur)
- Barre « Vitesse » sous la barre de lecture : 0,75× à 1,30× par pas de 0,05 ; le bouton 1,00× la remet à zéro.
  Aperçu : la lecture suit la vitesse. Conversion : la vidéo est refaite à cette vitesse (ralenti avec images intermédiaires,
  son à hauteur de voix conservée), via le moteur Time Repair.
- Résultat vidéo : les deux vidéos côte à côte sont remplacées par une seule vidéo avec curseur avant / après
  (glisser le doigt sur la vidéo ou le curseur du dessous), original synchronisé même si la vitesse a changé.
- Tests : tests/vitesse.test.mjs (12/12) ; Time Repair (tests/v3) inchangé.

## v3.4 — 5 novembre 2026 (IA rapide sur serveur gratuit Kaggle)
- Option « IA rapide sur serveur gratuit (Kaggle) » : la même IA (même fichier sr.bin, résultat identique à l'œil : PSNR 57–59 dB
  contre l'app), calculée sur les 2 cartes graphiques gratuites du compte Kaggle. Vidéo de test : 1,1 min de calcul (180 images).
- Jeton Kaggle dans ⚙️ Paramètres (gardé sur le téléphone, jamais sauvegardé) ; accord demandé avant chaque envoi ;
  tout est supprimé chez Kaggle après récupération. Relais Cloudflare dédié : retouche-kaggle.retouche-ia.workers.dev.
- Test d'intégration avec le vrai Kaggle (tests/ia_serveur.test.mjs) : refus sans jeton / envoi refusé = rien envoyé ;
  export Full HD complet (180/180 images, son) ; ordre des images conforme (0 écart sur 56 contrôles) ; ménage vérifié.
- Non encore fait : mesure sur une vraie vidéo 720×1280 de plusieurs minutes, essai sur iPhone, suite complète app --ia.

## v3.3 — 4 novembre 2026 (effacer une zone, sélection au toucher)
- **Effacer une zone d’une photo** (accueil, ou depuis une photo améliorée) : tu peins la zone, l’IA la remplit (MI-GAN, licence MIT,
  28 Mo téléchargés une fois après accord, calcul sur le téléphone). Proposition à **garder ou refuser** ; annuler, recommencer,
  revenir à l’original ; zoom à deux doigts. Hors de la zone, la photo n’est **pas modifiée, au pixel près** (testé).
- **Carte des zones inventées** : affichage dédié (rayures roses, opacité réglable), badge permanent « contient des zones inventées par l’IA »,
  export de la carte en pleine taille et d’une **fiche de provenance** (modèle, empreinte, licence, zones, pixels inventés, date).
- **👆 Sélection au toucher** (EdgeTAM, Meta, Apache-2.0, 40 Mo facultatifs) : un toucher propose le contour d’un objet, d’un accessoire
  ou d’un élément de filtre AR ; on le corrige au pinceau ou à la gomme avant de reconstruire.
- Gestionnaire de modèles : 3 entrées (`migan`, `edgetam`, `edgetam_dec`), adresses figées, empreintes vérifiées, mêmes règles que les autres.
- Historique : chaque effacement gardé est noté (date, taille, pixels inventés) ; jamais l’image.
- Correction pendant le développement : un téléchargement refusé affichait « la partie reçue est gardée » alors que rien n’avait été reçu.
- Nouveau test `tests/effacer.test.mjs` (19 cas, vrais modèles) ; il échoue bien quand on introduit un défaut (2 défauts essayés : 5 échecs chacun).
- Études : licences de ProPainter, CodeFormer (S-Lab, non commerciales) et CompleteMe (CC BY-NC-SA 4.0) relues à la source → écartés ;
  quotas ZeroGPU relus sur la documentation officielle (GUIDE_CLOUD_GRATUIT.md). Documents : GUIDE_RECONSTRUCTION_IA.md, MODELES_IA.md, RAPPORT_v3.3.md.

## v3.2 — 4 novembre 2026 (audit, sécurité, vie privée)
- **Modèles IA conservés lors des mises à jour** : le service worker effaçait tous les caches du site à chaque nouvelle version,
  dont le modèle de relief téléchargé (27 Mo, re-téléchargé ensuite) et les caches de l'app /radar/. Il ne retire plus que
  ses propres anciennes versions. Nouveau test `tests/sw.test.mjs` (échoue sur la v3.1, réussit sur la v3.2).
- **Faille corrigée** : une sauvegarde non chiffrée piégée pouvait exécuter du code à l'ouverture de ⚙️ Paramètres (historique
  affiché sans échappement). Tout est maintenant affiché comme du texte. Test ajouté (code exécuté sur la v3.1, plus sur la v3.2).
- **Plus aucune requête vers Google à l'ouverture** : polices hébergées avec l'app (`polices/`, licence OFL).
- **Secours mp4-muxer verrouillé** : le fichier de secours (jsDelivr) est refusé s'il ne correspond pas à son empreinte (SRI).
- **Autorisation « diagnostic »** (version Claude) : les mesures ne sont plus envoyées automatiquement sans accord ;
  bouton « Autoriser » ajouté dans ⚙️ Paramètres pour chaque autorisation.
- Vérifications d'audit : `sr.bin` identique bit à bit aux poids officiels Real-ESRGAN v0.2.5.0 (FP16) ; ONNX Runtime Web et mp4-muxer
  identiques aux paquets npm ; serveur **v5 bien en ligne** (la mention « à redéployer » de la v3.0 était périmée).
- Points de restauration : branches `sauvegarde-v2.49`, `sauvegarde-v2.50`, `sauvegarde-v3.0`, `sauvegarde-v3.1`
  (les tags cités dans les notes n'avaient jamais été créés).
- Documents : AUTORISATIONS.md (nouveau), RESTAURATION_IA.md (étude des modèles de suppression AR, visage, corps, cloud), mises à jour.

## v3.1 — 4 novembre 2026
- **Remise en ordre automatique des morceaux** (Outils → Regrouper des vidéos → « 🧩 Remettre dans l’ordre automatiquement ») :
  choisis les morceaux dans n’importe quel ordre ; l’app compare la dernière image de chaque morceau à la première des autres
  (continuité de l’image), lit la date d’enregistrement écrite dans le fichier quand elle existe, et repère les **doublons**
  (retirés de l’assemblage), les **raccords douteux** (morceau manquant ou changement de scène) et indique sa **confiance** ;
  si elle est faible, elle demande de vérifier avec les flèches au lieu d’affirmer un ordre. Rien n’est envoyé sur Internet.
- Nouveau test `tests/reassemblage.test.mjs` (5 cas).

## v3.0 — 4 novembre 2026
- **studio.js** (premier module séparé) : ⚙️ Paramètres avec **autorisations** révocables avant tout envoi réseau (lien, modèle, analyse IA), **sauvegarde chiffrée** des réglages (AES-256-GCM) et restauration, **historique** des traitements ; **assistant** « Dis ce que tu veux » (mots-clés en français : règle l’app et explique ce qu’il ne peut pas faire).
- **Time Repair** (Outils → Vitesse et sens de lecture) : vitesse 0,25× à 4×, lecture à l’envers, ralenti fluide facultatif
  (images intermédiaires estimées), son adapté avec hauteur conservée (WSOLA), façon cassette, inversé ou retiré.
- **Profils Faible luminosité et Nuit → jour (esthétique)** : relèvement des ombres sur la luminance, gain plafonné, vrais noirs gardés.
  Faible luminosité conseillée automatiquement pour une image très sombre.
- Rapport de fichier : cadence variable (VFR) et ralentis iPhone (≥ 100 i/s) détectés.
- Son : secours Opus quand l’encodeur AAC manque (fichier relu ; sinon export sans son, expliqué).
- Serveur v5 : origine CORS fixée par requête (plus de variable globale partagée), comptes Bluesky did:web limités aux vrais domaines.
  ~~À redéployer sur Cloudflare~~ — constaté en ligne le 4 novembre 2026 (audit v3.2 : `/etat` répond version 5).

## v2.50 — 4 novembre 2026
Gestionnaire de modèles, profils Naturel / Équilibré / Détails, analyse photo, comparateur avec zoom, export PNG, taille personnalisée,
vérification des exports, calcul WebGPU 4 pixels/fil, modèle de profondeur figé, suite de tests. Voir NOTES.md.
