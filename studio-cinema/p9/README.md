# Retouche Cinema AI P9 — Observatoire du geste
**Statut : atelier expérimental, hors production.**

## Objectif
Faire progresser la continuité anatomique, le regard, les lèvres, les joues, les mains, la cigarette et la fumée des personnages fictifs. Les événements sont annotés sur des intervalles ; plusieurs canaux peuvent évoluer simultanément.

## Livrables versionnés
- [annotateur_p9.html](./annotateur_p9.html) : application iPhone/ordinateur autonome, hors ligne. Import d'une vidéo locale, lecture lente et pas image, annotations temporelles/spatiales, annotations de sons, import facultatif d'une liste de fenêtres et export JSON de métadonnées uniquement.
- [p9_annotation_core.js](./p9_annotation_core.js) : validation, ontologie de 14 canaux et 12 phases, contrôle d'exhaustivité et avertissements de chronologie.
- [tests/test_p9_core.cjs](./tests/test_p9_core.cjs) : tests reproductibles avec Node.

## Bilan réel de recherche P9 (données privées, **NON incluses ici**)
- 157 fichiers du corpus original contrôlés par SHA-256 et décodage vidéo, 6 865,25 secondes au total, 3 paires de doublons exacts.
- 1 570 fenêtres d'activité sur toute la durée de chaque source, soit un **échantillonnage visuel parcellaire** et non un découpage intégral.
- 471 fenêtres candidates examinées plus finement (6 414 pas de mouvement) ; une partie à 5 Hz / 1,6 s, une autre à 8 Hz / 3 s, donc métriques non uniformes.
- 131 pistes audio traitées sur l'intégralité de leur durée à 8 kHz ; 26 vidéos sans audio.
- **Aucune inspiration/expiration, identité, âge ou action de fumer validée par les mesures automatiques.**
- **Aucun nouvel entraînement neuronal effectué en P9.**

## Utilisation
1. Ouvrir `annotateur_p9.html` hors ligne.
2. Importer localement une vidéo autorisée.
3. Examiner la totalité de l'action : main, poignet, doigts, filtre, lèvres, joues, regard, torse, expiration, fumée, sons. Placer des observations horodatées, y compris les événements simultanés.
4. Exporter le fichier JSON **en privé** : il contient le nom de la vidéo et les instants annotés ; il ne contient pas d'image ni de son.
5. Faire revoir les annotations par un second évaluateur ; aucun média n'est considéré « prêt pour entraînement » automatiquement.

## Confidentialité et limites
- **Aucune vidéo, image de personne, son, empreinte de fichier personnel, horodatage privé ou annotation sur les 157 médias n'est publié dans GitHub.**
- L'application n'utilise pas de serveur et n'effectue pas de `fetch` ni d'appel réseau. Les médias choisis restent dans le navigateur.
- La détection automatique de micro-mouvements et les analyses d'énergie audio sont de simples indices : elles n'identifient ni respiration ni actions complexes.
- L'export n'est pas chiffré ; protéger les annotations comme les vidéos privées.
- Safari physique iPhone non testé. Chromium, écran 390×844 et 1280×800, import local et export JSON testés sans erreur JS ou accès réseau.
- P9 ne génère pas un film photoréaliste ni des images originales à 45/60 fps. Rendu IA GPU, validation anatomique, et formation de modèles restent les étapes suivantes.

**Cette PR reste en brouillon ; aucun déploiement ou modification de `main`.**
