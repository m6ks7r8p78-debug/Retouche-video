# RetoucheProAI NOVA — proposition de rupture et première preuve fonctionnelle

**Statut : expérimental, isolé, non déployé.** Aucune modification de `main`, de `index.html`, des modèles privés, de `sw.js` ou des médias. La branche part de `chatgpt-ai-director-v01` pour préserver les travaux ChatGPT/Claude existants.

## La rupture : de « lancer un modèle » à « choisir le meilleur résultat admissible »

La plateforme cible n'applique plus aveuglément un profil unique à toute la vidéo. Elle orchestre, **sur chaque scène et région**, plusieurs hypothèses de restauration réelles, mesure leurs compromis puis conserve l'original lorsqu'aucun candidat ne passe les garde-fous.

1. **Diagnostic temporel et spatial** : segmentation de plans, cartographie bruit/blocs/lumière/mouvement et zones AR, estimation de confiance. Distinguer mesure, supposition, annotation vérifiée.
2. **Moteur d'hypothèses** : baseline fidèle (rendu existant), traitements classiques, modèles spécialistes validés, et reconstruction générative uniquement avec accord explicite.
3. **Arbitre et contrôles** : comparer la sortie à la source, regarder sur et hors des masques, refuser les régressions (visages/identité, scintillement, textures, écrêtage, erreurs spatiales, temps/mémoire). Si aucune preuve suffisante, conserver l'original et le signaler.
4. **Continuité vidéo** : exploiter plusieurs images voisines, mouvement estimé et occlusions pour lisser les décisions entre plans sans contaminer les scènes.
5. **Carte de provenance** : résultat fidèle / hypothétique / inventé, masque par zone, version des moteurs, consentements et possibilité de désactiver un traitement sans perdre la source.
6. **Apprentissage prudent** : laboratoires privés avec groupes de scènes séparés et baselines bicubiques / classiques / RNE ; pas de promotion d'un réseau à partir d'un seul score ou d'un benchmark synthétique favorable.

### Ce qui fonctionne vraiment dans le prototype livré

- `experiences/nova.html` : interface responsive nouvelle, import local photo/vidéo, aperçu sombre neutre, grande scène, comparateur tactile avant/après et bande d'instants.
- Pour la **photo** (v0.2) : `nova-zones.js` compare les régions de 128 px, applique uniquement un **éclaircissement local non génératif** lorsque l'arbitre l'autorise et lisse les forces entre régions. La source reste intacte. Un calque permet de voir les zones sélectionnées. Les anciennes hypothèses globales existent encore dans le prototype historique mais ne sont plus le chemin actif.
- Mesures transparentes : luminance moyenne, proportion de très hautes lumières, variation locale horizontale de luminance, écart de pixels. **Ce sont des proxies ; ils ne mesurent ni vérité terrain ni esthétique.**
- Export PNG **de l'aperçu seulement**, limité à 1 600 pixels sur le plus grand côté ; pas de fausse promesse d'un traitement 4K/8K. La source n'est jamais écrasée.
- Pour la **vidéo** (v0.2) : lecteur natif et prélèvement de cinq instants (si décodables), puis **aperçu restauré basse résolution** par copies de trames, avec comparaison tactile. La cadence cible des rendus est d'environ 220 ms, les calculs sont déportés dans un Web Worker local quand disponible, une seule trame en vol. Le son/lecture restent natifs. **Pas d'export vidéo, pas de vraie détection de scènes, pas d'inférence neuronale, pas de reconstruction des détails disparus.**
- `nova-worker.js` exécute la correction locale hors du fil principal ; si indisponible, repli local synchrone. Aucun CDN, service tiers, transfert du média vers un serveur, téléchargement de modèle, identification faciale, reconnaissance AR ou entraînement activé par cette page.

### Ce qui n'est PAS implémenté aujourd'hui

- Aucun raccordement de cette page au pipeline d'export WebCodecs existant, ni orchestration neuronale vidéo par scène/région ; la correction vidéo est un aperçu échantillonné seulement.
- Aucune comparaison réelle entre tous les spécialistes neuraux ni apprentissage sur les 157 médias depuis ce prototype.
- Aucune détection AR v4 ou reconstruction 3D réellement activée.
- Aucun test matériel Safari iPhone 15 Pro Max pour ce prototype ; l'interface doit être éprouvée physiquement.

### Pourquoi le nouveau moteur est pertinent pour nos résultats

Le banc AR de la PR #1 a encore 62,5 % d'échecs sur 8 cas artificiels et le filtre chat est très mal retiré : le nouveau moteur doit pouvoir **refuser les masques AR non fiables**. Le RNE 0.4 ne surpasse pas le bicubique temporellement sur les fenêtres auditées : le nouveau moteur doit pouvoir **préférer le bicubique** plutôt que forcer une sortie neuronale. Une apparente hausse de netteté n'est pas une preuve de restauration des détails originels.

## Essai

Après un checkout de cette branche, servir le dépôt en local, puis ouvrir `/experiences/nova.html`.
Exemple : `python3 -m http.server 8080` à la racine puis `http://localhost:8080/experiences/nova.html`.

Tests des modules : `node --test tests/nova-decision.test.mjs tests/nova-zones.test.mjs tests/nova-video.test.mjs`. Test navigateur Chromium : `node --test tests/nova-browser.test.mjs` (Playwright et FFmpeg nécessaires).
Le navigateur doit prendre en charge Canvas 2D et les codecs du média. L'arbitrage ne remplace jamais une validation visuelle ni un banc de vérité terrain.

## Design cible (parcours iPhone en trois gestes)

- **Importer** : un seul bouton principal, capture du format et de l'origine, résumé de confidentialité.
- **Regarder** : grand écran « avant / proposition », bande d'instants, points d'attention visibles, avec zoom sur les éléments sensibles.
- **Garder ou exporter** : une seule décision et rapport de provenance compréhensible. Les options avancées (« Fidélité », « Reconstruction » et « Pro ») restent secondaires.

Direction visuelle : papier clair et typographie éditoriale pour la navigation ; scène photo/vidéo très sombre et neutre pour juger les images ; accent menthe pour les actions, aucun faux panneau IA avec scores fantaisistes. Adapté aux zones de sécurité de l'iPhone.

## Critères de promotion vers l'application

1. Tests sur véritables paires de référence vérifiées et groupes non contaminés ; filtres AR par **type et taille**, avec mesures du masque dans/hors région et taux de faux positifs.
2. Pas de régression temporelle mesurée face au meilleur moteur classique sur plusieurs scènes, pas seulement face à RNE 0.3 ; revue humaine sur textures, peaux et yeux.
3. Vidéo : l'export doit *effectivement* refléter les réglages et préserver durée/audio/orientation ; iPhone réel et test thermique/mémoire.
4. Traçabilité et consentements par média, absence de données privées sur GitHub.
5. Tests d'accessibilité et d'usage d'une personne non experte (import → un bouton → résultat), avec possibilité claire de revenir à l'original.

**Décision de diffusion** : ne pas fusionner dans `main` ni modifier le site publié sans examen et validation.

## Cycle NOVA 0.2 — 15 novembre 2026

- Éclairage par **tuiles** 32–512 px (128 px par défaut pour les photos), choisi selon la luminance et les indicateurs de risque. Chaque tuile obtient un choix explicite par `NOVA_DECISION` et un état traçable. Mélange bilinéaire des intensités entre tuiles afin de diminuer les joints visibles. Les zones lumineuses et les zones sans preuve restent inchangées.
- Visualiseur de masque actionnable (photo) : montrer/masquer les régions sélectionnées ; carte non incluse dans le PNG.
- **Véritable prévisualisation vidéo** des trames : le navigateur dessine les images sur Canvas, le calcul local traite les régions puis le résultat s'affiche dans un calque pour la comparaison. Ce n'est pas le traitement du fichier vidéo de sortie. Le prototype utilise au plus 320 px sur le plus grand côté pour le flux vidéo.
- **Web Worker** isolé : les calculs de photo et de vidéo peuvent se faire hors thread UI, sans connexion serveur. Retour synchrone local en cas d'indisponibilité ; il convient de benchmarker les temps et la température sur l'iPhone physique avant toute promotion.
- **20 tests de fonctions validés dans le moteur d'exécution JS** lors de la préparation (9 arbitre, 7 zones, 4 vidéo). Des tests Chromium mobile/desktop et vidéo MP4 synthétique sont ajoutés en CI, mais leur **statut distant doit être confirmé**. Ceci n'est pas une mesure de qualité visuelle ni un essai Safari réel.
- Limites : détection de zones sombres heuristique, pas de nettoyage AR réel, pas de preuve que la texture naturelle est mieux conservée, aucun critère perceptuel validé. L'éclaircissement de pixels existants n'est pas une restauration de vrais détails absents. Travaux orientés **filiation et sécurité du rendu**, pas promesse 8K.

**Jalon suivant** : tester les masques et le rendu sur de vrais médias autorisés avec revues perceptuelles, mesurer les coûts iPhone, puis raccorder progressivement l'export vidéo au moteur validé sans écraser l'application historique.


## Cycle NOVA 0.3 — export MP4 réellement recalculé (15 novembre 2026)

**Code versionné, pilote non déployé.** La vidéo exportée n'est plus seulement un aperçu Canvas. `experiences/nova-export.js` crée un lecteur de décodage local secondaire, prélève des images à timestamps monotones, applique NOVA Mosaïque (Worker si disponible), envoie les images corrigées à `VideoEncoder` H.264, puis construit un MP4 avec le `mp4-muxer.js` déjà utilisé par RetoucheProAI. L'utilisateur dispose d'un bouton indépendant, d'une annulation et d'un téléchargement (`experiences/nova-export-ui.js`).

### Garde-fous du premier export

- **Durée au plus 12 secondes**, fichier au plus **60 Mo**, dimensions de sortie paires avec côté long au plus **640 px**, **15 images/s** maximum. Ces limites sont des contraintes expérimentales, pas des capacités maximales de l'application.
- **Son** : par défaut, décoder la piste via Web Audio et encoder en AAC avec `AudioEncoder`. Si la piste n'est pas décodable, s'il manque la prise en charge AAC, ou si l'assemblage audio échoue, l'export est refusé. Une case distincte permet de choisir **explicitement** une sortie sans son. Aucun son n'est jeté silencieusement.
- `AbortController`, validation des capacités encodeur, et nettoyage des objets `VideoFrame`, `AudioData`, lecteur, Worker et URL temporaires.
- La sortie reçoit un autre nom et ne remplace pas le fichier source. Pas de téléchargement automatique : l'utilisateur choisit d'enregistrer le résultat.
- **Important** : l'accès aux images se fait par recherche temporelle sur HTMLVideoElement et non par démultiplexage image-par-image avec horodatages natifs. Ce chemin peut dupliquer ou manquer des images ; la fidélité aux mouvements et la synchronisation fine restent à mesurer, même si le MP4 est lisible.
- Les modules AR v4 et RNE ne sont pas exécutés. Il s'agit d'un **recalcul par région classique non génératif**, pas d'un entraînement ni d'une solution 4K/8K.
- Le pilote peut ne pas être utilisable sur certaines versions de Safari ou avec certains fichiers, même si l'application historique sait les traiter. Refuser proprement plutôt que perdre la piste audio.

