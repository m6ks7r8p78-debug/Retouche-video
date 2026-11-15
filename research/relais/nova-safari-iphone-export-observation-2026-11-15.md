# NOVA 0.24 — observation d'export synthétique Safari / iPhone (15 novembre 2026)

## Contexte et provenance

Dans la conversation de validation utilisateur, le test « Tester Safari sans vidéo personnelle » a été lancé dans le laboratoire Cloudflare séparé `retoucheproai-labo.pages.dev` sur un iPhone. L'utilisateur a **fourni volontairement dans la conversation** le MP4 résultant pour inspection technique. **Ni ce média ni ses octets ne sont publiés dans ce dépôt.** L'origine exacte de l'exécution n'est pas vérifiée indépendamment par un journal ou une attestation d'appareil; elle repose sur le contexte et les captures fournies par l'utilisateur.

## Analyse indépendante du fichier reçu (ffprobe, ffmpeg, FFT locale)

- Conteneur: MP4, 4 221 octets, durée annoncée de 1,000 s, deux pistes.
- Vidéo: H.264 AVC Baseline (avc1), 160×90, 15 i/s, 15 images, balayage progressif, YUV420p, signalisation BT.709, plage limitée.
- Image extraite: gris uniforme (RGB 126 sur la première image), conforme à une mire statique synthétique; **aucun détail restauré ni fidélité réelle évalués**.
- Son: AAC-LC mono 48 kHz, durée déclarée 1,000 s, signal PCM décodé non silencieux; niveau RMS global d'environ -20,38 dBFS, fréquence dominante mesurée ~660 Hz (correspond au bip de la mire attendue).
- Décodage intégral: `ffmpeg -v error -i [fichier reçu] -f null -` termine avec code 0, aucune erreur de décodage affichée.
- Cadence observée: horodatages vidéo de 0 à 0,9333 s avec pas 1/15 s; début vidéo à 0. Piste AAC avec échantillon d'amorçage connu (premier paquet environ -21,3 ms), sans preuve d'anomalie de synchronisation sur cette mire.

## Niveau de preuve et limites

**Preuve acquise :** un MP4 issu du parcours synthétique présenté comme exécuté sur iPhone a été reçu, ses octets sont lisibles indépendamment et contiennent effectivement image + signal audio AAC, avec les paramètres attendus.

**Non démontré :**
- Lecture native du MP4 par Photos/Fichiers sur l'iPhone, image effectivement affichée et son effectivement entendu par l'utilisateur (confirmation visuelle/auditive distincte attendue).
- Prise en charge sur iPhone d'une **vraie vidéo personnelle** en HEVC/MOV, d'un audio complexe, de vidéos longues ou 4K, de la fidélité perceptuelle, de traitements neuronaux, de la température, de la batterie.
- La simple présence d'AAC non silencieux ne prouve pas qu'une application iOS joue la piste correctement.

## Reproductibilité locale (hors dépôt)

```bash
ffprobe -v error -show_format -show_streams -of json [fichier_reçu]
ffmpeg -hide_banner -v error -i [fichier_reçu] -f null -
ffmpeg -hide_banner -i [fichier_reçu] -map 0:a:0 -af astats=metadata=0:reset=0 -f null -
```

## Confidentialité / suite

Aucun média, nom personnel, clé, token, copie de fichier, image de visage, géolocalisation ou empreinte de fichier n'est ajouté au GitHub public. Ce rapport ne constitue pas une autorisation de diffuser l'export. La PR #38 reste brouillon ; aucune fusion, aucun déploiement ou bascule du site principal.

**Prochaine action :** demander la confirmation de lecture image + son sur l'iPhone, puis essayer une vidéo réelle explicitement autorisée dans le labo séparé, avec contrôle de compatibilité et sans envoi à GitHub.
