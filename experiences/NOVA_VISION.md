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
