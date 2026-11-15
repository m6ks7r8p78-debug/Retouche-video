# RETOUCHE CINEMA AI — P10 | RAPPORT EXPÉRIMENTAL
Date : 15 novembre 2026. Version : P10, développement local, aucun déploiement.

## 1. Périmètre et données

Cette étape exploite les agrégats produits en P9 lors de l'analyse des **157 vidéos originales** (~1 h 54 min) : 1 570 fenêtres visuelles initiales, 471 fenêtres de contrôle rapproché, 6 414 pas de mouvement, 131 pistes audio exploitées, 26 sans son. Les fichiers originaux ne sont pas réentraînés image par image et aucune étiquette « inspiration/expiration » ne découle automatiquement de ces statistiques.

## 2. Premier entraînement automatique réellement exécuté

Un **autoencodeur débruiteur** (PyTorch CPU, 12 dimensions de descripteurs de flux optique, architecture 12-24-7-24-12, 45 époques, graines fixes) est entraîné sur les mesures P9. Le manifeste de séparation du laboratoire v3.5 protège les groupes de scènes proches et les doublons.

| Jeux | Vidéos | Mesures |
|---|---:|---:|
| Entraînement | 110 | 5 074 |
| Validation | 24 | 540 |
| Test indépendant | 23 | 800 |

MSE normalisée du modèle : train **0,045365**, validation **0,080189**, test **0,104535**. Baseline simple, médiane des caractéristiques : test **1,414123**. Sur des perturbations de mouvement ajoutées artificiellement au test, AUC **0,7507**. Les poids privés sont conservés en `.npz` et contrôlés SHA-256.

**Interprétation prudente :** l'autoencodeur reconstruit les descripteurs qu'on lui donne ; il ne prédit pas le geste suivant, n'apprend pas l'anatomie du visage et ne détecte pas un vrai mouvement de cigarette. L'AUC ne s'applique pas à des erreurs réelles non étiquetées. Les métriques ne constituent pas une validation de génération vidéo.

## 3. Nouvelle revue privée

- La file des 471 fenêtres P9 est conservée et ordonnée. Une première série de **60 fenêtres**, réparties sur les **38 groupes de scènes**, donne 33 passages train, 13 validation et 14 test ; les 411 autres restent disponibles.
- **Un seul** passage réel a été inspecté visuellement à intervalles ~0,18 s pour un premier pré-relevé de **14 événements** : trajectoire de la main, prise des doigts, contact filtre–lèvres, changement du regard, retrait, ouverture des lèvres et fumée visible.
- L'inspiration, les variations des joues et les bruits de respiration n'ont **pas** été confirmés par une seconde personne. Aucune majorité n'a été vérifiée pour ce passage. Le relevé est **provisoire** et **non éligible à l'apprentissage supervisé**.
- Un fait qualitatif nouveau impose de ne pas utiliser de délai universel arbitraire de 0,6 s entre retrait de la cigarette et expiration : le délai apparent dépend fortement du plan et de la personne ; il faut annoter chaque événement réel individuellement.

## 4. Contrôle de consensus

- Validation P10 Python : **13/13 tests**.
- Jeu P10 de flux, split et file : **6/6 tests**.
- Contrôle P10 JavaScript : **10/10 tests**.
- Régression P9 JavaScript : **15/15 tests**.
- Total P10 et régression P9 : **44 tests automatisés réussis**.
- Tests d'interface Chromium aux dimensions **390×844 et 1240×820**, import de deux exports fictifs, désaccord spatial affiché, export de constat proposé ; **aucune exception JavaScript, aucun appel réseau**. Le test physique Safari iPhone reste à faire.

Deux sorties P9 sont comparées de façon déterministe par canal, phase, durée, position, visibilité et origine de fumée. Un bon F1 de rapprochement ne prouve ni une respiration, ni une identité, ni la justesse des étiquettes. Un arbitrage humain est toujours requis.

## 5. Confidentialité

Code, interface, exemples fictifs et tests génériques sont séparés de l'archive privée. Cette dernière comporte des horodatages, IDs de vidéos et poids issus de statistiques de personnes réelles ; **elle n'est pas chiffrée** et ne doit pas être partagée publiquement. Aucun média privé ni modèle dérivé n'a été déployé ou placé dans GitHub public.

## 6. Limites et prochaine phase P11

1. Créer des annotations temporelles vérifiées par au moins deux évaluateurs sur les micro-gestes (lèvres, joues, doigts, regard, souffle, fumée) ; confirmer l'admissibilité des vidéos pour un entraînement supervisé et le périmètre des autorisations.
2. Utiliser les passages dont les mouvements sont indépendamment validés pour mesurer les rappels/précisions d'un détecteur, plutôt que d'entraîner et d'évaluer sur des hypothèses.
3. Tester un **vrai modèle génératif vidéo** sur GPU avec séquences cohérentes, et comparer les positions et micro-mouvements originaux ; une interpolation à 60 images/s ne crée pas ces poses.

**Bilan :** progrès réel de l'infrastructure et premier entraînement statistique sur les données du laboratoire, mais **aucun nouveau film photoréaliste ni modèle neuronal de gestuelle humaine fidèle** livré en P10.

