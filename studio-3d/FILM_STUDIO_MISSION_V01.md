# RetoucheProAI — Film Studio IA : contrat v0.1 (15 novembre 2026)

## Vision validée
Un adulte de 18 à 75 ans et plus décrit librement son film en français ou fournit une photo/vidéo de référence, choisit ses personnages, décors, gestes, interactions, conversations, durée, cadrage et rendu. L'application vise un parcours **import ou description → préparer → vérifier → créer un film** avec options avancées discrètes. La destination finale est un film vidéo/audio exportable, idéalement avec plusieurs personnages persistants.

## Réalité technique au 15/11/2026
- `studio-3d/generateur.js` (laboratoire v1.9 de la branche de base) génère des personnages **stylisés procéduraux**, dont des gestes limités comme marcher sur place, fumer ou saluer. Il ne produit pas de cinéma photoréaliste.
- Les travaux `research/3d-camera-v43/` relèvent de l'**estimation de mouvement 2D**, pas d'un avatar humain réaliste.
- Le laboratoire Cinema P30 est une **démonstration synthétique de mesures vidéo**, non un moteur texte→film.
- NOVA traite/restaure des médias ; il ne génère pas ces personnages et scènes.
- `film-project-v01.mjs` est **un contrat de scénario local et déterministe** : il extrait quelques intentions, les ordonne en scènes et refuse les références non autorisées. Il ne lit pas la photo/vidéo, ne restitue pas un visage et ne produit pas de MP4. Une analyse de texte complexe exigera un modèle de compréhension dédié et des tests.

## Pipeline cible (non implémenté en totalité)
1. **Directeur de film** : prompt libre → scénario structuré, questions uniquement en cas d'impossibilité réelle, plan de scènes.
2. **Biblio d'acteurs** : personnages synthétiques, ou reconstruction fidèle à partir de références avec provenance/droits et consentements spécifiques.
3. **Mouvement et objets** : gestes continus, contacts main–tasse, main–bouche, poses assises, marche réelle, interactions à plusieurs.
4. **Parole et voix** : dialogues, synchronisation labiale, émotions vocales ; reproduction d'une voix réelle soumise à un consentement distinct.
5. **Décors/caméras/lumière** : continuité des vêtements, regards, identité, géométrie et éclairage entre plans.
6. **Rendu et montage** : clips cohérents → assemblage → son synchronisé → export contrôlé MP4, avec traitements NOVA optionnels.
7. **Vérification** : identité et mouvement cohérents, physique plausible, absence de clignotement, contenu conforme, latence/coût/qualité mesurés.

## Interfaces prévues pour la suite
- Entrée : `{prompt, references?:[{kind:'photo'|'video', rightsConfirmed, depictsRealPerson, likenessConsent, cloneVoice, voiceConsent}]}`.
- Sortie actuelle : JSON `retoucheproai.film-project.v0.1`, étapes `planifie_non_anime`, état explicite `renderAvailable:false`.
- Références : **métadonnées de consentement seulement** ; jamais de média, d'URL, de nom, de visage ou de voix dans cette sortie.
- Toute vraie ingestion, persistance, reconstruction, réutilisation pour entraînement, partage et diffusion exigera des fonctions d'autorisation et de révocation propres à chaque usage.
- I001 et les personnes dont les droits/consentements sont incertains ne doivent pas entrer dans un entraînement d'identité ou de voix sans clarification.
- Les 157 vidéos de recherche et les poids privés ne vont **jamais** dans le dépôt public.

## Critères mesurables pour franchir le prochain palier
- Tests unitaires verts pour ordre, actions, négations, refus de référence et séparation consentement apparence/voix.
- Première scène de **personnage synthétique inédit**, sans média privé : assis → boit → pose tasse → parle, avec animation 3D observable et sans annoncer le photoréalisme.
- Vérification indépendante des contacts main-objet, persistance du personnage et synchronisation éventuelle du dialogue.
- Pas de fusion, déploiement ni promesse de rendu complet avant preuves réelles sur le navigateur cible, en particulier Safari iPhone.

## Premier pont fonctionnel vers les personnages 3D (v0.1)
- `film-preview-v01.mjs` appelle explicitement le **générateur procédural v1.9 déjà existant** pour une demande sans référence privée décrivant un seul personnage adulte. Il retourne les **octets d'un vrai GLB stylisé** et les étapes scénaristiques en attente.
- Un scénario à deux personnages ou une demande de reconstruction de personne réelle restent au stade JSON ; aucune fausse prétention de rendu n'est faite.
- `film-preview-v01.test.mjs` ajoute quatre tests Node (en-tête glTF, refus multi-personnages, refus de réutiliser une référence privée, signalement des gestes non animés). Ils sont exécutés avec les huit tests du plan par `.github/workflows/ci-film-studio-v01.yml`.
- **Attention :** le GLB n'est ni une vidéo ni un acteur photoréaliste ; les gestes boire, poser tasse, s'asseoir, parler, synchroniser les lèvres ne sont pas encore animés. Aucun média privé n'est traité.


