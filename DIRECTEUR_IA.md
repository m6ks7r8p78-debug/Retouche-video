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
- `directeur-rendu.js` (v0.6) : **adaptation réelle par image à l'export** du débruitage classique (facteur 0,78 à 1,10) et **protection des détails** : une zone nettement plus bruitée peut réduire jusqu'à 16 % l'accentuation de netteté, jamais l'augmenter. Les deux facteurs ont des transitions lissées ; aucune variation automatique des couleurs ni du contraste et aucun nouveau modèle ni passe GPU. Ne touche pas aux réglages persistants. Désactivé si profil/curseur manuel de bruit, traitement IA, montage complexe, analyse incertaine ou export de secours. Un compteur ne marque que les images réellement encodées.
- `directeur-export.js` (v0.7) : précontrôle de l'export classique avant allocation GPU (dimensions paysage/portrait, plafond WebGL disponible, estimation indicative de six surfaces RGBA, repli automatique Full HD/720p, conservation de la sélection 4K lorsqu'elle est compatible). Le codec reste vérifié par WebCodecs. Les exports vers X conservent leur profil séparé. Un 8K, même demandé par un réglage interne ou via « origine », n'est **pas** certifié par une simple estimation de mémoire : repli sûr tant que le profil vidéo, le chemin de rendu et un banc réel n'ont pas été validés.
- `directeur-capacites.js` : filtre les recommandations selon les capacités disponibles (WebGL, VideoDecoder/Encoder, AudioEncoder, modèle voix) et classe les traitements AR / visages / recadrage dans les fonctions déclenchées séparément.
- `tests/directeur-ia.test.mjs`, `tests/directeur-qualite.test.mjs`, `tests/directeur-scenes.test.mjs`, `tests/directeur-capacites.test.mjs`, `tests/directeur-rendu.test.mjs` : **77 tests unitaires réussis sur 77** dans GitHub Actions.
- Tests de non-régression existants : `tests/format.test.mjs`, **16 tests / 16 réussis**, exécutés sur la branche pour protéger le module de recadrage v8.0 de Claude.
- `tests/directeur-browser.test.mjs` : **8 tests Chromium réussis sur 8**, comprenant photo importée, analyse/export, profil manuel préservé, H.264/AAC et son conservé, transition clair/sombre, et **banc A/B sur une vidéo bruitée et propre** : 18 images décodées sur 90 ont été différentes entre adaptation et traitement global. La protection de netteté n'a pas agi sur ce média car l'écart de bruit mesuré était insuffisant : déclenchement prudent confirmé.
- `sw.js` : empreinte calculée sur le checkout GitHub complet par `tests/directeur-empreinte.mjs` puis vérifiée strictement dans GitHub Actions (**8 tests de cache hors ligne**). Recalculer après chaque modification des scripts.

## Prototype 8K hors navigateur (v0.8)

Un outil de secours autonome `outils/export-8k.mjs` encode une vidéo en **H.264 Level 6.2, résolution maximale 7680 × 4320**, en conservant le ratio portrait/paysage et la piste audio (AAC). Il opère sur des fichiers locaux, avec FFmpeg, sans conserver la vidéo entière en RAM et sans transférer de fichier sur Internet. Il peut être exécuté ultérieurement sur un environnement compatible FFmpeg (p. ex. une instance de calcul explicitement autorisée), pas depuis Safari seul. Son redimensionnement Lanczos ne recrée pas de détails perdus.

Un test GitHub Actions crée une vidéo de référence avec son, convertit une image vidéo en 8K, puis vérifie les dimensions et les pistes réelles avec FFprobe. **Ce prototype ne permet pas encore à l'application iPhone de lancer cet export ni de traiter une vidéo réelle longue.** Les coûts, codecs, autorisations d'un éventuel serveur et limites des traitements doivent être validés séparément.

## Prochain jalon 8K

