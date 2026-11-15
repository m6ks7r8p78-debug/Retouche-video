# NOVA HD 0.33 — formats natifs Safari et conflit de matrice BT.601 → BT.709

Date : 2026-11-15. Branche expérimentale `chatgpt-nova-safari-frame-format-fallback-v1`, base `chatgpt-nova-iphone-opaque-frame-sdr-v1` (PR #70). Aucune fusion et aucun déploiement automatique.

## Constat réel

Après installation d'une archive précédente sur le laboratoire Cloudflare isolé et import de la même courte vidéo HEVC iPhone (1088 × 1920, ~6,5 secondes), l'utilisateur voit **exactement** :

`Export refusé : NOVA HD couleur : matrice MOV/SPS et trame décodée contradictoires (source smpte170m, décodeur bt709)`.

Il n'est pas possible d'établir depuis ce message seul si Safari livre un format `VideoFrame` opaque (`format=null`), RGB (RGBA/RGBX), ou YUV non copiable. Les propriétés de couleur précises sont un écart réel; **aucune correction colorimétrique n'est présumée** et aucun média personnel n'est publié.

## Cause identifiée dans le code

Dans le recours `NOVA_HD_COLOR.imagePourRendu` de la version précédente, `renduNatifOpaque` pouvait être appelé seulement pour une trame `format=null` ou pour une exception `copyTo().name = NotSupportedError` sur I420/NV12. D'autres images natives SDR affichables par Safari échouaient immédiatement sur le contrôle `["I420","NV12"].includes(frame.format)`, l'absence de `codedRect`, l'absence de `copyTo`, ou un constructeur YUV non pris en charge. Le message initial de contradiction pouvait donc encore remonter.

## Correctif 0.33

- Lorsque la source signale une **matrice BT.601 5/6**, que les primaires/transfert/plage de la `VideoFrame` sont cohérents et **strictement SDR**, tenter la correction YUV source vérifiable sur I420/NV12 en priorité.
- Si ce décodage matériel produit des surfaces uniquement affichables et non des plans YUV exploitables (format nul, I422/I444/RGBx 8 bits, méthodes absentes, rectangle absent, `NotSupportedError` / `TypeError` de copie ou construction YUV), se replier sur le rendu natif déclaré du navigateur, converti par Canvas en sRGB puis BT.709.
- Les formats 10/12 bits, les données HDR/PQ/HLG/P3, une plage explicitement incohérente ou des primaires incompatibles **ne sont pas acceptés** dans cette voie de secours.
- Quand la voie native est utilisée, `sourceMismatch=true`, `colorFidelity="uncertified-against-source"` et l'interface affiche un avertissement **ATTENTION COULEURS**, qui impose une comparaison visuelle avec l'original. Ne jamais appeler ce parcours « correction source certifiée ».
- Dans le panneau de contrôle, le texte `Moteur NOVA HD 0.33` apparaît même sans média et précise que l'export ne s'affiche qu'après import; `asset-manifest.json` contient également la version 0.33. Cela permet d'identifier un redéploiement réellement pris en compte.

## Preuves et limites

[GitHub Actions #43732732121](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43732732121) : **76/76 tests unitaires réussis** et **1/1 test navigateur Chromium sous CSP réussi**. Les tests unitaires couvrent RGBX, I420 non copiable, construction YUV refusée, matrices source 601/decoded 709, HDR/10 bits interdits. Le test navigateur fabrique des MP4 H264/AAC synthétiques, émule une VideoFrame non YUV et vérifie par FFprobe l'export MP4 H264 avec 15 images et AAC audio. Fichier ZIP statique manuel 48 éléments : `NOVA_HD_Safari_Frame_033_Cloudflare.zip` sans média privé, uniquement deux mires synthétiques.

**Non prouvé :** décodage et export sur ce fichier HEVC réel dans Safari iPhone, identité des couleurs avec l'original, synchronisation audio/performance réelle. Le rendu natif n'est pas une restitution BT.601 certifiée ; le H264 reste une recompression avec perte. Si le même échec apparaît avec `NOVA HD 0.33` visible, il faudra lire uniquement les champs techniques du `VideoFrame` pour déterminer la condition qui n'est pas satisfaite.

Aucun changement de `main`, de `retoucheproai.com` ni du site Cloudflare existant. Déploiement seulement manuel sur le laboratoire; pas d'image ou de son utilisateur publié.