## Suite expérimentale — Film Studio v0.2 (15 novembre 2026)

### Code livré sur la même PR en brouillon
- film-sequence-v02.mjs : **GLB 2.0 réellement animé** par le générateur procédural v1.9. Une seule scène, un personnage original, dix gestes maximum : s’asseoir (approximation), boire, poser la tasse, parler (bouche muette), regarder, sourire.
- Chaise, table et deux représentations **substituées** de la tasse : l’objet de table est masqué pendant que la copie suivie par le poignet est montrée, puis inversement. Cette substitution reste une **illusion visuelle**, pas une mesure physique du contact.
- Continuité du personnage et de ses matériaux dans le GLB ; pistes temporelles glTF, aucun rendu vidéo. Assise simulée par échelle verticale et rotations simplifiées, pas une cinématique réaliste.
- Les actions non prises en charge sont rapportées. Refus des scènes multiples, acteurs multiples, références photo/vidéo réelles même consenties, boisson non décrite, dépôt de tasse avant prise, demandes sans geste reconnu. Aucun média de référence n’est chargé.
- film-studio-v02.html + film-ui-v02.mjs : écran tactile local français, un champ texte/un bouton, compte-rendu du scénario et fichier GLB téléchargeable seulement sur action explicite. Aucun envoi, API réseau ou bibliothèque externe ; aucun déploiement.
- Tests de film-sequence-v02.test.mjs : structure GLB, animation, chronologie et refus ; film-ui-v02.test.mjs : bouton/export/refus avec DOM simulé, qui **n’est pas** une validation Safari.

### Limites non franchies
- Aucun film MP4, dialogue audio, synchronisation labiale, caméra, mouvement réellement physique, décor réaliste, IA neuronale générative, reconstruction depuis photo/vidéo ou modèle entraîné.
- Vérification GLB **structurelle** : elle ne prouve ni qualité visuelle ni contact main-tasse. Test dans un vrai moteur 3D et inspection humaine restent nécessaires.
- Page non déployée ; Safari iPhone réel non validé. Les 157 vidéos, photos privées et voix ne sont ni chargées ni publiées.
- NOVA, Cinema, et le site public restent inchangés. Ne pas fusionner ou diffuser automatiquement.

### Prochain jalon
1. Contact main-objet mesuré, prise/dépôt continus, vraie cinématique articulée pour l’assise.
2. Visualiseur local en navigateur Safari avec inspection et performance iPhone.
3. Continuité multi-personnages et multi-plans, dialogues audibles puis sortie MP4 avec consentements distincts.


## Film Studio v0.3 — preview local + continuité d’ancrage (15 novembre 2026)

### Modifications réalisées
- film-viewer-v03.mjs lit les vrais blocs JSON/BIN et pistes LINEAR d’un GLB glTF 2.0 **synthétique**. Animation échantillonnée dans les temps source, hiérarchie de matrices de transformation 4×4 conforme au modèle TRS ; rendu **approché** des volumes sphériques sur Canvas 2D, sans bibliothèque ni réseau. Ce n’est **pas** un vrai rendu maillage GPU ou photoréaliste.
- film-studio-v03.html / film-ui-v03.mjs : champ texte, bouton de création, visualisation sur écran mobile, lecture/pause, frise navigable et pivot tactile, export explicite du GLB. Lorsque le scénario est refusé, le précédent lien d’export est retiré. Aucune photo ou vidéo réelle importée.
- generateur.js : correction importante du type glTF des canaux de **translation** (VEC3, et non VEC4), sans changement pour rotation VEC4 et scale VEC3.
- film-contact-v03.mjs : réutilise l’avatar stylisé et son squelette ; remplace les copies visibles de tasse par **une seule tasse** à translation animée ; résout la portée du bras droit par IK analytique plane, adapte le point de saisie aux épaules de l’acteur, échantillonne la trajectoire à 40 Hz et mesure l’écart tasse–ancrage main à 20 Hz. Refus contrôlé si l’écart excède 0,025 m (25 mm). Il s’agit d’un **point d’ancrage mathématique** : aucune collision, préhension des doigts ou physique réelle démontrée.
- Le visualiseur supporte les matrices 4×4 et l’échelle non uniforme du torse assis ; cette correction était nécessaire pour éviter un écart artificiel au calcul du point de prise.
- tests film-viewer-v03.test.mjs, film-ui-v03.test.mjs, film-contact-v03.test.mjs.

