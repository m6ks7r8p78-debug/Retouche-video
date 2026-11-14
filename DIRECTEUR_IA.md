# Directeur IA global — branche expérimentale ChatGPT

## Ce qui fonctionne dans cette branche

- \`directeur-ia.js\` : planificateur JavaScript pur et déterministe. Il réutilise les mesures de \`AZ.run\` (vidéo) et \`PHOTO.analyze\` (photo), sans envoi réseau et sans nouveau modèle.
- Ordonne les corrections pertinentes : compression → bruit → poussière / stabilisation / scintillement → lumière → netteté → résolution éventuelle → audio → vérification / export.
- Écarte un traitement si le signal est faible, si le module est désactivé, si le traitement est explicitement exclu, ou si une reconstruction n'a pas été autorisée.
- Évite d'exagérer les détails si le bruit et la compression sont importants.
- Expose la limite 1920 px côté vidéo mobile en réglage automatique et 3840 px dans les autres cas ; n'active **pas** un export 8K absent.
- \`app.js\` appelle le Directeur dans le flux d'analyse de vidéo et photo ; \`concilier\` borne certaines recommandations avant de les transmettre à l'ancien moteur. Le plan est visible dans un volet facultatif « Directeur IA » (\`index.html\`), et ses propositions sont enregistrées dans la recette.
- \`tests/directeur-ia.test.mjs\` : 15 scénarios de décision vérifiés en local avec Node.

## Délimitations importantes

Ce module constitue une **première intégration**, pas un nouveau réseau de neurones. Il ne prétend pas que les détails disparus ont été retrouvés, ne valide pas encore le réalisme perceptuel, et ne crée pas de pipeline par scène. Son plan est un guide ; seule une partie de ses recommandations est reliée aux fonctions réellement présentes. Les traitements d'origine restent responsables de l'exécution. L'option « résolution » est une proposition et n'active aucun encodeur.

Un plan global calculé sur plusieurs échantillons n'équivaut pas encore à une orchestration scène par scène. La qualité réelle de l'export, les limites thermiques et les codecs doivent être vérifiés sur Safari d'un iPhone physique.

## Vérifications avant fusion sur main

1. Exécuter \`node --test tests/directeur-ia.test.mjs\`, \`node --check app.js\` et les tests d'analyse/vidéo déjà existants.
2. Lancer une photo nette, une photo bruitée, une vidéo compressée, une vidéo avec mouvement et une vidéo saine. Vérifier que les réglages manuels et les choix enregistrés prévalent, puis comparer avant/après.
3. Exécuter \`node tests/sw.test.mjs --maj\` **après les modifications** pour recalculer l'empreinte \`H\` dans \`sw.js\`, puis \`node tests/sw.test.mjs\`. Le numéro de cache a été passé de \`retouche-v80\` à \`retouche-v81\` et \`directeur-ia.js\` est ajouté au pré-cache. **L'empreinte H n'a pas encore été recalculée dans le dépôt** (le connecteur ne donne pas accès aux octets complets de \`sr.bin\`). Ne pas fusionner avant ce contrôle.
4. Tester sur un véritable iPhone Safari, notamment mise à jour hors ligne du service worker, absence d'échec de chargement et export avec son.
5. Reprendre les tests de non-régression du dépôt. Le nouveau workflow GitHub (si disponible) peut calculer cette empreinte sur un runner disposant de tous les fichiers.

## Prochaine tranche

Créer une couche d'adaptateurs de capacités explicitement déclarées (RVV, RFV, SR, défiltrage, colorimétrie, audio, réencadrement FMT), des métriques de qualité avant/après, une logique par scène, et un contrôleur d'export capable de mesurer le coût de calcul, gérer les replis et documenter la provenance. Ne jamais inventer une capacité parce qu'un bouton existe.
