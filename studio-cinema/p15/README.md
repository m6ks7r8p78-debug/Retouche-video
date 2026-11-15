# Retouche Cinema AI P15 — Comportements, attitudes et gestes superposés

**Prototype local, 15 novembre 2026 — aucun entraînement de modèle gestuel effectué dans P15.**

## Pourquoi ce changement
Les premiers modules P9–P14 ont audité les 157 fichiers sources et mesuré leur mouvement, les boîtes faciales et une partie de l'audio. Ils **n'ont pas automatiquement identifié** les mordillements de lèvres, les passages de langue, les ajustements subtils de regard, les contractions des joues ou les attitudes liées à une inspiration. Un algorithme de flux optique ne constitue pas une reconnaissance sémantique.

P15 ajoute une ontologie **multicanale et multi-étiquette** de 47 comportements observables appartenant à neuf familles : visage, lèvres et langue, joues, mains, objet, respiration, fumée, corps et son. Les événements peuvent se chevaucher ; aucune durée universelle de contact cigarette–lèvres ou de pause avant expiration n'est imposée.

### Exemples de micro-actions à distinguer
- Lèvre supérieure / inférieure mordillée, langue passant sur la lèvre supérieure / inférieure, langue visible, retrait de langue, contact et relâchement des lèvres, ouverture de mâchoire.
- Regard caméra ou ailleurs, déplacement des yeux, clignement, sourcil, mouvement subtil de tête et changement d'expression.
- Approche, retrait et maintien de main, doigts réajustant la cigarette, rotation de poignet, mouvement de coude.
- Contact avec le filtre, changement d'incandescence, fumée de la pointe versus fumée sortant de la bouche, diffusion de la fumée.
- Expansion thoracique **visible** versus inspiration ou expiration **audible** versus souffle **incertain**. Aucun son n'est une preuve de respiration sans contrôle supplémentaire.

## Contenu
- `behavior_ontology.js` : schéma, validation, contrôles de preuves, chevauchements temporels, revue indépendante A/B, couverture.
- `p15_annotateur_attitudes_iPhone.html` : interface autonome Safari/iPhone/Chromium, fichier vidéo importé localement ; temps début/fin, geste, preuve, relecteur, annotation, comparaison et export JSON privé **sans pixels ni sons**.
- `tests/test_behavior_ontology.cjs` : tests automatisés Node.
- `examples/video_fictive_test.mp4` : motifs animés synthétiques pour test de l'import, **aucune personne filmée**.
- `examples/annotations_fictives.json` : exemple fictif ; aucune vidéo personnelle.

## Statut scientifique
- **47 étiquettes définies, 0 étiquette vérifiée sur l'intégralité des 157 vidéos dans P15** ; les anciennes mesures P9–P14 ne changent pas de nature.
- La vidéo fictive de test ne montre aucun comportement humain ; les étiquettes fictives servent uniquement à tester l'outil et le schéma.
- Deux identifiants de revue A et B ne garantissent pas que deux personnes distinctes ont effectivement regardé la vidéo. La validation d'éligibilité à l'entraînement reste impossible dans le prototype.
- Aucun jugement sur « sensualité » n'est inféré à partir d'une personne réelle ; cela reste un choix de direction artistique pour un personnage fictif.
- Les données d'un média importé ne quittent pas le navigateur ; le JSON exporté inclut **le nom de fichier et les horaires**, donc il doit rester privé.
- Aucune image originale ni référence personnelle n'est incluse dans ce paquet public ou dans GitHub.

## Tests
Exécuter `node --test tests/test_behavior_ontology.cjs`. Vérifier également `node --check behavior_ontology.js` et la lecture hors ligne de `p15_annotateur_attitudes_iPhone.html`. Le navigateur vérifié en laboratoire est Chromium ; Safari iPhone physique reste non testé.

## Suite sans faux raccourcis
1. Faire annoter indépendamment des passages autorisés et clairement adultes, avec apparition des mouvements sur tout le corps et de plusieurs comportements simultanés.
2. Mesurer l'accord entre annotateurs et résoudre les ambiguïtés ; séparer les groupes de scènes et leurs doublons entre entraînement et test.
3. Exécuter un détecteur fiable de repères lèvres, langue et mains, enregistrer l'incertitude et les masques d'occlusion. Les mouvements de langue invisibles ne sont pas attribuables.
4. Entraîner un modèle temporel supervisé **seulement après** constitution de données fiables ; mesurer sa généralisation sur personnes/scènes distinctes.
5. Relier les mouvements validés à la génération de séquences cohérentes, sans prétendre qu'une sortie 60 fps interpolée comporte 60 poses générées distinctes par seconde.

**Branche de recherche uniquement. Ne pas fusionner ni déployer sans revue.**