### Résultat de la CI
Run GitHub Actions 43734295024 : **34 tests Node réussis sur 34**, SHA 05b055abc4a65240033fa95ac9d62fafe18bab69. Tests de structure GLB, sampling, projections Canvas avec contexte simulé, navigation et export de l’interface via DOM simulé, refus, calcul d’ancrage pour acteur féminin et masculin. Aucun navigateur physique ni GPU n’est testé par ces seules suites.

### Limites strictes
- Pas de film MP4, pas de voix, pas de photo/vidéo → avatar, pas de rendu réaliste, pas de communication réseau, pas d’IA générative entraînée, pas de gestion multi-personnages.
- La projection Canvas 2D ne remplace pas un moteur 3D réel : maillage, illumination, occlusions, profondeur et formes peuvent diverger du GLB interprété par une application 3D complète.
- L’IK et la continuité de l’ancrage ne prouvent ni la tenue correcte de la tasse par les doigts, ni l’absence d’intersections. La posture assise demeure simplifiée.
- Vérification de Safari physique sur l’iPhone cible : **non réalisée** ; contrôle visuel humain : **non réalisé** ; prototype **non déployé**.
- Les 157 vidéos privées, visages, voix et droits de référence ne sont pas impliqués dans cette CI ou cette branche. PR en brouillon, aucune fusion vers main.

### Prochain contrôle avant toute diffusion
Effectuer un test navigateur effectif de la page locale, puis inspection visuelle/glTF dans un véritable moteur 3D ; comparer stabilité, doigts/objets, collisions et ressources. Déployer uniquement après revue et validation du chemin iPhone.

**Renforcement des contrôles :** run GitHub Actions 43734491229, 34/34 tests Node réussis sur SHA 4a0b69e30b1f7c764649fa24d256bab055922320 avec seuil d’écart d’ancrage réduit à 25 mm. Ce seuil mesure uniquement la distance à un point de prise mathématique ; il ne certifie pas le contact doigt-tasse.


## Film Studio v0.4 — véritable rendu local du maillage glTF (15 novembre 2026)

### Réalisations
- film-webgl-v04.mjs : lecture stricte des accesseurs POSITION/NORMAL/indices de triangles et des couleurs du GLB synthétique déjà généré ; validation des limites et de la cohérence. Rendu **des triangles du GLB** en WebGL2 avec tampon de profondeur, transformations animées 4×4 et lumière diffuse simplifiée. Ne nécessite aucun CDN, téléchargement de modèles, média privé ou accès réseau.
- film-studio-v04.html + film-ui-v04.mjs : parcours tactile existant (champ → animation locale → lecture/pause/curseur/rotation → enregistrement GLB), mais avec nouveau moteur WebGL2 lorsque disponible ; repli Canvas 2D explicitement annoncé si WebGL2 n'est pas disponible. Pas de film vidéo exportable.
- film-webgl-v04.test.mjs : audit indépendant de la géométrie, des indices, des matrices, du contrôle des GLB altérés et des commandes GPU simulées.
- film-browser-v04.test.mjs : banc **réel dans Chromium** avec serveur HTTP local, sans ressources externes chargées par la page. Vérifie WebGL2 effectivement disponible, pixels peints dans le vrai tampon GPU, différences d'image lors des animations et de la rotation, contrôle du lien d'export puis refus d'une requête incomplète ; capture PNG d'une scène entièrement synthétique.
- CI : job Node, puis job navigateur Playwright isolé sur Ubuntu 24.04 ; artefact capturable pour revue humaine. Ubuntu 26.04 non compatible avec Playwright 1.56.1 a été remplacé uniquement pour ce job, après un premier échec d'installation.

### Preuves de tests
- SHA 3928ae78c63aed7d3fc0e8c90c0d089fb20ac7a9, GitHub Actions run **43735906687** : Node **38/38 réussis** ; Chromium WebGL2 **réussi** ; pixels de premier plan **16 873** sur canevas 712×580, rendu dynamique et export/refus vérifiés ; capture de scène synthétique conservée dans l'artefact film-studio-v04-chromium-synthetic.
- Ces tests prouvent l'exécution du **moteur de visualisation glTF stylisé** dans Chromium ; ils ne constituent ni inspection qualitative humaine, ni test sur appareil Safari iPhone, ni certification d'une animation physiologiquement réaliste.

### Limites et suite
- WebGL2 ne transforme pas notre géométrie procédurale en photoréalisme : formes simplifiées, texture et éclairage PBR absents, aucune peau/chevelure reconstruite, mouvements imparfaits, contacts physiques des doigts non vérifiés, scène unique, sans voix ni MP4.
- Safari iPhone physique à mesurer : stabilité mémoire, thermiques, orientation, mise en arrière-plan, perte du contexte WebGL et export GLB via l'interface native.
- PR en brouillon ; aucune fusion, aucun déploiement ni publication des 157 vidéos privées. La démonstration est disponible en **code source dans la branche**, non sur le site public.


