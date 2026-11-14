# Banc de mesure des masques AR vérifiés — laboratoire privé

Le module outils/directeur-banc-masques-verifies.cjs ne décode pas de média et n'entraîne aucun modèle. Il compare un candidat de segmentation à un témoin sur la même référence humaine contrôlée hors Git, à partir de comptes VP/FP/FN/VN anonymisés. La déclaration d'annotation est exigée mais n'est pas authentifiée par le code.

## Entrée
Un tableau de 1 à 10 000 enregistrements contenant EXCLUSIVEMENT :
- groupe : identifiant de scène opaque, sans nom ni chemin (1–24 lettres/chiffres/_/-)
- image : index non négatif dans la scène
- ensemble : validation ou test (jamais entraînement)
- annotationHumaineVerifiee : true après revue réelle par une personne
- candidat, temoin : objets avec vp, fp, fn, vn entiers, mesurés pixel à pixel contre le même masque de vérité terrain

Les deux traitements doivent partager les mêmes nombres de pixels positifs/négatifs de référence. Un groupe ne peut appartenir qu'à un ensemble et une image ne peut être réutilisée. Les masques, les images, les noms, empreintes, captures et chemins doivent rester privés.

## Sorties et limites
La fonction evaluerMasquesVerifies(entrees) produit précision, rappel, IoU, F1, taux de faux positifs par pixel, IoU macro par scène et différence de l'IoU micro face au témoin. Validation et test sont séparés. Un quotient de dénominateur nul vaut null, jamais « 100 % ».

La fonction bilanPublicMasques ne diffuse pas de scores pour moins de cinq scènes OU moins de cinquante images. Ce seuil de discrétion ne garantit pas l'anonymat des données.

Une amélioration d'IoU ne prouve ni la récupération des pixels d'origine occultés ni la qualité d'inpainting. Aucun masque réel annoté n'a encore été testé par ce module : les douze tests sont exclusivement synthétiques. Aucune promotion de modèle, activation automatique, publication de média, fusion dans main ou déploiement n'est autorisé.

Contrôle : node --test tests/directeur-banc-masques-verifies.test.mjs

## Étape expérimentale suivante
Générer localement les comptes anonymisés depuis des masques AR temporels effectivement vérifiés, sur scènes indépendantes; comparer le modèle candidat à une base classique, inspecter visuellement les erreurs. Les masques exploratoires ne deviennent jamais automatiquement de la vérité terrain. Ne transférer aucun média vers GitHub Actions.
