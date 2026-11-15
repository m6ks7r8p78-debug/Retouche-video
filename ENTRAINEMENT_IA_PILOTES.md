# RetoucheProAI — protocole d'entraînement privé (laboratoire pilote)

> **Branche expérimentale uniquement.** Ce document décrit des expériences locales ; il n'active aucun modèle ni aucun traitement dans l'application.

## Séparation indispensable

1. **Évaluation** : modèles et vidéos peuvent être mesurés localement sans modifier les poids.
2. **Apprentissage sur vidéos privées** : exiger, pour chaque média, `autorisations.entrainement == "oui"` dans le catalogue privé, indépendamment des autres autorisations ; conserver les documents de consentement **hors Git**.
3. **Publication / partage** : interdit par défaut, même si l'entraînement privé est autorisé. Ne jamais joindre médias, vignettes, jeux de patches, images échantillonnées, catalogues identifiants, poids personnalisés ou chemins locaux aux commits, PR et GitHub Actions.
4. **Droits de tiers** : un accord de l'utilisateur sur ses copies n'établit pas nécessairement les droits de toutes les personnes filmées ou des auteurs d'œuvres ; aucune diffusion ni commercialisation sans vérification.
5. **Contrôle indépendant** : regrouper les fichiers par SHA, scène, transformations et empreintes perceptuelles avant séparation. Validation et test indépendants de l'entraînement ; pas de sélection itérative sur le lot de test final.

## Deux pilotes autonomes, hors application

### Débruitage CNN résiduel

- Échantillonner des frames de vidéos privées **en lecture seule** ; conserver les patchs en mémoire autant que possible.
- Ajouter un bruit synthétique à une version propre *au regard de la dégradation ajoutée*, sans supposer qu'elle est sans filtre AR.
- Apprendre une régression de l'image bruitée vers cette référence; mesurer PSNR et SSIM sur scènes séparées.
- Comparer à l'absence de traitement et à un flou standard; tester la préservation des détails.
- Un gain sur bruit synthétique ne prouve rien quant au bruit naturel, à la compression, à la peau ou à la restauration perceptuelle.

### Reconstruction de masques synthétiques

- Dessiner des occultations connues sur des trames locales et apprendre à prédire les pixels sous masque; conserver exactement les pixels hors masque.
- Évaluer sur scènes tenues à l'écart, avec un remplissage classique comme **OpenCV Telea**, et distinguer les résultats des vrais accessoires AR.
- Les pixels dissimulés par un filtre AR déjà présent dans le fichier ne constituent pas une vérité terrain : ne jamais prétendre les avoir retrouvés.
- **Ne pas promouvoir** ce modèle s'il ne dépasse pas l'algorithme classique et n'est pas validé sur des paires originales/filtrées authentifiées.

## Conditions avant toute intégration

- Jeux de références licites et annotés, masques temporels et provenance contrôlée.
- Mesures sur données de validation puis test final, aucune dégradation majeure hors masque, revue visuelle humaine, limites de mémoire et performances **réelles** iPhone Safari.
- Versionner seulement du **code générique** et des tests synthétiques ; garder les poids personnalisés privés.
- Ne pas modifier `main`, la PR brouillon #1 ou les travaux de Claude hors de la branche `chatgpt-ai-director-v01`. Pas de fusion, activation, déploiement ou publication automatique.

## État pilote (non publié comme modèle)

Des entraînements exploratoires locaux ont été effectués sur des images échantillonnées d'un corpus explicitement autorisé. Les mesures détaillées, les autorisations individuelles, les scripts exécutés, les poids et les journaux sont conservés en espace privé seulement. Aucun modèle nouveau n'est déclaré prêt à être intégré. Les prochains bancs doivent apporter de vraies annotations d'effets AR, des références et une validation sans fuite.
