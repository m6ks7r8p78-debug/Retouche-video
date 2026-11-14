# Directeur IA global — branche expérimentale ChatGPT

## Ce qui fonctionne dans cette branche

- `directeur-ia.js` : planificateur JavaScript pur et déterministe. Il réutilise les mesures de `AZ.run` (vidéo) et `PHOTO.analyze` (photo), sans envoi réseau et sans nouveau modèle.
- Ordonne les corrections pertinentes : compression → bruit → poussière / stabilisation / scintillement → lumière → netteté → résolution éventuelle → audio → vérification / export.
- Écarte un traitement si le signal est faible, si le module est désactivé, si le traitement est explicitement exclu, ou si une reconstruction n'a pas été autorisée.
- Évite d'exagérer les détails si le bruit et la compression sont importants.
- Expose la limite 1920 px côté vidéo mobile en réglage automatique et 3840 px dans les autres cas ; n'active **pas** un export 8K absent.
- `app.js` appelle le Directeur dans le flux d'analyse de vidéo et photo ; `concilier` préserve les recommandations établies, tandis que `protegerNettete` limite la netteté excessive en présence d'artefacts clairement mesurés, sans écraser un profil manuel. Le plan est visible dans un volet facultatif « Directeur IA » (`index.html`), et ses propositions sont enregistrées dans la recette.
- `directeur-qualite.js` : comparateur technique avant/après sans fausse note de réalisme ; branché sur la vérification de l'export vidéo et sur des miniatures photo à mémoire bornée. Préserve les signaux contradictoires (ex. bruit réduit mais netteté effondrée).
- `directeur-scenes.js` : analyse les huit échantillons déjà prélevés par `AZ.run` ; identifie des zones temporelles de qualité sans deuxième décodage. Les frontières sont approximatives, ce ne sont pas des coupes de scène certifiées.
- `directeur-rendu.js` (v0.5) : **adaptation réelle par image à l'export** du débruitage classique (facteur 0,78 à 1,10) et **protection des détails** : une zone nettement plus bruitée peut réduire jusqu'à 16 % l'accentuation de netteté, jamais l'augmenter. Les deux facteurs ont des transitions lissées ; aucune variation automatique des couleurs ni du contraste et aucun nouveau modèle ni passe GPU. Ne touche pas aux réglages persistants. Désactivé si profil/curseur manuel de bruit, traitement IA, montage complexe, analyse incertaine ou export de secours. Un compteur ne marque que les images réellement encodées.
- `directeur-capacites.js` : filtre les recommandations selon les capacités disponibles (WebGL, VideoDecoder/Encoder, AudioEncoder, modèle voix) et classe les traitements AR / visages / recadrage dans les fonctions déclenchées séparément.
- `tests/directeur-ia.test.mjs`, `tests/directeur-qualite.test.mjs`, `tests/directeur-scenes.test.mjs`, `tests/directeur-capacites.test.mjs`, `tests/directeur-rendu.test.mjs` : **58 tests unitaires réussis sur 58** dans GitHub Actions.
- Tests de non-régression existants : `tests/format.test.mjs`, **16 tests / 16 réussis**, exécutés sur la branche pour protéger le module de recadrage v8.0 de Claude.
- `tests/directeur-browser.test.mjs` : **8 tests Chromium réussis sur 8**, comprenant photo importée, analyse et export photo, profil manuel préservé, vidéo H.264 + AAC synthétique, export à taille d'origine et audio préservé, transition noir/blanc détectée et **vidéo synthétique bruitée/propre prouvant l'utilisation effective de facteurs de débruitage différents durant l'export**.
- `sw.js` : empreinte calculée sur le checkout GitHub complet par `tests/directeur-empreinte.mjs` puis vérifiée strictement dans GitHub Actions (**8 tests de cache hors ligne**). Recalculer après chaque modification des scripts.

## Délimitations importantes

Ce module constitue une **intégration progressive**, pas un nouveau réseau de neurones. Il ne prétend pas que les détails disparus ont été retrouvés, ne valide pas encore le réalisme perceptuel, et ne coordonne pas encore tous les traitements image par image : seuls le débruitage classique et une baisse prudente d'accentuation dans les zones bruitées peuvent varier. Son plan est un guide ; seule une partie de ses recommandations est reliée aux fonctions réellement présentes. Les traitements d'origine restent responsables de l'exécution. L'option « résolution » est une proposition et n'active aucun encodeur.

Un petit nombre d'échantillons ne permet pas de garantir une segmentation sémantique des scènes. La modulation du débruitage et de la netteté est expérimentale : elle doit être comparée à un rendu de référence sans adaptation, en particulier sur peaux, feuillages, motifs fins, textures naturelles, et plans courts. Une mesure de bruit élevée peut aussi provenir de textures légitimes. La qualité réelle, les limites thermiques et les codecs restent à valider sur Safari d'un iPhone physique.

## Vérifications avant fusion sur main

1. La syntaxe de `app.js` et des modules est vérifiée en CI ; 58 tests unitaires, 16 tests de non-régression du reformatage et 8 tests Chromium photo/vidéo ont réussi. Le dernier test encode réellement des images où l'intensité de débruitage varie selon le temps. Poursuivre la non-régression des autres fonctionnalités existantes, notamment filtres AR, restauration des visages, audio, réencadrement, export X et modèles lourds.
2. Lancer une photo nette, une photo bruitée, une vidéo compressée, une vidéo avec mouvement et une vidéo saine. Vérifier que les réglages manuels et les choix enregistrés prévalent, puis comparer avant/après.
3. Exécuter `node tests/sw.test.mjs --maj` **après les modifications** pour recalculer l'empreinte `H` dans `sw.js`, puis `node tests/sw.test.mjs`. Le numéro de cache a été passé de `retouche-v80` à `retouche-v81` et `directeur-ia.js` est ajouté au pré-cache. L'empreinte H a été recalculée sur un runner GitHub Actions qui contient tous les fichiers, puis enregistrée dans `sw.js`. Le workflow vérifie désormais cette empreinte sans la corriger silencieusement.
4. Tester sur un véritable iPhone Safari, notamment mise à jour hors ligne du service worker, absence d'échec de chargement et export avec son.
5. Le workflow `.github/workflows/directeur-ia.yml` vérifie la syntaxe, les 58 tests unitaires, les 16 tests de format v8.0, l'empreinte PWA en lecture seule et les 8 tests de parcours photo/vidéo dans Chrome. Les exécutions anciennes sont annulées lors d'un nouveau commit pour ne pas gaspiller les minutes CI. Reprendre les tests de non-régression étendus du dépôt.

## Prochaine tranche

Étendre prudemment l'adaptation temporelle à d'autres modules uniquement après des benchmarks perceptuels réels et des garde-fous contre le scintillement ; développer un contrôleur d'export conscient du coût, des replis et de la mémoire iPhone ; couvrir les moteurs optionnels RVV, RFV, SR et FMT seulement quand les mesures et consentements permettent un déclenchement justifié. Ne jamais inventer une capacité parce qu'un bouton existe.
