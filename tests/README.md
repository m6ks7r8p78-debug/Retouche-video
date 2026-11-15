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
| `node tests/sw_reel.test.mjs` *(v6.5)* | vrai service worker dans Chrome, site servi en local en HTTPS sous le nom retoucheproai.com : deuxième ouverture sans demande au serveur, ouverture sans connexion, mise à jour automatique, pas de rechargement pendant un travail. `node tests/sw.test.mjs --maj` recalcule l’empreinte des fichiers dans `sw.js` (à faire à chaque version, après avoir changé le numéro du cache). |
| `node tests/moteur_graphique.test.mjs` *(v6.6)* | retire exprès le moteur graphique (comme un iPhone à court de mémoire) : aperçu identique après retour, export repris à la même image sans perte, attente au lancement, message clair s'il ne revient pas. |
| `node tests/noyau.test.mjs` | les deux versions du calcul WebGPU donnent le même résultat ; le choix automatique fonctionne |
| `node tests/effacer.test.mjs` *(v3.3)* | « Effacer une zone » avec les vrais modèles : outils internes, refus de téléchargement (aucune requête), modèle abîmé refusé, reconstruction réelle, pixels hors zone identiques au pixel près, carte des zones inventées, garder / refuser / annuler / original, gomme, sélection au toucher (EdgeTAM), exports JPEG / PNG / carte / provenance, historique, 12 Mpx, 20 Mpx réduite, ouverture depuis une photo améliorée. `RAPIDE=1` saute ce dernier cas (long en GPU simulé). Placer dans `tests/medias/` : `migan.onnx` (= migan_pipeline_v2.onnx, `6f1f3530…c40b`), `edgetam_enc.onnx_data` (`21e75dba…528e`) et `edgetam_dec.onnx_data` (`dfa2125e…1be8`), téléchargés aux adresses figées de `models.js`. |
| `node tests/rvv.test.mjs` *(v7.4)* | visages restaurés en vidéo : lissage des repères, export sans / avec l'option, mesure contre la vérité (LPIPS, PSNR, scintillement), étape sautée avec la stabilisation. Préparer : `python3 tests/visage_ia/video_visage.py creer`. Banc des méthodes : `tests/visage_ia/banc_video.py`. |
| `node tests/rfv.test.mjs` *(v7.5)* | retrait de filtre en vidéo : recalage fin (transformation connue retrouvée), export sans / avec l'option, mesure contre la vérité (écart dans la zone, scintillement, LPIPS), filtre + visages ensemble, vidéo sans filtre intacte. Préparer : `python3 tests/labo_filtres/video_filtre.py creer` et `tests/medias/migan.onnx`. Banc des méthodes : `tests/labo_filtres/banc_video.py`. **Drapeaux Chromium** : ceux d'`app.test.mjs` (`--enable-unsafe-swiftshader` fait fermer l'onglet pendant un export vidéo). |
| `python3 tests/catalogue_medias_test.py` *(Directeur v1.0, branche)* | catalogueur privé sur médias synthétiques : SHA-256, métadonnées, doublon exact, réencodage rapproché (hypothèse), bruit mesuré, partition sans fuite, autorisations séparées, import du catalogue ChatGPT, refus d'écrire dans Git, médias jamais modifiés. `node --test tests/directeur-priorites.test.mjs` : priorisation des modules faibles. |
| `node tests/banc_filtres_app.mjs` *(Directeur v1.1, branche)* | vrai module « Retirer le filtre du visage » sur 8 vidéos synthétiques (portraits NASA × chien / chat / hasard) : export sans / avec, mesure contre la vérité → `tests/sorties/f10/banc_app.json`, puis `python3 outils/banc_vers_etat.py tests/sorties/f10/banc_app.json --module filtres_ar --ecrire`. Préparer : `PYTHONPATH=tests/visage_ia/faux python3 tests/labo_filtres/video_filtre_multi.py creer`, `tests/medias/migan.onnx`, `CHROME=` (codecs H.264). |
| `node tests/qualite.test.mjs` puis `python3 tests/qualite_mesures.py` | banc de qualité : agrandissement simple, app sans IA, profils Naturel / Équilibré / Détails avec IA, mesurés contre l’original intact (PSNR, SSIM, LPIPS) + planches pour l’inspection à l’œil. `SANS_VISAGES=1` coupe la protection des visages (calibrage). |

Le modèle de profondeur (27 Mo) n’est pas dans le dépôt : le télécharger à l’adresse figée indiquée dans `models.js`
(empreinte SHA-256 `fcf51f1b…f20d`) et le placer dans `tests/medias/depth.onnx`.
