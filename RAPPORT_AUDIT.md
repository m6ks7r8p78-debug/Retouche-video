# Rapport d’audit

## Audit du 4 novembre 2026 (v3.1 → v3.2)

Base examinée : dépôt `m6ks7r8p78-debug/Retouche-video`, branche `main`, commit `d563af9` (**v3.1**, alors que le prompt
de reprise annonçait v3.0). Version publiée sur GitHub Pages : identique octet par octet au dépôt (`index.html`, `sw.js`, `studio.js`).
Autres branches présentes : `studio-ia` (= main), `qualite-maximale`, `simplifications`, `webgpu`, `v2-dev`, `wip-*` (anciennes).

| Vérification | Résultat |
|---|---|
| Version dans le code (`VER`) | v3.1 ; NOTES / ARCHITECTURE / RAPPORT_FINAL disaient encore v3.0 (corrigé) |
| Points de restauration annoncés (tags `v2.49-sauvegarde`, `v2.50`) | **absents** de GitHub ; créés en branches `sauvegarde-*` (l'envoi de tags est refusé par l'environnement) |
| Serveur Cloudflare | **v5 en ligne** (`/etat`), contrairement aux documents ; origine étrangère → 403, adresse interne → refusée, CORS par requête |
| `sr.bin` | identique bit à bit aux poids officiels Real-ESRGAN v0.2.5.0 (x4v3 + wdn-x4v3) convertis en FP16 |
| Modèle de relief | empreinte SHA-256 conforme au fichier téléchargé à l'adresse figée |
| `rnnoise.mjs`, `filtres.png` | taille et SHA-256 conformes au registre |
| `ort/` (ONNX Runtime Web 1.22.0), `mp4-muxer.js` (5.1.3) | identiques aux paquets npm officiels (non couverts par le registre d'empreintes) |
| Requêtes réseau à l'ouverture | Google Fonts sans autorisation → **corrigé** (polices locales) |
| Code tiers de secours | mp4-muxer depuis jsDelivr sans contrôle → **corrigé** (SRI sha384) |
| Service worker | effaçait les modèles téléchargés et les caches /radar/ à chaque mise à jour → **corrigé**, testé |
| Historique (⚙️ Paramètres) | injection de code possible via une sauvegarde piégée → **corrigé**, testé |
| Diagnostic (version Claude) | envoyé sans autorisation → **corrigé** (autorisation `diagnostic`) |
| Chiffrement AES-256-GCM | conforme : sel 16 o et nonce 12 o aléatoires à chaque sauvegarde, PBKDF2-SHA256 250 000 tours |
| AUTORISATIONS.md | absent → créé, conforme au code |

Fonctions réellement opérationnelles, partielles et absentes : tableau des « 12 systèmes » ci-dessous (toujours exact pour la v3.2).
Recherche sur la suppression AR, la restauration de visage et la complétion du corps : RESTAURATION_IA.md.

## Audit précédent (v2.50 → v3.0)

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

## Cahier « Mission complémentaire » (v3.1)

| Demande | État |
|---|---|
| Analyse intelligente à l’import | déjà présente (rapport de fichier, profil conseillé, VFR, ralentis) |
| Détection / retrait de filtres de visage et de réalité augmentée, récupération du visage d’origine | **non réalisable honnêtement** : les pixels d’origine n’existent plus ; il faudrait inventer un visage (interdit par le cahier lui-même) |
| Reconstruction du visage et des yeux guidée par l’identité | **non réalisée** (invention de traits d’une vraie personne ; essai v2.50 mesuré défavorable) |
| Reconstruction hors du cadre | **non réalisée** (génération d’image, modèles de plusieurs Go) |
| Cohérence temporelle | partielle (débruitage temporel, anti-scintillement, stabilisation existants) |
| **Réassemblage intelligent de vidéos** | **réalisé** : ordre par continuité d’image + date du fichier, doublons, raccords douteux, confiance, validation demandée si incertain, correction manuelle, regroupement sans perte — testé (tests/reassemblage.test.mjs) |
| Directeur de traitement / bouton unique | déjà présent (analyse automatique → profil conseillé → un bouton « Améliorer ») |
