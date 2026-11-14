# Directeur IA global — branche expérimentale ChatGPT

## Ce qui fonctionne dans cette branche

- `directeur-ia.js` : planificateur JavaScript pur et déterministe. Il réutilise les mesures de `AZ.run` (vidéo) et `PHOTO.analyze` (photo), sans envoi réseau et sans nouveau modèle.
- Ordonne les corrections pertinentes : compression → bruit → poussière / stabilisation / scintillement → lumière → netteté → résolution éventuelle → audio → vérification / export.
- Écarte un traitement si le signal est faible, si le module est désactivé, si le traitement est explicitement exclu, ou si une reconstruction n'a pas été autorisée.
- Évite d'exagérer les détails si le bruit et la compression sont importants.
- Expose la limite 1920 px côté vidéo mobile en réglage automatique et 3840 px dans les autres cas ; n'active **pas** un export 8K absent.
- `app.js` appelle le Directeur dans le flux d'analyse de vidéo et photo ; `concilier` préserve les recommandations établies, tandis que `protegerNettete` limite la netteté excessive en présence d'artefacts clairement mesurés, sans écraser un profil manuel. Le plan est visible dans un volet facultatif « Directeur IA » (`index.html`), et ses propositions sont enregistrées dans la recette.
- `directeur-qualite.js` : comparateur technique avant/après sans fausse note de réalisme ; branché sur la vérification de l'export vidéo et sur des miniatures photo à mémoire bornée. Préserve les signaux contradictoires (ex. bruit réduit mais netteté effondrée).
- `directeur-scenes.js` : analyse, sans deuxième décodage, les huit échantillons déjà prélevés par `AZ.run` ; identifie des zones temporelles aux défauts différents (lumière, bruit, netteté). Ce ne sont pas des coupes de scène certifiées, les frontières sont approximatives ; l'export n'applique pas encore des réglages différents par zone.
- `directeur-capacites.js` : filtre les recommandations selon les capacités disponibles (WebGL, VideoDecoder/Encoder, AudioEncoder, modèle voix) et classe les traitements AR / visages / recadrage dans les fonctions déclenchées séparément.
- `tests/directeur-ia.test.mjs`, `tests/directeur-qualite.test.mjs`, `tests/directeur-scenes.test.mjs`, `tests/directeur-capacites.test.mjs` : **47 tests unitaires réussis sur 47** dans GitHub Actions.
- Tests de non-régression existants : `tests/format.test.mjs`, **16 tests / 16 réussis**, exécutés sur la branche pour protéger le module de recadrage v8.0 de Claude.
- `tests/directeur-browser.test.mjs` : **6 tests Chromium réussis sur 6**, comprenant photo importée, analyse et export photo, profil manuel préservé, vidéo H.264 + AAC synthétique, export à taille d'origine, piste audio vérifiée par `ffprobe`, et absence d'erreur JavaScript non gérée.
- `sw.js` : empreinte `043617af6a5e2509` vérifiée sur un checkout GitHub complet (**8/8 tests hors ligne**).

## Délimitations importantes

Ce module constitue une **première intégration**, pas un nouveau réseau de neurones. Il ne prétend pas que les détails disparus ont été retrouvés, ne valide pas encore le réalisme perceptuel, et ne crée pas de traitement/export adapté image par image selon les scènes. Son plan est un guide ; seule une partie de ses recommandations est reliée aux fonctions réellement présentes. Les traitements d'origine restent responsables de l'exécution. L'option « résolution » est une proposition et n'active aucun encodeur.

Un plan global calculé sur plusieurs échantillons n'équivaut pas encore à une orchestration scène par scène. La qualité réelle de l'export, les limites thermiques et les codecs doivent être vérifiés sur Safari d'un iPhone physique.

## Vérifications avant fusion sur main

1. La syntaxe de `app.js` et des modules est vérifiée en CI ; 47 tests unitaires, 16 tests du reformatage et 6 tests Chromium photo/vidéo ont réussi. Un test additionnel de variation réelle de lumière dans la vidéo est en cours de validation. Poursuivre la non-régression des autres fonctionnalités existantes, notamment filtres AR, restauration des visages, audio, réencadrement, export X et modèles lourds.
2. Lancer une photo nette, une photo bruitée, une vidéo compressée, une vidéo avec mouvement et une vidéo saine. Vérifier que les réglages manuels et les choix enregistrés prévalent, puis comparer avant/après.
3. Exécuter `node tests/sw.test.mjs --maj` **après les modifications** pour recalculer l'empreinte `H` dans `sw.js`, puis `node tests/sw.test.mjs`. Le numéro de cache a été passé de `retouche-v80` à `retouche-v81` et `directeur-ia.js` est ajouté au pré-cache. L'empreinte H a été recalculée sur un runner GitHub Actions qui contient tous les fichiers, puis enregistrée dans `sw.js`. Le workflow vérifie désormais cette empreinte sans la corriger silencieusement.
4. Tester sur un véritable iPhone Safari, notamment mise à jour hors ligne du service worker, absence d'échec de chargement et export avec son.
5. Le workflow `.github/workflows/directeur-ia.yml` vérifie la syntaxe, les 47 tests unitaires, les 16 tests de format v8.0, l'empreinte PWA en lecture seule et le parcours photo/vidéo dans Chrome. Les exécutions anciennes sont annulées lors d'un nouveau commit pour ne pas gaspiller les minutes CI. Reprendre les tests de non-régression étendus du dépôt.

## Prochaine tranche

Passer du registre de capacités et du diagnostic temporel à une véritable orchestration séquentielle vérifiée, sans surtraiter le naturel ; développer un contrôleur d'export conscient du coût, des replis et de la mémoire iPhone ; couvrir les moteurs optionnels RVV, RFV, SR et FMT seulement quand les mesures et consentements permettent un déclenchement justifié. Ne jamais inventer une capacité parce qu'un bouton existe.
