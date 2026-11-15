# Retouche Cinema AI P16 — Direction d'acteur et présence à l'écran

**Prototype autonome expérimental · 15 novembre 2026 · aucun déploiement**

## Pourquoi P16

P9–P14 ont analysé les 157 vidéos au niveau technique (fluidité, mouvement et audio), et P15 a défini 47 comportements observables, sans les annoter sur tout le corpus. **P16 ajoute une grammaire de direction artistique et un protocole de perception du spectateur**, pour éviter d'utiliser uniquement le même geste mécanique.

Un regard langoureux, un retour de regard, une posture dominante, une classe discrète et un sourire retenu peuvent être des choix de jeu précis. Le moteur sépare :

- **Ce qui est observé** : regard vers caméra, paupières détendues, lèvres souples, doigts qui s'ajustent, tête inclinée, etc. L'observation est horodatée manuellement.
- **Ce que souhaite le réalisateur** : sensualité, présence dominante, élégance, charme et mystère, chacune sur une échelle 0–5.
- **Ce que ressent un spectateur** : note subjective 0–5, conservée avec son relecteur, jamais assimilée à une intention intérieure de l'acteur ni à un effet universel.

## Fichiers

- `RetoucheCinema_P16_iPhone.html` : **interface hors ligne intégrale**. Mode **Diriger** : scène fictive adulte, cinq intensités, plan de jeu JSON et copie des instructions. Mode **Observer** : charger localement une vidéo autorisée, marquer un geste/repère pendant un intervalle, ajouter une appréciation subjective par évaluateur et exporter un JSON de métadonnées.
- `presence_director.js` : API JavaScript déterministe pour planifier, valider et comparer les observations.
- `tests/test_presence_director.cjs` : tests reproductibles.
- `examples/p16_plan_fictif.json` : plan synthétique de 12 secondes.
- `examples/p16_avis_fictifs.json` : exemple fictif de deux évaluateurs, sans vidéo personnelle.
- `examples/aperçu_P16_390.png` : capture de l'interface en test sur un format iPhone simulé.

## Ce qui est réellement réalisé

- Planification chronologique des phases de scène (dont geste main → objet → lèvres → inspiration → retrait → expiration pour la cigarette), avec **couches de jeu simultanées** : regard, posture, expression et précision des mains.
- Refus d'une génération dirigée avec personne non fictive ou statut adulte inconnu.
- Instructions détaillées **sans images ni vidéo générée**, sans prétendre produire 45/60 poses originales par seconde.
- Projet d'observation avec points et intervalles **uniquement saisis par l'humain** : aucun visage, aucune voix, aucune identité n'est détecté automatiquement par P16.
- Notes indépendantes A/B, écarts visibles et avertissement explicite que deux identifiants ne prouvent pas deux personnes indépendantes.
- Pas de téléversement, pas de stockage distant, export JSON sans médias. **Les noms de vidéos et horodatages peuvent être sensibles** ; conserver le JSON privé.

## Vérification locale

- **28/28 tests P16** et **21/21 tests P15** réussis (49 tests Node au total).
- Chromium système au format **390×844** et **1240×820**, page hors ligne injectée : création de plan, import vidéo entièrement fictive MP4, une annotation, deux notes par A/B, comparaison, export des deux JSON, **0 exception JavaScript / 0 requête HTTP(S)**.
- Les navigateurs WebKit/Safari **sur iPhone physique non testés**.

## Limites indispensables

- **0 nouvel entraînement neuronal effectué en P16.** Les 157 vidéos **n'ont pas été annotées individuellement** pour la sensualité, la domination, la classe ou d'autres impressions. P16 fournit un protocole pour le faire progressivement, sans inventer de labels.
- Les notes de spectateurs peuvent être corrélées à des éléments visuels, mais l'effet de séduction n'est ni universel, ni une vérité objective sur les intentions des personnes dans les originaux.
- Le modèle n'anime pas encore les personnages photoréalistes, n'enregistre aucun son ou respiration et n'installe pas de GPU. Les gestes scénarisés doivent être confrontés aux images originales avant toute revendication de réalisme.
- Ne pas publier les 157 vidéos, noms, voix, extractions, modèles privés ou notes relatives aux personnes réelles sur GitHub. Les images et les effets sont réservés aux personnages fictifs adultes et aux références autorisées.

## Prochain jalon P17

Faire annoter un lot de séquences réelles éligibles avec les cues visuels et le ressenti de plusieurs évaluateurs ; mesurer les désaccords, éviter les fuites de scènes entre les jeux train/validation/test, puis conditionner un véritable moteur de génération sur cette direction d'acteur, en évaluant micro-mouvements sur toute la scène et pas seulement sur le visage.