Le code d'export actuel utilise un profil H.264/HEVC prévu pour la 4K, n'a pas de pipeline de rendu en tuiles 8K et ne garantit ni mémoire ni stabilité thermique sur iPhone. Le précontrôle v0.7 refuse donc toute sortie au-delà de 3840 px / 3840×2160 (tout en préservant l'orientation), et choisit un repli existant. **Cela ne correspond pas à un nouvel export 8K opérationnel.** Étape suivante : prototype autonome de profils codec 8K, validation encodeur et budget réel sur matériel compatible, tests de plusieurs durées, puis activation expérimentale après mesures visuelles.

## Laboratoire autonome à trois niveaux (v0.9)

1. **Exécution autonome** : le Directeur IA applique déjà des corrections locales prudentes selon les sondages, sans remplacer les réglages manuels.
2. **Amélioration par expérimentation** : `outils/directeur-laboratoire.cjs` crée 18 cas synthétiques d'entraînement et 18 cas distincts de validation. Il évalue 26 hypothèses de réglage sans réseau, mesure une erreur quadratique et refuse une dégradation supérieure à 5 % sur les familles plat / contour / texture. Aucun média personnel n'entre dans le laboratoire.
3. **Recherche expérimentale** : il explore des familles de lissage et des variantes de protection de contours, et priorise les faiblesses mesurées ; ses résultats sont seulement des **propositions à revoir**, jamais des changements automatiques de code ou de poids.

Les données réelles exigeraient des consentements **séparés** pour stockage et entraînement, un corpus licite, des partitions indépendantes et des tests perceptuels. Même avec consentement, cette voie n'est **pas raccordée** actuellement. Un progrès sur signal 1D synthétique ne prouve aucune amélioration de vraie photo ou vidéo. Le laboratoire est exécuté en CI sur la branche, sans déclencher de modifications de `main` ou de déploiement.

## Bibliothèque de recherche et priorisation (v1.0)

- `outils/catalogue_medias.py` : catalogue **privé** des médias de recherche (schéma `MEDIA_CATALOG_SCHEMA.md`),
  partition sans fuite par groupe de scène, autorisations séparées par finalité, import du catalogue ChatGPT.
  16 tests sur médias synthétiques (`tests/catalogue_medias_test.py`), exécutés en CI.
- `outils/directeur-priorites.cjs` : classe les modules par besoin mesuré ; `suivi/etat-modules.json` ne contient
  encore aucune qualité mesurée → recommandation actuelle : **mesurer les filtres AR en premier**. 7 tests.
- Banc multi-cas du vrai module de retrait de filtre AR en vidéo : `tests/banc_filtres_app.mjs` + `tests/labo_filtres/video_filtre_multi.py`,
  conversion `outils/banc_vers_etat.py` → `suivi/etat-modules.json` (normalisation : `BENCHMARK_PROTOCOL.md` §6.1).
  Résultat du 14 nov. : qualité 0,37, 62,5 % d'échecs (filtre chat non retiré) → priorité « améliorer le détecteur ».
- Protocole : `BENCHMARK_PROTOCOL.md` ; résultats réels : `BENCHMARK_RESULTS.md` ; transmission : `CHATGPT_CLAUDE_HANDOFF.md`.
- Outils hors application : pas de changement de `app.js`, `sw.js` ni de l'empreinte hors ligne.

## Délimitations importantes

Ce module constitue une **intégration progressive**, pas un nouveau réseau de neurones. Il ne prétend pas que les détails disparus ont été retrouvés, ne valide pas encore le réalisme perceptuel, et ne coordonne pas encore tous les traitements image par image : seuls le débruitage classique et une baisse prudente d'accentuation dans les zones bruitées peuvent varier. Son plan est un guide ; seule une partie de ses recommandations est reliée aux fonctions réellement présentes. Les traitements d'origine restent responsables de l'exécution. L'option « résolution » est une proposition et n'active aucun encodeur.

Depuis v0.6, si une zone montre une netteté locale élevée **et** une large dynamique de luminance, l'augmentation du débruitage et la réduction de netteté y sont ramenées à un quart de l'intervention prévue : mesure de prudence, **pas** preuve que le signal est une texture naturelle. Les zones disjointes, superposées, négatives ou incompatibles avec la durée connue désactivent l'adaptation au profit du traitement global. Ces règles n'ajoutent ni lecture d'image ni traitement lourd.

Un petit nombre d'échantillons ne permet pas de garantir une segmentation sémantique des scènes. La modulation du débruitage et de la netteté est expérimentale : elle doit être comparée à un rendu de référence sans adaptation, en particulier sur peaux, feuillages, motifs fins, textures naturelles, et plans courts. Une mesure de bruit élevée peut aussi provenir de textures légitimes. La qualité réelle, les limites thermiques et les codecs restent à valider sur Safari d'un iPhone physique.

## Vérifications avant fusion sur main

1. La syntaxe de `app.js` et des modules est vérifiée en CI ; 67 tests unitaires, 16 tests de non-régression du reformatage et 8 tests Chromium photo/vidéo ont réussi. Le dernier test encode réellement des images où l'intensité de débruitage varie selon le temps. Poursuivre la non-régression des autres fonctionnalités existantes, notamment filtres AR, restauration des visages, audio, réencadrement, export X et modèles lourds.
2. Lancer une photo nette, une photo bruitée, une vidéo compressée, une vidéo avec mouvement et une vidéo saine. Vérifier que les réglages manuels et les choix enregistrés prévalent, puis comparer avant/après.
3. Exécuter `node tests/sw.test.mjs --maj` **après les modifications** pour recalculer l'empreinte `H` dans `sw.js`, puis `node tests/sw.test.mjs`. Le numéro de cache a été passé de `retouche-v82` à `retouche-v83` et `directeur-ia.js` est ajouté au pré-cache. L'empreinte H a été recalculée sur un runner GitHub Actions qui contient tous les fichiers, puis enregistrée dans `sw.js`. Le workflow vérifie désormais cette empreinte sans la corriger silencieusement.
4. Tester sur un véritable iPhone Safari, notamment mise à jour hors ligne du service worker, absence d'échec de chargement et export avec son.
5. Le workflow `.github/workflows/directeur-ia.yml` vérifie la syntaxe, les 64 tests unitaires, les 16 tests de format v8.0, l'empreinte PWA en lecture seule et les 8 tests de parcours photo/vidéo dans Chrome. Les exécutions anciennes sont annulées lors d'un nouveau commit pour ne pas gaspiller les minutes CI. Reprendre les tests de non-régression étendus du dépôt.

## Prochaine tranche

Étendre prudemment l'adaptation temporelle à d'autres modules uniquement après des benchmarks perceptuels réels et des garde-fous contre le scintillement ; développer un contrôleur d'export conscient du coût, des replis et de la mémoire iPhone ; couvrir les moteurs optionnels RVV, RFV, SR et FMT seulement quand les mesures et consentements permettent un déclenchement justifié. Ne jamais inventer une capacité parce qu'un bouton existe.
