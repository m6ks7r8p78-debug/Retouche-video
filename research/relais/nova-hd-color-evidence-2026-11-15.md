# NOVA HD — reprise du traitement des métadonnées couleur incomplètes

**15 novembre 2026 — laboratoire expérimental**, branche `chatgpt-nova-iphone-hd-color-evidence-v1`, base `chatgpt-nova-iphone-native-fullhd-v1` (PR #47).

## Problème réel observé

Sur Safari iPhone, après déploiement manuel d'un ZIP HD du laboratoire Cloudflare séparé, un utilisateur a importé une courte vidéo réelle reconnue en 1088×1920 et obtenu **« Export refusé : NOVA HD : BT.709 SDR 8 bits limité non confirmé »**. Ce message ne prouve pas que la vidéo est HDR ; il signifie que le contrôle de `nova-native-hd.js` ne trouvait pas tous les champs stricts de la boîte ISO-BMFF `colr`. Aucune vidéo, capture privée ou nom de fichier utilisateur n'est publié dans GitHub.

## Correction réelle

- Nouveau `experiences/nova-hd-color.js` (`NOVA_HD_COLOR`) : audit progressif de trois sources de preuve :
  1. Métadonnées conteneur MOV/MP4 `colr` (nclc/nclx), pouvant être absentes ou notées « unspecified »;
  2. Paramètres HEVC SPS/VUI issus de `NOVA_HEVC_ANNEXB.configuration` et `NOVA_HEVC_VUI.lireSPS`, sans exiger un colr déjà complet;
  3. `VideoFrame.colorSpace` des images **effectivement décodées** par WebCodecs : primaires, transfert, matrice et plage.
- Si le conteneur ne précise pas les couleurs mais que le SPS ou les images décodées confirment le SDR BT.709, le moteur peut poursuivre **sans prétendre que les métadonnées manquantes étaient une preuve HDR**.
- Si le transfert SDR sRGB (13/IEC 61966-2-1) est identifié, le Canvas sRGB et la conversion explicite vers I420 BT.709 continuent de s'appliquer.
- Si le flux est du SDR en plage complète, le décodeur doit réellement confirmer la plage avant conversion Canvas sRGB → BT.709 plage vidéo limitée ; le résultat indique la conversion, **qui n'est pas un transfert sans perte**.
- Les informations explicites HDR/PQ/HLG, BT.2020/P3, la plage contradictoire entre conteneur et SPS, ou un décodeur signalant des couleurs incompatibles restent protégées. Le système **ne se contente pas de supprimer la vérification**.
- `nova-native-hd-ui.js` propose en cas d'échec une exportation **volontaire** du rapport technique `NOVA_diagnostic_couleur_local.json`, sans médias, noms, identifiants ou audio.

## Validation et limites

Les tests unitaires simulent colr 709, colr absent, « unspecified », nclc sans full-range, sRGB, plage complète, SPS/VUI HEVC confirmant 709 et conflits HDR/P3, ainsi que des objets VideoFrame de couleurs contrôlées. Les tests navigateur Chromium utilisent de vraies trames synthétiques H264/AAC, désactivent volontairement la boîte colr **côté analyseur** et valident que le décodage/encodage peut réussir en se fondant sur `VideoFrame.colorSpace` sans envoyer les médias.

Ce n'est pas une validation Safari iPhone : **le même fichier HEVC réel de l'utilisateur doit être réessayé physiquement**. Un fichier vraiment HDR 10 bits/P3 ne doit pas être faussement « corrigé » en SDR ; une voie HDR/tonemapping fidèle et volontaire nécessite un pipeline dédié validé.

Le résultat reste une amélioration classique des ombres (pas de restauration neuronale), avec transcodification H264 potentiellement avec pertes, à comparer à l'original intact. L'application principale et `main` sont inchangés ; nouveau ZIP Cloudflare isolé à déployer **manuellement uniquement**.
