# Directeur IA global — branche expérimentale ChatGPT

## Ce qui fonctionne dans cette branche

- `directeur-ia.js` : planificateur JavaScript pur et déterministe. Il réutilise les mesures de `AZ.run` (vidéo) et `PHOTO.analyze` (photo), sans envoi réseau et sans nouveau modèle.
- Ordonne les corrections pertinentes : compression → bruit → poussière / stabilisation / scintillement → lumière → netteté → résolution éventuelle → audio → vérification / export.
- Écarte un traitement si le signal est faible, si le module est désactivé, si le traitement est explicitement exclu, ou si une reconstruction n'a pas été autorisée.
- Évite d'exagérer les détails si le bruit et la compression sont importants.
- Expose la limite 1920 px côté vidéo mobile en réglage automatique et 3840 px dans les autres cas ; n'active **pas** un export 8K absent.
- `app.js` appelle le Directeur dans le flux d'analyse de vidéo et photo ; `concilier` préserve les recommandations établies, tandis que `protegerNettete` limite la netteté excessive en présence d'artefacts clairement mesurés, sans écraser un profil manuel. Le plan est visible dans un volet facultatif « Directeur IA » (`index.html`), et ses propositions sont enregistrées dans la recette.
- `directeur-qualite.js` : comparateur technique avant/après sans fausse note de réalisme ; branché sur la vérification de l'export vidéo et sur des miniatures photo à mémoire bornée. Préserve les signaux contradictoires (ex. bruit réduit mais netteté effondrée).
- `tests/directeur-ia.test.mjs` et `tests/directeur-qualite.test.mjs` : **28 tests unitaires réussis sur 28** dans GitHub Actions.
- `tests/directeur-browser.test.mjs` : **6 tests Chromium réussis sur 6**, comprenant photo importée, analyse et export photo, profil manuel préservé, vidéo H.264 + AAC synthétique, export à taille d'origine, piste audio vérifiée par `ffprobe`, et absence d'erreur JavaScript non gérée.
- `sw.js` : empreinte `8876fc9c31893589` vérifiée sur un checkout GitHub complet (**8/8 tests hors ligne**).

## Délimitations importantes

Ce module constitue une **première intégration**, pas un nouveau réseau de neurones. Il ne prétend pas que les détails disparus ont été retrouvés, ne valide pas encore le réalisme perceptuel, et ne crée pas de pipeline par scène. Son plan est un guide ; seule une partie de ses recommandations est reliée aux fonctions réellement présentes. Les traitements d'origine restent responsables de l'exécution. L'option « résolution » est une proposition et n'active aucun encodeur.

Un plan global calculé sur plusieurs échantillons n'équivaut pas encore à une orchestration scène par scène. La qualité réelle de l'export, les limites thermiques et les codecs doivent être vérifiés sur Safari d'un iPhone physique.

## Vérifications avant fusion sur main

1. La syntaxe de `app.js` et des modules est vérifiée en CI ; 28 tests unitaires et 6 tests Chromium photo/vidéo ont réussi. Poursuivre la non-régression des autres fonctionnalités existantes, notamment filtres AR, restauration des visages, audio, réencadrement, export X et modèles lourds.
2. Lancer une photo nette, une photo bruitée, une vidéo compressée, une vidéo avec mouvement et une vidéo saine. Vérifier que les réglages manuels et les choix enregistrés prévalent, puis comparer avant/après.
3. Exécuter `node tests/sw.test.mjs --maj` **après les modifications** pour recalculer l'empreinte `H` dans `sw.js`, puis `node tests/sw.test.mjs`. Le numéro de cache a été passé de `retouche-v80` à `retouche-v81` et `directeur-ia.js` est ajouté au pré-cache. L'empreinte H a été recalculée sur un runner GitHub Actions qui contient tous les fichiers, puis enregistrée dans `sw.js`. Le workflow vérifie désormais cette empreinte sans la corriger silencieusement.
4. Tester sur un véritable iPhone Safari, notamment mise à jour hors ligne du service worker, absence d'échec de chargement et export avec son.
5. Le workflow `.github/workflows/directeur-ia.yml` vérifie la syntaxe, les 28 tests unitaires, l'empreinte PWA en lecture seule et le parcours photo/vidéo dans Chrome. Reprendre les tests de non-régression étendus du dépôt.

## Prochaine tranche

Créer une couche d'adaptateurs de capacités explicitement déclarées (RVV, RFV, SR, défiltrage, colorimétrie, audio, réencadrement FMT), des métriques de qualité avant/après, une logique par scène, et un contrôleur d'export capable de mesurer le coût de calcul, gérer les replis et documenter la provenance. Ne jamais inventer une capacité parce qu'un bouton existe.
