# NOVA — stockage MP4 progressif OPFS (pilote expérimental, sans déploiement)

Branche `chatgpt-nova-opfs-mp4-stream-v1-20261115`, créée depuis le HEAD `823bd5de6f4dd04d965f59f019585fe31e40fff8` de la [PR #60](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/60). **`main` et le site public sont intacts ; aucun média privé n'a été ajouté au dépôt.**

## Problème réel et solution ajoutée

Le parcours H.264 natif pouvait déjà exporter 20 et 24 s avec PTS continus et copie AAC, mais `Mp4Muxer.ArrayBufferTarget` / `fastStart: "in-memory"` construisait la sortie finale en mémoire avant d'en faire un `Blob`.

Le nouveau module **`experiences/nova-opfs-stream.js`** propose l'option **volontaire** `storageMode: "opfs"`, uniquement pour le H.264 SDR 8-bit BT.709/VUI validé **plus de 12 et jusqu'à 24 s**, lorsque la copie de la piste AAC peut être garantie. Aucun repli silencieux vers l'ancien mode. HEVC conserve son chemin indépendant.

Le pipeline vidéo et audio **reste inchangé au niveau des médias** : un seul décodage PTS, un seul encodeur, fenêtres de 6 s, une piste AAC complète copiée après la vidéo, **un seul MP4** et vérification finale de lisibilité et de couleur. **Seule la destination des octets de muxage change** :

- `Mp4Muxer.StreamTarget` écrit par blocs de 64 Kio en fournissant `onData(data, position)`; les octets sont copiés immédiatement, les écritures asynchrones en position sont sérialisées vers un `FileSystemWritableFileStream` dans l'OPFS de l'origine.
- La file de blocs en attente est limitée à **2 Mio** ; la taille de MP4 à **24 Mio** (conservateur). Vidage périodique côté vidéo et pendant la copie AAC ; erreurs disque/quota/annulation et dépassement entraînent un **refus**, pas un faux export.
- Le MP4 est **non-fragmenté avec `fastStart: false`** (boîte `moov` à la fin), pour écrire les paquets au fil de l'eau, puis fermeture de la sortie OPFS. Cela n'est **pas** optimisé pour les lectures web à démarrage immédiat ; aucun changement du profil par défaut, qui conserve `fastStart:"in-memory"`.
- Le pipeline obtient un **`File` depuis OPFS**, sans créer le grand `ArrayBuffer` final. Ce `File` sert directement à `URL.createObjectURL` et au lien d'enregistrement manuel.
- Un nom `export-<16-octets-aléatoires>.mp4`, sans nom de source ni données identifiantes, est créé dans un sous-dossier privé. En cas d'échec, le fichier partiel est détruit. Après succès, l'UI le conserve pour rendre le téléchargement possible, puis essaie de l'effacer au changement de source et à la fermeture de page.
- **Réserve importante de confidentialité :** une fermeture brutale ou un crash peut empêcher le nettoyage ; un MP4 exporté peut alors **persister dans le stockage OPFS de l'origine**. Ce prototype **n'est donc pas activé par défaut**, et aucune conservation/diffusion communautaire n'en découle.

Le multiplexeur `mp4-muxer.js` dispose désormais d'un **contrat AAC étroit** : `windowed24Seconds: "opfs"` est accepté pour une édition AAC ≤24 s **seulement si `fastStart === false`** ; l'ancien `true` nécessite toujours `fastStart: "in-memory"`, et les exports ordinaires restent à 12 s par défaut. La validation `elst`/`roll` reste obligatoire. `NOVA_AAC_COPY.copier` attend maintenant les callbacks asynchrones de contre-pression ; la copie AAC brute et les dates ne changent pas.

## Preuves sur fichiers réellement produits

[**GitHub Actions #43729763106 — SUCCESS**](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43729763106), commit `95ef65a7b85d2d1aed0220259ef70ea9e21f16f3`, deux jobs :

- **72/72 tests Node** ; tests de prise en charge des offsets hors ordre, copie du buffer pour éviter l'écrasement, limite mémoire de file, quota/faux écriture, annulation, API absente, nettoyage, ainsi que les tests hérités AAC, PTS, SPS/VUI, export.
- **4/4 tests Chromium** sous CSP et avec FFmpeg/FFprobe sur mires **strictement synthétiques**. Deux parcours normaux (20 et 24 s) et deux parcours **OPFS** (20 et 24 s), vérifiés par de vrais téléchargements.
- **20 s en OPFS** : 300 images à PTS continus, 4 fenêtres, 939 paquets AAC bit-identiques au source par SHA-256, vidéo/audio de 20 s.
- **24 s en OPFS** : 360 images à PTS continus, 4 fenêtres, 1 126 paquets AAC bit-identiques, vidéo/audio de 24 s.
- Pour les tests OPFS, `Mp4Muxer.ArrayBufferTarget` est volontairement remplacé par un constructeur qui lève une exception : le parcours ne peut réussir s'il recrée la sortie MP4 traditionnelle en mémoire. Le `File` OPFS a été téléchargé avec succès ; le temporaire est supprimé après nouvelle sélection.
- Aucun POST, upload ou accès réseau externe observé ; aucune source privée utilisée. La couleur `colr` BT.709 limitée et le nombre de pistes ont été contrôlés.

## Limites non résolues

L'écriture progressive en OPFS **n'élimine pas** les allocations des décodeurs/encodeurs matériels, Canvas, WebAssembly, WebCodecs, copies de pixels, index MP4 et buffers du navigateur. **Aucune mesure RSS/empreinte mémoire sur iPhone physique** n'a été obtenue ; il est donc impossible d'annoncer un gain chiffré en RAM, une absence de crash, ou un export universel multi-minute.

Le chemin expérimental reste limité à **H.264/AAC SDR BT.709 validé**, durée **>12–24 s**, source jusqu'à **1080p**, sortie **≤640 px et 15 images/s**, fichier source ≤60 Mio, sortie ≤24 Mio et budget mémoire conservateur. Pas de 4K/8K ni de longues vidéos. La **qualité perceptuelle** et la **synchronisation audible** ne sont pas certifiées par FFprobe ou SHA-256.

Le mode est isolé et opt-in : l'app conserve son export habituel par défaut. La disponibilité de `navigator.storage.getDirectory()` et `FileSystemFileHandle.createWritable()` doit être testée à l'exécution, particulièrement sous Safari iOS (WebKit a introduit son écriture OPFS en Safari 26, mais **aucun test physique** n'est acquis). `showSaveFilePicker()` n'est pas requis ; l'enregistrement reste un téléchargement utilisateur explicite.

## Suite technique prioritaire

Évaluer la consommation CPU/GPU/RAM **sur iPhone réel**, puis mesurer la capacité OPFS/quota et décider des stratégies progressives pour dépasser 24 s sans relever aveuglément les limites de décodeur, AAC, PTS, couleur ou mémoire. Avant intégration, revoir les modalités de nettoyage OPFS après fermeture brutale et les performances de fichiers `moov` en fin de MP4. Pour un usage de publication sur X, envisager une seconde phase de finalisation **fast-start** séparée et honnêtement testée.

**Règles** : aucune fusion, aucun déploiement, aucun usage/partage des médias privés, aucun entraînement, aucun envoi de rapport automatique. Un test Chromium synthétique ne certifie pas Safari iPhone physique.
