# NOVA / iPhone — correction ciblée WebKit AAC ESDS (15 novembre 2026)

**Branche :** `chatgpt-nova-safari-aac-esds-webkit-v1` (expérimental).
**Base :** `chatgpt-nova-iphone-hd-aac-rescue-v1`, PR #59, dépend de #57/#52/#47.
**Production :** `main` et `retoucheproai.com` inchangés ; ZIP Cloudflare exclusivement manuel ; aucun média privé joint.

## Observations physiques et cause documentée

L'utilisateur a chargé volontairement une vidéo HEVC personnelle d'environ 1088×1920, 6,5 s sur le labo Cloudflare iPhone. Après correction d'autres refus précédents, le message actuel est :

> Export refusé : NOVA HD : copie AAC non validée (fréquence ou canaux ASC différents de la piste MP4) ; Audio natif NOVA : ASC natif AAC invalide

Ces sont **deux** contraintes différentes : le source AAC ne se copie pas sous contrat strict, puis le secours `AudioEncoder` n'arrive pas à valider `decoderConfig.description`. Cela ne signifie PAS que la vidéo est dépourvue de son.

**Recherche publique déterminante :** [WebKit Bugzilla #302253](https://bugs.webkit.org/show_bug.cgi?id=302253) décrit exactement une anomalie de `AudioEncoder` sur Safari : `decoderConfig.description` contient un **ES_Descriptor MPEG-4 complet**, octets commençant par `03 80 80 80 22`, et non les **deux octets d'AudioSpecificConfig** standard `11 88` (48 kHz mono). La vidéo muxée avec les octets ESDS entiers devient silencieuse. Correctif WebKit commité en amont le 22 octobre 2026 ; présence dans un iPhone particulier non présumée.

## Correctif effectif

`experiences/nova-aac-native.js` :
- Accepte explicitement les métadonnées de codec `mp4a.40.2` et `mp4a.40.02`.
- Reconnaît soit une ASC brute conforme WebCodecs, soit la structure WebKit `03 ES → 04 DecoderConfig → 05 DecoderSpecificInfo` complète, avec tailles 7 bits jusqu'à 4 octets, `06 SLConfig` contrôlé ; aussi variantes `esds` FullBox/atom strictes.
- Extrait **uniquement** l'ASC authentique, valide AOT=2 (AAC-LC), sampleRate, channels et stabilité des descriptions entre paquets. La vraie ASC seule est transmise à `mp4-muxer.js`.
- Refuse toute description corrompue, AAC non-LC, format ADTS, changement de fréquence ou canaux, ou codec natif manquant ; ne fabrique plus une ASC fictive si Safari ne transmet rien. **Aucune exportation sans son par défaut.**
- Le secours AAC reste un **réencodage avec perte**, annoncé explicitement à l'utilisateur ; la première option demeure la copie AAC originale sans réencodage lorsqu'elle est validée.
- Le MP4 final est relu après export pour vérifier qu'une piste AAC est réellement présente.

## Preuves reproductibles

`tests/nova-aac-native.test.mjs` couvre les **39 octets exacts** du bug WebKit #302253, versions mono et stéréo, extraction `11 88` / `11 90`, `Uint8Array`, `ArrayBuffer`, `DataView`, FullBox et atome ESDS, rejet des descriptions fausses et absence d'ASC.
`tests/nova-native-hd-browser.test.mjs` intègre un contrôle de `normalizeDescription` sous CSP et **réemploie des paquets AAC synthétiques réellement encodés** par FFmpeg, muxés avec l'ASC normalisée puis vérifiés par FFprobe sur un `.m4a` réel. Cela s'ajoute au parcours HD H264/AAC et aux vérifications couleur.

**Attention :** ces preuves sont Node + Chromium/Linux et des échantillons synthétiques. Le décodage natif HEVC/AAC et le réencodage natif AAC sur l'iPhone de l'utilisateur demeurent non certifiés jusqu'à une nouvelle tentative **sur son Safari physique** avec comparaison image et écoute de la piste.

## Coordination

Les laboratoires NOVA et Export Intelligence peuvent réutiliser le normaliseur WebKit comme composant de compatibilité **sous tests**, sans modifier `main` ni présumer que toutes les configurations AAC sont identiques. Éviter de reproduire la même erreur en transmettant directement `decoderConfig.description` du navigateur au muxeur sans normalisation. Ne publier aucun fichier privé. Une fusion ou livraison de production exigera validations iOS réelles et décision explicite.
