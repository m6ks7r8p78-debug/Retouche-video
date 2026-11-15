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
