# NOVA — Diagnostic audio par étapes + correctif AAC ESDS WebKit

## Constat authentique depuis Safari iPhone

L'utilisateur a d'abord obtenu un **résultat positif AAC-LC pour 0,512 s de son synthétique** (27 chunks / 2 238 octets) dans NOVA #62. Puis il a testé **volontairement une vraie vidéo locale** avec NOVA #65 ; le rapport retourné est `local_audio_validation_failed`, sans provenance du sous-échec. Ce statut **ne montre ni vidéo muette ni incapacité d'encoder** : un message d'exception inconnu était rabattu sur la même valeur générique.

Pendant la vérification de la coordination, **NOVA PR #64** a été identifiée : elle avait déjà développé un correctif pour la description WebKit AAC qui contient un `ES_Descriptor` MPEG-4 au lieu de l'ASC brut. Le moteur de #65, basé sur #59 puis #62, **ne contenait pas ce correctif de #64**. L'erreur `ASC natif AAC invalide` était un problème connu dans une branche voisine, mais **on ne peut pas affirmer que c'était la cause du statut générique de cet utilisateur sans un second essai**.

## Changements réels (nouvelle branche autonome)

Branche expérimentale `chatgpt-nova-webkit-aac-stage-20261115`, créée à partir de **NOVA #65**, sans modifier les branches de #59, #62, #64, #65, `main`, le site public, les médias ou le registre commun.

- `experiences/nova-aac-native.js` : réutilise **exactement le correctif éprouvé de la PR #64** (MPEG-4 `ES_Descriptor` 03/04/05/06 et `AudioSpecificConfig`, vérification de type AAC-LC, fréquence/canaux, stabilité de la description et refus si l'encodeur n'émet aucun ASC fiable).
- `tests/nova-aac-native.test.mjs` : reprend les tests de #64, notamment l'échantillon officiel WebKit #302253, le cas 48 kHz stéréo, les formats `DataView` et les descriptions incohérentes. **Pas d'ASC inventé** pour muxer un son qui pourrait être muet.
- `experiences/nova-local-audio-check/core.js` : sur la même source locale et avec les mêmes plafonds de 16 Mio / 12,2 secondes :
  1. appelle `NOVA_AAC_NATIVE.decode` **une seule fois** ;
  2. valide la présence d'un tampon PCM local mais n'en envoie jamais les valeurs ni les noms de fichier au rapport ;
  3. appelle `NOVA_AAC_NATIVE.capability` pour la fréquence et le nombre de canaux effectivement décodés ;
  4. appelle `NOVA_AAC_NATIVE.planifier` avec son paramètre existant de décodeur injecté, en **réutilisant le PCM sans relire le fichier** ;
  5. vérifie les chunks AAC, la description ASC, les horodatages et la couverture avant d'autoriser le statut positif du *test de chunks*.
- Des champs de rapport constants `diagnostic_phase` et `last_verified_stage` indiquent précisément **jusqu'où le code a progressé**, sans inclure la cause brute qui pourrait contenir une donnée privée. Les refus incluent `source_audio_decode_unavailable`, `aac_encoder_unavailable`, `aac_description_unusable`, `aac_encoder_runtime_failed`, `aac_timing_not_verified`, `encoded_audio_not_verified`.
- `ui.js` : message français distinct par cause et étape, **aucune valeur audio, aucune trace d'erreur, aucun contenu vidéo**, aucun upload, pas d'export.
- `tests/nova-aac-stage-webkit.test.mjs` : tests de provenance par étape, confidentialité, annulation, absence de relire le fichier, défaut d'ASC, erreur d'encodeur et **vrai module NOVA avec un encodeur WebKit ESDS simulé** (test de contrat et non d'iPhone physique).
- `.github/workflows/nova-local-audio-webkit-stage.yml` : régression #59/#62/#65, tests #64 et nouveaux tests, sélection d'une vidéo **fictive FFmpeg** dans Chromium Linux, vérification des fichiers du site expérimental via HTTPS.

**URL pilote (après vérification de disponibilité par la CI) :**

`https://raw.githack.com/m6ks7r8p78-debug/Retouche-video/chatgpt-nova-webkit-aac-stage-20261115/experiences/nova-local-audio-check/index.html`

## Sécurité et confidentialité

- La vidéo est sélectionnée par l'utilisateur dans Safari ; le script utilise une URL `blob:` temporaire pour lire la durée, et `NOVA_AAC_NATIVE` uniquement **sur l'appareil**.
- Le code ne déclenche aucune requête réseau pour les médias ni pour le rapport (`connect-src 'none'`), n'utilise ni micro ni caméra, ne crée **aucun MP4**, et ne modifie pas la source.
- Le proxy public HTTPS `raw.githack.com` voit les requêtes initiales de chargement HTML/JS/CSS, mais le code ne lui transmet pas la vidéo ni le rapport. Sa disponibilité n'est pas garantie.
- Aucune donnée privée, échantillon PCM, paquet AAC ou nom de fichier n'est publiée dans GitHub ni copiée dans le JSON.
- **Un statut positif ne valide pas le multiplexage audio/vidéo, la synchronisation perceptuelle, les pistes MP4 Apple, HDR/HEVC, les vidéos 4K ou l'export X.** Les contrôles existants empêchant un export sans son validé demeurent actifs.
- L'exécution Chromium Linux et les tests WebKit ESDS simulés ne prouvent pas que le vrai Safari iPhone a réussi. Une nouvelle observation utilisateur permettra de localiser la phase défaillante.

## Coordination

La PR sera transmise à **NOVA #59**, **WebKit ESDS #64** et **diagnostic local #65** à titre d'information. Aucun merge ou déploiement vers le site public n'est effectué ; la coordination reste asynchrone par GitHub, seul le coordinateur édite `coordination/REGISTRE.json`.