## Film Studio v0.5 — WebKit Safari : validation du moteur et du repli (15 novembre 2026)

### Modifications sur la PR #69
- film-ui-v05.mjs : reprise du lecteur WebGL2 v0.4 avec repli Canvas 2D robuste en cas d'échec des shaders (recréation de l'élément Canvas après un contexte GL déjà attribué), limite de la résolution interne à 2048 px par axe, capture tactile défensive, tentative de reprise après perte/restauration du contexte GPU et préservation du contenu lors du cache de navigation Safari (pageshow/pagehide persistés).
- film-studio-v05.html : interface française responsive avec création de scènes stylisées d'un bouton, lecture/pause, déplacement tactile, curseur temporel et téléchargement local GLB.
- film-browser-webkit-v05.test.mjs : test **réel du moteur WebKit de Playwright sur Linux Ubuntu 24.04**, écran tactile 390×844 puis 844×390 ; vérification des pixels du rendu, du changement d'image aux gestes, du repli forcé après refus des shaders, de la préservation du lien Blob après événements pagehide/pageshow persistés et du refus des scénarios incomplets.
- GitHub Actions : troisième job navigateur WebKit indépendant, sans chargement de médias privés ni appel réseau externe de la page ; installation temporaire de Playwright/WebKit uniquement sur le runner CI.

### Résultats vérifiés
- GitHub Actions **run 43736977633 : trois jobs réussis** : 38/38 tests Node, Chromium WebGL2, et WebKit sur Linux.
- WebKit normal : **WebGL2 réel**, 16 441 pixels de premier plan sur toile interne 712×580, rotation tactile et animation changent l'image, portrait/paysage sans débordement, export protégé et zéro erreur JS.
- WebKit avec refus des shaders injecté : **Canvas 2D de secours** effectif, 148 760 pixels de premier plan ; navigation et export/refus restent opérationnels. Le repli a été réellement exécuté.
- Captures entièrement synthétiques sauvegardées dans l'artefact GitHub Actions film-studio-v05-webkit-synthetic (durée de conservation CI 7 jours).

### Limites de validation
- **WebKit Playwright sous Linux n'est pas Safari physique sur iPhone 15 Pro Max** : GPU Apple, thermiques, mémoire, version iOS, téléchargement iOS et PWA non attestés.
- Animations toujours stylisées, posture assise approximative, doigts sans préhension physique, pas de voix, de film MP4, de photoréalisme ni d'entraînement sur les 157 vidéos privées.
- Aucune fusion, aucun déploiement, aucun changement public. PR en brouillon.


## Film Studio v0.6 — diagnostic iPhone local, paquet HTTPS isolé (15 novembre 2026)

### Livré dans la PR expérimentale
- film-diagnostic-v06.mjs : métriques locales sur 90 images, cadence moyenne/effective, médiane et 95e percentile du temps par image, compteur des images >50 ms ; compteurs de perte/restauration de contexte WebGL et code d'erreur GPU. Mesures réelles du navigateur, pas télémétrie du système iOS.
- film-ui-v06.mjs et film-studio-v06.html : bouton facultatif de diagnostic, compte-rendu lisible et export volontaire d'un JSON local. Aucun contenu de scénario, photo, vidéo, user-agent détaillé, géolocalisation ou identité dans ce JSON. Le diagnostic n'est pas envoyé à un serveur et les anciens liens sont retirés quand un nouveau scénario est refusé.
- film-diagnostic-v06.test.mjs : sept tests Node de cadence, d'entrées malformées, de confidentialité et d'interruption.
- film-browser-webkit-v06.test.mjs : test du clic de diagnostic dans un vrai navigateur WebKit Playwright sous Linux, en mode WebGL2 et avec repli Canvas 2D forcé ; téléchargement du JSON au lieu d'une simple inspection de lien, vérification du contenu et du refus.
- FILM_STUDIO_IPHONE_QA_V06.md : protocole séparé de test manuel Safari réel.
- Paquet HTML/JS autonome sans médias privés : index.html + huit scripts et _headers restrictif. Produit seulement après la validation WebKit et disponible dans les artefacts GitHub Actions sous film-studio-v06-iphone-https-package. Pas de déploiement automatique ni de fusion.

