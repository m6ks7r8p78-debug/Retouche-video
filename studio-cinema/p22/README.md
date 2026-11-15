# Cinema P22 — preuve visuelle mesurée des micro-gestes P21

**Laboratoire : Cinema AI P20/P21/P22. Branche : `chatgpt-cinema-p21-gesture-layer-20261115`, PR #33.**
Aucune fusion, déploiement ou modification du site. P22 reste un banc synthétique isolé.

## Motivation et reprise des anciens modules

P19 produit des mouvements procéduraux à 60 Hz, mais le film vectoriel original les rend souvent peu visibles. P20 compare les commandes temporelles avec des annotations P15 visibles et arbitrées, **sans prétendre que les commandes sont des observations humaines**. P21 ajoute de nouveaux paramètres de lèvres et de langue. P22 est la prochaine étape : brancher ces paramètres **sur le véritable dessinateur de P19** et mesurer des modifications de pixels réelles, pas seulement des nombres.

## Modules exécutés

- `src/build_p22_controls.cjs` : exécute les véritables P19, P20 et P21 pour 480 états synthétiques à 60 Hz, et refuse leur génération si les audits numériques échouent.
- `src/render_p22.py` : importe réellement `studio-cinema/p19/src/render_p19.py`, produit l'image originale P19 puis superpose les micro-gestes P21 **uniquement dans une petite zone autour de la bouche**. Enregistre les images avant/après aux phases pertinentes, un rapport quantitatif et, en option, un MP4 de 8 s/60 i/s H.264 + bande-son AAC synthétique.
- `tests/test_p22_visual.py` : vérifie les changements effectivement visibles, l'absence de modifications hors zone, la non-modification pendant les phases inactives, la provenance et les refus de fausses preuves.
- `.github/workflows/ci-cinema-p22.yml` : installe les dépendances publiques reproductibles, exécute les tests P15–P22, génère le MP4 synthétique, mesure le codec/cadence/480 images/durée et décode intégralement la vidéo. L'artefact CI a une rétention de trois jours ; ce n'est pas un déploiement.

## Commandes de reproduction

```bash
python -m pip install 'numpy<3' 'opencv-python-headless>=4.9,<5'
node --test studio-cinema/p21/tests/test_p21.cjs studio-cinema/p20/tests/test_p20.cjs studio-cinema/p19/tests/test_p19.cjs studio-cinema/p15/tests/test_behavior_ontology.cjs
node studio-cinema/p22/src/build_p22_controls.cjs studio-cinema/p22/results/controls.json
python -m unittest discover -s studio-cinema/p22/tests -p 'test_p22_visual.py' -v
python studio-cinema/p22/src/render_p22.py --data studio-cinema/p22/results/controls.json --out studio-cinema/p22/results/proof --render-preview
```

## Critères de preuve et limites

- **Preuve vérifiable :** quatre événements P21 doivent modifier au moins 15 pixels dans le visage vectoriel; aucun pixel hors zone bouche ne peut être modifié; la pose originale P19 est conservée.
- Le seuil de 15 pixels est un **seuil expérimental de présence visible de trait**, ni un seuil perceptif calibré, ni une mesure de réalisme humain. Une animation schématique peut passer les tests tout en restant peu naturelle.
- L'encodage MP4 H.264/AAC ne signifie pas génération vidéo neuronale, imitation d'une personne, précision anatomique, vérification physiologique ou fonctionnement sur iPhone physique.
- Aucun des 157 médias personnels, métadonnées sensibles, modèles ou poids privés n'a été utilisé, exporté ou publié.
- Le module n'est pas branché à la page publique, à la PWA ni à AURA ; il n'utilise pas un résultat SmallMotion comme preuve de lèvres ou de mains.
- Prochaine étape après revue : comparer la visibilité et la stabilité des rendus en Chromium/WebKit, puis Safari iPhone physique sur un hôte autorisé et distinct, et collecter l'évaluation humaine explicite avant toute fusion.

## Contrat de coordination

- **NOVA / PR #3 :** réutiliser ses audits de cadence, H.264/AAC et A/V pour *évaluer* les sorties P22 ; ne pas les déclarer intégrés.
- **SmallMotion / PR #28 :** ne jamais requalifier son observation sur deux images en preuve de geste sémantique.
- **AURA / PR #31 :** un aperçu facultatif P22 pourrait être ajouté lors d'une PR d'intégration spécifique; aucune modification de façade ici.
- **Directeur IA :** le statut `synthetic_vector_pixel_gate_pass` est **consultatif** et ne peut jamais déclencher une reconstruction de médias réels.
- Les sources de vérité restent le commit exact, la CI et les tests, pas le seul instantané du registre central.
