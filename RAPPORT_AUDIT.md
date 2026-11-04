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

## Écart avec l’architecture « 12 systèmes » (cahier des charges du 4 novembre, 17 h 42)

| Système | État dans l’app livrée |
|---|---|
| 1. Media Intelligence | **en grande partie réalisé** : analyse, filtres, compression, détails, résolution 4K, nuit, vieilles vidéos (poussières, scintillement), couleurs, mouvement (stabilisation), Time Repair, export vérifié. Manque : masques par zone, rolling shutter, HDR en sortie, visages (essai retiré) |
| 2. Audio & Voice | **partiel** : réduction du bruit vocal, son à vitesse modifiée, inversion. Manque : séparation de sources, transcription, synthèse vocale, doublage |
| 3. Visual & Generative | **non réalisé** (modèles de plusieurs Go, GPU puissant) |
| 4. Character | **non réalisé** |
| 5. 3D & Environment | **non réalisé** (seule la profondeur pour l’effet de relief) |
| 6. Cinematic Production | **minime** : regrouper des vidéos, prolonger, avant / après |
| 7. Capture & Live | **non réalisé** (Safari limite fortement la capture avancée) |
| 8. Research & Knowledge | réalisé hors app : recherches documentées (MODELES.md, DECISIONS.md) |
| 9. Project & Workflow | **partiel** : historique des recettes, assistant en langage courant (mots-clés), sauvegarde. Manque : bibliothèque de projets avec médias, collaboration |
| 10. Model & Integration | **réalisé** : registre, SHA-256, reprise, atomique, versions, retour arrière |
| 11. System & Infrastructure | **partiel** : exécution WebGPU/WebGL2/WASM, stockage, sauvegarde chiffrée, diagnostic. Manque : reprise d’un export après fermeture, multi-appareils |
| 12. Governance & Quality | **partiel** : autorisations révocables, licences vérifiées, tests et rapports, aucune dépense possible |
