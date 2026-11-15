# NOVA — essai final audiovisuel MP4 entièrement local (laboratoire)

## Contexte réel

L'utilisateur a envoyé un rapport de son essai Safari iPhone sur une **vidéo locale réelle** dans NOVA #68 :

- Statut `local_source_aac_reencode_chunks_verified` ;
- `diagnostic_phase=completed`, `last_verified_stage=encoded_packet_validation` ;
- **306 paquets AAC-LC**, **51 476 octets** à 48 kHz et **1 canal (mono)** ;
- aucun MP4 final créé, aucune image traitée et aucune synchronisation image/son mesurée.

Le test positif signifie que **la voie WebAudio → WebCodecs AAC** fonctionne sur cette vidéo dans l'environnement déclaré par l'utilisateur. Il ne certifie pas l'assemblage du MP4. Le projet NOVA disposait **déjà** d'un moteur `NOVA_NATIVE_HD.exporter` qui produit un MP4 H264/AAC, vérifie les dimensions, le nombre d'images/PTS, la colorimétrie SDR et la présence de la piste AAC au moyen d'un analyseur de sortie. Il intègre la gestion des AAC natifs corrigés par WebKit #64 dans l'ancêtre PR #68. Ce pilote **réutilise directement le moteur existant**, sans en désactiver les contrôles ou créer un encodeur concurrent.

## Livraison indépendante

La PR suivante (basée sur #68) ajoute exclusivement :

- `experiences/nova-final-av-lab/{index.html,style.css,core.js,ui.js}` : interface mobile simple avec fichier sélectionné volontairement, un bouton de conversion HD, lecture manuelle du MP4 résultant avec piste audio, **deux confirmations distinctes** (images visibles et son audible), une troisième facultative (synchronisation plausible) et **téléchargement local permis seulement après les deux premières**.
- `tests/nova-final-av-lab.test.mjs` : cas malformés et limites, refus d'une piste non audio ou d'images manquantes, confidentialité et interdiction de déclarer la lecture humaine certifiée par le laboratoire.
- `tests/nova-final-av-browser.py` : **réel** essai de conversion audiovisuelle sur un MP4 H264/AAC **généré par FFmpeg** (160×120, 15 images, 1 seconde, audio synthétique 660 Hz MONO 48 kHz). Exécute `NOVA_NATIVE_HD.exporter` en Chromium Linux, prévisualise le résultat, vérifie le blocage du téléchargement avant les confirmations utilisateur, puis examine le MP4 téléchargé via FFprobe (**vidéo H264 15 images + piste AAC mono**) et **décode réellement l'AAC** en PCM pour démontrer que le résultat synthétique n'est pas silencieux. Teste aussi un échec de piste AAC sans téléchargement. L'audio de laboratoire est **artificiel**, sans vidéo utilisateur.
- `.github/workflows/nova-final-av-local.yml` : régression NOVA #59/#64/#65/#68, nouveaux tests, navigateur réel Linux et comparaison en HTTPS des **16 fichiers locaux du pilote** avec les mêmes fichiers GitHub. Les vidéos synthétiques générées et exportées sont détruites après test ; **seuls rapports JSON et captures d'écran sont mis en artefacts**.

## Protocole sur Safari iPhone

**Lien expérimental (ne pas annoncer comme validé avant la CI) :**

`https://raw.githack.com/m6ks7r8p78-debug/Retouche-video/chatgpt-nova-final-av-local-gate-20261115/experiences/nova-final-av-lab/index.html`

1. Ouvrir cette page en HTTPS dans Safari sur son iPhone.
2. Choisir **volontairement un MP4 ou MOV local** (max **16 Mio**, max **12 secondes**). La vidéo précédemment testée (6,5 secondes) est un bon candidat si sa taille respecte cette borne.
3. Toucher **« Créer le MP4 de test »**. NOVA vérifie codec, cadence, couleur, AAC et les protections mémoire, puis tente de produire un MP4 H264/AAC en **mémoire du navigateur uniquement**. Le fichier source n'est pas modifié.
4. **Si un résultat est créé**, toucher lecture dans la page. Contrôler réellement l'image et le son. Cocher les deux observations seulement si elles sont vraies. Vérifier la synchronisation si un événement observable le permet.
5. Le bouton **« Enregistrer ce MP4 testé sur l'iPhone »** n'apparaît qu'après ces confirmations ; il déclenche une demande de téléchargement locale facultative. La page ne prétend pas que Safari l'a réellement enregistrée avant que l'utilisateur le confirme.
6. Utiliser **« Copier le rapport technique »** pour transmettre **le JSON seul** à la conversation, si souhaité. Les médias et le MP4 ne sont jamais téléchargés vers un serveur par ce pilote.

## Clauses strictes de non-régression

- **Aucune transmission** de vidéo, audio, images ou rapport : CSP `connect-src 'none'`, `media-src blob:`, scripts/styles du même hôte, sans `fetch`, sans télémétrie ni stockage persistant.
- Le service expérimental tiers `raw.githack.com` voit les requêtes nécessaires au **chargement initial du code**, et peut parfois montrer une confirmation intermédiaire. Il n'est pas un hébergeur contrôlé par le projet et **n'est pas destiné à la production**. Ne jamais y envoyer de vidéo manuellement.
- **Protection mémoire** : taille d'entrée conservatrice 16 Mio ; moteur HD refuse plus de **2,2 mégapixels, 360 images, 12 secondes** et les colorimétries non démontrées, y compris HDR/P3 incompatible. Refuser le traitement est préférable à fabriquer une vidéo dégradée ou silencieuse.
- **Pas de fusion, pas de déploiement RetoucheProAI.com ou Cloudflare, aucune modification de `main` ni du registre**. PR expérimentale en brouillon.
- Un test avec FFmpeg et Chromium Linux **ne valide pas Safari iPhone physique**, HEVC 1088×1920, la fidélité perceptuelle ni la synchronisation de la vraie vidéo. Seule l'observation volontaire de l'utilisateur peut renseigner la lecture sur son appareil, et ce témoignage demeure distinct d'une certification indépendante.
- Pas d'exécution en arrière-plan, pas de traitement serveur et aucun modèle IA neuronal. La restauration est **classique et prudente**, pas une reconstruction 8K.

## Prochain jalon

Si le pilote produit un MP4 et que l'utilisateur confirme image+son : collecter uniquement les champs de preuve du rapport, puis déterminer si la synchronisation est jugée plausible et si une comparaison vidéo perceptuelle est nécessaire. Si un refus se produit : le statut `error_code` est **liste blanche** et ne divulgue ni nom de fichier, ni erreur de décodeur brute. Conserver l'original et améliorer uniquement l'étape concernée ; ne pas supprimer les garde-fous.