### Résultats vérifiés
GitHub Actions **43749104454**, SHA dacb8c1c39b376d6c7560151541e5b88b669d6c8 : **45/45 tests Node, Chromium WebGL2, WebKit standard et WebKit repli forcé réussis**, plus job de paquet HTTPS réussi.
WebKit standard : 16 441 pixels de premier plan ; repli 2D : 148 760 pixels. Les deux parcours ont contrôlé l'export JSON local et les protections contre les anciens liens de téléchargement. Les captures et le paquet sont des artefacts temporaires de CI, sans diffusion publique.

### Limites
Le test WebKit sous Linux **ne certifie pas Safari sur un iPhone réel**, ni les thermiques, l'autonomie, la mémoire du système ou la possibilité de sauvegarder un GLB vers Fichiers sur iOS. Les FPS mesurés par requestAnimationFrame reflètent la cadence de l'animation dans ce navigateur précis, pas la vitesse garantie de traitement d'un film.
La scène reste synthétique, stylisée et mono-personnage : aucun MP4, aucune voix, ni reconstruction fidèle de personne ou entraînement des modèles. PR brouillon, aucune modification de main, aucune donnée privée publiée.


## Film Studio v0.7 — partage natif iOS facultatif (15 novembre 2026)

### Code développé
- film-share-v07.mjs : crée uniquement un fichier GLB synthétique vérifié ou un rapport JSON local au schéma autorisé. Contrôle Web Share API via canShare lorsque disponible. Une action explicite de l'utilisateur appelle navigator.share avec un fichier unique ; aucune destination imposée et aucun téléversement direct de l'application. En cas d'annulation, erreur ou absence de support, le téléchargement classique subsiste. Le retour positif de share NE prouve PAS que le fichier est enregistré dans Fichiers.
- film-ui-v07.mjs et film-studio-v07.html : boutons facultatifs « Partager vers Fichiers… » et « Partager le diagnostic… », disponibles uniquement lorsque le navigateur annonce une capacité de partage. Gestion des erreurs avec messages clairs ; effacement des liens de partage après une demande refusée.
- film-share-v07.test.mjs : cinq nouveaux tests Node de formats et tailles, schéma privé, canShare, transfert explicite, annulation et échec.
- film-browser-webkit-v07.test.mjs : simulation contrôlée de navigator.canShare/navigator.share sur vrai WebKit Linux. Vérifie que le clic transmet uniquement un File local de type GLB ou JSON, aucune demande réseau externe de l'application, et qu'un refus ultérieur masque les boutons. Les parcours de rendu WebGL2 et de secours Canvas 2D restent couverts.
- FILM_STUDIO_IPHONE_QA_V07.md : protocole iPhone Safari manuel avec téléchargement de secours et panneau de partage natif.

### Résultats réellement vérifiés
- SHA 29844769ad6ef8f4a0c8d79cab6a21f68db30ed1, GitHub Actions run **43751123230** : **50/50 tests Node**, test Chromium WebGL2, test WebKit normal + repli 2D (incluant partage API simulé et diagnostic), paquet HTTPS isolé : **4 jobs sur 4 réussis**.
- Paquet d’essai statique film-studio-v07-iphone-https-package généré comme artefact GitHub Actions, non déployé. Captures synthétiques de WebKit archivées séparément.
- Le premier passage du test WebKit a révélé une attente de nom de fichier v0.6 au lieu de v0.7 ; le test a été corrigé puis le run ci-dessus a confirmé le succès.

### Limites inchangées
- **Aucune preuve de fonctionnement du panneau natif iOS réel**, de la sauvegarde de GLB dans l'application Fichiers, de la mémoire, de la température ou de la fluidité sur appareil Apple. Le test WebKit remplace navigator.share par un faux service contrôlé et ne peut pas attester le système iOS.
- Toujours pas de film MP4, d'acteur photoréaliste, de dialogue audio, de reconstruction de personne ni de contact des doigts physiquement simulé. Les 157 vidéos privées restent hors de la CI, du paquet et du dépôt public.
- PR en brouillon, pas de fusion, pas de diffusion publique, pas de déploiement à retoucheproai.com.


## Film Studio v0.8 — trajectoire et prise/dépôt contrôlés (15 novembre 2026)

