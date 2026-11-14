# Laboratoire du Directeur IA — spécialiste du bruit fort (14 novembre 2026)

## Expérience privée constatée
- Ancien débruiteur déjà préentraîné sur les 157 vidéos privées ; aucun nouveau départ à zéro.
- Ajustement supplémentaire expérimental : 8 vidéos et 24 trames de huit scènes distinctes ; 220 étapes ; validation sur 4 vidéos et 12 trames indépendantes du nouvel ajustement.
- Contrôle individuel de consentement local (analyse, benchmark, entraînement privés autorisés, publication interdite) et SHA-256 avant usage ; aucun média, poids, trame ou empreinte individuelle dans GitHub.
- Bruit gaussien **artificiellement ajouté** aux images déjà encodées. Aucune preuve de débruitage de captations naturelles.

## Comparaison ancienne IA vs nouvel ajustement
Sur 12 trames de validation (quatre scènes), variation moyenne de PSNR :
| σ | nouveau - ancien (dB) |
|---|---:|
| 0 (source non altérée artificiellement) | -2,524 |
| 0,02 | -2,236 |
| 0,04 | -1,599 |
| 0,06 | -0,807 |
| 0,10 | +0,926 |
| 0,14 | +2,309 |

**Conclusion : rejet du remplacement universel**, parce que le nouveau modèle dégrade trop les scènes saines ou faiblement bruitées.

## Confirmation indépendante du nouvel ajustement
Quatre autres vidéos, douze trames, groupes disjoints. Avec un aiguillage **oracle** utilisant l'intensité réellement injectée :
- σ 0,10 : gain +1,428 dB ; pire image +0,946 dB.
- σ 0,14 : gain +3,166 dB ; pire image +2,726 dB.
- Sous σ 0,085 : le routage conserve la référence, sans prétendre que le spécialiste est meilleur.

Ces quatre scènes ne figurent pas dans le nouvel ajustement ; toutefois le **modèle initial** a été préentraîné sur le corpus complet, si bien que ce test n'est pas un test vierge d'apprentissage historique. Le routage connaît ici la dégradation parce qu'elle est simulée : aucun classificateur réel n'a encore démontré cette décision.

## Code versionné
`outils/directeur-specialistes-bruit.cjs` propose une décision de **revue en laboratoire seulement**, à partir de données anonymisées : refuse sources incertaines, manque d'autorisation, réglage manuel prioritaire, bruit faible ou inconnu, compression/JPEG/AR, confiance insuffisante et modèles non validés. Il n'accède pas aux vidéos et ne peut ni appliquer, entraîner, publier ou déployer. `tests/directeur-specialistes-bruit.test.mjs` fournit 13 tests synthétiques.

**Prochaine étape :** banc sur bruit naturel, compression, stabilité temporelle, tissus/visages, classification de type et sigma sans oracle, coûts iPhone Safari, et données hors domaine. Toute décision d'intégration reste séparée et supervisée. Les poids du modèle ajusté et la reproductibilité détaillée restent dans une archive privée ChatGPT et ne sont pas commités.
