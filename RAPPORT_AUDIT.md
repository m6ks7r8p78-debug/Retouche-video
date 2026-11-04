# Rapport d’audit (v2.50 → v3.0)

Base : dépôt `Retouche-video`, version v2.50 (identique à l’archive Retouche-video-v2.50.zip), auditée dans cette session et la précédente.

| Fonction | État constaté |
|---|---|
| Import photo / vidéo, analyse automatique, profils Naturel / Équilibré / Détails | opérationnel, vérifié par tests automatiques |
| Real-ESRGAN general v3 FP16, WebGPU (2 versions de calcul) + repli WebGL2 | opérationnel, vérifié (GPU simulé) ; vitesse iPhone non vérifiée ici |
| Depth Anything V2 Small (ONNX Runtime Web 1.22.0) | opérationnel, vérifié avec le vrai modèle |
| RNNoise | présent ; encodage AAC non vérifiable ici (encodeur absent du Chrome de test), vérifié par l’usage sur iPhone (v2.37) |
| Tables de filtres (LUT) | opérationnel, empreinte vérifiée |
| Gestionnaire de modèles, reprise IndexedDB, installation atomique, SHA-256 | opérationnel, 24 scénarios testés |
| Export MP4 / PNG / JPEG, service worker | opérationnel, vérifié (ffprobe) |
| Serveur Cloudflare | **défectueux** : variable ORIGIN globale (mélange CORS possible entre requêtes) → corrigé en v5 ; limite de débit par instance seulement (indicative) ; redirections du /proxy vérifiées une à une (correct) ; SSRF : un Worker n’atteint pas le réseau privé, risque limité à l’internet public, did:web restreint |
| Fichier unique `index.html` (~2 900 lignes) | fonctionnel mais peu modulaire (voir limites) |

Fonctions à développer demandées par le cahier des charges et leur sort en v3.0 : voir RAPPORT_TESTS.md (tableau « réalisé / non réalisé »).