### Ce qui fonctionne désormais
- film-contact-v03.mjs (moteur commun) ajoute une rotation synthétique graduelle de la tasse : inclinaison autour de 0,26 radian (15°) pendant « boire », retour à la verticale à la fin. La tasse reste une seule géométrie GLB animée.
- film-motion-v08.mjs introduit une **analyse indépendante du GLB réellement encodé** : échantillonnage local de la position tasse/point d’ancrage à 120 Hz sur toute la séquence, vérifications au voisinage précis des transitions « prise » et « dépôt », retour de la tasse au même point sur la table, et contrôle d'un plafond de vitesse.
- Limites d'acceptation du pilote : maximum 25 mm d'écart au point d'ancrage pendant le transport, 40 mm de déplacement sur une fenêtre de 10 ms autour d'une transition, 25 mm d'écart à l'emplacement initial après dépôt, 6 m/s comme seuil d'alerte de vitesse excessive. Ces seuils servent à détecter les défauts grossiers, **pas** à certifier une motion capture ni la physique des objets.
- film-motion-v08.test.mjs : six nouveaux tests Node, dont inspection de l'inclinaison aux différents instants, homme/femme synthétiques, refus de référence réelle et **injection volontaire d'une téléportation dans les données d'animation GLB** pour vérifier l'arrêt du pilote.
- film-ui-v08.mjs et film-studio-v08.html : le parcours texte → créer → voir la scène → télécharger reste identique, avec une information courte sur la mesure cinématique. Pas de téléchargement réseau ni d'envoi de vidéo.
- film-share-v08.mjs : noms des fichiers GLB et JSON cohérents entre le téléchargement classique et le partage iOS simulé.
- film-browser-webkit-v08.test.mjs : vérification du parcours de création v0.8 et des exports dans WebKit Linux, en rendu WebGL2 natif et en mode Canvas 2D de secours.
- La CI prépare un nouveau paquet statique nommé film-studio-v08-iphone-https-package, sans aucun média personnel.

### Preuves et précautions
- GitHub Actions **run 43752405431**, commit 397fea960f750a508a22110c36eaa3168a9a00b5 : **56 tests Node sur 56 réussis**, job Chromium réussi, job WebKit réussi (WebGL2 + repli Canvas) et paquet iPhone généré, soit **4 jobs sur 4 verts**.
- Un premier passage WebKit a détecté des noms d'export de diagnostic/partage restés en v0.7. Les noms GLB et JSON ont été corrigés et **le run cité a validé le correctif**.
- Il n'y a **ni collision réaliste des doigts**, ni simulation de liquide, ni correspondance des lèvres, ni posture assise biomécanique validée, ni MP4, ni voix, ni photoréalisme. La vitesse de 120 Hz désigne uniquement la fréquence de **mesure de trajectoire**, non une fréquence de rendu vidéo.
- Aucun test Safari iPhone physique n'a été réalisé, et aucune modification de retoucheproai.com, de main, de NOVA ou des 157 vidéos privées. PR toujours en brouillon et non fusionnée.


## Film Studio v0.9 — doigts articulés et alignement du siège (15 novembre 2026)

### Éléments réellement livrés
- Extension optionnelle de film-contact-v03.mjs : le moteur des anciennes versions reste inchangé lorsqu'aucun décorateur de rig n'est fourni. La nouvelle étape ajoute des os et des surfaces synthétiques avant encodage dans le même GLB.
- film-fingers-v09.mjs : **cinq doigts procéduraux** sur la main droite (index, majeur, annulaire, auriculaire et pouce), chacun avec pivot proximal, articulation distale et deux volumes maillés. Les doigts se ferment progressivement avant la prise de tasse, restent repliés pendant le transport et se rouvrent avant le dépôt, avec rotation opposée du pouce. C'est une approximation géométrique, pas une force de préhension ni une collision vérifiée.
- Le plateau de la chaise passe à une hauteur compatible avec le bas du volume du bassin du personnage stylisé lorsqu'il est assis. L'ancien chevauchement de gros volumes est réduit au niveau du point de contact ; aucune posture assise humaine réaliste ou contact des pieds avec le sol n'est certifié.
- auditFingerAndSeat : contrôle local de cinq bouts de doigts par rapport au centre de la tasse pendant l'intervalle tenu, des variations angulaires maximales des dix articulations, de la fermeture avant la prise et de l'ouverture après le dépôt. Mesure séparée de l'écart entre le bas du volume du bassin et le dessus du siège en station debout et à la fin de l'assise. Il refuse les déformations grossières (doigts trop éloignés, mouvement angulaire brusque, assise non alignée), mais ne résout aucune physique.
- film-fingers-v09.test.mjs : six tests couvrant les phases d'ouverture/fermeture, le GLB de la main droite, la proximité doigt–objet, l'alignement du siège, l'acteur féminin et masculin synthétiques, le refus de références privées et une injection volontaire de rotation anormale dans un canal glTF.
- film-ui-v09.mjs, film-studio-v09.html : parcours mobile simple inchangé ; présence des doigts et résultat d'assise indiqués. Le partage natif simulé et l'export local sont toujours facultatifs.
- film-browser-webkit-v09.test.mjs : contrôle réel de l'interface sous WebKit Linux (WebGL2 et repli Canvas 2D), export et refus. Paquet statique indépendant film-studio-v09-iphone-https-package pour un futur essai sur iPhone physique, non déployé.

