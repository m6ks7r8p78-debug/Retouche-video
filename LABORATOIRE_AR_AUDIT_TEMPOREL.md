# Directeur IA — audit temporel des propositions AR et des zones reconstruites

**Laboratoire expérimental.** Le module `outils/directeur-audit-masques.cjs` traite seulement des nombres anonymisés. Il ne détecte ni ne reconstruit un média, n'ouvre aucun fichier et n'active aucune opération. Ses alertes demandent une revue humaine et **ne deviennent jamais des labels d'entraînement**.

## Expérience privée du 14 novembre 2026

- Images échantillonnées: **180**, extraites de dix vidéos privées autorisées, dont quatre séquences ciblées avec fleur et six séquences de contrôle.
- Masques proposés: **58** sur 72 images des quatre séquences ciblées, **0** sur 108 images de contrôle.
- Audit optique: **4 alertes de cohérence** sur les séquences ciblées, entre autres aux transitions où une proposition disparaît. L'IoU entre masques comparés est calculée après recalage par déplacement des centres : ce n'est **pas** une IoU avec la véritable segmentation de la fleur.
- Aperçus d'inpainting Telea: **10** sous contrôle de carte des pixels inventés, avec **aucun pixel changé en dehors de la carte**. Les bordures et les parties occultées peuvent être fausses ou incomplètes.
- Les images, leurs masques, journaux d'évaluation nominatifs et poids personnalisés restent **en dehors de GitHub**.
- La justesse des contours sur les vidéos réelles et le rappel sur l'ensemble de la bibliothèque restent inconnus : **zéro masque véritablement annoté et vérifié dans ce protocole**.

## Vérifications de sécurité

- Le contrôleur rejette les métadonnées contenant noms et chemins; il distingue signalements et vérités terrain.
- Les masques trop grands et les modifications hors zone bloquent toute candidature, même pour une revue.
- Une vérification humaine éventuelle n'autorise ni export automatique, ni publication, ni entraînement avec le pseudo-masque.
- Aucun changement à `app.js`, `sw.js`, aux poids ou au déploiement; `main` et la PR brouillon restent protégées.
- Le module Python de traitement des **pixels** et les expériences sur les vidéos restent privés; l'outil JS publié ne fait que contrôler leurs résultats agrégés.

## Suite technique

Créer des **masques temporels corrigés** sur des séquences indépendantes, avec révision manuelle d'échantillons. Calculer précision, rappel et IoU *par rapport à ces masques vérifiés*, comparer les reconstructions aux méthodes classiques, puis tester sur un véritable iPhone Safari avant toute activation. Sans références d'origine, toujours marquer la zone comme inventée.
