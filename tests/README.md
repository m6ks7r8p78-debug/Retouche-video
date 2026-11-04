# Tests automatiques

Tous les tests tournent dans Chrome sans écran (Playwright), contre un petit serveur local (`serveur.mjs`) qui sert l’app
et simule un serveur de modèles capricieux. **Aucun de ces tests ne remplace un essai sur iPhone** : ici, le GPU est simulé
sur le processeur (SwiftShader), donc les durées ne disent rien de la vitesse réelle sur téléphone.

Préparation (une fois) :

```sh
npm install playwright          # ou indiquer son chemin : PW=/chemin/playwright/index.mjs
pip install scikit-image pillow numpy   # médias de test et mesures ; lpips + torch (CPU) pour la mesure perceptive
python3 tests/creer_medias.py   # crée tests/medias/ (images libres de droits dégradées, 2 vidéos, une photo 12 Mpx)
```

| Commande | Ce qui est vérifié |
|---|---|
| `node tests/gestionnaire.test.mjs` | gestionnaire de modèles : installation, reprise après coupure ou annulation, fichier corrompu, empreinte fausse, taille fausse, stockage insuffisant, modèle incompatible ou absent, appels simultanés, perte de réseau, mise à jour réussie / échouée, retour arrière, libération de mémoire, mémoire saturée, désactivation, `sr.bin` abîmé, nettoyage sans toucher aux médias, protection des modèles, fenêtre « Modèles IA » |
| `node tests/app.test.mjs tests/medias tests/sorties [--ia]` | parcours complet : photos (analyse, profil, export JPEG / PNG, comparateur avec zoom, grande photo 12 Mpx), vidéos (paysage et portrait en 4K, 1080p, 720p personnalisée, taille d’origine ; durée, cadence, son, format d’image vérifiés avec ffprobe), photo animée avec le vrai modèle de profondeur (placer `depth.onnx` dans `tests/medias/`) |
| `node tests/sw.test.mjs` | service worker : à la mise à jour, seuls les anciens caches de l’app sont retirés (modèles téléchargés et /radar/ gardés) ; fichiers hors ligne et polices locales présents |
| `node tests/noyau.test.mjs` | les deux versions du calcul WebGPU donnent le même résultat ; le choix automatique fonctionne |
| `node tests/effacer.test.mjs` *(v3.3)* | « Effacer une zone » avec les vrais modèles : outils internes, refus de téléchargement (aucune requête), modèle abîmé refusé, reconstruction réelle, pixels hors zone identiques au pixel près, carte des zones inventées, garder / refuser / annuler / original, gomme, sélection au toucher (EdgeTAM), exports JPEG / PNG / carte / provenance, historique, 12 Mpx, 20 Mpx réduite, ouverture depuis une photo améliorée. `RAPIDE=1` saute ce dernier cas (long en GPU simulé). Placer dans `tests/medias/` : `migan.onnx` (= migan_pipeline_v2.onnx, `6f1f3530…c40b`), `edgetam_enc.onnx_data` (`21e75dba…528e`) et `edgetam_dec.onnx_data` (`dfa2125e…1be8`), téléchargés aux adresses figées de `models.js`. |
| `node tests/qualite.test.mjs` puis `python3 tests/qualite_mesures.py` | banc de qualité : agrandissement simple, app sans IA, profils Naturel / Équilibré / Détails avec IA, mesurés contre l’original intact (PSNR, SSIM, LPIPS) + planches pour l’inspection à l’œil. `SANS_VISAGES=1` coupe la protection des visages (calibrage). |

Le modèle de profondeur (27 Mo) n’est pas dans le dépôt : le télécharger à l’adresse figée indiquée dans `models.js`
(empreinte SHA-256 `fcf51f1b…f20d`) et le placer dans `tests/medias/depth.onnx`.
