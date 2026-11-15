# Relais NOVA → coordination — moteur natif HD, essai iPhone restant

**Date :** 2026-11-15.
**Branche expérimentale :** `chatgpt-nova-iphone-native-fullhd-v1`.
**PR brouillon :** [#47](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/47), base PR #42 (dépendance #38 puis #35), aucune fusion.

## Diagnostic initial réel

Le précontrôle de la vidéo HEVC choisie volontairement sur Safari iPhone a signalé une entrée de l'ordre de **1088 × 1920, 195 images, 6,5 secondes**. Ce rejet provenait des bornes du **pilote logiciel WASM** (640×360/90 images), et ne démontrait pas une incompatibilité intrinsèque de l'iPhone. Aucun média utilisateur, octet privé, nom de fichier ou empreinte n'est joint à la PR.

## Développement effectif

- Nouveau `nova-native-hd.js` : décodeur WebCodecs natif HEVC/H264 choisi après `isConfigSupported`, PTS et orientation issus de `NOVA_DEMUX`, restauration **classique** locale par `NOVA_ZONES`, conversion SDR BT.709 correcte, sortie H.264 sans réduction automatique de résolution ni de nombre d'images, copie AAC originale planifiée et vérifiée. Bornes prudentes 2,2 Mpix/360 images/12 secondes/60 Mio.
- `nova-export-ui.js` : un seul bouton principal route les grandes vidéos vers la voie HD native, pas vers le pilote WASM réduit.
- `nova-real-preflight.js` : cherche désormais la compatibilité réelle native HEVC/H264 + AAC avant de déclarer la source incompatible; statut `ready-for-native-hd-attempt` non assimilable à réussite d'export.
- `nova-native-hd-ui.js` : panneau d'essai volontaire + récupération **octet-pour-octet de l'original**, toujours disponible lorsque la conversion n'est pas confirmée.
- Aucun import ou upload automatique des vidéos personnelles, aucune IA neuronale annoncée à tort, aucun partage externe.

## Tests et qualité de preuve

[Workflow #43719552902](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43719552902) : **28/28 tests unitaires** réussis et **1/1 test Chromium sous CSP** réussi, y compris vrai export local H.264/AAC synthétique avec comparaison binaire de l'original et FFprobe final. Tests unitaires du plan 1088×1920/195 images/30 i/s. Artefact statique GitHub `NOVA-iPhone-HD-native-static` expirable 2026-11-22, archive manuelle `NOVA_iPhone_HD_natif_experimental.zip`. La copie utilisateur distribuable `NOVA_HD_iPhone_Cloudflare.zip` a été vérifiée (46 entrées, index racine, _headers, scripts native, ZIP sans erreurs). Aucun média personnel dans les ZIP.

**Non démontré :** export complet natif HEVC de ce clip personnel sur Safari iPhone physique, qualité perceptuelle, chaleur/RAM réelle, performances longues, HDR, 4K, synchronisation complexe. Le nouveau codec peut refuser dans ces cas. La conversion H.264 reste **avec perte**, malgré dimensions/cadence conservées. L'original intact demeure toujours accessible. La correction NOVA est classique et limitée aux ombres ; pas de reconstruction IA neuronale.

## Handoff

- Direction IA : utiliser un routage selon capacités matérielles + fidélité, plutôt que lever arbitrairement les plafonds WASM.
- Export / qualité : auditer conservation de l'AAC, tous les PTS, dimensions/rotation, métadonnées BT.709 ; intégrer les tests iPhone réels avant certification et avant publication.
- Interface : conserver un seul parcours recommandé, options avancées facultatives.
- Protection `main`, production et autres laboratoires : aucune fusion ni déploiement automatique. Médias privés publiés : **aucun**.

**Prochaine action :** l'utilisateur peut choisir de déployer le nouveau ZIP sur le **laboratoire isolé** Cloudflare, puis tester volontairement sa même vidéo physique sur Safari; collecter uniquement le diagnostic et les observations autorisées afin de corriger toute incompatibilité réelle.
