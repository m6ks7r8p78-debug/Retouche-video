# Relais NOVA — vidéo HEVC iPhone : trame native opaque et matrice couleur divergente

**Date :** 15 novembre 2026
**Branche expérimentale :** `chatgpt-nova-iphone-opaque-frame-sdr-v1`
**Base :** `chatgpt-nova-safari-aac-esds-webkit-v1` (PR #64), elle-même en aval des PR #59/#57/#52/#47.
**Statut :** non fusionné, déploiement Cloudflare manuel uniquement, aucun média privé publié.

## Retour du test physique iPhone

La vidéo réelle choisie volontairement par l'utilisateur (1088 × 1920, environ 6,5 s) est passée par les correctifs HD, couleur et audio, puis s'est arrêtée sur ce message :

> NOVA HD couleur : matrice MOV/SPS et trame décodée contradictoires (source smpte170m, décodeur bt709)

Ce refus ne prouve pas que le décodeur Safari produit de mauvaises couleurs. Il révèle un désaccord **entre les métadonnées source et les propriétés de VideoFrame**. L'ancien fallback n'autorisait une conversion qu'en recopi­ant les plans YUV bruts (`I420`/`NV12`), qui peuvent ne pas être accessibles pour les trames HEVC accélérées matériellement sur iPhone.

## Correction ajoutée

`experiences/nova-hd-color.js` :
- Nouveau recours `renduNatifOpaque` ciblant des sources avec **matrice SDR BT.601 connue (5 ou 6)** et des images décodées dont `VideoFrame.colorSpace` décrit **un rendu SDR complet** avec matrice BT.709, primaires et transfert connus et plage cohérente.
- Quand `VideoFrame.format === null`, la trame native est dessinée vers un Canvas sRGB dans son espace déclaré. Il n'y a **aucune requalification artificielle des pixels en BT.601**.
- Lorsque le décodeur expose I420/NV12, la correction YUV antérieure, qui conserve la matrice source vérifiée, reste prioritaire. Si la copie YUV échoue spécifiquement avec `NotSupportedError`, le même recours de rendu natif SDR est possible.
- Un profil HDR/P3/BT.2020 explicitement annoncé, une incohérence de primaires, de plage, ou d'espace de transfert reste refusé. Aucune autorisation généralisée d'ignorer les contradictions.
- Le cas observé dans le banc de test comprend une source indiquant **matrix=6, mais primaries non renseignées**, et une trame native **primaries=bt709, transfer=bt709, matrix=bt709, fullRange=false**. NOVA peut utiliser l'information de décodage native en **déclarant la fidélité colorimétrique source non certifiée**.

`experiences/nova-native-hd.js` :
- Compte le nombre de trames passées par ce chemin au lieu de certifier faussement leur couleur.
- Signale `colorFidelity:"native-display-only-not-source-certified"` et `colorWarning` dans le résultat de l'export.
- Les protections précédentes de vidéo H.264 HD (PTS, nombre de trames, dimensions, budget), de copie AAC ou encodage AAC natif et de relecture MP4 final sont conservées.

`nova-export-ui.js` et `nova-native-hd-ui.js` :
- Le résultat affiche clairement : **ATTENTION COULEURS :** la source dit BT.601, Safari dit BT.709 ; comparer le rendu du MP4 à l'original. Le traitement n'est pas présenté comme une correction colorimétrique source certifiée.
- L'original n'est jamais remplacé ni modifié.

## Validation

[Workflow synthétique GitHub #43731285960](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43731285960) : **72 tests unitaires réussis et 1 test navigateur Chromium sous CSP réussi**. Le test navigateur utilise deux fichiers synthétiques H.264/AAC et simule une trame opaque `format=null` avec source BT.601 (matrix 6) et décodeur annonçant BT.709 ; il réussit à produire un MP4 H.264 avec 15 trames, résolution 160×120, une piste AAC et des métadonnées BT.709 de sortie. L'ancienne voie avec accès YUV brut reste testée avec comparaison PSNR sur les mires.

**N'est PAS encore démontré :** que la vidéo HEVC personnelle passe le chemin opaque sur Safari physique, que l'image du MP4 final correspond à la colorimétrie originale, que l'AAC reste audible et synchronisé sur ce fichier, ou que les performances/mémoires se généralisent aux vidéos longues ou 4K.

## Protection et suite

- Aucune vidéo personnelle, aucun fichier original, aucune donnée d'appareil ni image identifiable dans ce dépôt/ZIP.
- ZIP Cloudflare Pages généré pour **installation manuelle dans le laboratoire isolé** ; ne pas fusionner dans `main`, ne pas toucher au domaine `retoucheproai.com`.
- Étape suivante : même vidéo HEVC sur Safari iPhone, vérification du MP4 produit, lecture audio, comparaison visuelle avec l'original, puis revue de promotion du laboratoire.
