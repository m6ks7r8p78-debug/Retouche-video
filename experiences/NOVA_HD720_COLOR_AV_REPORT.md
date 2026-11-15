# NOVA HD 720p — fidélité couleur et audio, expérimentation v1

**Laboratoire isolé, sans déploiement ni fusion.** Branche `chatgpt-nova-hd720-color-av-v1-20261115` issue du HEAD `de16f6dfd158acac45baef80e945042b1b09b229` de [NOVA H.264 #53](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/53).

## Objectif du changement

Étendre les **preuves de fonctionnement** de NOVA depuis la source H.264/AAC 160 × 90 du laboratoire #53 vers une **source HD réelle de test** 1280 × 720 à 30 images/s, avec audio AAC et couleur SDR BT.709. La sortie du pilote demeure volontairement limitée à **640 × 360 / 15 images/s**, donc ceci n'est **pas** un export HD, 4K ou 8K.

## Correctif de colorimétrie H.264

L'export NOVA existant convertissait déjà le Canvas sRGB en trame `VideoFrame I420` BT.709 limitée sur le chemin HEVC WASM. Le chemin H.264 natif passait en revanche par `new VideoFrame(canvas)`, sans preuve équivalente de colorimétrie déclarée.

Cette PR réutilise `NOVA_COLOR709.videoFrame` pour le chemin H.264 natif **seulement si** le module nouvellement ajouté `NOVA_AVC_VUI.analyser` vérifie dans l'**avcC/SPS** une VUI **BT.709 SDR plage limitée 8 bits 4:2:0**, cohérente avec les métadonnées `colr` disponibles, et si le mode approximatif n'a pas été choisi. Une déclaration `nclx` de conteneur avec primaires/transfert « non spécifiés » peut être complétée **par une VUI explicite**, mais une déclaration contradictoire est refusée. Le muxer reçoit alors `colorMetadata: bt709-limited` et le `colr nclx` final est inspecté via `NOVA_DEMUX`. Si l'audit de sortie échoue, l'export n'est pas présenté comme réussi.

L'admission H.264 `NOVA_H264_PATH` s'appuie maintenant sur ce contrôle SPS/VUI. Un `nclc` sans plage déclarée **ne suffit pas à lui seul**, mais une VUI explicite et non contradictoire peut le valider. Les SPS incomplets, profils non couverts et colorimétries contradictoires restent refusés. Aucun contournement des protections audio, des PTS, du budget ou du codec.

## Banc réel, exclusivement synthétique

Le test `tests/nova-hd720-color-av-browser.test.mjs` génère localement avec FFmpeg un H.264/AAC 1280 × 720 @ 30 fps d'une durée de 2 s. Il passe par le **vrai laboratoire sous CSP dans Chromium** :

1. Import manuel, puis précontrôle local volontaire, sans export automatique.
2. Vérification des métadonnées sources et de la proposition d'export, sans fuite de nom ou média.
3. Clic distinct pour le véritable `NOVA_EXPORT.exporter`.
4. Téléchargement réel du MP4 et mesure `ffprobe` des pistes, cadence, dimensions et marquage couleur.
5. Comparaison de **tous les paquets AAC de sortie** aux paquets source par empreintes SHA-256, et comptage des images décodées via FFmpeg `framemd5`. La présence de plusieurs images distinctes écarte une sortie figée.
6. Vérification de l'absence de requêtes externes, uploads et exceptions JS.

Le test Node supplémentaire refuse les sources H.264 `nclc` avec plage inconnue, même si les autres champs déclarent BT.709.

## Frontières

- Les différences d'aspect de l'original, mouvements et détails perceptuels ne sont **pas encore** objectivement étalonnées par une vraie métrique image source vs sortie ; couleur `nclx` dans le fichier **≠** certitude de qualité perceptuelle.
- Le banc ne valide pas la lecture Safari iPhone physique, les sources HDR/P3, la 4K/8K, la cadence 30/60 fps en sortie ni les longs médias.
- La limite **12 secondes** vient du plan d'export actuel et n'a pas été relevée ici ; la prochaine étape exige du travail sur la mémoire, les segments, les PTS et les edit lists AAC.
- Tous les médias utilisés sont générés en CI et effacés à la fin ; aucun média privé, aucun poids IA, aucune image identifiable, aucun partage ni entraînement.
- Un workflow vert est une preuve limitée à son HEAD et à l'environnement CI : aucune fusion ni publication implicite.

## Relais

- NOVA #53/#3 : mutualiser le traitement couleur vérifié du chemin H.264 avec les garde-fous AAC/PTS existants.
- SmallMotion #44 : contrôle indépendant de l'export obtenu ; ne pas confondre FFprobe ou `framemd5` et synchronisation perceptuelle.
- AURA #31 : décrire honnêtement « source HD analysée, export pilote à résolution réduite », sans promesse de HD exporté.
- Coordinateur #34 : référence et CI uniquement après preuve du HEAD.

**Résultat CI vérifié au HEAD `660324263a6be3f881353a31070b3edabb7371bc` :** workflow GitHub Actions #43723769035 **SUCCESS** (2 jobs), **40/40 tests Node** et **3/3 tests Chromium**. La mire source H.264/AAC **1280 × 720 à 30 images/s** a été réellement exportée en MP4 **640 × 360 à 15 images/s** : **30 trames distinctes sur 30**, **95 paquets AAC conservés à l'identique** d'après les SHA-256, et `colr` BT.709 limité validé par FFprobe et le contrôle local du MP4. Ce chiffre prouve le banc Chromium, non une qualité perceptuelle ni un résultat iPhone physique. Aucun média privé publié ni déploiement.
