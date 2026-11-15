# NOVA — export 720p réel étendu à 6 secondes (H.264/AAC/OPFS)

**Branche expérimentale** : `chatgpt-nova-hd720-6s-av-v1-20261115`, basée sur le HEAD `f1623c48cbca01ddd9aecb335bd9aff776925f98` de la [PR #79](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/79). **Aucune fusion sur main, aucun changement du site public, aucun média privé.**

## Livrables effectifs

Le précédent essai [PR #79] produisait 1280×720/15fps sur une **mire synthétique de 2 secondes** avec un plafond contractuel de **3 secondes**. Cette branche porte exclusivement le profil HD expérimental à **6 secondes maximum** :

- Profil propre `h264-hd720-opfs-6s` : source **H.264** SDR 8 bits avec **SPS/VUI BT.709 limité prouvés**, géométrie au moins 1280×720 sans upscale, durée **1 µs à 6 s**, sortie 1280×720 ou portrait 720×1280, 15 images/s et **90 images maximum**.
- **AAC d'origine obligatoire et recopié intégralement**, horodatages vidéo issus du MP4 source, un encodeur et un multiplexeur de sortie. Pas de reconstruction du son ou de contournement des contrôles d'édition AAC.
- Deux options avancées explicitement choisies par l'utilisateur : **OPFS local** + **sortie HD720**. Aucune conversion automatique à l'import, aucun repli en mémoire sans consentement. Le muxage OPFS évite le `ArrayBufferTarget` final ; le fichier reste téléchargeable manuellement.
- Budget préventif conservateur de **160 Mio estimés**, limite d'octets encodés/MP4 **24 Mio**, file d'écriture OPFS bornée **2 Mio**, copie I420 BT.709 limitée uniquement pour ce profil ; profil ordinaire inchangé.
- Les rapports de précontrôle sérialisent désormais `maxDurationMs:6000` pour ce seul profil et **1280×720, 15fps, jusqu'à 90 frames**. Les limites des autres modes restent séparées (HEVC 12s, H.264 mémoire 24s, H.264 OPFS en sortie ≤640px jusqu'à 48s).

## Preuve réelle sur une mire synthétique

[GitHub Actions **#43748887217 — SUCCESS**](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43748887217), SHA vérifié `8831fac5db40b3765828e2ae879c7a0cc43b7d4a` :

- **98/98 tests unitaires et 10/10 tests Chromium** réussis sous CSP. Vérifie aussi le profil 720p de 2s, le profil normal 640×360, les exports 20/24s en mémoire et 20/24/36/48s en OPFS.
- Source H.264 SDR BT.709/AAC, **1280×720 à 30fps, 6s** → fichier MP4 de **1280×720 à 15fps, 6s**.
- FFprobe et FFmpeg : **90 images décodées, 90 images distinctes**, PTS commençant à zéro, strictement croissants et espacés régulièrement (~66,7ms), durée audio et vidéo ~6s.
- **283 paquets AAC source / 283 paquets en sortie, identité SHA-256 de chaque paquet**, sans coupe partielle ni réencodage. Métadonnées de sortie `colr` SDR BT.709 plage limitée vérifiées ; piste audio présente.
- Rapport technique JSON local : **estimation préventive 106,3 Mio**, **pic d'octets en attente OPFS 262 144** (256 Kio), pas de mesure de RAM totale de l'iPhone. Aucun téléversement observé dans le banc.
- Ce résultat **ne prouve pas** la fidélité visuelle perceptuelle, un film HDR/HEVC/4K, l'absence de perte de mouvement (source 30fps → sortie 15fps), un lip-sync audible ni une mémoire GPU mesurée.

## Paquet iPhone HTTPS manuel (pas de déploiement)

Le constructeur existant `outils/build-nova-iphone-preview.mjs` prend désormais l'option `--with-hd720-6s`, qui **ne modifie pas les tests/paquets classiques** mais ajoute, uniquement sur demande, la mire `experiences/nova-hd720-6s-synthetic.mp4` (FFmpeg local, aucune vidéo utilisateur) et un lien de téléchargement dans `index.html`.

La CI `.github/workflows/nova-hd720-6s-av.yml` doit, **après réussite des tests Node et Chromium**, générer un artefact GitHub `NOVA-HD720-6s-iPhone-HTTPS-PREVIEW-NON-DEPLOYE` (rétention 7 jours), inspecter la mire par FFprobe (1280×720, H.264, 30fps, 6s, AAC, BT.709) et vérifier **tous les SHA-256 du manifeste**. L'archive est un **livrable manuel** : aucune action Cloudflare/GitHub Pages ni retoucheproai.com n'est déclenchée.

### Essai Safari physique, après hébergement HTTPS de laboratoire séparé

1. Déployer **manuellement** l'archive de prévisualisation sous un domaine de **laboratoire distinct**, en conservant `_headers`, les chemins relatifs et la CSP. Ne pas remplacer le site public.
2. Ouvrir la page dans Safari sur **l'iPhone physique**. Toucher « Télécharger la mire H.264/AAC 720p de 6 secondes », puis enregistrer dans Fichiers.
3. Ouvrir NOVA, importer **la mire synthétique** (aucune vidéo personnelle nécessaire), cocher **écriture progressive OPFS** et **sortie HD720**.
4. Exécuter le précontrôle local : source 1280×720/6s, sortie proposée **1280×720/15fps/90 images**, AAC conservable, capacité OPFS vérifiée. Si refus, enregistrer uniquement le diagnostic JSON local après le contrôle ; n'ignorer aucun refus.
5. Déclencher volontairement l'export. Télécharger le MP4 dans Fichiers, puis ouvrir le fichier pour inspecter la durée, la présence du son, l'orientation, la couleur et la fluidité.
6. Si disponible, sauvegarder le rapport JSON local anonyme (pas de nom de fichier, pixels/audio ou médias), et relever **manuellement** le comportement sur iPhone (succès, refus, éventuel crash, température ressentie, batterie, qualité du son). Ne jamais qualifier ces observations de mesure instrumentée de la RAM ou du GPU.
7. Le stockage OPFS peut conserver des fichiers après crash : utiliser le bouton volontaire de nettoyage des anciens temporaires après enregistrement, avec prudence si plusieurs onglets.

**Statut de preuve** : `unit-tested + synthetic-chromium-hd720-6s-av`. **Safari physique non testé ; production non publiée.**
