# RNE 0.9 — invariant de confiance du mouvement, sans déploiement

**14 novembre 2026 · Recherche expérimentale sur les 157 anciennes vidéos consenties.** Le moteur RNE 0.4 reste la référence expérimentale ; la PR #1 est conservée en brouillon, sans fusion et sans changement du site.

## Problème traité
Le sélecteur RNE 0.8 dispose de trop peu d'échecs graves distincts pour apprendre un bon détecteur de risques (5 cas sur 3 groupes pour l'entraînement historique et 4 cas sur un seul groupe pour l'audit historique). La stratégie RNE 0.9 ne prétend donc **pas** apprendre un tel détecteur.

Dans le moteur causal RNE 0.4, les images précédentes peuvent influer sur la correction ×2. Une carte de confiance de mouvement périmée, incohérente avec son image supposément alignée, pourrait laisser passer une correction inventée. La confiance calculée par le module `alignment()` est normalement **bornée par la correspondance photométrique** selon la règle `clip((30 − MAE_RGB×255)/22,0,1)`.

## Deux essais sur les vidéos historiques uniquement

**41 groupes de scènes historiques** ; un représentant déterministe par groupe ; deux entrées LR (propre, H.264) ; **82 observations normales** et **164 perturbations artificielles** (historique provenant d'une autre scène ou décalé de 12 pixels, tout en conservant volontairement d'anciennes cartes de confiance) ; **246 observations par méthode**. Le checkpoint RNE 0.4 était gelé. Les **41 vidéos reçues ultérieurement** n'ont été ni utilisées à l'entraînement ni utilisées ici à l'évaluation.

1. **Correction photométrique progressive** : améliore parfois la résolution des historiques erronés, mais crée des régressions sur des contextes normaux et sur les images décalées. **Rejetée** ; code conservé uniquement dans l'archive privée du laboratoire.
2. **Contrôle d'invariant + rejet complet** : si la confiance excède sa borne photométrique de plus de `0,05` sur plus de `1 %` des pixels, **tout le résultat neuronal du frame est remplacé par le bicubique**. Sinon le moteur n'est pas modifié. Aucune transformation du média, aucun entraînement de poids et aucun nouveau contenu inventé par le garde-fou.

| Mesure, sur ces seuls essais historiques artificiels | Garde-fou invariant |
|---|---:|
| Entrées normales préservées sans changement | **82/82** |
| Contextes temporels artificiellement contradictoires refusés | **164/164** |
| Cas sous −0,5 dB vs bicubique, sans garde-fou | **87** |
| Cas sous −0,5 dB vs bicubique, avec garde-fou | **0** |
| Effet moyen du refus sur les contextes corrompus | **+0,856 dB** face au RNE non protégé |
| Bootstrap exploratoire, par 41 groupes historiques, 95 % | **[+0,705 ; +1,047] dB** |

**Interprétation et limites :** les 164 erreurs sont **fabriquées pour violer l'invariant** ; la détection ne démontre donc ni capacité à détecter toutes les erreurs réelles ni sûreté vidéo générale. Le rejet force le bicubique, ce qui peut faire perdre des gains RNE éventuels sur des images pourtant améliorables. Les seuils `0,05` et `1 %` ont été choisis **après l'inspection d'un premier échec**, donc cette comparaison est **post hoc**. De plus RNE 0.4 avait déjà vu ces scènes historiques. Aucune identité faciale, récupération avant filtre AR, performance 4K/8K ou validation Safari iPhone n'est démontrée. Aucune image ni poids personnel n'est publié.

## Code et statut

- `outils/rne/rne09/confidence_invariant.py` : vérification purement générique, `manual_research_opt_in=False` par défaut, aucune exportation possible par ce module, retour au bicubique sans autoriser le déploiement.
- `tests/test_rne09_confidence_invariant.py` : **23 tests synthétiques réussis localement** ; scénarios de mauvais contexte, refus, innocuité des données sources, batching, entrées non finies, types et repli.
- Flux GitHub CPU étendu ; état distant à contrôler.
- **Archive privée RNE09** fournie au propriétaire : rapports par identifiants opaques, scripts, deux méthodes (dont la première rejetée), 45 tests synthétiques et bilan. Aucun média brut, image extraite, son ou poids neuronal. Le fichier reste hors dépôt GitHub.

## Décision
**Ne pas activer RNE 0.9 dans RetoucheProAI.** Son garde-fou rejoint seulement le laboratoire. Il faudra une validation sur **alignements naturellement défectueux**, vraies scènes nouvelles, coupes, compression et essais iPhone Safari, en gardant distincts l'entraînement et l'évaluation. Le bicubique reste le repli ; RNE 0.8 n'est pas davantage promu.
