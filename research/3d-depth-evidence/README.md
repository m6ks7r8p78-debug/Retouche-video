# RetoucheProAI — DepthMotion Evidence (laboratoire expérimental, après MultiMotion)

**Statut :** nouveau module de *diagnostic de géométrie 2D* conditionné par profondeur et mouvement de caméra **fournis de l'extérieur**. Ne crée pas de reconstruction humaine 3D. Ne détecte pas de mains, d'identités, d'objets immobiles ou de contact. Ne réalise aucun entraînement ni inférence neuronale. Pas de média privé.

## Continuité avec les versions précédentes

Il **réutilise** le suivi LK du laboratoire `research/3d-multimotion/multimotion_evidence.py`, lui-même conçu après CameraGuard v4.3. Les anciens modèles restent inchangés. Le banc compare les états MultiMotion et DepthMotion sur les mêmes pixels. Un ZIP autonome contient des copies de référence non modifiées de deux modules de synthèse historiques (`baseline_*`), uniquement pour fonctionner hors GitHub.

## Installation et reproduction

Python ≥3.10, `numpy`, `opencv-python-headless`, `pytest`.

```sh
pip install numpy opencv-python-headless pytest
# Dans le dépôt GitHub :
export PYTHONPATH="research/3d-multimotion:research/3d-depth-evidence"
python -m pytest -q research/3d-camera-v43/tests research/3d-multimotion/tests research/3d-depth-evidence/tests
python research/3d-depth-evidence/benchmark_depthmotion.py --seeds 3 --out /tmp/depth_0.json
python research/3d-depth-evidence/benchmark_depthmotion.py --seeds 3 --offset 3 --out /tmp/depth_3.json
python research/3d-depth-evidence/merge_batches.py /tmp/depth_all.json /tmp/depth_0.json /tmp/depth_3.json
```

Dans le ZIP local autonome, aller dans le dossier extrait et exécuter `python -m pytest -q tests`; lancer `python benchmark_depthmotion.py --seeds 3 --out test.json`. Pour reproduire la campagne 12 graines, exécuter les tranches 0,3,6,9 de 3 graines chacune et fusionner.

## API publique

```python
from depthmotion_evidence import analyze_sequence
out = analyze_sequence(
    frames_bgr_uint8, list_of_float32_depth_maps, camera_motion_per_transition,
    depth_source='independent_sensor', camera_source='independent_sensor',
    origin='real_unvalidated', depth_uncertainty_rel=.1,
    camera_uncertainty_rel=.1)
```

- Profondeurs en **mètres positifs**, synchronisées avec les pixels (NaN autorisé pour pixels manquants). **Les prédictions de profondeur relative ne sont pas des mètres** et doivent être calibrées indépendamment avant d'utiliser cette API.
- Mouvement caméra déclaré par transition `{'translation_x_m': valeur, 'rotation_deg': valeur, 'focal_px': valeur}`. **Modèle simplifié** (translation horizontale et rotation image dans un plan), hors 6-DoF complet, rolling shutter et déformation d'objectif.
- Si la provenance profondeur ou caméra est `rgb_inferred` ou `unknown`, réponse `abstain_non_independent_evidence`. Le programme **ne vérifie pas la provenance réelle** : elle doit être auditée en amont.
- Pour une analyse de capteurs réels, `depth_uncertainty_rel` et `camera_uncertainty_rel` sont obligatoires. Les hypothèses perturbées de ±incertitude sont recalculées ; si la classe varie, renvoyer `abstain_calibration_sensitivity`.
- En mode fictif, utiliser `depth_source='synthetic_oracle'`, `camera_source='synthetic_oracle'`, `origin='synthetic'`. Ces cartes proviennent du générateur de scènes, elles **ne sont pas de mesures indépendantes sur le monde réel**.
- Sortie sans frames, depth map, identité, position anatomique ou données personnelles. Étiquettes = candidat, expliqué, abstention ; `causal_claim=False` toujours.

## Campagnes expérimentales (locales)

Scènes 320×240, 11 images, 11 scénarios × 12 graines = 132 séquences par campagne. Une seconde campagne 100…111 reproduit la même géométrie avec d'autres textures. Total : 264 séquences, mais **un seul générateur synthétique**.

- 144/144 instances de scènes statiques correctement expliquées ; 0/144 candidates autonomes fausses sous **calibration parfaite**.
- 48/48 grands objets autonomes signalés comme candidats ; **24/24 petits objets manqués**.
- 48/48 séquences coupure ou texture vide abstention.
- 24/24 scènes de parallaxe fixe **faussement candidates** quand on substitue une carte de profondeur erronée (même distance sur les deux plans), dans l'ablation dédiée.
- Lors de la première campagne, +40 % d'erreur de translation sur l'objet « mimique » conduit à 10/12 statuts « expliqué par caméra » et à 2/12 abstentions ; deuxième campagne : 11/12 « expliqué » et 1/12 abstention. **Une calibration fausse peut cacher le mouvement d'un objet**.
- Nombres = observations de tests synthétiques, pas scores de généralisation humaine ni accuracy réaliste.

## Matériel / iPhone

Le fichier `RetoucheDepthMotion_iPhone_experimental.html` est un lecteur tactile **hors ligne** d'images JPEG fictives et de diagnostics Python pré-calculés. Pas de calcul IA sur iPhone. Vérifié dans Chromium système via Playwright en 390×844 et 1280×800 : navigation 6 expériences, curseur et boutons, 0 erreur JS et 0 requête HTTP(S). **Pas de test Safari physique**.

## Pistes GitHub vérifiées (sans téléchargement de poids)

- `DepthAnything/Video-Depth-Anything` (CVPR 2025) : modèles relative et metric depth ; **Small Apache 2.0**, Base/Large CC BY-NC 4.0 selon README ; métriques coût GPU FP16 annoncées A100, non iPhone. https://github.com/DepthAnything/Video-Depth-Anything
- `DepthAnything/Depth-Anything-V2`: incohérences temporelles vidéo signalées dans #85 et #228 ; problème licence soulevé en #320 (question ouverte, pas conclusion juridique). https://github.com/DepthAnything/Depth-Anything-V2/issues/320
- Aucun poids de ces projets n'est installé ou testé dans cette expérience ; leur profondeur inférée des mêmes pixels **ne constitue pas une mesure indépendante**. Une éventuelle intégration hybride demanderait validation, capteurs/calibration et audit de licences séparé.

**Interdit à ce stade :** fusion sur `main`, déploiement sur retoucheproai.com, partage du corpus privé, revendication 3D anatomique / mains / contact, utilisation du résultat comme preuve biométrique.