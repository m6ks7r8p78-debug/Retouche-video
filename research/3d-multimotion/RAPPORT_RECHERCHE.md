# RetoucheProAI — Rapport de recherche MultiMotion Evidence

**15 novembre 2026 — Expérience après CameraGuard v4.3**

## Décision

Nous n'ajoutons pas artificiellement une v4.4 « reconnaissance de parallaxe ». Nous avons créé un **module de preuves visuelles 2D** capable d'identifier plusieurs transformations cohérentes, sans leur attribuer une cause. Il est expérimental, autonome et distinct de CameraGuard v4.3. Aucun service IA distant, aucun entraînement, aucun média privé, aucun déploiement.

## Reprise et sécurité

Source retenue : la branche GitHub `lab-3d-v43-camera-evidence` contenant `research/3d-camera-v43/`. Le rapport et l'archive du précédent cycle ont été consultés ; les tests Python v4.3 existants sont préservés. L'archive privée v4.2 a été trouvée au cycle précédent, mais **aucune extraction personnelle n'est copiée dans GitHub** et aucun des 157 médias originaux n'est présent dans ce nouveau banc. Le coffre local du précédent cycle contient quelques MP4 de démonstration synthétique et des catalogues, mais aucune nouvelle validation sur 157 originaux n'a été effectuée.

## Recherche GitHub ciblée et décisions

| Technologie | Apport | Résultat de cette étape |
|---|---|---|
| MAGSAC++ (`danini/magsac`, OpenCV `USAC_MAGSAC`) | Homographie robuste | **Réellement sondé** en CPU : n'améliore pas une séparation automatique des deux champs dans notre scène, car le modèle homographique peut absorber une partie des deux mouvements ; pas intégré |
| Kornia RANSAC | Affine, homographie, fondamentale, essentiel | Code et documentation examinés, non intégré (dépendance PyTorch et coût non justifié) |
| Depth Anything V2 Small / Video Depth Anything Small | Profondeur monoculaire (état temporel à surveiller) | Licences Apache-2.0 pour poids Small ; non téléchargés, non testés |
| SAM2 | Segmentation vidéo | Piste à tester plus tard ; issue GitHub #739 sur saut d'identité : observation de développeur, pas preuve générale |
| Open-CHOIR | Mouvements et contacts main/objet en 4D | Bibliographie pour recherche future ; licences mixtes et fortes dépendances ; non exécuté |
| Depth Anything 3 | Géométrie spatiale | Vérifier la licence de **chaque** checkpoint avant réutilisation ; non exécuté |

Références : https://github.com/danini/magsac ; https://github.com/kornia/kornia ; https://github.com/DepthAnything/Depth-Anything-V2 ; https://github.com/DepthAnything/Video-Depth-Anything ; https://github.com/facebookresearch/sam2/issues/739 ; https://github.com/hxwork/CHOIR ; https://github.com/ByteDance-Seed/Depth-Anything-3 ; https://github.com/DepthAnything/Depth-Anything-V2/issues/85 .

## Nouveau prototype et hypothèses

`multimotion_evidence.py` : extraction Lucas–Kanade avant/arrière, estimation robuste par RANSAC d'une première transformation de similarité 2D, estimation d'une seconde sur les résidus, vérification d'un support suffisamment étendu, différence cinématique minimale et cohérence temporelle. Un échec de correspondances sur une transition provoque une **abstention sur la séquence** plutôt qu'une interpolation artificielle. Une seconde transformation est une preuve **d'un second champ de mouvement**, pas d'une couche de profondeur, d'une identité d'objet ou d'une interaction.

Les scènes synthétiques sont des surfaces à Z théorique variable, projetées avec déplacement horizontal approximatif `Δx = - f * Tx / Z`, où f = 360 px, Tx = 0,018 m par image, Z fond = 7,2 m et Z avant-plan = 1,7 m. Ce ne sont pas de vraies vues 3D, et la caméra n'est pas calibrée sur une vidéo humaine.

## Banc synthétique — 12 graines (0…11) par scénario

