# NOVA — premier MP4 H.264 **720p de sortie réel**, expérimental

Branche : `chatgpt-nova-hd720-output-pilot-v1-20261115`, issue de la PR #74 au commit `0f4f5afc0099d7597f81243637d00459d213ef9a`. Aucun déploiement, aucune publication de média personnel, aucune modification de `main` ou du registre de coordination.

## Fonction réellement ajoutée

Un **choix avancé** dans l'interface permet d'essayer un MP4 de **1280×720 à 15 images/s**, quand toutes les conditions suivantes sont réunies :

- Vidéo source H.264 native, conteneur et SPS/VUI confirmant **SDR BT.709 limité**, sans contradiction géométrique ni temporelle.
- Source **au moins 1280×720** (format paysage ou portrait) et durée **≤3 s**. **Aucun agrandissement artificiel** : le profil refuse une source plus petite et une sortie qui ne correspondrait pas à la dimension annoncée.
- L'utilisateur active volontairement la **sortie HD720** et l'**écriture locale OPFS**. La source doit contenir une piste AAC dont la copie sans réencodage est vérifiable. Pas de fallback silencieux, pas de chemin HD720 en mémoire RAM, pas de conversion HEVC détournée.
- Budget préventif mémoire NOVA **≤160 Mio estimés**, compteur de sortie finale **≤24 Mio**, file OPFS **≤2 Mio**. Le convertisseur de couleur sRGB → I420 BT.709 limité peut traiter au plus **1280×720** uniquement sur ce profil ; l'ancien plafond **640×360** reste sur les autres profils.
- Paramètres de sortie vidéo WebCodecs `avc1.42E01F`, **15 images/s**, **4 Mbit/s**, `colorMetadata: bt709-limited`. Le muxer écrit dans OPFS via StreamTarget sans utiliser l'ancien ArrayBufferTarget final. La source AAC est copiée une fois.
- Le précontrôle H.264 valide l'accès réel à OPFS et la configuration VideoEncoder, puis écrit dans son rapport **le profil exact HD720 et les dimensions proposées**, sans laisser la limite 640 masquer le profil sélectionné.

**Ne pas interpréter les 1280×720 comme une restauration ou une super-résolution réussie** : la résolution de sortie est réelle, mais le moteur actuel ne reconstitue pas encore les détails perdus. De même, une piste AAC conservée bit à bit ne démontre pas à elle seule la synchronisation perceptuelle.

## Preuve sur MP4 synthétique

[**GitHub Actions #43736951148 — SUCCESS**](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43736951148), SHA exact `3f9a182e698cd33807570d87c92bd8f089052b33` :

- **97/97 tests Node** : plan et limites HD720/3s, refus de l'upscale, colorimétrie I420, plafonds mémoire séparés, précontrôle H.264/AAC/OPFS, pas de fuite de nom privé, et non-régression des modules antérieurs.
- **9/9 tests Chromium** sous CSP sur mires FFmpeg **entièrement synthétiques**.
- Source d'essai : **1280×720, 30 images/s, 2 s**, H.264 8 bits SDR BT.709 + AAC 48 kHz.
- Sortie **vraiment obtenue**, vérifiée via FFprobe : MP4 **1280×720, 15 images/s, 2 s**, **30 trames décodées et 30 checksums vidéo distincts**, champ `colr` BT.709 limité, audio AAC présent.
- **95 paquets AAC identiques par SHA-256** entre source et sortie. Aucun autre média dans les fixtures, aucun téléversement réseau détecté.
- Le banc force le constructeur `Mp4Muxer.ArrayBufferTarget` à lever une exception dans ce chemin : l'écriture HD720 validée est bien l'OPFS volontaire.
- Régression : source 720p→ sortie 640×360, AAC conservé ; MP4 OPFS 20, 24, 36 et **48 secondes** et modes mémoire 20/24 s continuent à passer. Le pilote HEVC conserve ses refus historiques.

**Important** : la limite 3 secondes est couverte par les contrats unitaires mais l'essai MP4 complet prouvé ici porte sur **2 secondes**. Les essais Chromium ne représentent **pas** un test Safari iPhone physique ni une mesure réelle de mémoire CPU/GPU.

## Protocole Safari iPhone — essai utilisateur physique requis

Sur **un domaine HTTPS de laboratoire distinct**, après publication manuelle et consentement explicite, ouvrir la page dans Safari iPhone (pas la production). Avec un fichier H.264 SDR BT.709/AAC de 2–3 secondes **dont l'utilisateur détient les droits** :

1. Importer volontairement la vidéo ; vérifier qu'aucun export n'est déclenché automatiquement.
2. Ouvrir les options avancées « Écriture progressive locale », cocher OPFS puis « Essayer la sortie 720p réel ».
3. Lancer « Vérifier cette vidéo sans exporter » : le rapport local doit annoncer **1280×720 / 15 images/s**, AAC copiable, profil `h264-hd720-opfs-3s`.
4. Lancer l'export, enregistrer le MP4 dans Fichiers, le lire avec son et contrôler visuellement l'orientation, la couleur, le mouvement, la netteté, les transitions et la synchronisation.
5. Sauvegarder **uniquement le diagnostic JSON local** si souhaité. Il donne le budget estimé, le tas JS quand disponible, la file OPFS et les octets ; il **n'enregistre pas** le nom, les pixels ni l'audio et n'est **jamais transmis automatiquement**.
6. Après l'enregistrement et si nécessaire, utiliser l'inventaire et le nettoyage **volontaire** des anciens temporaires OPFS. Attention : un crash peut laisser un fichier en stockage privé ; éviter toute publication ou partage involontaire.

**Ne déclarer « Safari iPhone vérifié » que lorsque le véritable appareil a exécuté toutes ces étapes avec observations concrètes.** Un déploiement de prévisualisation doit être effectué sur demande distincte, **jamais sur `main` ni sur retoucheproai.com** par le seul fait de cette PR.

## Priorités suivantes

Mesurer matériellement les performances et la mémoire lors du rendu HD720 puis explorer l'allongement progressif **3→6→12 s** en 720p *seulement si les budgets réels le permettent*. Conserver le profil H.264 48s en 640px et tous les contrats AAC/PTS/BT709. Après preuve sur Safari, envisager 720p à 30 images/s et une vraie reconstruction perceptuelle — jamais promettre 4K/8K ou absence de compression sans preuve.

**Statut : laboratoire isolé, preuve `unit-tested + synthetic-chromium-hd720-output`, aucune fusion ni déploiement.**
