# NOVA — récupération OPFS et diagnostic local d'export

Branche de développement isolée `chatgpt-nova-opfs-recovery-diagnostics-v1-20261115`, fille de [PR #71](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/71). **Aucune fusion ni publication**, aucun fichier privé, aucun entraînement ou transfert externe.

## Objectif

Les exports H.264/AAC par OPFS de NOVA fonctionnent sur les mires synthétiques de 20, 24, 36 et 48 secondes (PR #71), mais un plantage ou une fermeture brutale du navigateur peut laisser un MP4 temporaire dans l'OPFS de l'origine. Les mesures du pipeline disponibles jusqu'ici ne correspondent pas à une mesure réelle de RAM iPhone/GPU.

Cette étape ajoute une **gestion volontaire des anciens temporaires** et un **rapport JSON local** pour les prochains essais matériels ; elle **ne modifie ni les codecs, les résolutions, les durées maximales ni la piste AAC**.

## Inventaire et nettoyage privé

- `experiences/nova-opfs-recovery.js` et `nova-opfs-recovery-ui.js` ajoutent un inventaire sur demande puis un bouton distinct de suppression **sur demande**, visibles même sans vidéo importée.
- Le module ouvre seulement le dossier `nova-opfs-local-v1` déjà existant, sans créer de fichier ni parcourir le reste du stockage utilisateur. Il ne retient comme candidat que `export-[32 chiffres hexadécimaux].mp4` et les fichiers d'au plus **24 Mio**.
- Les candidats doivent dater d'au moins **une heure**. Les fichiers plus récents, les noms non reconnus, les entrées non lisibles, et les fichiers marqués actifs dans cet onglet sont ignorés. Le nettoyage revalide l'âge juste avant chaque suppression.
- L'inventaire fournit uniquement des compteurs et volumes, **jamais les noms, octets vidéo/audio ou métadonnées personnelles**. Maximum de **128 entrées** : refus plutôt que suppression partielle silencieuse si le dossier est anormalement grand.
- `nova-opfs-stream.js` marque les fichiers exportés encore actifs/téléchargeables de cet onglet, puis enlève cette marque quand `release()` termine le nettoyage.

**Limite :** aucune garantie transactionnelle entre différents onglets. Une source suspendue pendant plus d'une heure dans un autre onglet pourrait encore être ciblée. Ne pas ouvrir deux exports NOVA concurrents pendant un nettoyage ; l'interface signale ce risque. Un utilisateur doit cliquer sur « Effacer » : aucun nettoyage destructif automatique à l'ouverture.

## Rapport technique local pour Safari iPhone

- `experiences/nova-local-export-report.js` sérialise une liste blanche stricte de compteurs après un export **réussi ou refusé**. Après un clic d'export, un lien distinct « Enregistrer le diagnostic JSON anonyme » apparaît.
- Compteurs possibles : MP4 produit, dimensions, FPS, durée, images, fenêtres, octets H.264/AAC, paquets AAC audités, durée de pipeline, file encodeur, file OPFS maximale, nombre d'écritures, estimation de quota/usage de stockage **de toute l'origine**, pic de tas JS **si fourni par le navigateur**.
- Les valeurs optionnelles absentes restent `null`. Le rapport ne contient ni nom du fichier source, nom temporaire, extrait vidéo, image, données audio, paquets binaires, IP, trace d'erreur libre, ni localisation.
- Champs de vérité obligatoires : `totalDeviceMemoryMeasured:false`, `physicalIphoneVerified:false`, `qualityPerceptuallyCertified:false`, `automaticUpload:false`.
- Un quota OPFS estimé n'est **pas** une mesure de RAM ni une garantie d'espace disponible ; un pic de tas JS ne comprend pas GPU, WASM, surface Canvas ni RSS système.
- Le lien et ses octets JSON sont détruits au changement de source ou au lancement d'un autre export ; aucun rapport n'est envoyé automatiquement.

## Tests et état

- Tests unitaires `tests/nova-opfs-recovery.test.mjs` : filtrage des noms, âge, tailles, onglet actif, protection des fichiers récents/inconnus, erreurs disque, annulation, inventaire non destructif, absence de noms privés.
- Tests `tests/nova-local-export-report.test.mjs` : succès/refus, absence de données privées même si un objet source malveillant est transmis, schéma et compteurs.
- Banc navigateur `tests/nova-opfs-stream-browser.test.mjs` : vrai MP4 de 20, 24, 36 et 48 secondes, statut de rapport JSON local, refus de la mémoire pour 36/48, copie AAC conservée, création d'un orphelin synthétique et suppression de celui-ci sans toucher au MP4 OPFS encore téléchargeable.
- Régression `tests/nova-h264-windowed-long-browser.test.mjs` : exports H.264/AAC classiques 20/24 secondes conservés.

**État :** 85/85 tests Node réussis au commit `c87f671a508c12fc28a5ca020e1e6d308e9f0072` ; première CI navigateur a identifié une remise à zéro incomplète du panneau du rapport quand un export refusé est suivi d'un export accepté. Correctif appliqué dans `nova-export-ui.js`, CI du HEAD **à confirmer**.

## Prochaines limites

Les exports sont toujours plafonnés par le pilote : H.264 mémoire 24 secondes, H.264 OPFS 48 secondes, HEVC 12 secondes, **sortie jusqu'à 640 pixels / 15 images/s**. Aucun test matériel Safari iPhone ni mesure de pic mémoire CPU/GPU réelle. Ce rapport rend les futurs essais sur appareil réel plus exploitables sans partager automatiquement de médias privés.

La branche est expérimentale : ne pas confondre validation Chromium synthétique, vérification technique d'un MP4, fidélité perceptuelle et disponibilité publique.