| Scénario, 11 images chacune | Résultat module, nombre de séquences sur 12 | Résultat CameraGuard v4.3 sur mêmes pixels |
|---|---|---|
| Deux surfaces à profondeurs simulées | 12/12 **deux champs** | 12/12 abstentions |
| Rotation + deux surfaces | 12/12 **deux champs** | 12/12 abstentions |
| Deux couches avec déplacement relatif trop faible | 12/12 **un champ** (**échec** connu) | 12/12 traitées, sans décorrélation prouvée |
| Deux surfaces compressées JPEG qualité 52 | 12/12 **deux champs** | non comparé directement |
| Coupe au milieu de deux surfaces | 12/12 **abstentions temporelles** | 12/12 abstentions |
| Une seule surface | 12/12 **un champ** | 12/12 traitées |
| Petit objet mobile | 12/12 **un champ** | 12/12 traitées |
| Grand objet mobile indépendant | 12/12 **deux champs** : faux si interprété comme « parallaxe » | 12/12 abstentions |
| Décor sans texture | 12/12 **abstentions** | 12/12 abstentions |
| Grande occultation artificielle | 12/12 **deux champs**, aucune identité suivie | 12/12 abstentions |

**Contre-exemple formel d'identifiabilité :** `two_depths` et `two_depths_mimic` produisent des matrices de pixels **strictement identiques** (test `np.array_equal`) alors que la simulation leur attribue des causes différentes (parallaxe de caméra vs mouvement indépendant du grand plan). Aucune méthode n'observant **que les pixels** ne peut décider laquelle est réelle dans ce cas. La sortie doit donc conserver une incertitude causale.

La suite `benchmark_holdout_100_111.json` réutilise le générateur avec 12 autres graines et reproduit les catégories ci-dessus (ce n'est **pas** une validation externe). Les mesures `mean_time_ms` du rapport JSON sont CPU dans cet environnement, pas des benchmarks sur iPhone.

### Sonde comparant les estimateurs

Sonde OpenCV 4.13, 12 graines sur une paire d'images seulement, pas un concours de précision comparable entre modèles de paramètres différents :

- Deux profondeurs : similaire RANSAC ~396,7 points dans les résidus considérés conformes ; homographie `USAC_MAGSAC` ~554,7 points. Cela peut résulter d'une plus grande souplesse du modèle qui absorbe une partie du mouvement de la deuxième surface.
- Rotation + deux profondeurs : ~374,8 contre ~569,8.
- Plan unique : 650 contre 650.
- Sur ce petit banc, la sonde homographique est plus lente : médianes 1,447 ms contre 0,395 ms sur deux profondeurs. Ce sont des temps d'estimation par paire, pas le temps total de la chaîne.

Nous **n'intégrons pas automatiquement MAGSAC++** à MultiMotion ; la minimisation d'erreur d'un modèle plus riche ne garantit pas que les couches restent distinguables.

## Régression et navigateur

- `27/27` nouveaux tests Python réussis + `34/34` tests CameraGuard v4.3 préservés = **61/61** dans la session locale.
- Démo HTML tactile intégralement autonome : 6 scénarios et 11 images par scénario, lecture, sélection, recherche temporelle, état de preuve et vérité **de simulation** clairement distinguée. Chromium sous viewport mobile 390×844 et bureau 1280×800 : lecture, changement de cas, 0 erreur JavaScript, 0 requête HTTP(S). Accès `file://` refusé par le navigateur d'automatisation ; repli `page.set_content` avec les mêmes octets HTML, sans modification de la logique. **Safari physique non testé.**
- Cinq MP4 fictifs de 11 images ont été créés avec `cv2.VideoWriter` et rouverts avec `cv2.VideoCapture` (aucun test perceptuel ou temps réel).
- Aucun contrôle de performance mobile, aucun traitement neuronal et aucune validation humaine annotée.

## Faiblesses et décision suivante

1. Avec une faible parallaxe, le second champ disparaît : traiter comme **information insuffisante**, pas comme preuve d'absence de profondeur.
2. Un grand objet en mouvement est indiscernable de certaines scènes de parallaxe en 2D (contre-exemple exact) : introduire éventuellement des informations externes — calibration, trajectoire IMU, vraie profondeur vidéo cohérente ou vues supplémentaires — et vérifier les licences et la stabilité.
3. Occultation : le résultat est une preuve de champs, **aucun suivi d'identité** ni lien main–objet.
4. La fidélité 3D et les interactions sont hors périmètre ; prochaine évaluation sur vidéos publiques annotées, sous licence compatible et sans contamination train/test.
5. Ne rien fusionner vers `main` ni retoucheproai.com avant revue et vérifications iPhone physique.

## Reproduction

Voir `README.md`, `tests/test_multimotion.py`, `benchmark_multimotion.py`, `benchmark_holdout_100_111.json`, `compare_v43_multimotion.py`, `probe_estimators.py`. Tous sont fournis dans le pack autonome, sans média privé.