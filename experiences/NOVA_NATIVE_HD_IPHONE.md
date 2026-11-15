# NOVA natif HD — pilote de traitement 1088 × 1920 / 30 i/s — laboratoire iPhone

**Statut : expérimental. Aucune fusion ou publication automatique.**
**Principe :** ne pas confondre une ancienne borne du décodeur WebAssembly (640 × 360 / 90 images) avec une incapacité du terminal à traiter une courte vidéo HD.

## Besoin constaté

Sur un essai physique Safari iPhone, l'ancien précontrôle NOVA 0.25 a reconnu une vidéo réelle HEVC d'environ 6,5 s, 1088 × 1920, 195 images et moins de 5 Mo, puis l'a refusée à cause des bornes du décodeur WASM. Ce refus était correct pour **ce pilote réduit**, mais pas une preuve que la vidéo ne pouvait pas être traitée dans un autre pipeline. **Aucun média privé n'est ajouté à GitHub ou Cloudflare.**

## Nouveau chemin exécutable

`experiences/nova-native-hd.js` :
1. Relit localement le MP4/MOV via `NOVA_DEMUX.analyser` et exige présentation fidèle, PTS sans doublons, chrominance BT.709 SDR 8 bits, limites HD bornées (**2,2 mégapixels, 360 images, 12 s, 60 Mio de source**). Ces bornes conservatrices protègent le test ; pas de prétention de compatibilité universelle.
2. Vérifie `VideoDecoder.isConfigSupported` en HEVC/H264 et `VideoEncoder.isConfigSupported` pour H.264, préférant le matériel lorsque disponible. **Pas de supposition d'accélération ni de soutien codec sans réponse du navigateur.**
3. Décode par échantillons locaux dans l'ordre DTS, avec horodatages PTS du conteneur, et tampons bornés; respecte l'orientation du film.
4. Utilise `NOVA_ZONES.restituer` comme correction **classique prudente des ombres par zones**. Ce n'est ni une IA générative ni une reconstruction des pixels absents. Convertit le rendu Canvas sRGB vers Y'CbCr I420 BT.709 limité avant encodage afin d'éviter une fausse étiquette couleur.
5. Encode au même format géométrique et à partir de **chaque image de la source** : pas de saut, duplication ou réduction automatique de cadence. Copie les paquets AAC d'origine selon `NOVA_AAC_COPY.planifier/c opier` (fonction réellement utilisée : `copier`) ; le son doit être conservable, faute de quoi l'export HD échoue.
6. Contrôle le nombre d'images, dimensions, durée et métadonnées colorimétriques du MP4 final; garde toujours l'original intact à disposition dans l'interface.

`experiences/nova-export-ui.js` : le bouton existant « Exporter un MP4 restauré » route automatiquement les sources HEVC/H264 hors du pilote 640 × 360 vers la nouvelle voie native HD plutôt que de forcer la réduction.
`experiences/nova-native-hd-ui.js` : un panneau avancé facultatif offre un test HD distinct et un téléchargement **octet-pour-octet de l'original**, explicitement non présenté comme restauré.

`experiences/nova-real-preflight.js` : avant de rejeter une source trop haute pour le décodeur WASM, teste le pipeline natif et la conservation AAC. Si tous ces précontrôles passent, répond `ready-for-native-hd-attempt` et fournit le plan de sortie à la résolution/cadence d'origine, **mais ne garantit pas que l'export réussira en mémoire ou sous iOS**.

## Preuves et risques

- Tests unitaires avec profils factices synthétiques 1088 × 1920, 195 images, 30 i/s; protections de profils et de codecs.
- Test navigateur Chromium local : fichier synthétique H.264 + AAC, export MP4 dans le vrai pipeline, source préservée, audio AAC copié, contrôle final indépendant par FFprobe. **Ce test n'est pas un test de décodage HEVC native Safari.**
- À vérifier par utilisateur : décodage HEVC Safari physique, orienté portrait, 195 images sans décalage/duplication, couleur réelle, son, mémoire iPhone, rendu perceptuel, temps de traitement. Les vidéos HDR/Main10, VFR difficiles, 4K, formats audio complexes, séquences longues restent hors certification.
- Pas d'extension automatique vers 8K ou 4K et aucune promesse de restauration neuronale. Le résultat H.264 transcodé peut être plus volumineux que l'original; une transcodification est avec perte même si la résolution est inchangée. L'original n'est jamais remplacé.

## Gouvernance

Branche de laboratoire dérivée de la PR #42 ; elle n'écrase pas la PR #38, la coordination ou `main`. ZIP Cloudflare Pages **uniquement manuel**, sans média privé et sans redéploiement de `retoucheproai-labo.pages.dev` tant que l'utilisateur ne l'effectue pas. Aucun entraînement IA ou partage de bibliothèque privée.

**Étape suivante :** essai réel par l'utilisateur du mode HD natif sur le laboratoire iPhone séparé, puis audit comparatif visuel/sonore. Corriger les blocages matériels observés avant toute intégration au produit final.