### Preuves validées
- GitHub Actions run **43754031675**, commit ec5b95ca9565dc9c64e478dcdf2328587025a158 : **62/62 tests Node**, test Chromium, test WebKit normal + Canvas 2D de secours et création du paquet HTTPS expérimental. **4 jobs sur 4 réussis**.
- Un premier test avant correction a signalé une assertion contrôlant la fermeture des doigts trop tôt, avant le commencement programmé du geste. Le moment d'échantillonnage du test a été corrigé ; la suite est devenue verte sans masquer les audits de proximité et de rotation.

### Frontières à ne pas dépasser
- Le seuil de proximité des bouts de doigts à la tasse n'est **pas** une preuve de contact avec la surface, d'une force suffisante pour tenir l'objet, de collisions absentes ni de simulation des mouvements de chaque phalange humaine.
- L'assise est seulement un ajustement volumétrique ; pas d'équilibre du tronc, de poids corporel, de position des pieds ou de contraintes articulaires réalistes démontrés.
- Aucune image photoréaliste, aucun film MP4, aucune voix et aucune reconstruction à partir de vidéos privées dans le pilote. Pas de publication, de fusion ni de déploiement sur retoucheproai.com ; Safari physique iPhone non validé.


## Film Studio v0.10 — inspection de main rapprochée et estimation doigt–surface (16 novembre 2026)

### Fonctionnement livré
- film-inspection-v10.mjs : nouvelle mesure **radiale approximative** de la distance des cinq bouts des doigts à l'ellipsoïde représentant le corps de la tasse. Le calcul utilise les matrices 3D issues du GLB réellement encodé, inclinaison et échelle comprises ; échantillonnage local de 30 poses par seconde durant le transport. Rapport synthétique contenant les minima/moyennes/maxima, nombres d'échantillons proches de la surface (<35 mm) et détail par doigt ; aucune donnée privée ni preuve trompeuse de contact.
- film-scene-v10.mjs : le constructeur reprend le moteur v0.9, son audit de continuité, puis ajoute l'audit doigt–surface. Les scénarios non pris en charge restent refusés sans GLB ni audit factice.
- film-webgl-v04.mjs et film-viewer-v03.mjs : caméras de **gros plan localisé**, avec centre pouvant suivre la tasse durant le mouvement, distance réduite à 0,77 m, restauration de la caméra générale. WebKit/Canvas 2D agrandit et recentre le même élément avec une projection de secours approximative.
- film-ui-v10.mjs / film-studio-v10.html : nouveau bouton accessible « Voir la main de près », navigation réversible, caméra qui suit la tasse pendant le déplacement de la chronologie, statut de mesure doigt–surface affiché avec avertissement de non-certification physique. Les exports GLB et JSON locaux restent facultatifs.
- film-inspection-v10.test.mjs : 5 tests Node (géométrie radiale élémentaire, données GLB, suivi de caméra, zoom Canvas, refus des mauvaises entrées/références).
- film-browser-v10.test.mjs et film-browser-webkit-v10.test.mjs : vrais tests Chromium et WebKit sur runners Linux, vérification du basculement de caméra, de l'image qui change en gros plan et au cours du temps, du retour à la vue générale, du téléchargement du GLB et de la séparation WebGL2/Canvas.
- Paquet statique isolé film-studio-v10-iphone-https-package assemblé par CI, jamais déployé ni relié au site public.

### Validation
- Run GitHub Actions **43792012358**, SHA be5a592b21b261ef9ddb890ac4bc4f79c19fd985 : **67/67 tests Node**, Chromium WebGL2, WebKit Linux normal + repli 2D forcé et assemblage HTTPS, **4/4 jobs au vert**.
- Chromium : géométrie réelle rendue, 14 934 pixels de premier plan, tests de changement d'angle et de suivi du point d'intérêt, absence d'erreurs JS dans le parcours ; artefact de captures film-studio-v10-chromium-synthetic.
- WebKit : rendu WebGL2 (14 714 pixels de premier plan), repli Canvas 2D (133 349 pixels de premier plan), zoom et déplacement du point d'intérêt visibles, export et refus contrôlés. Captures sous film-studio-v10-webkit-synthetic.
- Une capture du gros plan Chromium a été inspectée : plusieurs doigts et la tasse sont visibles, avec le visage partiellement hors champ. Les doigts ne sont pas encore une main anatomique, le contact peut seulement être estimé. La capture est entièrement synthétique.

