# Rapport expérimental — SmallMotion Device Budget

15 novembre 2026 · extension expérimentale de SmallMotion In-App, hors `main` et hors production.

## Objectif

Conserver le moteur JS local déjà prouvé dans la branche précédente et introduire des limites mesurables avant d'espérer faire tourner l'analyse de mouvement sur un iPhone physique. Le protocole de l'expérience ne transforme aucune image et n'identifie aucun objet.

## Modifications

- Calcul des durées de prélèvement vidéo (*lecture + attente + décodeur*), puis du moteur JS de correspondances locales ; elles restent distinctes.
- Seuils d'ergonomie, non calibrés sur iPhone : 80 ms pour signaler un CPU lent, 500 ms de traitement ou 6000 ms pour le prélèvement avant abstention.
- Repli local au prochain essai vers 128×96 au lieu de 160×120, si une latence est détectée. Les images trop petites pour une analyse prudente sont refusées.
- Contrôle des ressources qui supprime les candidats lorsque le budget est dépassé ; aucune modification d'export, aucun upload et aucune interprétation sémantique.
- Estimation explicite des seules allocations CPU JS (14 octets par pixel traité), sans la mémoire native, GPU ou la batterie. Les trois champs non mesurables sont `null`.
- Fichier HTML hors ligne permettant à l'utilisateur iPhone de mesurer et **exporter volontairement uniquement le diagnostic JSON**.

## Tests locaux exécutés dans cette session

- `node tests/test_resource_guard.cjs` : **25 vérifications** (budgets, états, abandon d'une preuve, mémoire non mesurable).
- `node tests/test_director_local.cjs` : **27 assertions** héritées (provenance, bornes, sortie prudente).
- `python tests/browser_check.py` : 2 formats simulés, import d'un vrai MP4 synthétique H.264 dans le Chromium disponible ; un résultat de mouvement local pour chaque cas, aucun HTTP ni erreur JS. Les essais suivants imposent artificiellement une lenteur pour vérifier 128×96, puis un dépassement de budget pour vérifier l'abstention.
- `python tests/test_safari_harness.py` : HTML autonome exécuté en Chromium aux deux formats, import local, zéro HTTP et export volontaire d'un JSON sans pixels.
- Tests historiques Python CameraGuard v4.3 + MultiMotion + DepthMotion + SmallMotion : **139/139 réussis** dans cette session.

Les fichiers `results/*.json` contiennent les mesures exactes exécutées (lorsqu'elles sont produites par le navigateur). **Les exemples de ralentissement et de dépassement sont des injections de politique de test, pas des performances matérielles réelles.**

## Contre-exemples et limites

- Le navigateur Chromium de GitHub peut ne pas décoder H.264 ; le banc autorise VP8 WebM **et consigne le codec effectivement décodé**, sans annoncer un test H.264 quand ce n'est pas le cas.
- Un faible support de texture et certaines parallaxes continuent à rendre les boîtes 2D incertaines.
- Un portrait très fin peut devenir inférieur à 64 pixels de large au profil 128×96 : **abstention prévue**.
- Les valeurs de batterie, température, RAM du décodeur et fluidité iPhone physique **restent inconnues**.
- Une observation sur deux images n'est pas une inférence temporelle fiable sur la totalité d'une vidéo, ni une preuve de préhension humaine.

## Conditions avant promotion

Audit Safari physique et de la stabilité après plusieurs essais consécutifs, validation des captures et du traitement des interruptions, contrôle de batterie et mémoire par instrumentation externe lorsque disponible, revues de confidentialité et tests sur contenus indépendamment annotés. Ne pas fusionner ou publier automatiquement.