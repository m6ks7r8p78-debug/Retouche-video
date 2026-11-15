# NOVA 0.29 — matrice couleur SDR BT.601 / 709, preuve iPhone à compléter

**Branche expérimentale :** `chatgpt-nova-iphone-hd-sdr-matrices-v1`
**Base :** `chatgpt-nova-iphone-hd-color-evidence-v1` (PR #52). Aucun merge ni déploiement automatique.

## Observation réelle

Sur le laboratoire Cloudflare isolé, une courte vidéo HEVC HD (1088 × 1920) importée volontairement sur iPhone a produit le message : **« NOVA HD couleur : matrice couleur incompatible BT.709 »**. La capture ne donne pas la **valeur numérique exacte** du champ matrix. Le message atteste seulement du rejet d'une matrice différente du seul code 1 accepté auparavant ; il ne prouve ni HDR ni corruption.

## Correction concrète

- `experiences/nova-hd-color.js` reconnaît maintenant les matrices SDR H.273 **5 = BT.601 PAL**, **6 = SMPTE 170M / BT.601 NTSC**, **9 = BT.2020 NCL** sous condition stricte de primaires non larges et de transfert SDR. Transferts SDR BT.709/SMPTE170M/sRGB (1/6/13) et primaires BT709/BT.601 (1/5/6) prises en charge. La présence explicite de primaires P3/BT.2020, de transfert PQ/HLG, ou d'une matrice contradictoire entre MOV et SPS continue à produire un refus du traitement SDR.
- Chaque trame `VideoFrame` est auditée : matrice, primaires, transfert et plage. Les matrices BT.601 PAL/NTSC sont équivalentes entre elles ; un changement inexpliqué vers BT709 **n'est pas ignoré**.
- **Résultat expérimental important :** un fichier synthétique BT.601 6 a été réellement décodé dans Chromium avec `VideoFrame.colorSpace.matrix = "bt709"`, malgré un marquage source `smpte170m`. En présence de YUV 8 bits brut (`I420` ou `NV12`), `imagePourRendu` crée alors une trame temporaire annotée avec la matrice attestée par MOV/SPS, convertie par le rendu Canvas couleur-géré vers sRGB, puis réencodée en Y'CbCr BT709 limité. Si les plans ne sont pas accessibles, aucun rendu aux couleurs incertaines n'est prétendu.
- Le chemin HD conserve les contrôles existants sur les PTS, toutes les images, la résolution, la copie AAC, le conteneur de sortie et l'original intact.
- Le rapport couleur JSON volontaire (sans nom, média ou emplacement) inclut les champs numériques du `colr` et du SPS lorsque disponibles, pour diagnostiquer les cas réellement HDR/P3 et les matrices non couvertes.

## Évidence et limites

Tests Node couvrent les matrices 5/6/9, la conversion YUV 8 bits, les exceptions, les conflits et la protection HDR. Le navigateur CI essaie un vrai MP4 H264+AAC synthétique BT.601 puis en vérifie la sortie H264+AAC BT709 et les images avec FFprobe/FFmpeg.

**Ne pas extrapoler :** la validation d'export avec un clip H264 synthétique Chromium ne certifie pas le même chemin sur une vidéo HEVC personnelle, Safari iOS, HDR, 4K, longue durée, ni la fidélité visuelle du modèle classique NOVA. La correction de matrice vidéo est un processus couleur-géré et le réencodage H264 reste avec perte. Le premier essai HEVC iPhone physique doit encore être exécuté et le MP4 final comparé à l'original.

**Confidentialité et sécurité :** aucun média privé, image extraite, nom, identifiant ou audio dans cette branche/PR/ZIP. Aucun changement de `main`, `retoucheproai.com` ou du site Cloudflare existant ; déploiement du ZIP manuel seulement après contrôle CI.
