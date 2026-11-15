# RNE 0.3 — entraînement privé **après évaluation** sur 157 vidéos

**14 novembre 2026 — RetoucheProAI, recherche uniquement.** Code générique dans le dépôt public, poids et médias dans une archive privée. La PR reste expérimentale, sans fusion sur `main` ni activation dans l'application.

## Objectif et déroulement réellement effectués

1. Les **157 vidéos** prévues dans le catalogue privé ont été retrouvées localement. SHA-256 contrôlé individuellement : **157/157 conformes**, environ **2,46 Go**. Parmi ces fichiers, on compte **154 empreintes uniques** et **3 copies exactes supplémentaires**. Les copies ne représentent pas de nouvelles scènes indépendantes.
2. L'apprentissage RNE 0.3 initial de **600 étapes** avait préservé **127 vidéos d'entraînement / 12 de validation / 18 de test**, sur 37 groupes conservateurs de scènes, afin d'obtenir une mesure externe au nouvel apprentissage. Le checkpoint résultant et son rapport sont conservés séparément.
3. **Après cette évaluation**, le propriétaire a demandé d'exploiter les 157 vidéos. Une passe **supplémentaire de 450 étapes, batch 8**, a été effectuée à partir du checkpoint RNE 0.3 initial sur **284 véritables triplets de frames** provenant des **157 vidéos** : 254 triplets des 127 vidéos initialement en apprentissage, 12 triplets des anciennes vidéos de validation et 18 des anciennes vidéos de test.
4. La vérification de couverture à l'intérieur de la boucle a confirmé **157/157 sources** et **284/284 triplets** présentés à l'optimiseur. Chaque source était explicitement autorisée à l'apprentissage privé et à l'évaluation. Aucune image séparée n'a été incluse et aucune vidéo n'a été publiée.
5. Le nouveau modèle **RNE 0.3 tout corpus** a produit un vrai MP4 synthétique de **24 images, 256×192 à 12 fps**, avec **22 images traitées temporellement** après l'initialisation. Le MP4 a été décodé à nouveau. Ce test ne certifie ni l'efficacité perceptuelle ni un fonctionnement 4K/iPhone.

## Mesures à ne pas confondre

| Comparaison | Protocole | Résultat |
|---|---|---|
| Avant la passe tout corpus : RNE 0.3 vs bicubique | 72 patchs issus des 18 clips auparavant tenus à l'écart | **+0,43214 dB de PSNR**, mais une régression > 0,5 dB et 5 groupes gagnants sur 6 |
| Après la passe tout corpus : bicubique | 284 patchs issus de l'**ensemble d'apprentissage** | 34,5021 dB |
| Après la passe tout corpus : ancien checkpoint RNE 0.3 | Les mêmes 284 patchs d'apprentissage | 34,9438 dB |
| Après la passe tout corpus : RNE 0.3 réajusté | Les mêmes 284 patchs d'apprentissage | **34,9979 dB** |

Le gain de **+0,0541 dB** du réajustement face à son point de départ (et +0,4958 dB face au bicubique) est **un score sur les données désormais utilisées pour entraîner**. Ce n'est **ni une évaluation indépendante, ni la preuve d'une meilleure qualité sur des vidéos inconnues**. Par construction, aucun groupe du catalogue des 157 vidéos ne reste vierge pour un nouveau test final. Le benchmark antérieur sur 18 vidéos vaut **seulement pour l'ancien checkpoint**, testé avant leur inclusion dans l'apprentissage.

Il n'a pas été procédé à l'entraînement sur toutes les frames de toutes les vidéos : **1 ou 2 triplets échantillonnés par vidéo** ont été utilisés, puis augmentés par sous-échantillonnage ×2 et dégradations synthétiques. Les véritables accessoires AR, l'identité des visages, les détails irrémédiablement effacés, les performances 4K et Safari iPhone ne sont pas validés.

## Code et protection

- `outils/rne/finetune_all_corpus.py` : chemin générique réexécutable **hors dépôt** après évaluation, avec exigence des autorisations d'entraînement de **chaque** vidéo, vérification des SHA-256 et de la présence de triplets, couverture complète des sources, chargement sécurisé de poids, refus de réécriture du checkpoint initial et avertissement permanent sur l'absence de test vierge.
- `tests/test_rne_all_corpus.py` : sept tests de protocole sur données entièrement synthétiques (catalogue incomplet, doublon, consentements et interdiction de publication, etc.).
- `.github/workflows/rne-cpu.yml` : contrôles de syntaxe et exécution des tests synthétiques. **Aucun média personnel, manifeste, poids spécialisé, sortie image ou empreinte ne doit être ajouté à GitHub ou traité par GitHub Actions.**
- Archive privée transmise au propriétaire : `RetoucheNeuralEngine_RNE03_157_videos_prive.zip` avec les **deux checkpoints**, le script exact de l'expérience, les deux rapports et la démonstration entièrement synthétique ; pas de vidéo brute ni frame de la bibliothèque.

## Prochain jalon

Pour affirmer une amélioration du nouveau modèle tout corpus, collecter **de nouvelles scènes indépendantes**, réellement hors entraînement/hyperparamètres, sous autorisations appropriées. Évaluer PSNR/SSIM/LPIPS quand une référence authentique est disponible, et sinon qualité perceptuelle avec tests de non-régression sur détails fins, visages, mouvements, coupes et compression. Le déploiement doit rester bloqué tant que la stabilité, la mémoire et la compatibilité sur un vrai iPhone Safari ne sont pas validées.

**DLSS 5 NVIDIA n'a pas été utilisé** : RNE reste un moteur 2D maison basé sur un réseau entraînable, une estimation de mouvement et une fusion temporelle causale, sans données moteur 3D.
