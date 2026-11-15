# RetoucheProAI IA 3D — SmallMotion Local First : rapport d'expérience

**15 novembre 2026 — recherche expérimentale — non déployé**

## 1. Situation de départ vérifiée

Depuis la branche `lab-3d-depthmotion-evidence`, DepthMotion décrivait correctement des plans artificiels dont le mouvement est expliqué par des cartes de profondeur et une calibration simulées, mais manquait le petit objet mobile dans **24/24** cas du banc précédent. Il utilise principalement des correspondances LK ponctuelles et un seuil conservateur de cohérence spatiale.

Le but de cette expérience est limité : compléter les **hypothèses 2D** d'un mouvement local, sans certifier l'identité de l'objet ni l'inférence physique. Les nouveaux modules réutilisent les scènes et la prédiction géométrique existantes.

## 2. Réalisation

Le pipeline Python `smallmotion_evidence.py` calcule un flux dense de Farneback et soustrait le flux prédit par la profondeur *oracle* et une caméra connue. Un seuillage robuste, une ouverture morphologique et des limites sur aire, dimensions et cohérence éliminent les parasites évidents. Une séquence requiert des répétitions temporelles ; une coupe, une scène uniforme ou des données non indépendantes entraînent un refus. La provenance du modèle est explicitement `synthetic_oracle` : le mode capteur réel est refusé jusqu'à caractérisation des incertitudes.

Le prototype **navigateur**, `smallmotion-local.js`, est volontairement différent : appariement de blocs RGBA à petite résolution 160×120, déplacement global robuste par médiane, sélection des blocs résiduels et composantes connexes. Il ne possède pas de profondeur indépendante et doit **toujours afficher « région de mouvement visuel possible »**. Il évite ainsi le GPU/cloud et requiert peu de mémoire, mais sa détection n'est pas exhaustive.

`RetoucheSmallMotion_Local_iPhone.html` réalise le même calcul sur des images décodées d'un fichier vidéo **choisi** sur l'appareil (`blob:` local). La politique CSP impose `connect-src 'none'`; aucun chargement distant, aucun module CDN ni poids téléchargé. La gestion des erreurs tient compte des fichiers incompatibles ; la taille d'entrée est plafonnée à 120 Mo pour ce pilote.

## 3. Mesures exécutées

| Expérience | DepthMotion initial | SmallMotion Python |
|---|---:|---:|
| Petit objet mobile, graines 0–11 | 0/12 candidat | 12/12 candidat local |
| Petit objet mobile, graines 100–105 | 0/6 | 6/6 |
| Faux « petit objet », 5 scènes statiques × 18 graines | n/a | 0/90 |
| Grand objet mobile classé comme champ large | n/a | 18/18 |
| Coupure et plan uniforme : abstention | n/a | 18/18 chaque catégorie |

**Durée médiane CPU (machine de test)**, 320×240, 6 images / 5 transitions : DepthMotion 48,53 ms contre SmallMotion 136,65 ms sur graines 0–11 ; 40,52 ms contre 119,67 ms sur graines 100–105. Il y a donc un **coût supérieur de ~2,8–3,0×**, à ne pas transposer à l'iPhone.

**Non-régression Python : 139/139 tests réussis**, y compris les 34 tests CameraGuard, les 27 MultiMotion, les 37 DepthMotion et les nouveaux tests SmallMotion (41 après ajout de provenance). Les tests Node du moteur JS (mouvement, scène statique, texte uniforme, éclairage et entrées invalides) passent.

### Comparaison indépendante du moteur JS

Test de `smallmotion-local.js` avec les scènes synthétiques historiques rendues en RGBA à 160×120. Prise des images 0 et 2, avec un intervalle de 2 images, pas 0 et 1 :

- `local_object`: 3/3 candidats,
- `single_plane`, `two_depths`, `two_depths_rotated`, `two_depths_mimic`, `occlusion` : 0/3 candidat chacun,
- `broad_object`: 2/3 candidats (pas un classement correct d'objet),
- `blank`: 3/3 abstentions,
- `two_depths_cut` avant coupure : 0/3 candidat.

**Contre-exemple documenté** : un seuil réduit à 1,55 pixels et un maillage plus dense amélioraient les réponses sur des paires séparées d'une seule image, mais entraînaient **3/3 faux mouvements** dans plusieurs scènes de parallaxe et occultation. Ces réglages ont été abandonnés. À l'inverse, l'intervalle de 2 images permet de conserver un seuil plus prudent de 2,2 pixels dans ce banc, mais peut manquer les mouvements plus lents ou les images réelles bruitées.

### Navigateur

Chromium système, via Playwright, viewport 390×844 et 1280×800, HTML chargé directement : l'exemple fictif fonctionne, un **MP4 H.264 synthétique** généré avec FFmpeg est importé localement, ses images sont décodées et la sortie contient une hypothèse régionale. Aucun chargement HTTP(S), aucune erreur JS. Mesures de seule fonction JavaScript : **4,4 ms et 3,7 ms** après décodage. Aucun test sur Safari physique iPhone, aucune mesure thermique/batterie, aucun benchmark haute définition.

## 4. Sources techniques et alternatives

- [WebKit : Safari 26.0 WebGPU](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) — disponible iOS, mais pas utilisé dans ce prototype.
- [Kornia](https://github.com/kornia/kornia) — bibliothèques géométriques et CV pour recherche hybride, non intégrées ici.
- [Video Depth Anything](https://github.com/DepthAnything/Video-Depth-Anything) — option pour expériences lourdes ; aucune inférence ni validation sur GPU réalisée ici.
- [OpenCV](https://github.com/opencv/opencv) — flux optique dense CPU utilisé dans le banc Python.
- GPU gratuits (Kaggle/Colab/ZeroGPU) restent seulement des possibilités de recherche et **n'impliquent aucun transfert des 157 médias privés**.

## 5. Limites scientifiques et priorité suivante

Les scènes répétées avec des graines différentes n'ont **pas** la diversité de vraies scènes humaines. Une vidéo RGB seule n'apporte pas un capteur de profondeur indépendant ; la parallaxe et la variation d'éclairage restent des causes de faux mouvements. La taille des cadres estimés ne vaut pas segmentation pixel précise, et leur succession ne vaut pas suivi d'identité. La prochaine étape devrait viser une évaluation réelle annotée autorisée et un contrôle physique Safari du décodeur, de l'usage mémoire et de la batterie ; ensuite explorer WebGPU uniquement si des mesures montrent que le CPU local est insuffisant.

**Déploiement : non. Entraînement : non. Site public inchangé. Aucune vidéo personnelle envoyée ni publiée.**