# Relais NOVA → coordination : précontrôle H.264 par WebCodecs natif

**Date :** 2026-11-15  
**Branche :** `chatgpt-nova-h264-preflight-relay-20261115-v1`  
**Base de travail :** `chatgpt-nova-iphone-native-fullhd-v1` (PR #47), SHA 4e81e7415d0c479890077b85889dce4bc6cd1a3d  
**Statut :** développement expérimental et PR brouillon, sans fusion ni déploiement.

## Problème vérifié par lecture du code
Le moteur `NOVA_NATIVE_HD` de la PR #47 accepte en principe HEVC et H.264 via `VideoDecoder`, mais `NOVA_REAL_PREFLIGHT.inspect` renvoyait systématiquement `unsupported-video-codec` pour H.264 avant d'évaluer les capacités natives. De plus, l'absence de WebAssembly bloquait le précontrôle même lorsque le moteur natif ne l'utilise pas.

## Correction de continuité
- Reconnaît H.264 dans le précontrôle et vérifie `NOVA_NATIVE_HD.analyse`, `configDecoder`, `configEncoder` et la copie AAC avant toute conclusion favorable.
- Sépare les limites de l'ancien décodeur HEVC WebAssembly des limites du chemin HD natif.
- Ne requiert WebAssembly que pour le repli HEVC historique.
- Signale `native-hd-unavailable` si la voie native H.264 n'est pas validée, et `audio-not-preservable` si AAC ne peut pas être copié. Aucune sortie faussement « restaurée ».
- Conserve le rapport JSON à liste blanche, sans nom de média, pixels ou données privées.
- Ajoute des tests H.264 natif avec absence de WebAssembly, refus du décodeur, refus AAC et contrôle du repli HEVC.

## Preuves / validation
Suite ciblée CI `.github/workflows/nova-h264-preflight-relay.yml` sur la seule branche expérimentale.
**Résultats CI vérifiés sur le HEAD `8566e48dbdd2b165802027ff7afbaf4acc893f35` : 21/21 tests Node réussis, 0 échec, 0 ignoré**, y compris H.264 sans WebAssembly, blocages codec/AAC et sérialisation privée. [GitHub Actions #43720461540](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43720461540) : SUCCESS. Les vérifications de syntaxe JS et du périmètre expérimental passent également. Tests automatisés synthétiques uniquement : le H.264 natif physique sur iPhone, le HEVC réel, la fidélité du son et la lecture finale restent non certifiés.

## Limites et intégration
Le précontrôle ne modifie aucun média et n'ouvre pas de nouveau format de décodage. Le traitement HD reste limité dans #47 à 60 Mio, 12 s, 360 images, 2,2 Mpx et BT.709 SDR : une source hors de ces bornes conserve l'original mais n'est pas encore transformable par cette voie. Ce travail ne prétend pas atteindre l'objectif universel. Ne pas annoncer comme « compatible tout fichier » avant routeurs supplémentaires, validation audio/vidéo et essais physiques.

**Relais :** proposer au laboratoire NOVA PR #47 de vérifier ce correctif, au laboratoire AURA d'utiliser un statut d'indisponibilité explicite, et au Directeur IA de distinguer moteur indisponible, source incompatible et original non retouché. Aucun fichier de production ni registre central n'est modifié. Aucun média privé publié.
