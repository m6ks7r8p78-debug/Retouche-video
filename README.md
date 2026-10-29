# Retouche vidéo

Application web (installable sur iPhone depuis Safari) qui redonne de la qualité aux vieilles vidéos et photos :
amélioration automatique, agrandissement Full HD / 4K, son plus clair, retrait de filtres Snapchat / Instagram,
avant / après à partager. Tout est calculé sur le téléphone : les vidéos ne sont envoyées à aucun serveur.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | l'application entière (interface, traitement d'image en WebGL, export vidéo) |
| `sr.js`, `sr.bin` | « Qualité maximale » : réseau de restauration Real-ESRGAN general v3 exécuté en WebGL2 (poids en demi-précision, 4,9 Mo) |
| `filtres.png` | bibliothèque de filtres Snapchat / Instagram (tables de couleur 17³, aller et retour), apprise sur de vraies paires avec / sans filtre |
| `rnnoise.mjs` | nettoyage de la voix |
| `mp4-muxer.js` | écriture du fichier MP4 |
| `sw.js`, `manifest.webmanifest` | fonctionnement hors ligne et installation sur l'écran d'accueil |
| `serveur/` | petit serveur gratuit (Cloudflare Workers) qui récupère une vidéo à partir d'un lien de réseau social |

## Licences des composants

- Real-ESRGAN : BSD-3 (`LICENSE-Real-ESRGAN.txt`)
- mp4-muxer : MIT (`LICENSE-mp4-muxer.txt`)
- RNNoise (wasm) : BSD (`LICENSE-rnnoise-wasm.txt`)