### Validation à réaliser avant toute activation publique

1. `node --test tests/nova-export.test.mjs` : limites de durée/dimensions/taille et absence de repli audio implicite.
2. `tests/nova-browser.test.mjs` : MP4 synthétique avec piste AAC, export réel et inspection des pistes par `ffprobe` ; vérifier la vidéo, la présence de la piste audio en export normal réussi et son absence uniquement sur choix explicite. Ces tests de CI **ne remplacent pas un essai matériel Safari iPhone**.
3. Contrôler nombre de frames, temps audio/vidéo, orientation, cadence, décalage son et différences perceptuelles sur des vidéos autorisées et non utilisées à l'entraînement. Préparer un bench comparatif face à la chaîne historique.
4. Après validation : préférer l'export image-par-image horodaté et un muxage audio robuste de la version principale pour les fichiers longs ; ne pas étendre arbitrairement les limites de ce premier pilote.

La PR reste en brouillon. Aucun changement de `main` ou de déploiement public.


## Cycle NOVA 0.4 — contrat temporel et contrôle d'export (15 novembre 2026)

- **Incident CI corrigé** : le test navigateur 0.3 confirmait la photo mobile, la photo bureau et l'aperçu MP4, mais le dernier test attendait un téléchargement qui ne démarrait pas. La règle CSS `.pilot a{display:block}` annulait le masquage natif du lien ; le lien était visuellement présent sans `href`. Corrigé par `.pilot a[hidden]{display:none!important}` et par un test qui exige un véritable `blob:` avant de cliquer.
- **`nova-timeline.js`** : génération explicite des timestamps et durées CFR à 15 images/s ; contrôle de continuité, de monotonie et des durées ; limite du nombre de frames ; tolérance contrôlée de l'écart entre la position demandée et la position courante du lecteur.
- **Contrôle audio** : compare la durée PCM réellement décodée à la durée vidéo CFR prévue ; refuse une piste audio trop courte (tolérance limitée), coupe proprement le nombre de samples injectés dans l'encodeur à la durée vidéo, et conserve le principe « AAC ou refus, sauf sortie muette explicitement autorisée ».
- **Validation FFprobe renforcée** : vérifie le codec H.264, les dimensions de sortie, le nombre de frames, la durée, la présence/absence de piste audio selon le choix et l'écart des durées de piste.
- **Limite majeure conservée** : la chronologie CFR détermine la *sortie* ; tant que le décodage source repose sur des recherches HTMLVideoElement, il n'existe PAS de garantie de récupération exacte de chaque frame du film (PTS originaux non exposés), ni de parfaite synchronisation labiale ou de conservation HDR/couleur/metadata. Les valeurs `media.currentTime` peuvent signaler un écart manifeste, mais ne prouvent pas les PTS des images décodées. Le véritable chaînage démultiplexeur → VideoDecoder → NOVA par frame → VideoEncoder, avec remux AAC de référence, reste l'étape suivante.
- Aucune mise en production automatique ; pas de traitement des médias privés de recherche dans cette branche.

### Portes de qualité supplémentaires

1. CI « unitaires » et « navigateur » totalement vertes sur le même SHA ; rapport final du MP4 avec FFprobe.
2. Vrai essai Safari sur iPhone physique (réactivité, température, mémoire et reprise après verrouillage).
3. Tests de scènes très mouvementées et de durée sonore non alignée, comparés au pipeline historique.
4. N'autoriser ensuite une augmentation progressive des limites d'export qu'après ces mesures.


### NOVA 0.4b — contrôle de lisibilité avant téléchargement

Après `muxer.finalize()`, l'export crée une URL Blob locale, charge les métadonnées de sortie dans un élément vidéo muet et contrôle dimensions et durée (tolérance 300 ms). **Le lien de téléchargement n'apparaît qu'après réussite**. Le Blob temporaire de diagnostic est révoqué. Le rapport reste honnête : lecture des métadonnées démontrée, mais pas lecture intégrale, pas qualité perceptuelle ni intégrité du son sur Safari ; la CI FFprobe inspecte séparément les pistes, dont AAC. Un MP4 qui ne s'ouvre pas au moins au niveau métadonnées est refusé.

La première CI 0.4 avait les deux jobs verts : **4/4 tests Chromium** (photo mobile/bureau, aperçu vidéo MP4, export MP4 avec inspection FFprobe) et job unitaire réussi. Le contrôle de lisibilité supplémentaire correspond à un **nouveau commit qui doit être revalidé** avant promotion.


## NOVA 0.5 — décodage séquentiel à PTS MP4 natifs

**Capacité effectivement codée**, expérimental, isolé de la publication publique.

### Architecture nouvelle

- `nova-demux.js` extrait les échantillons du flux vidéo MP4 via `stsd`, `stts`, `ctts`, `stsc`, `stsz`, `stco/co64`, `stss`, et prend en compte un `edts/elst` **simple** en temps média pour corriger les PTS. Le code est adapté de la fonction `demuxVideo()` historique de `app.js`. Les structures non reconnues, les tables incohérentes et les montages complexes sont refusés.
- `nova-pts.js` alimente `VideoDecoder` en **ordre de décodage** des samples, reçoit les images dans leur **ordre de présentation** (y compris B-frames), compare leurs PTS natifs convertis en microsecondes et choisit l'image visible au moment d'export demandé. Il applique la matrice d'orientation du MP4. Il borne le nombre d'images gardées en mémoire.
- `nova-export.js` s'appuie désormais par défaut sur cette source décodée réellement, non sur `HTMLVideoElement.seek()`. Le traitement `NOVA_ZONES` et le muxage H.264/AAC restent dans le même chemin d'export. **Aucune fusion ni diffusion**.
- **Mode de compatibilité approximatif** : recherche d'images dans le lecteur HTML uniquement lorsque l'utilisateur coche volontairement l'option avancée. Aucun repli silencieux vers une chronologie infidèle.
- **Audit du changement de cadence** : nombre d'images source répétées et nombre d'images source sautées lors de la conversion vers une cadence constante à 15 fps. Ces nombres ne constituent pas à eux seuls des défauts : ils peuvent être inévitables lors d'une source à cadence variable ou supérieure à celle de sortie.

### Garde-fous

