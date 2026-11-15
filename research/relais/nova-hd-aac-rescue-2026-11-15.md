# NOVA HD — compatibilité et secours AAC sur iPhone (15 novembre 2026)

**Laboratoire :** NOVA / compatibilité audio / export iPhone.
**Branche expérimentale :** `chatgpt-nova-iphone-hd-aac-rescue-v1`.
**Base :** `chatgpt-nova-iphone-hd-sdr-matrices-v1` (PR #57), en aval de #52/#47/#42/#38.
**État :** code expérimental; **aucun déploiement public ni fusion**.

## Échec utilisateur observé sur Safari physique

Après correction des limites de résolution, des couleurs SDR et du conflit de matrice, la capture iPhone montre une vidéo locale 1088×1920 / 6,5 s, puis : **« Export refusé : Copie AAC prudente : AAC-LC ou paramètres ASC non confirmés »**.

Ce message provient précisément de `ascFromEsds`, anciennement une recherche heuristique du tag 05 avec ASC de 2–6 octets, fréquences indexées. Il **ne permet pas de conclure** que la vidéo n'a pas de son, ni de savoir si le vrai codec est HE-AAC, AAC-LC explicite ou autre. La vidéo privée et ses données brutes ne sont pas publiées.

## Changement 1 — conserver l'original AAC quand c'est possible

`experiences/nova-aac-copy.js` lit désormais les descripteurs MPEG-4 `ES_Descriptor(03) → DecoderConfig(04) → DecoderSpecificInfo(05)` et la longueur variable (jusqu'à 4 octets). Reprise d'AudioSpecificConfig pour vérifier l'objet audio, la fréquence indexée **ou explicite 24 bits** et les canaux de la piste, tout en limitant strictement taille et structure. Les configurations LC correspondent à une copie sans réencodage, toujours privilégiée. Les profils HE/SBR ne sont **pas** renommés AAC-LC pour les copier sans preuve.

## Changement 2 — recours natif AAC sur Safari récent

`experiences/nova-aac-native.js` crée un parcours **opt-in par l'appui sur exporter** : si et seulement si la copie AAC échoue, et que le navigateur peut décoder l'audio du MP4 local, teste `AudioEncoder.isConfigSupported({codec:"mp4a.40.2"})`, encode localement des blocs de PCM en AAC-LC, vérifie les paquets, la chronologie et la couverture du son, puis les passe au même muxeur MP4 local. Cette ré-encodage n'est PAS bit-identique ; l'UI affiche la différence et demande de vérifier le son et la synchronisation. Sans support natif ou en cas de durée incohérente, export refusé **plutôt que muet**.

**Limites strictes :** fichier local <=16 Mio pour le fallback, durée <=12,2 s, mono/stéréo, AAC-LC du navigateur, mémoire/paquets bornés, aucune capture micro, envoi serveur, stockage persistant ou partage. La validation `AudioContext.decodeAudioData` avec **une vraie source HEVC/HE-AAC Apple** doit être effectuée sur l'iPhone physique — réussite non présumée. L'encodage AAC WebCodecs est supporté sur Safari 26+ mais pas sur Chrome/Linux; les tests CI ont un encodeur simulé pour la branche fallback.

## Tests

- Test des `esds` imbriqués 03/04/05, AAC-LC fréquence explicite 48000 Hz, rejet de HE-AAC AOT5 pour la **copie directe**, longueur invalide.
- Test mock du recours natif : PCM mono/stéréo borné, configuration AAC, paquets encodés, muxer, non-silence, annulation et absence d'encodeur.
- Test vrai Chromium sur MP4 H264/AAC synthétique, couleurs BT709/BT601, export final FFprobe, aucune requête externe ni média privé. **Chromium/Linux ne prouve pas le réencodage AAC matériel Apple.**
- Paquet Cloudflare Pages statique manuel si CI réussi, sans publication automatique.

## Actions futures

Installer l'archive sur laboratoire Cloudflare uniquement, puis réessayer **la même vidéo réelle**. Vérifier MP4 final image + son et horodatages sur iPhone. Si Safari refuse le parcours natif (décodage source ou encodeur indisponible), conserver l'original et examiner les caractéristiques audio anonymisées avant de développer un décodeur/encodeur WebAssembly plus large. Ne jamais cocher « sans son » automatiquement.

**Aucun changement de `main`, du site public, ni média privé dans le dépôt GitHub.**
