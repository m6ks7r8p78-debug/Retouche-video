# Retouche Cinema AI — P21 Micro-gestes procéduraux

**P21 est un module expérimental et local, issu directement de P20.** Il réutilise le véritable moteur P19 de 480 commandes à 60 Hz / 8 s. Il ne décode aucune des 157 vidéos, n'entraîne aucun modèle et ne génère aucune image photoréaliste.

## Réalisation

- La scène fictive P19 conserve tous ses contrôles d'origine : contact main–accessoire–lèvres, mouvements du regard, paupières, souffle et objets.
- Ajout optionnel de **quatre événements P15** : `lower_lip_bite` (morsure de lèvre inférieure pendant la pause), `lip_lick_lower`, `tongue_visible`, `tongue_retract` (après l'expiration). Ce sont des **commandes numériques originalement calculées**, pas des gestes détectés ou copiés dans des vidéos réelles.
- Interpolation quintique C2, petit contrôle 2D de position de la pointe de langue et contrôle des transitions à 45 et 60 Hz.
- Contrôles de non-superposition de la morsure / langue avec le contact à l'accessoire ou l'expiration. L'audit détecte aussi les modifications adversariales de la trajectoire et de sa provenance.
- **Réutilisation de P20/P15** : comparaison temporelle des quatre nouveaux événements uniquement avec des annotations de source autorisée, visibles et relues indépendamment par deux personnes. Pas d'identification, pas d'annotation automatique ni de nouveau droit d'entraînement.
- Les gestes **non pris en charge**, notamment `lip_lick_upper`, restent inscrits comme manquants. Le recouvrement temporel ne certifie ni la justesse anatomique ni le naturel du rendu.

## Tests

```sh
node --test studio-cinema/p21/tests/test_p21.cjs
node --test studio-cinema/p20/tests/test_p20.cjs studio-cinema/p19/tests/test_p19.cjs studio-cinema/p15/tests/test_behavior_ontology.cjs
```

À exécuter depuis la racine du dépôt. Workflow : `.github/workflows/ci-cinema-p21.yml` pour vérifier l'intégration et les tests anti-régression.

## Utilisation technique

```js
const P15 = require('../p15/behavior_ontology.js');
const P19 = require('../p19/src/p19_micro_motion_generator.js');
const P20 = require('../p20/p20_temporal_evidence.js');
const P21 = require('./p21_gesture_layer.js');
const synthetic = P21.generate(P19, { fps: 60, seed: 17 });
const qa = P21.validate(synthetic, P20);
// Un document P15 autorisé, avec des événements révisés, doit être fourni
// pour P21.compare(docP15, synthetic, P15, P20, {localEvaluationAllowed:true})
```

## Limites et sécurité

- Pas d'intégration dans le `main`, l'interface AURA ou le moteur de publication. Aucune diffusion, connexion distante ou fichier vidéo privé n'est nécessaire.
- **Les nouveaux gestes existent numériquement** ; la visibilité à l'écran, la synthèse photoréaliste, la justesse labiale, le suivi réel des mains et les performances sur Safari iPhone restent non validés.
- Les créneaux temporels des quatre gestes sont encore **écrits pour la démonstration fixe de 8 s**, pas pilotés librement par un prompt utilisateur. Ils ne prétendent pas représenter le comportement d'une personne réelle.
- Des évaluations humaines, des modèles de rendu vérifiés et les tests sur appareil seront nécessaires pour un moteur vidéo 3D capable de produire des gestes naturels et fidèles.