- Le *pilote* refuse les sources codées au-delà du **Full HD 1920 × 1080** en décodage PTS pour limiter la pression mémoire ; le fichier source n'est jamais modifié.
- L'export reste à **12 secondes maximum, 60 Mo d'entrée, 640 pixels et 15 fps de sortie**. Il refuse une perte sonore silencieuse, exige une vérification locale des métadonnées MP4 et n'envoie aucun média à un serveur.
- Certaines structures MP4 (plusieurs entrées d'edit-list, vidéo fragmentée, types de sample non couverts), codecs et colorimétries peuvent ne pas être supportés. Les PTS vidéo sont extraits ; **les horodatages audio originaux, les associations de montage complexes et la conservation HDR ne sont PAS garantis**.
- Les PTS de la source donnent la chronologie de présentation, **pas** le respect des 30/60 fps initiaux en sortie : NOVA échantillonne toujours à 15 fps dans le pilote et peut donc perdre des images de mouvement.
- Un test navigateur avec B-frames et edit-list simple est ajouté ; un test de **cadence variable VFR** vérifie les PTS distincts et le MP4 produit. Les résultats de la CI doivent être interprétés séparément de la validation physique sur Safari iPhone, non effectuée.

### Étape après NOVA 0.5

Garantir la qualité colorimétrique et la synchronisation audio sur plusieurs fichiers réellement autorisés ; comparer la cadence temporelle à la source ; intégrer ensuite au pipeline vidéo historique sans casser les profils normal / maximum / X et sans exposer de médias privés dans le dépôt. Ne pas augmenter les limites avant les mesures de mémoire, température, énergie et débit sur iPhone réel.


## NOVA 0.6 — protection mémoire, PTS, AAC et pression WebCodecs (15 novembre 2026)

Cycle **expérimental sur `chatgpt-studio-nova-v01` uniquement**.

### Modifications effectives

- `nova-guard.js` applique un **budget préventif de 160 Mio estimés** aux exports : fichier et éventuelle copie audio, jusqu'à dix surfaces décodées, buffers RGBA/Worker, PCM, muxage en mémoire, réserve fixe. Ce chiffre est **un seuil de prudence configurable en code**, ni une limite mémoire officielle d'iOS, ni une mesure matérielle. Un fichier trop coûteux est rejeté avant l'export. Les appareils peuvent néanmoins échouer sous le seuil : il faut tester Safari physique.
- Le parcours PTS natif libère maintenant l'élément vidéo HTML dès que l'analyse source / orientation et les métadonnées utiles sont acquises, afin d'éviter de garder **deux lecteurs de la source** inutilement. Le mode de recherche HTML approximatif conserve naturellement le lecteur jusqu'à la fin.
- L'audit de PTS vérifie l'absence de départ vidéo artificiel : une première image trop tardive provoque un refus explicite. Il relève aussi les longues lacunes temporelles pour les diagnostics, **sans les qualifier systématiquement comme erreurs de source**.
- `VideoEncoder` et `AudioEncoder` évitent les `flush()` intermédiaires utilisés pour désengorger la file, au profit d'une attente sur l'événement `dequeue`, avec annulation et délai maximum. Le `flush()` de fin de flux reste nécessaire.
- Pour le son, les paquets AAC réellement encodés sont comptés : une piste annoncée sans paquet, des timestamps incohérents, un départ très décalé ou une durée AAC manifestement mauvaise entraînent un refus, **pas une sortie silencieuse maquillée en vidéo avec son**.
- Tests : `tests/nova-guard.test.mjs` vérifie budgets source, projections 1080p/4K/8K, départ PTS, trous temporels, paquets AAC, suspension et annulation d'encodeur. `tests/nova-browser.test.mjs` ajoute un vrai MP4 synthétique **portrait à 30000/1001 i/s**, puis audit FFprobe des dimensions, de la cadence de sortie et du mouvement.

### Portée des garanties

- **Aucune montée des limites** : 12 s, 60 Mo de source, sortie <= 640 px / 15 i/s, source PTS <= Full HD.
- Le budget mémoire est une **projection**, pas une mesure de RAM, de chauffage, de batterie ni une preuve que Safari ne sera pas interrompu.
- L'audit AAC porte sur les timestamps des paquets **de sortie**. Les PTS de toutes les pistes audio à la source, les `edit lists` complexes, les délais perceptifs, les décalages labiaux et la qualité audible demandent toujours une instrumentation supplémentaire et des fichiers de référence.
- Les exports AV ne sont **pas** annoncés compatibles iPhone réel sans test sur un iPhone 15 Pro Max ; la CI Chromium n'est pas un substitut.
- Un résultat de tests ne doit être annoncé vert qu'après le dernier run GitHub Actions du **SHA exact**.
- Aucun média privé ni fichier d'entraînement ajouté au dépôt, aucune fusion ni mise en production.

### Fondements techniques

- [Spécification W3C WebCodecs](https://www.w3.org/TR/webcodecs/) : fermeture des `VideoFrame` après usage.
- [MDN WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) : queues asynchrones et encodage/décodage natif.
- [MDN VideoDecoder.decodeQueueSize](https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder/decodeQueueSize) : limitation de la pression d'entrée.

### Suite mesurable

1. Vérifier le dernier SHA en CI, puis mesurer les prévisualisations/export **sur iPhone réel**, dont mémoire, son et interruption.
2. Vérifier des fichiers tournés à 23,976 / 25 / 29,97 / 30 / 60 fps, de vraies rotations MP4 et des variantes AAC / VFR / HDR / edit lists.
3. Construire un audit **des pistes audio sources** (PTS, offsets, délais AAC) avant d'affirmer une synchronisation frame-perfect.
4. Obtenir un jeu de référence autorisé avec comparaisons perceptuelles et objective sans publication ; n'activer la montée 1080p/4K qu'après validation.


## NOVA 0.7 — inspection de la piste audio MP4 source (15 novembre 2026)

**Développement réel sur la branche isolée uniquement. Aucun changement de `main` ni déploiement.**

### Problème corrigé

`decodeAudioData()` fournit du PCM mais ne donne pas à l'application une chronologie fiable des `edit lists` de chaque piste. L'audit 0.6 portait sur les paquets AAC **de sortie**, et pouvait laisser passer une piste MP4 originale qui commence volontairement plus tard que la vidéo : un réencodage naïf aurait supprimé le décalage.

### Ce qui est implémenté

- `experiences/nova-avsync.js` lit localement la boîte `moov` (limitée à 12 Mio pour prévenir une allocation excessive), les pistes `soun`, `mdhd` (timescale), `stsd` (AAC `mp4a`), `stts` (durée d'échantillons) et `edts/elst` (délais et trims simples).
- Le nouveau contrat **refuse explicitement** : plusieurs pistes sonores ambiguës, codecs source non AAC, edits complexes, décalage initial important, trim de priming trop long, piste audio trop courte ou structures MP4 invalides.
- L'analyse du conteneur précède `audioDuFichier()` lorsque l'utilisateur demande un export **avec son** ; une erreur bloque tout l'export. Le choix explicite « sans son » ne déclenche pas cet audit.
- Un décalage initial connu n'est **jamais** supprimé par une correction automatique non vérifiée.
- L'audit renvoie des informations structurelles de source, sans lire ni sauvegarder le signal sonore et sans upload.

### Bancs d'essai et preuves

- `tests/nova-avsync.test.mjs` : source AAC simple, boîte moov en fin de fichier, priming court, montage à silence initial, trim trop important, durée trop courte, piste muette, pistes multiples, codec non AAC, edits complexes et fichiers tronqués.
- `tests/nova-browser.test.mjs` : génération FFmpeg d'un **vrai MP4 H.264/AAC avec 350 ms de décalage audio**. Contrôle de l'edit-list détectée puis refus du fichier par le parcours d'export. Ce test ne diffuse aucun média privé.
- **CI du commit `10c121b0d77f0721757039042efff0e9022929c7`**, run [43681882803](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43681882803) : 2 jobs success, **54/54 tests unitaires et 7/7 navigateur Chromium**.

### Limites non résolues

- Une analyse des tables de temps **ne garantit pas la synchronisation auditive perceptuelle** ni le comportement réel de l'amorçage AAC après réencodage : ce dernier peut introduire un délai additionnel. Des tests de boucle audio et d'écoute sur Safari iPhone sont nécessaires.
- La voie PCM via `decodeAudioData()` reste un prototype conservateur ; elle ne gère pas les mixes multipistes, edits complexes, fragmentations, vidéo HDR, ni la copie directe AAC sans altération.
- **Ni 4K/8K, ni validation iPhone réel** ; mêmes plafonds pilote que NOVA 0.6 (12 s, 60 Mo, 640 px, 15 i/s en sortie, sources Full HD en décodage PTS).
- Une source refusée n'est pas automatiquement rendue muette. Seul l'utilisateur peut demander explicitement la sortie sans son.

### Fondement et pistes suivantes

- [W3C WebCodecs — définition du timestamp et audio priming](https://www.w3.org/TR/webcodecs/)
- [MDN WebCodecs — transcodage et pass-through audio](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API)
- [QuickTime File Format — AAC priming](https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFAppenG/QTFFAppenG.html)

Prochaine étape : un test de synchronisation de bout en bout (impulsions audio + flashs vidéo synchronisés, FFprobe + analyse du PCM décodé) ; analyser le délai ajouté par l'encodeur AAC sur plusieurs environnements avant de prétendre à une préservation parfaite. Préparer ensuite une alternative de copie sans réencodage de l'audio AAC **uniquement** sur les sources avec chronologie de conteneur intégralement comprise.


## NOVA 0.8 — banc de synchronisation AV à impulsions et références (15 novembre 2026)

### Fonctionnalités test ajoutées

- `tests/nova-av-pulses.mjs` : extraction temporelle d'impulsions PCM décodées (Float32 LE mono) et de flashs vidéo (trames grises 8×8), puis mesure des **offsets audio/vidéo avant/après** et de la dérive entre deux événements. Les fonctions refusent les signaux absents, les données malformées, un décalage ajouté >90 ms ou une dérive >90 ms. Tolérance propre à **ce banc 15 fps**, pas garantie universelle.
- `tests/nova-av-pulses.test.mjs` : cinq scénarios unitaires (réussite, signaux invalides, délai introduit, dérive).
- `tests/nova-browser.test.mjs` : source synthétique 160×90, 15 fps, flashs à 0,4 et 1,2 secondes, impulsions sonores correspondantes ; export expérimental NOVA et décodage FFmpeg à partir du MP4 téléchargé pour mesurer l'écart **si AAC est encodable**.
- **Calibrage indépendant de l'encodeur WebCodecs** : vraie réencapsulation/édition AAC avec FFmpeg. Un fichier témoin de référence et un second fichier auquel 250 ms de silence ont été injectées sont **décodés physiquement** ; le banc doit accepter le premier et identifier le second. Ce calibrage ne prétend pas valider l'export audio de NOVA.

### Résultats GitHub Actions honnêtes sur le commit `d1f073327a5bf3194ca12796e6ef9bbea711fe3b`

[Run GitHub Actions 43682496977](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43682496977) : **deux jobs verts**, 59 tests unitaires réussis sur 59, 8 tests navigateur réussis sur 9 ; **un test navigateur ignoré**, aucun échec.
- Le témoin FFmpeg **sain** affiche une différence ajoutée de **0,0 ms**.
- Le témoin FFmpeg **désynchronisé** affiche **250,0 ms** de retard audio mesuré ; ce témoin doit provoquer le refus du banc.
- Le test de la sortie audiovisuelle complète de NOVA a été explicitement **ignoré** : l'environnement Chromium CI ne dispose pas d'encodeur AAC WebCodecs utilisable pour ce scénario. Une CI verte n'est **pas** une preuve de synchronisation du MP4 restauré par NOVA avec son.

### Limites qui restent bloquantes

1. Réaliser le test exact AV sur un navigateur disposant d'AAC WebCodecs, puis sur **Safari d'un iPhone 15 Pro Max physique**, sans téléverser les vidéos privées.
2. Réduire les allocations et instrumenter les temps de traitement du décodeur/encodeur sous contraintes mémoire et énergie réelles.
3. Étendre le banc à des cadences source 23,976 / 25 / 29,97 / 30 / 60 et des edits AAC difficiles.
4. Mesurer colorimétrie, détails, visages et métriques perceptuelles avant d'annoncer une restauration supérieure.
5. Ne débloquer ni Full HD en sortie ni 4K/8K sans ces validations.

**Les limites opérationnelles restent inchangées :** 12 s / 60 Mo, sortie 640 px / 15 fps, décodage PTS source Full HD au plus. PR #3 toujours brouillon, aucune fusion ni déploiement, aucune publication de média privé.


## NOVA 0.9 — solution libre et locale aux lacunes d'AudioEncoder AAC (15 novembre 2026)

**Blocage initial résolu pour un sous-ensemble strict de MP4** : Chrome/Chromium sur Linux n'expose pas d'encodeur AAC utilisable. Le test AV était historiquement ignoré dans cette CI, bien que le test sonore synthétique FFmpeg fonctionne. Des recherches documentaires sur WebCodecs ont montré la solution de **pass-through AAC** ; le `mp4-muxer.js` déjà présent expose `addAudioChunkRaw`. Aucun service payant, nouveau moteur WASM, fichier externe ou téléversement n'est nécessaire.

### Code intégré sur la branche isolée

- `experiences/nova-aac-copy.js` : lecture locale du `moov` (plafond d'index), sélection d'une unique piste AAC-LC mono/stéréo validée par `esds/ASC`, `mdhd`, `stsd`, `stts`, `stsc`, `stsz` et `stco/co64`. Reconstruction bornée des offsets, tailles, durées et PTS audio. **Copie échantillon par échantillon des octets AAC originaux** vers le muxer MP4 sans `AudioEncoder` ni `decodeAudioData`.
- Cette voie n'est permise que pour **une piste AAC-LC simple dont le début, la couverture et la configuration sont vérifiables**. Elle rejette un priming/trim AAC non nul, les listes de montage complexes, les pistes multiples, les codecs inconnus, des tables malformées ou des données hors limites. L'audit audio source de NOVA 0.7 reste obligatoire, et le contrôle des paquets de sortie de NOVA 0.6 aussi.
- `nova-export.js` **essaie la copie AAC d'abord**, puis l'encodeur AAC natif pour les cas qui exigent un réencodage, sinon refuse l'export sonore. La case « sans son » reste une action explicitement demandée, jamais un repli silencieux.
- `nova-export-ui.js` annonce correctement « audio AAC original copié » plutôt que « réencodé ». Cela évite de confondre les deux chemins.
- `nova-pts.js` introduit `choisirProche` : à la sortie CFR 15 fps, une vraie image source peut être sélectionnée légèrement à l'avance **uniquement si elle est la plus proche et à moins d'une demi-image** (33,3 ms). Aucun nouvel objet/image n'est généré. La fonction historique `choisir` reste disponible pour les cas qui exigent le passé strict.
- La chronologie source vidéo de notre banc AV est maintenant mesurée avec les **vrais PTS FFprobe**, pas seulement en supposant que l'image zéro démarre à t=0.

### Tests CI réellement exécutés

- `tests/nova-aac-copy.test.mjs` : samples source égaux bit à bit aux octets recopiés, horodatages, ASC, rejets priming, pistes invalides, couverture incomplète et annulations.
- `tests/nova-pts.test.mjs` : nouvelle sélection temporelle au plus proche et borne de demi-image, y compris pour des intervalles VFR.
- `tests/nova-browser.test.mjs` : vrai fichier synthétique H.264/AAC généré par FFmpeg, sans edit-list audio/vidéo ambiguë, décodé et converti par NOVA en Chromium Linux. Les paquets audio source et sortie sont comparés par empreintes SHA-256 `ffprobe -show_data_hash`, puis les flashs vidéo et impulsions audio sont comparés sur leurs **timestamps effectifs**, avec un seuil inférieur à une demi-image de sortie.
- **CI du commit `91e735eb8819967b3a6962b387ff2aec9a4b83b3` : [run 43683773593](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43683773593), 2 jobs success, 67/67 tests unitaires et 9/9 navigateur, 0 échec, 0 ignoré.**
- **Résultat exact du banc** : **94 paquets AAC identiques bit à bit**, décalage AV ajouté **21,4 ms** (contre 66,7 ms avant ajustement du choix de trames), **dérive 0,0 ms** entre les 2 impulsions, témoins FFmpeg 0 ms sain / 250 ms défaut identifié.

### Limites à ne pas masquer

- Un test synthétique H.264/AAC avec source audio simple et sortie à 15 fps ne certifie **ni synchronisation universelle, ni iPhone Safari physique, ni écoute subjective**, ni conservation des métadonnées originales HDR/couleurs.
- Certains MP4 AAC contiennent un **priming obligatoire ou un montage que la copie brute ne peut représenter correctement** avec ce muxer : pas de suppression arbitraire du priming. Ces médias ne bénéficient pas de la copie directe ; le chemin d'encodage natif reste requis, et peut lui-même être indisponible.
- `choisirProche` minimise l'écart CFR en acceptant une image déjà réelle légèrement future (≤ une demi-période) : il n'est **pas** un mode strict « jamais d'anticipation » et ne constitue pas une restauration de cadence intégrale.
- Le budget mémoire 0.6 est une estimation préventive, pas une mesure d'usage iOS. Les limites pilote restent **12 secondes, 60 Mo de fichier, côté long 640 pixels, sortie 15 fps, source décodée PTS Full HD maximum**.
- Toujours PR #3 en brouillon, aucune fusion/déploiement, aucune donnée privée ou vidéo d'entraînement publiée.

### Étapes mesurables suivantes

1. Sur une vraie application iPhone Safari, mesurer les variantes sans edit-list, avec priming AAC, HEVC orienté, 30/60 fps, écoute des 2 repères et mémoire.
2. Rechercher une stratégie standardisée pour **préserver exactement l'edit-list AAC/priming** avant de généraliser la copie sans encodage.
3. Ajouter le même banc d'événements sur des sources VFR/B-frames réelles (timelines FFprobe et sorties), mesurer les erreurs de cadence.
4. Puis seulement permettre Full HD/4K après validation mémoire/performance, sans forcer le moteur neuronal.

Références : [MDN — pass-through WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API), [MDN — disponibilité des encodeurs AAC](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection), [Apple — priming AAC](https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFAppenG/QTFFAppenG.html).


## NOVA 0.10 — VFR + B-frames + audio AAC et groupes d'amorçage (15 novembre 2026)

### Avancement réel et mesurable

1. **Couplage des problèmes difficiles dans un seul MP4 synthétique.** `tests/nova-browser.test.mjs` génère un MP4 160×90 avec audio AAC, cadence vidéo variable, images réordonnées par B-frames, flashs et impulsions sonores. Le banc vérifie les deltas PTS multiples et les PTS décodage/présentation non monotones en ordre d'échantillons. La vidéo exportée est réellement produite par NOVA en Chromium Linux, sans `AudioEncoder`, avant FFprobe et décodage des signaux.
2. **Mesures initiales VFR+B+AAC.** Sur le run [43684972098](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43684972098) (avant amélioration de la métadonnée de préchargement) : source avec **34 trames**, **4 intervalles distincts**, **95 paquets AAC de sortie égaux aux paquets source** ; les 2 repères sonores et les 2 flashs restent au même PTS avant/après : **0 ms d'offset ajouté, 0 ms de dérive mesurée** dans ce scénario. CI : 67/67 unitaires, 10/10 navigateur, 0 ignoré.
3. **Durcissement de la lecture de paquets AAC.** `nova-aac-copy.js` analyse maintenant **toutes les boîtes MP4 de premier niveau** avec une limite de 2 048, collecte chaque région `mdat`, et refuse tout paquet audio dont les octets tomberaient en dehors des données médias, même si les offsets restent à l'intérieur du fichier. Les `mdat` après `moov` (faststart) restent valides.
4. **Préchargement AAC `roll` préservé lorsque simple et vérifiable.** FFmpeg produit souvent `sgpd/sbgp` de type `roll` avec distance `-1` pour une piste AAC. Ces groupes n'étaient pas précédemment recopiés, ce qui peut être problématique pour le décodage à l'ouverture ou après recherche. Le nouveau lecteur refuse les groupes incomplets, complexes ou étrangers, mais accepte `roll` distance -1 ou 0 avec **une description de groupe et une affectation à tous les échantillons**. L'extension ciblée de `mp4-muxer.js` écrit les mêmes groupes `sgpd/sbgp` en sortie ; `nova-export.js` transmet la distance validée.
5. **Contrôles structurels supplémentaires.** Les tests unitaires vérifient que des références vers `moov` ne sont pas prises pour des paquets `mdat`, et que les groupes partiels sont refusés. Les tests Chromium exigent aussi la présence correcte des groupes AAC `roll` dans les deux exports, sans altération des empreintes SHA-256 des paquets AAC.

### Vérification et limites

- Validation structurelle du groupe `roll` ne prouve **pas** la synchronisation auditive parfaite sur Safari iPhone, ni l'amorçage gapless pour tous les lecteurs.
- **Les `elst` avec priming, trims non nuls, éditions multiples, groupes `roll` complexes ou source en HE-AAC restent hors voie sans réencodage**. Le système ne gomme jamais ces temps, et refuse l'export sonore si aucun chemin sûr n'est disponible.
- La sortie reste limitée à 640 px / 15 images/s, 12 secondes et 60 Mo ; aucun test matériel réel iPhone. Aucun média privé n'est utilisé dans cette CI.
- La branche `chatgpt-studio-nova-v01` et la PR #3 restent en brouillon ; **aucune fusion, publication, ni déploiement**.

### Recherche de solutions gratuites pour le prochain obstacle

- Apple documente les groupes `roll`, `sgpd/sbgp` et l'`elst` dans la représentation de l'amorçage AAC : [documentation Apple](https://developer.apple.com/documentation/quicktime-file-format/using_track_structures_to_represent_encode_delay_explictly).
- Le projet libre **Mediabunny** (licence **MPL-2.0**, ne pas confondre avec MIT) a travaillé sur la détection de l'encoder delay, la correction de priming AAC et le cas Safari fin octobre/début novembre 2026 : [dépôt](https://github.com/Vanilagy/mediabunny), [ticket technique #444](https://github.com/Vanilagy/mediabunny/issues/444). **Piste à comparer sous tests**, pas dépendance déjà intégrée ou solution iPhone certifiée.
- L'architecture d'export reste locale et gratuite. Les choix futurs doivent être motivés par essais end-to-end, respect des licences, mémoire iPhone et confidentialité.

*La validation CI du HEAD documenté et le statut précis des tests sont consignés dans la PR GitHub. Une CI verte ne prouve pas la qualité perceptuelle ou la synchronisation universelle.*


## NOVA 0.11 — amorçage AAC `elst + roll` et VFR/B-frames (15 novembre 2026)

### Ce qui est effectivement développé

Le pilote expérimentait une copie AAC bit-identique sans `AudioEncoder`, mais rejetait les listes de montage audio dont le `media_time` était non nul. Or ce temps peut représenter **l'amorçage de l'encodeur AAC**, et non un délai de début du son. Le supprimer ou l'ignorer décale le son ou expose des échantillons qui ne font pas partie de l'audio source.

L'extension `experiences/nova-aac-copy.js` autorise désormais **une édition audio simple** (`elst`, version 0, exactement une entrée, vitesse 1x, début média positif <=125 ms), uniquement avec une piste AAC-LC mono/stéréo à groupes d'échantillons `roll` complets et vérifiés. Les paquets de préchargement d'origine sont copiés, **y compris ceux qui se situent avant la première portion sonore présentable**. La source est refusée en cas de montage complexe, délai vide en début de piste, préchargement sans `roll`, débordement de la durée réellement encodée, structure hors `mdat`, codecs non pris en charge ou informations contradictoires.

L'extension ciblée du `mp4-muxer.js` insère une véritable boîte `edts/elst` **sur la piste audio seulement**, contenant le même `media_time` exprimé en échantillons audio et la durée à l'échelle du film. Elle conserve aussi le groupe `sgpd/sbgp roll` et ajuste les durées `tkhd/mvhd` pour que les métadonnées du fichier restent cohérentes. La durée de l'édition de sortie **ne peut jamais être supérieure à celle de l'édition source**. Les échantillons AAC restent identiques à ceux de la source ; ce n'est pas un réencodage.

`experiences/nova-avsync.js` calcule désormais la **durée réellement présentée après montage**, plutôt que de confondre toute la couverture `stts` et la durée audio utilisable. Des listes qui indiquent des portions hors des échantillons décodables sont rejetées. Les tests unitaires couvrent également le cas théorique **2 112 échantillons** documenté par Apple, sans prétendre avoir mesuré un encodage iPhone réel de cette variante.

### Tests indépendants

- [Run 43686173484](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43686173484) : **72 tests unitaires / 72, 11 tests navigateur / 11, aucun ignoré.** Source réelle H.264 + AAC issue de FFmpeg, avec `elst` positif et `roll`. Après un export NOVA réel dans Chromium Linux : **21,333 ms d'amorçage source et 21,333 ms après copie**, **95 paquets AAC de mêmes empreintes SHA-256**, et **0 ms d'offset ajouté / 0 ms de dérive** sur les deux événements synthétiques.
- [Run 43686545460](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43686545460) : **76/76 unitaires, 12/12 navigateur, aucun ignoré**. Le nouveau scénario *combiné* intègre dans **un seul vrai fichier** une source vidéo VFR, des B-frames réordonnées et une piste AAC avec `elst` positif/`roll=-1`. Les repères vidéo sont mesurés via les vrais timestamps FFprobe, et l'export conserve 95 paquets audio identiques, sans décalage ni dérive détectables sur les deux événements.
- Les tests suivants renforcent encore les bornes de durée des edits audio, le contrôle de couverture des paquets et l'interdiction de prolonger une édition audible au-delà du segment source. Leur validation CI doit être confirmée sur le dernier commit et ne doit pas être déduite des runs précédents.

### Limites importantes et options gratuites examinées

1. L'édition directe ne couvre **pas** les `elst` version 1 ou multiples, silences initiaux volontaires, troncatures complexes, `roll` atypiques, HE-AAC, audio multicanal complexe, ni les cas où le priming dépasse 125 ms. Ils sont **refusés** si aucun traitement natif sûr n'est disponible.
2. Un fichier synthétique et un décodeur FFmpeg sur Linux ne reproduisent pas le comportement perceptuel réel de **Safari iOS, de son matériel ou d'une séquence de 157 vidéos privées** : il reste indispensable de mesurer le son sur un iPhone physique. Aucun de ces médias n'a été utilisé ou publié dans ce banc.
3. La spécification Apple décrit un cas courant avec **2112 échantillons d'amorçage**, une liste `elst` et des groupes `sgpd/sbgp roll` ; il ne suffit pas de réécrire l'`elst` isolément. [Apple — Representing encoder delay explicitly](https://developer.apple.com/documentation/quicktime-file-format/example_representing_encoder_delay_explicitly), [Apple — Using track structures](https://developer.apple.com/documentation/quicktime-file-format/using_track_structures_to_represent_encode_delay_explictly).
4. Mediabunny, sous licence MPL-2.0, est une alternative libre à évaluer pour des flux plus complexes, mais **n'a pas été intégrée ni validée pour nos médias**. [Mediabunny #444](https://github.com/Vanilagy/mediabunny/issues/444).
5. Toutes les limites de la version pilote restent en place : **12 secondes**, **60 Mo**, **sortie 640 px à 15 i/s**, décodage PTS source Full HD maximum ; pas de restauration neuronale 4K/8K démontrée.

La PR #3 doit rester **DRAFT**, aucun déploiement sur `retoucheproai.com`, pas de fusion sur `main`, aucune publication des médias privés.


## NOVA 0.12 — préservation d'un début de piste AAC volontairement différé (15 novembre 2026)

### Problème résolu dans le pilote progressif

NOVA 0.11 savait conserver l'amorçage AAC `elst media_time > 0`, mais laissait de côté les fichiers dont la piste audio commence volontairement plus tard que la vidéo. Les fichiers MP4 peuvent représenter ce décalage par **deux entrées `elst`** : une édition vide initiale (`media_time=-1`), puis une édition normale de la piste audio. Supprimer cette entrée provoque un décalage audible, même lorsque les octets AAC sont intégralement conservés.

### Développement intégré dans la branche expérimentale

- `nova-aac-copy.js` accepte **exactement une édition média**, ou **une édition vide initiale suivie d'une unique édition média** (version 0, vitesse 1x, aucun montage complexe). La durée vide est plafonnée à **500 ms**. Le décalage est lu à l'échelle temporelle du film et n'est pas inventé à partir des PTS des paquets AAC.
- `mp4-muxer.js` écrit l'`edts/elst` à **deux entrées pour la piste audio** ; les durées `tkhd` et `mvhd` comprennent le temps vide initial. Ce mode exige un **MP4 progressif**, et refuse explicitement `fastStart="fragmented"` pour ce cas. Le début AAC `media_time` et l'éventuel `sgpd/sbgp roll` restent conservés.
- `nova-export.js` demande le plan de copie AAC avant de permettre un décalage audio supérieur à 80 ms ; si le plan est incompatible, l'audit audio refuse toujours le décalage au lieu de le supprimer pendant `decodeAudioData`.
- `nova-avsync.js` expose le mode d'audit `allowLeadingGap` uniquement lorsque le chemin de copie a vérifié le montage ; plafond 500 ms et contrôle du premier PTS vidéo.
- `nova-guard.js` compare la durée des paquets AAC à **durée film − durée vide**, et non à la durée totale du film : le silence initial ne devient jamais un paquet AAC artificiel.
- `tests/nova-aac-copy.test.mjs`, `tests/nova-avsync.test.mjs` et `tests/nova-guard.test.mjs` vérifient les bornes, le décodage des métadonnées, les refus de gaps excessifs, l'impossibilité d'allonger un montage audio et l'absence de repli silencieux.

### Preuve sur un vrai fichier MP4 et limites

Le test Chromium crée un MP4 **H.264 + AAC avec un décalage initial demandé à FFmpeg de 250 ms**. FFmpeg a inscrit une édition vide de **228 ms** dans le fichier ; NOVA conserve **228 ms**, valeur **réellement encodée**, au lieu de forcer 250 ms. Le test compare la structure de piste AAC, ses **84 empreintes de paquets sans changement**, et deux repères sonores/visuels avant/après. Les événements audio sont également analysés par FFmpeg avec `aresample=async=1:first_pts=0`, qui rétablit le silence initial dans le PCM pour mesurer la chronologie présentée. Sur ce banc : **0 ms d'offset ajouté et 0 ms de dérive mesurée**, à la résolution de la mesure.

**Run vérifié du code `ec9d58ed683764a384ada5b6de3fc705e245ebec` :** [GitHub Actions 43687777882](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43687777882), **82/82 tests unitaires, 13/13 tests navigateur Chromium, aucun échec ni test ignoré**.

**Limite importante documentée :** les lecteurs Chromium, Safari et Firefox ne traitent pas tous les *empty edits* de la même façon dans certains scénarios **Media Source Extensions (MSE)**. La preuve actuelle concerne **un MP4 progressif lu/décodé par FFmpeg et produit par le navigateur Chromium**, pas tous les pipelines MSE et pas le Safari physique d'un iPhone. Voir [W3C Media Source Extensions issue #377](https://github.com/w3c/media-source/issues/377) et [FFmpeg `mov.c` edit-list handling](https://chromium.googlesource.com/chromium/third_party/ffmpeg/+/refs/heads/master/libavformat/mov.c).

Les garde-fous du pilote restent inchangés : 12 secondes, 60 Mo source, 640 px/15 fps export. Les sources AAC avec plus de deux éditions, silence de début >500 ms ou montage non déterministe restent refusées. Aucune mesure Safari iPhone physique, aucune fusion/déploiement, aucun média privé publié.

### Prochaines expériences prioritaires

1. Répéter le banc sur les variantes d'edit-list version 1 et les délais plus courts qui se quantifient à une unité AAC.
2. Tester les différences de lecture iPhone Safari progressive vs MSE, sans déployer la PR et sans publier de médias privés.
3. Isoler les fausses alertes de décalage sur des vidéos iPhone HEVC/VFR et instrumenter la mémoire et l'énergie réelles.


## NOVA 0.13 — listes de montage AAC `elst` version 1 (15 novembre 2026)

### Extension codée et validée

NOVA 0.12 gérait l'édition audio `elst` version 0 (durée 32 bits non signée, `media_time` 32 bits signé) avec au plus deux segments : une portion vide facultative, puis la piste AAC. Le pilote NOVA 0.13 sait **lire et conserver la version 1**, à durée 64 bits non signée et `media_time` 64 bits signé, conformément à [ISO/IEC 14496-12:2015/Amd.2:2018, §8.6.6](https://cdn.standards.iteh.ai/sist-preview/71851/c530ffc825c84f0a9440e20cba9baf30/ISO-IEC-14496-12-2015-Amd-2-2018.pdf).

- `experiences/nova-aac-copy.js` : lecture `getBigUint64`/`getBigInt64`, conservation du numéro de version `editListVersion`, refus des valeurs qui ne peuvent pas être représentées en entier JS sans perte de précision. Les bornes de durée et de préchargement déjà présentes restent obligatoires : il ne s'agit PAS d'autoriser 64 bits de durée arbitraires.
- `mp4-muxer.js` : écriture d'une boîte `elst` **version 1 en sortie**, avec ses champs 64 bits et l'édition vide facultative ; les boîtes de durée de la piste et du film continuent à refléter la durée de présentation, et les octets AAC sont recopiés sans réencodage.
- `nova-export.js` : propage `editListVersion` uniquement si l'édition audio source validée est copiée.
- Durcissement fondé sur les règles ISO : **le bit de répétition de la liste `elst` et les autres flags non nuls sont refusés**, car le pilote ne peut pas reproduire fidèlement la répétition. Le refus s'applique à `nova-aac-copy.js`, à l'audit `nova-avsync.js` et à `nova-demux.js` pour les éditions vidéo ; les en-têtes tronqués sont également refusés.

### Preuve expérimentale vérifiée

La CI produit un **vrai MP4 FFmpeg** H.264 + AAC avec édition vide initiale ; sa boîte `moov` est volontairement en fin de fichier, après `mdat`. Le banc transforme ensuite **uniquement** l'édition audio `elst` version 0 en version 1 (en recalculant la taille de `elst/edts/trak/moov`) : les offsets `stco` des paquets restent identiques. Ce n'est **pas** une vidéo iPhone originale encodée directement en v1, mais une vraie vidéo AAC/AVC lisible avec métadonnée v1 reconstruite.

L'export expérimental du navigateur Chromium conserve :
- **`elst` 1 → 1** avec 2 entrées et un silence initial de **228 ms** ;
- **84 paquets AAC** vérifiés identiques par leurs empreintes SHA-256 source/sortie ;
- **0 ms de décalage AV introduit, 0 ms de dérive** sur les deux événements synthétiques, aux seuils du banc ;
- aucun upload ni encodage audio supplémentaire.

Le test ajoute des cas unitaires `elst` v1 à un et deux segments, avec/sans priming, des entiers supérieurs à `Number.MAX_SAFE_INTEGER`, des `media_time` invalides et les **flags de répétition** interdits. **GitHub Actions [run 43688752755](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43688752755)** sur le commit `496055794caf4ee9315cc797852d0f35ae8e3f81` : **87/87 tests unitaires, 14/14 tests navigateur Chromium, 0 échec, 0 ignoré, deux jobs success**.

### Limites à respecter

- Le fait qu'une `elst` soit version 1 ne garantit **pas** sa prise en charge : les grandes valeurs 64 bits, les répétitions, les edits multiples/complexes, les vides initiaux >500 ms et les fichiers fragmentés MSE restent exclus du chemin conservateur.
- Un banc Chromium/FFmpeg synthétique ne remplace pas des essais matériels **Safari iOS**, et ne démontre pas de synchronisation labiale ou de restauration vidéo visuelle supérieure.
- Les plafonds opérationnels ne changent pas : 12 s / 60 Mo source, sortie 640 px à 15 i/s. Aucun entraînement neuronal réalisé ici, aucune analyse des 157 médias privés, aucun déploiement/fusion.
- La PR #3 doit rester **DRAFT** et le site `retoucheproai.com` doit rester inchangé.

### Poursuite prioritaire

Éprouver sur appareil iPhone physique le MP4 progressif avec edits v0/v1 et les délais AAC ; ensuite isoler les cas source HEVC orienté/VFR et les pistes multiples, sans étendre les formats non testés ni sacrifier l'audio.


## NOVA 0.14 — véritable banc WebKit Linux, orientation portrait et source HEVC (15 novembre 2026)

### Deuxième moteur de navigateur réellement mis en place

La PR expérimentale possédait déjà des tests Chromium, mais **pas de tests WebKit**. Le workflow `.github/workflows/nova-check.yml` exécute maintenant **trois jobs obligatoires** : `unitaires`, `navigateur` (Chromium) et `webkit`. Le job WebKit installe librement et localement Playwright WebKit et ses dépendances dans GitHub Actions ; aucun compte GPU payant ni publication de média n'est nécessaire.

- `tests/nova-webkit.test.mjs` vérifie une **photo importée localement** sur viewport iPhone 390 px : traitement réel, PNG exporté, aucune requête vers un domaine externe, absence d'erreurs JS et aucun débordement horizontal.
- Le **premier vrai run WebKit** a découvert **89 px de défilement horizontal** malgré une interface invisible sur l'écran. Cause confirmée : le champ `input[type=file]` avait une largeur CSS de 1 px, mais WebKit calculait encore ses 107 px de largeur de contenu interne à droite du viewport. `experiences/nova.html` place et clippe maintenant ce champ et coupe son débordement interne, tout en conservant la commande d'import accessible via son `label`. La correction passe sous WebKit sans cacher artificiellement le défilement de la page entière.
- Le banc WebKit importe un **vrai MP4 H.264/AAC** de FFmpeg, analyse ses pistes locales, teste les API WebCodecs, puis **effectue un export audiovisuel NOVA réel**. `ffprobe` confirme les flux vidéo `h264` et audio `aac` dans le MP4 téléchargé. Une assertion additionnelle compare les **empreintes SHA-256 des paquets AAC** source et sortie pour démontrer la copie bit-identique ; sa CI doit être vérifiée sur le HEAD correspondant, sans supposer sa réussite.
- Les premiers résultats WebKit/Linux indiquent `VideoDecoder` et `VideoEncoder` présents, `canPlayType` indiquant « probably » pour H.264/AAC et HEVC, mais **`canPlayType` seul ne prouve pas la décodabilité**. Le test d'export lui-même constitue la preuve utile.

### Garde-fou pour les orientations MP4 iPhone

`experiences/nova-demux.js` comprend maintenant `analyserOrientation(W,H,mt)`. Cette fonction refuse les matrices de piste `tkhd` présentant cisaillement, zoom, déformation, perspective, rotation non orthogonale, coordonnées non finies ou dimensions impossibles. Les **rotations de 0°, 90°, 180°, 270°**, et les réflexions orthogonales, sont conservées par une matrice de rendu exacte au pixel, avec normalisation des dimensions de présentation. La validation est non destructive : NOVA refuse les matrices non représentables au lieu d'étirer involontairement le sujet. `tests/nova-demux.test.mjs` protège ces cas et fait partie des unitaires CI.

### Banc d'import HEVC + orientation 90°

`tests/nova-hevc-browser.test.mjs` fabrique un **vrai MP4 H.265/HEVC** (FFmpeg `libx265`, AAC), puis modifie uniquement sa matrice `tkhd` pour exprimer une orientation portrait de 90° comme peut le faire une vidéo iPhone. Le lecteur `NOVA_DEMUX` reconstruit correctement les dimensions **160×90 codées → 90×160 présentées**, avec la transformation `[0,1,-1,0,90,0]`.

**Constat limité de Chromium Linux :** `VideoDecoder.isConfigSupported` a répondu **false** pour la source HEVC générée ; NOVA a donc **refusé l'export**. Ce refus est le résultat correct : le banc ne prétend pas que le HEVC a été décodé ou exporté. Le test doit devenir un export HEVC réel sur une plateforme qui dispose du codec.

### Exécution GitHub Actions et limites

- **[Run 43690257054](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43690257054)** : 3 jobs success, **90/90 unitaires, 14/14 Chromium, 2/2 WebKit**, sans tests ignorés — premier banc multi-moteur vert et correction du viewport.
- **[Run 43690410066](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43690410066)** : 3 jobs success, **90/90 unitaires, 15/15 Chromium (dont refus HEVC portrait contrôlé), 2/2 WebKit**.
- **[Run 43690802104](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43690802104)** : 3 jobs success, **90/90 unitaires, 15/15 Chromium, 3/3 WebKit**, dont le vrai MP4 exporté avec pistes H.264 et AAC vérifiées par `ffprobe`. Le dernier test ajouté de comparaison des empreintes AAC est à revalider séparément sur son propre commit.
- Le WebKit fourni par Playwright **n'est pas Safari officiel** ; sur Linux, les codecs disponibles diffèrent de ceux d'iOS et macOS. Voir [Playwright — Browsers](https://playwright.dev/docs/browsers) et [W3C — HEVC WebCodecs Registration](https://www.w3.org/TR/webcodecs-hevc-codec-registration/). Aucun essai matériel iPhone n'a été effectué.

**Plafonds inchangés :** 12 secondes, 60 Mo de fichier, sortie côté long ≤640 px, 15 images/s, décodage source jusqu'au Full HD selon capacités. Aucun entraînement 3D, aucune restauration neuronale réelle ou test sur les 157 médias privés n'a été réalisé dans cette étape. La PR #3 reste en brouillon, aucune fusion ni déploiement sur `retoucheproai.com`.

### Prochaine étape vérifiable

Obtenir des mesures HEVC + rotation et AAC sur un environnement macOS Safari ou un iPhone physique, comparer le rendu pixel et la chronologie avant/après, et tester les cas 30/60 fps/VFR sans augmenter les plafonds avant certification mémoire/énergie et qualité.


## Cycle NOVA 0.15 — HEVC/MOV, translation et VFR 30/60 (15 novembre 2026)

**Modifications expérimentales (CI du nouveau commit à vérifier).** Les rotations orthogonales restent autorisées, mais une matrice `tkhd` dont les translations ne sont ni nulles ni conformes au cadrage normalisé est désormais rejetée : l'export ne doit pas recadrer silencieusement. Une matrice manquante/tronquée est refusée. Tests unitaires ajoutés.

Le chemin HEVC vérifie `VideoDecoder.isConfigSupported` avant l'ouverture HTML de la source pour fournir une explication claire quand le décodage WebCodecs est absent. **Aucun décodeur HEVC WASM n'est encore intégré**, même si des candidats libres existent. L'import d'un **vrai conteneur QuickTime MOV** contenant HEVC/AAC et une rotation de 90° est ajouté au banc. MOV n'est pas pour autant validé sur tous les iPhone.

Nouveau banc `tests/nova-iphone-cadence.test.mjs` : génération FFmpeg de fichiers réels VFR en 30 i/s (MP4) et 60 i/s (MOV), B-frames et audio AAC, avec contrôle externe des PTS par `ffprobe -show_packets`, comparaison image par image et mesure de l'erreur maximale. Les cadences décrivent les **sources**, l'export pilote reste à **15 i/s**.

**Alternatives libres à évaluer** : décodage local `libde265` via WebAssembly (LGPL, coût mémoire/CPU et obligations de redistribution à auditer), `wasmpeg` (FFmpeg/WASM LGPL selon build, conteneurs divers ; intégration et comportement iOS à éprouver), et `ffmpeg.wasm` (selon compilation, GPL si modules GPL activés). Aucun succès de décodage iPhone ni accélération WebGPU ne doit être annoncé sans benchmark réel, et aucun de ces projets ne constitue actuellement un repli intégré.

**Toujours interdits** : fusion de la PR #3, production, publication de médias privés. Aucune confirmation Safari iOS physique ; pas de restauration IA neuronale ni 4K/8K. Plafonds du pilote inchangés.


## Cycle NOVA 0.16 — garde-fous colorimétrie / aspect (travail expérimental)

Le démultiplexeur inspecte les boîtes `colr` (nclc/nclx, primaires, courbe de transfert et matrice) et `pasp` (sample aspect ratio) des pistes MP4/MOV reconnues. NOVA refuse explicitement les profils HDR/PQ/HLG, les primaires larges (BT.2020/P3), les colorimétries non prises en charge, les signaux full-range explicitement marqués et les pixels non carrés, car le chemin actuel Canvas 2D -> H.264 n'offre pas un round-trip fiable de ces métadonnées. La protection s'applique **même en mode de décodage temporel approximatif**.

Ce contrôle **n'est pas une restauration HDR ni un parseur complet des VUI du bitstream** : des fichiers sans boîtes `colr` peuvent néanmoins transporter des informations de couleur au niveau des séquences. Le nouveau contrôle interdit les conversions silencieuses connues, mais ne certifie pas le rendu fidèle des autres sources. Aucun nouveau codec HEVC n'est intégré. CI du commit à vérifier avant annonce de succès.



### Résultats vérifiés du cycle 0.16 (avant commit de documentation)

- **SHA du code et des nouveaux bancs** : `25f876035c55218aa2b6c26ba87236e97bc6cf69`.
- **GitHub Actions** : [exécution 43693448591](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43693448591), 3 jobs `success` : 92/92 unitaires, 20/20 Chromium+FFmpeg/FFprobe, 3/3 WebKit Linux. Total **115/115**, 0 échec et 0 ignoré.
- **Incident découvert** : sur un vrai conteneur MOV à 60 i/s VFR, la copie audio échouait avec « taille MP4 incohérente ». Cause identifiée : les MOV QuickTime peuvent utiliser une entrée `mp4a` **version 1**, avec 16 octets supplémentaires et une configuration `wave/esds` imbriquée. `experiences/nova-aac-copy.js` reconnaît cette variante connue, valide la structure `frma=mp4a` et continue de refuser les configurations ambiguës ou non prouvées.
- **Nouvelle preuve de sortie audiovisuelle** : source synthétique MOV H.264 à **60 i/s d'acquisition**, 47 images de présentation VFR et B-frames, convertie en un véritable MP4 H.264 **15 i/s** par NOVA sous Chromium Linux. Les **95 paquets AAC** de sortie ont les mêmes empreintes SHA-256 que la source. Sur deux événements artificiels (flashs 0,4/1,2 s et impulsions 0,39/1,19 s), le décalage additionnel et la dérive mesurés sont **0 ms** avec FFmpeg et FFprobe. Cela ne garantit pas une synchronisation parfaite sur des vidéos réelles ou d'autres cadences.
- **Deux fichiers de couleur/géométrie réels** : un MOV HEVC 10 bits BT.2020/PQ est correctement reconnu puis refusé pour éviter une conversion SDR incontrôlée ; un MOV H.264 `pasp` 4:3 est reconnu puis refusé pour éviter une déformation géométrique. Les rejets reposent sur les boîtes analysées et des contrôles indépendants FFprobe.
- **Inchangés** : aucun décodage HEVC WASM intégré ; aucun export 60 i/s, pas de rendu HDR/P3 validé, pas de test Safari sur iPhone physique ; limites pilote 12 s / 60 Mo / 640 px / 15 i/s. Aucune publication de médias privés, fusion ou production.
- **Critère qualité** : la validation verte ci-dessus concerne le SHA de code avant cette documentation. Le nouveau SHA documentaire requiert sa propre exécution CI pour être certifié.


## Cycle NOVA 0.17 — preuve HEVC WebAssembly locale (15 novembre 2026)

- Bibliothèque candidate : [hevc.js](https://github.com/lid-labs/hevc.js) / `@hevcjs/core@1.8.0` (MIT). Le binaire est téléchargé **uniquement par le runner CI** lors du test, pas à l'import d'un média utilisateur et jamais depuis un CDN en production. Aucun fichier privé ni poids de modèle utilisateur n'est transmis. `libde265` (LGPL) reste une autre piste à auditer avant redistribution.
- `nova-hevc-annexb.js` : conversion depuis les vraies tables HEVC `hvcC` vers le format Annex B attendu par le décodeur WebAssembly ; validation stricte des VPS/SPS/PPS, longueurs, tailles, offsets et budgets.
- `nova-hevc-lab.js` : lecteur HEVC expérimental acceptant un décodeur WASM explicitement fourni localement. Associe les trames décodées (ordre de présentation) aux PTS source uniquement si le nombre de trames concorde. Limite prototype **640×360, 90 images, SDR 8 bits et première image PTS=0** ; refuse les exceptions. Ne produit **pas encore** un MP4 restauré avec ce décodeur.
- Nouveau banc `tests/nova-hevc-wasm-browser.test.mjs` : génère un MOV HEVC à B-frames avec FFmpeg, extrait les vrais paquets dans Chromium, réalise le décodage WebAssembly de `@hevcjs/core` hébergé par le serveur de test local, compare le SHA-256 de l'ensemble des plans YUV avec les octets FFmpeg décodés indépendamment ; refuse les appels réseau externes. Toute différence d'image ou de nombre de trames fait échouer le test.
- **État** : code et banc soumis à CI, pas de preuve de réussite tant que le SHA exact n'a pas été audité. Ce banc ne prouve **pas** Safari iOS physique, vitesse réelle sur iPhone, restitution des couleurs HDR, export HEVC complet ou fonctionnement hors du laboratoire. Les assets WASM ne sont **pas intégrés à la distribution statique du site**.



### Validation indépendante du décodage HEVC WASM (NOVA 0.17, 15 novembre 2026)

**Dernier commit de code validé** `0bbaa5ab3f6fea5908f87e47946994915539efdf` ;
**GitHub Actions** [43694877493](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43694877493) :
**95 tests unitaires / 95, 21 tests Chromium / 21, 4 tests WebKit Linux / 4, soit 120/120, 0 échec, 0 ignoré, 3 jobs verts**.

**Fichiers et résultats réels** :
- `experiences/nova-hevc-annexb.js` extrait les images HEVC d'un vrai conteneur MOV en ordre de décodage et reconstitue les VPS/SPS/PPS nécessaires depuis `hvcC`.
- `experiences/nova-hevc-lab.js` décode ce bitstream avec la version npm épinglée `@hevcjs/core@1.8.0` ; association des images décodées aux PTS validée pour la séquence de test sous les garde-fous du prototype. Le code n'envoie pas les médias vers un service tiers.
- **18 images HEVC réelles décodées en YUV, 160×90**, avec **SHA-256 identique au décodage FFmpeg** sur *tous les octets des trois plans* en Chromium Linux **et** WebKit Linux. **17 727 octets** d'Annex B produits depuis le MOV. PTS : début 0 µs, dernière image 1 133 333 µs.
- Mesures du banc pour l'import, la conversion, le décodage, la copie et le calcul de SHA-256 : **170 ms sous Chromium** et **144 ms sous WebKit Linux** dans l'exécution documentée (autre exécution Chromium initiale : 147 ms). Ce ne sont pas des benchmarks iPhone, ni des mesures isolées de performance du décodeur, ni une garantie de débit en temps réel.
- Un premier essai a révélé que le glue Emscripten expose actuellement `HEVCDecoderModule` comme fonction globale plutôt que comme export ESM. Le banc charge explicitement le script depuis la même origine, sans CDN.
- Les contrôles HEVC de longueur hvcC/NAL, d'offset et de budget empêchent des traitements manifestement incohérents. Le test de corruption NAL a été rectifié pour altérer le champ de longueur (et non les octets du contenu), sans supprimer la vérification.

**Frontière importante** : le binaire WebAssembly est installé de façon éphémère **uniquement dans la CI** depuis npm et exposé par le serveur local de test ; il **n'est pas encore embarqué dans le site statique** et le décodeur expérimental **n'est pas branché à l'export utilisateur**. Les deux tests prouvent le **décodage local pixel-exact d'une source MOV synthétique particulière**, pas un moteur HEVC universel, ni l'iPhone 15 Pro Max physique, ni une prise en charge HDR, 4K/8K, audio/vidéo HEVC complet, thermique ou longues vidéos. Les limites de l'export NOVA restent 12 secondes / 60 Mo / 640 px / 15 i/s.

**Suite technique** : empaqueter les fichiers JavaScript/WASM MIT localement avec hash SHA-256 et contrôle de licence ; valider des sources avec B-frames/VFR/rotation/HDR variées et le budget mémoire, puis seulement tester un chemin réel de sortie audiovisuelle et le comportement sur Safari iOS physique. La PR reste brouillon ; aucun déploiement ou média privé publié.

**Note :** ce paragraphe documentaire crée un nouveau commit ; vérifier sa CI exacte séparément avant de certifier ce HEAD.


## NOVA 0.18 — préparation autonome du WASM hors-ligne et décodage flux (expérimental)

- `outils/nova-hevc-assets.mjs` copie dans `experiences/vendor/hevc` les fichiers indispensables de `@hevcjs/core@1.8.0` installé sur le runner, en suivant les imports ES relatifs du décodeur. Il crée un manifeste SHA-256 (longueur des fichiers, version et URL de licence MIT) et refuse les altérations lors de `verify`. La copie ne se fait qu'en CI ; **ce n'est pas encore une livraison des fichiers binaires dans le dépôt**. Une étape suivante doit intégrer les fichiers exacts à un paquet hors-ligne versionné, avec empreintes figées indépendantes de la récupération npm.
- `NOVA_HEVC_ANNEXB.flux` permet d'émettre les unités Annex B séquentiellement (VPS/SPS/PPS puis un paquet par sample en ordre de décodage), avec limite par paquet et globale ; évite d'assembler la totalité du flux HEVC.
- `NOVA_HEVC_LAB.decoderFlux` appelle `feed/drain/flush` du vrai décodeur WASM, livre des images provisoires une par une au callback, vérifie les plans YUV, les PTS et le nombre final d'images ; il ne conserve pas la collection d'images. **Interdiction de publier un export tant que le compte final n'est pas vérifié**.
- Le banc de preuve teste les assets servis depuis le répertoire local éphémère plutôt que directement `node_modules`. Ce chemin ne dépend d'aucun service de téléchargement côté navigateur, mais reste un outil de test tant que les fichiers ne sont pas effectivement distribués à l'application.
- **État de ces modifications : en attente du contrôle CI du SHA exact ; ne pas interpréter leur présence comme décodage flux vérifié ni mise en production.**


### 0.18 : binaire effectivement embarqué dans GitHub et test hors npm (expérimental)

Un job dédié GitHub Actions a récupéré `@hevcjs/core@1.8.0` avec `--ignore-scripts`, vérifié quatre SHA-256 figés et ajouté dans `chatgpt-studio-nova-v01` les fichiers `experiences/vendor/hevc/{decoder-entry.js,chunk-M6WO4WIK.js,wasm/hevc-decode.js,wasm/hevc-decode.wasm,integrity.json,LICENSE.txt}`. **Commit du fournisseur** : `92ccfabc6e9fe03079c40047756e1c7113e7e262` (auteur github-actions[bot]). Taille WASM : **344 949 octets** ; licence MIT intégrale. **Aucun fichier utilisateur privé n'est inclus**.

La CI standard ne réinstalle plus le paquet HEVC : Chromium et WebKit Linux testent désormais les fichiers binaires/JS **versionnés dans le dépôt**, et le job `hevc-sans-npm` les charge directement sur Node sans dépendance npm pour le décodeur ; un média HEVC synthétique est comparé au YUV décodé par FFmpeg. Cela ne teste pas Safari iPhone physique, n'active pas l'export HEVC pour les utilisateurs, et ne prouve pas l'absence de réseau lors du chargement initial du site.

**Attention :** cette étape CI et son nouveau banc doivent encore être validés sur le SHA exact qui les contient ; ne pas proclamer un test réussi sans journaux verts. La branche expérimentale peut héberger les binaires, sans publication sur `main` ni mise en ligne de `retoucheproai.com`.



### Bilan final NOVA 0.18 — HEVC WASM réellement embarqué et horodatage VFR (15 novembre 2026)

**Code certifié :** `0807d17402be0648d5a6cb048ae5edb321615434`. **CI :** [GitHub Actions 43698350705](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43698350705) ; **quatre jobs verts, 127/127 tests réussis, zéro échec, zéro ignoré** : 99 unitaires, 22 Chromium, 5 WebKit Linux, 1 décodeur HEVC sans installation npm.

**Binaire réellement enregistré** : [commit de vendor `92ccfabc`](https://github.com/m6ks7r8p78-debug/Retouche-video/commit/92ccfabc6e9fe03079c40047756e1c7113e7e262). Le dossier `experiences/vendor/hevc/` contient 4 fichiers de code et binaires, `integrity.json` et `LICENSE.txt` complet, tous dans la branche **expérimentale**. Le binaire `hevc-decode.wasm` pèse 344 949 octets, SHA-256 `450601a71473125e772f01437877eb97abcb3a55332553e205f352f500208a1d`. Les trois autres empreintes sont inscrites de manière indépendante dans `outils/nova-hevc-assets.mjs` ; un binaire différent ou un fichier altéré est refusé. Téléchargement npm uniquement pour recréer le paquet audité dans un job dédié, jamais pour charger le décodeur dans les tests navigateur.

**Décodage sans npm** : le job `hevc-sans-npm` utilise uniquement le décodeur embarqué dans Git et `locateFile` Emscripten pour lire le binaire par le système de fichiers Node. **18 images HEVC 160×90 bit-identiques** au décodage FFmpeg d'une vidéo synthétique. Aucun chargement CDN ni installation npm du décodeur, mais l'outil indépendant FFmpeg est installé sur le runner si nécessaire.

**Pipeline incrémental** : `nova-hevc-annexb.js` fournit `flux()` avec échantillons en ordre de décodage, garde-fous de budget par paquet (2 Mio) et global (16 Mio), maximum 90 échantillons au pilote. `nova-hevc-lab.js` fournit `decoderFlux()` qui utilise `feed/drain/flush` et remet chaque image au callback puis vérifie le total et les PTS avant de déclarer la séquence valide. Les images émises avant cette vérification sont **provisoires**.

**Preuves pixel/PTS indépendantes (Chromium ET WebKit Linux)** :
- MOV HEVC CFR 15 i/s / B-frames : **18 images** ; toutes les images YUV correspondent une par une à FFmpeg. Flux Annex B total **17 727 octets**, paquet maximal **2 413 octets**, plans YUV temporaires maximum **43 200 octets** (métrique de données métier, pas pic réel de RAM navigateur).
- MOV HEVC VFR à partir d'une acquisition **30 i/s** / B-frames avec edit list QuickTime : **27 images** ; chaque image décodée est identique à FFmpeg et chaque PTS de présentation diffère au plus de **2 µs** de FFprobe, dans les deux moteurs. Annex B total **20 295 octets**, paquet maximal **2 055 octets**.
- Le générateur VFR sans `elst` cohérente a d'abord été refusé par le garde-fou `Preroll/décalage PTS HEVC non couvert`. Ce refus est maintenu ; le cas valide a été corrigé au niveau du MOV synthétique en écrivant explicitement la liste de montage.

**Ce qui n'est toujours PAS certifié** : la consommation totale de mémoire (y compris le tas WebAssembly), la vitesse/thermique de l'iPhone, Safari iOS physique, l'export MP4 complet à partir de ce décodeur, les couleurs HDR/P3, la vidéo HEVC 4K/8K, la synchronisation AAC avec le pipeline HEVC, ni la prise en charge de tous les fichiers HEVC du monde réel. Le site public `main` n'a pas été modifié, la PR #3 reste en brouillon, aucune vidéo privée n'est utilisée.

**Note de traçabilité :** ce paragraphe crée un nouveau commit documentaire ; celui-ci doit recevoir sa propre CI verte avant d'être annoncé comme dernier SHA certifié.


## NOVA 0.19 — première intégration HEVC WASM à l'export H.264/AAC (expérimentale)

Le convertisseur `NOVA_HEVC_RENDER` lit les plans YCbCr 8 bits 4:2:0 du moteur WebAssembly versionné dans `experiences/vendor/hevc/`, construit une `VideoFrame` I420 annotée BT.709 SDR limité, puis rend les images selon la matrice de rotation/tkhd et les PTS MOV dans le Canvas 2D du pipeline export. Le traitement mosaïque, l'encodage H.264, l'audit AAC et la copie sans réencodage restent les composants NOVA existants. Le chargement est même origine, sans CDN.

**Protection avant ouverture :** cette voie n'est autorisée que lorsque le navigateur ne prend pas en charge le HEVC natif, que la source a une boîte `colr` identifiée exactement comme BT.709 (primaires 1, courbe 1, matrice 1, gamme non explicitement complète), que la durée et les PTS sont cohérents et que le pilote respecte 12 s / 640×360 / 90 échantillons. HDR/P3, colorimétrie absente ou non répertoriée, vidéo hors limites ou incohérence des frames : refus, jamais de conversion silencieuse. Le moteur reste versionné et chargé exclusivement depuis le même site expérimental.

Un nouveau test `tests/nova-hevc-export-browser.test.mjs` fabrique une véritable vidéo MOV HEVC VFR/B-frames BT.709 à deux flashs et une piste AAC avec deux impulsions audio, lance l'export de l'interface sous Chromium puis inspecte le vrai MP4 H.264/AAC produit, les empreintes SHA-256 des paquets AAC et les timings FFmpeg/FFprobe. **Le code et le banc sont soumis à CI : ne pas déduire leur réussite tant que le SHA exact n'est pas vert.** Aucun essai matériel iPhone Safari ni restauration de HDR/4K/8K n'a été effectué.


### Bilan mesuré NOVA 0.19 — MOV HEVC avec export audiovisuel réel (15 novembre 2026)

**Dernier commit de code vérifié :** `27a31ece0731c205f3c94e92568fa2b0d87d63f4`. **CI :** [GitHub Actions 43700729946](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43700729946) — quatre jobs success, **130/130 tests**, **0 échec, 0 ignoré** : 99 unitaires, 25 Chromium/FFmpeg/FFprobe, 5 WebKit Linux, 1 HEVC Node sans npm. Le présent bilan documentaire crée un SHA plus récent : contrôler sa CI exacte avant de le déclarer certifié.

**Nouveauté implémentée :** le moteur WebAssembly HEVC déjà versionné dans `experiences/vendor/hevc/` est branché sur le chemin `NOVA_EXPORT.exporter` sous Chromium lorsque la prise en charge native `VideoDecoder` manque. `NOVA_HEVC_RENDER` fabrique des `VideoFrame` I420 à partir des plans YUV, applique la rotation tkhd dans Canvas, échantillonne les PTS du vrai MOV pour la sortie CFR 15 i/s, puis réutilise la transformation NOVA et le muxer MP4 H.264/AAC. Aucune image n'est publiée avant le succès de `feed/drain/flush` et de la validation du fichier de sortie. Aucun CDN utilisé par le navigateur de test.

**Défaut corrigé grâce au nouveau banc :** avec les B-frames QuickTime, la durée vidéo montée est définie par `tkhd` en unités de `mvhd`, pas par `mdhd - editMediaTime` ; l'ancien calcul raccourcissait abusivement la durée. Le démultiplexeur fournit désormais `durationUs` après montage ; sur un vrai MOV HEVC VFR mesuré, **1 967 000 µs** contre **1 966 667 µs** par FFprobe (arrondi movie timescale, différence 333 µs).

**Test audiovisuel complet :** MOV HEVC BT.709/8 bits VFR (34 images source, B-frames) et AAC, deux flashs visuels et deux impulsions audio, converti en MP4 H.264 15 i/s avec copie des **92 paquets AAC sans modification SHA-256** ; audio à 0,39 et 1,19 s, vidéo à 0,4 et 1,2 s avant et après export : **0 ms de décalage ajouté et 0 ms de dérive mesurés sur ces deux événements artificiels**. Ce résultat n'est pas une mesure universelle de lip-sync.

**Autres tests d'intégration :** MOV HEVC 10 bits HDR BT.2020/PQ **refusé** sans export de remplacement ; MOV HEVC SDR BT.709 pivoté de 90° **exporté en H.264 90×160, 15 i/s**, sans audio lorsque cela est explicitement demandé. Ces résultats ont été obtenus avec de vrais fichiers MOV synthétiques.

**Fidélité du chemin YUV → Canvas (avant l'algorithme NOVA et avant l'encodage H.264)** : 32 positions RGB/vidéo comparées à la référence FFmpeg par FFmpeg sur un vrai `testsrc2` BT.709. Écart moyen absolu en niveaux de 8 bits : **Chromium 1,65 / 1,82**, **WebKit Linux 0,95 / 1,09** pour les sources constantes / VFR respectivement. Les deux pipelines WebAssembly sont capables de construire et afficher les trames I420 dans les navigateurs testés. Le test ne prouve ni fidélité perceptuelle de la restauration ni restitution totale de la couleur dans le MP4 réencodé.

**Limites colorimétriques explicites :** `nclc` dans le MOV indique primaires, transfert et matrice BT.709 mais **ne possède pas de bit de plage complète** ; NOVA suppose alors une plage vidéo limitée pour construire la `VideoFrame`. Quand `nclx` indique explicitement pleine plage, c'est refusé. Les VUI du bitstream HEVC ne sont pas encore inspectées pour détecter les conflits et le MP4 de sortie n'a pas subi d'audit complet de ses métadonnées `colr`. Les vidéos aux couleurs inconnues ou HDR/P3 restent refusées, mais la fidélité de **toutes** les sources BT.709 n'est donc pas établie.

**Limites persistantes :** traitement expérimental uniquement en branche `chatgpt-studio-nova-v01` ; plafonds pilote **12 s, 60 Mo, 640 px de sortie, 15 i/s**, avec **90 images HEVC source maximum et 640×360 pixels encodés**. Pas de Safari réel sur iPhone 15 Pro Max, pas de test mémoire/thermique iPhone, pas de 4K/8K HDR, pas de sortie native 30/60 i/s, pas de déploiement sur `main`, pas de média privé partagé.

**Prochaine priorité :** vérification explicite des VUI HEVC et de la plage de couleurs, audit des `colr` de la sortie H.264, étendre progressivement le décodage à des sources plus longues/60 i/s avec budget mémoire instrumenté ; seulement ensuite validation sur Safari iPhone physique.