### Ce qui n'est PAS démontré
- La distance radiale à un ellipsoïde est une approximation et n'est pas la distance minimale exacte à un corps de tasse réel (cylindre, anse, bord, boisson et géométrie des doigts sont simplifiés).
- Aucune preuve de collision, de prise ferme, de frottement, de force, de contact lèvres/objet, de stabilité du liquide ni de posture humaine réaliste.
- WebKit Linux n'est pas un test sur iPhone physique ; aucun export iOS vers Fichiers certifié. Aucun film MP4, aucune voix, aucun photoréalisme ni traitement des 157 vidéos privées.
- La PR #69 reste en brouillon ; aucun déploiement sur retoucheproai.com et aucune fusion.


## Film Studio v0.11 — anse ajourée, doigts guidés vers une boucle (16 novembre 2026)

### Implémentation contrôlée
- film-grip-v11.mjs : remplace l'ancienne anse pleine par une boucle ajourée en **12 petits éléments ellipsoïdaux**, articulés au **même unique récipient GLB**. Aucune deuxième tasse n'est créée.
- À partir de la pose **réellement encodée dans un GLB intermédiaire**, calcule les trajectoires des pivots de cinq doigts dans le repère local du poignet, au moyen de l'inverse de sa matrice 3D. Les bouts des doigts suivent des positions distinctes autour de l'anse pendant la prise ; le pouce est placé sur l'autre côté et les pivots reviennent à leur position initiale après le dépôt. La paume a été légèrement réduite afin de limiter son volume apparent autour de la tasse.
- Les constructeurs v0.9 et v0.10 disposent d'une option facultative de décorateur de rig ; **leur sortie par défaut ne change pas**. Le moteur v0.11 ajoute ses corrections uniquement à sa propre scène.
- La fonction auditHandleGrip vérifie directement sur le **GLB final exporté** la présence de l'anse ajourée, la distance radiale approximative entre le centre de chaque bout de doigt et les segments du pourtour, le taux de proximité, le dépassement instantané et un premier indice d'enfoncement du **centre** des doigts dans le corps de tasse.
- **Seuils du pilote :** distance moyenne maximale par doigt ≤45 mm, distance instantanée maximale ≤100 mm, au moins 70 % des observations à moins de 35 mm de l'anse ; enfoncement du centre d'un doigt dans le volume central de la tasse ≤12 mm. Il s'agit uniquement de filtres contre les défauts grossiers, pas d'une validation physique de préhension.
- film-grip-v11.test.mjs : 7 tests sur l'unicité de l'anse, les cinq trajectoires, l'absence de saut de racine, les scénarios masculin/féminin stylisés, le refus de médias réels, la compatibilité rétroactive v0.10 et l'injection volontaire d'une téléportation dans un canal GLB.
- film-ui-v11.mjs et film-studio-v11.html : parcours local simple et gros plan conservés, affichage explicite du nombre de segments et de la proximité géométrique. film-share-v11.mjs conserve le téléchargement normal et le partage local facultatif.

### Preuves GitHub et revue d'image
- **GitHub Actions 43794230819** (révision f3459582b5afc61d3a057f361baaa88ce0791bcc) : **74/74 tests Node**, Chromium WebGL2, WebKit Linux normal + Canvas 2D de secours et paquet HTTPS isolé réussis — **4/4 étapes vertes**.
- Les premiers tests ont repéré qu'un pic anormal était encore toléré par la métrique moyenne ; le contrôle de distance **instantanée** a été ajouté. L'injection anormale est ensuite détectée et les 74 tests réussissent.
- Chromium : 14 945 pixels de premier plan, vérification du GLB téléchargé (5 doigts, 12 segments d'anse), gros plan et suivi temporel. WebKit : WebGL2 14 720 pixels, secours 2D 133 403 pixels, aucun événement de type pageerror détecté par la suite de tests.
- La capture réelle du banc Chromium montre la tasse claire, la boucle composée de segments et les doigts stylisés autour du côté de l'anse. La boucle n'est plus un volume plein ; le rendu reste rudimentaire, sans garanties de non-intersection de toutes les surfaces.
- Paquet statique pour futur essai iPhone : artefact **film-studio-v11-iphone-https-package** (14 jours de conservation CI), **non déployé**. Captures synthétiques dans film-studio-v11-chromium-synthetic et film-studio-v11-webkit-synthetic.

### Limites explicites
- Mesurer le **centre** des bouts de doigts contre des ellipsoïdes n'est pas tester le vrai contact entre les triangles des maillages. Des pénétrations visibles des volumes complets sont encore possibles.
- Aucun calcul de pression, friction, force, poids, équilibre du corps, collisions certifiées, bouche ou lèvres réalistes ; aucun film MP4 ni dialogue audio et aucune ressemblance photoréaliste.
- Aucun test physique sur iPhone, aucune des 157 vidéos privées utilisée, aucun déploiement ou fusion de la PR #69, aucun changement à retoucheproai.com.
