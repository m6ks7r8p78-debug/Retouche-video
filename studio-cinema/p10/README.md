# Retouche Cinema AI — P10 · Observation indépendante + premier entraînement de mouvement

**Statut : recherche expérimentale, pas un générateur vidéo photoréaliste.**

## Résultats vérifiés (15 novembre 2026)

- Conservation du corpus P9 : **157 originaux authentifiés** (audit P9), **471 fenêtres candidates**, **6 414 pas de flux optique** ; ces dernières mesures sont des échantillons clairsemés et ne couvrent **pas toutes les images** des 157 vidéos.
- Première file de travail privée : **60 passages** sur **38 groupes de scènes** (33 train, 13 validation, 14 test). Les 411 passages restants sont conservés. La sélection dépend uniquement d'indices de mouvement, de visibilité approximative du visage, d'audio présent et de diversité de scènes, **pas d'une reconnaissance de l'acte de fumer**.
- **Premier modèle neuronal P10 effectivement entraîné** en auto-supervision sur des **descripteurs P9 dérivés de mouvements uniquement** : 5 074 mesures train / 540 validation / 800 test, sur respectivement 110 / 24 / 23 vidéos, 45 époques CPU, sans images, sons ni noms de personnes dans les entrées réseau.
- Erreur de reconstruction MSE normalisée sur test : **0,104535**. Ligne de base médiane de caractéristiques : **1,414123**. Cela confirme surtout que l'autoencodeur reproduit ses descripteurs d'entrée ; **ce n'est ni une prédiction de mouvements ni une validation de gestes humains**.
- AUC **0,7507** dans une détection de perturbations injectées *synthétiquement* sur le jeu de test : n'établit pas la reconnaissance d'erreurs sur des vidéos réelles.
- Premier pré-relevé visuel sur **une** séquence réelle : **14 observations provisoires** (main, doigts, filtre, lèvres, regard, fumée) et incertitudes explicites. **Zéro annotation humaine indépendante validée, zéro clip qualifié pour apprentissage supervisé de la respiration/fumée.**
- Tests P10 : **13 Python de consensus**, **10 JavaScript de consensus**, **6 Python de données / anti-fuite**, soit **29/29** ; **15/15** tests P9 de non-régression ; UI Chromium **390×844** et **1240×820**, 0 erreur JavaScript / 0 requête réseau lors des scénarios de comparaison. Safari physique pas encore testé.

## Outils

| Fichier | Fonction |
|---|---|
| `RetoucheCinema_P10_Annotateur_Consensus_iPhone.html` | Atelier P9 conservé + comparaison locale de deux exports JSON, suivi des conflits et export d'un constat d'écarts. |
| `p10_consensus_core.js` | Même logique de comparaison en JavaScript, sans serveur. |
| `p10_review.py` | Comparaison de deux annotations P9 indépendantes ; vérifie position, temps, visibilité et origine de fumée. |
| `p10_review_queue.py` | Prépare une file privée variée sur les 38 groupes anti-fuite à partir des audits P9. |
| `p10_motion_pretrain.py` | Entraîne l'autoencodeur CPU sur les mesures de flux optique P9 et évalue sur une séparation de groupes fixe. |

## Essayer sur iPhone

Ouvrir le HTML P10 dans Safari. Importer une vidéo autorisée puis l'annoter, et exporter le JSON P9. Faire annoter la même vidéo *indépendamment* une seconde fois (sans exposer le premier relevé), puis charger les deux JSON dans le comparateur P10. Examiner les écarts et produire un compte rendu d'arbitrage. **L'atelier ne fait ni upload ni inférence biométrique**.

## Reproduire les tests (sans données personnelles)

```sh
python -m unittest discover -s tests -p 'test_p10_review.py'
node --test tests/test_p10_core.cjs
```

L'entraînement optionnel exige des fichiers d'agrégats P9 et le manifeste privé de groupe, conservés séparément du pack public :

```sh
python p10_motion_pretrain.py --input-dir /chemin/audit_p9_PRIVE --split-manifest /chemin/manifest_v35_PRIVE.json --output-dir /sortie_privee --epochs 45
```

Installer PyTorch CPU, NumPy et scikit-learn pour cet entraînement ; aucun entraînement sur le corpus ne s'exécute automatiquement lorsqu'on ouvre la page iPhone.

## Contrôles de confidentialité et de fiabilité

- **Dépôt GitHub public :** uniquement code, tests génériques, documentation et exemples fictifs. Aucun original, extrait, nom réel de média, empreinte privée, horodatage personnel ou poids du modèle P10.
- **Archive privée séparée :** métadonnées de passages, modèle `.npz` (tableaux NumPy, sans code Python exécutable), audit, premier relevé non validé. Archive **non chiffrée** à ne pas partager.
- Les droits revendiqués par l'utilisateur ne constituent pas une vérification de majorité pour chaque personne. L'éligibilité des séquences réelles reste **non vérifiée** pour les modèles de gestuelle humains.
- Un accord entre annotateurs n'est pas une preuve d'identité, ni de physiquement correct, ni de qualité artistique.
- Aucune nouvelle vidéo IA et aucune pose originale 60 i/s produite par P10. Aucun changement de production.

