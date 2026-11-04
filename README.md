# Retouche vidéo

Application web (installable sur iPhone depuis Safari) qui redonne de la qualité aux vieilles vidéos et photos :
amélioration automatique, restauration par IA, agrandissement Full HD / 4K (paysage 3840×2160 ou portrait 2160×3840),
son plus clair, retrait de filtres Snapchat / Instagram, avant / après à partager.
Tout est calculé sur le téléphone : les photos et vidéos ne sont envoyées à aucun serveur.

## Utilisation en bref

1. Ouvrir l’app dans Safari (puis Partager → « Sur l’écran d’accueil » pour l’installer).
2. « Choisir une vidéo » ou « Choisir une photo ». L’app analyse le fichier et règle tout (carte « Analyse automatique »).
3. Choisir la taille (vidéo) et le rendu : **Naturel**, **Équilibré** (conseillé), **Détails**, **Faible lumière** ou **Nuit → jour** (esthétique).
4. « Améliorer » : progression réelle, puis compte rendu vérifié, comparateur avant / après (zoom jusqu’à 8× pour les photos), enregistrement.
5. Outils → **Vitesse et sens de lecture** : accéléré, ralenti, à l’envers (Time Repair).
6. Bouton **🧠 Modèles IA** (en haut) : modèles installés, place occupée, téléchargement, vérification, libération de mémoire, nettoyage.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | l’application (interface, rendu WebGL, analyse, profils, export WebCodecs, son, outils) |
| `models.js` | gestionnaire central des modèles IA : registre, empreintes SHA-256, téléchargements avec reprise, versions, nettoyage, fenêtre « Modèles IA » |
| `sr.js`, `sr-gpu.js`, `sr.bin` | « Qualité maximale » : Real-ESRGAN general v3 en WebGPU (repli WebGL2), poids FP16 (4,9 Mo) |
| `depth.js`, `ort/` | « Effet de relief » des photos animées : Depth Anything V2 Small (ONNX, téléchargé à la première utilisation) avec ONNX Runtime Web 1.22.0 |
| `filtres.png` | 25 tables de couleur (aller et retour) pour retirer les filtres |
| `rnnoise.mjs` | nettoyage de la voix (RNNoise en WebAssembly) |
| `mp4-muxer.js` | écriture du fichier MP4 |
| `sw.js`, `manifest.webmanifest` | fonctionnement hors ligne et installation sur l’écran d’accueil |
| `studio.js` | ⚙️ Paramètres : autorisations, sauvegarde chiffrée, historique ; assistant « Dis ce que tu veux » |
| `polices/` | polices de l’interface, hébergées avec l’app (aucune requête vers Google) |
| `serveur/` | petit serveur gratuit (Cloudflare Workers) qui récupère une vidéo à partir d’un lien de réseau social |
| `tests/` | tests automatiques (gestionnaire de modèles, app de bout en bout, version de calcul WebGPU, banc de qualité) — voir `tests/README.md` |
| `MODELES.md` | fiches des modèles : version, source, licence, taille, besoins, validation, limites |

## Licences des composants

- Real-ESRGAN (code et poids general v3) : BSD-3-Clause (`LICENSE-Real-ESRGAN.txt`)
- Depth Anything V2 **Small** : Apache-2.0 (les versions Base / Large, non commerciales, ne sont pas utilisées)
- ONNX Runtime Web : MIT (`ort/LICENSE-onnxruntime.txt`)
- mp4-muxer : MIT (`LICENSE-mp4-muxer.txt`)
- RNNoise : BSD-3-Clause (Xiph) ; son enveloppe WebAssembly est sous Apache-2.0 (`LICENSE-rnnoise-wasm.txt`)
- Polices Bricolage Grotesque, DM Mono, Instrument Sans : SIL Open Font License 1.1 (`polices/OFL.txt`)

Aucun service payant, aucune clé d’API, aucun abonnement. Seuls téléchargements : le modèle de profondeur (27 Mo, une fois,
depuis Hugging Face, adresse figée sur une révision et empreinte vérifiée) et les vidéos chargées par lien.

Documents : CHANGELOG.md, NOTES.md, MODELES.md, ARCHITECTURE, DECISIONS, ROADMAP, SECURITE, AUTORISATIONS, CONFIDENTIALITE, LICENCES, PERFORMANCES, COMPATIBILITE, RESTAURATION_IA (étude suppression AR / visages / cloud), GUIDE_* (iPhone, ordinateur, utilisateur, cloud gratuit), DEPANNAGE, RAPPORT_* (audit, tests, qualité, final).
