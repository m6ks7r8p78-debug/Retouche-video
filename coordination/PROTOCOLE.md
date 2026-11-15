# Protocole de collaboration inter-conversations (v1)

## Objectif

Permettre à plusieurs conversations ChatGPT de coopérer **par lecture/écriture explicite d'artefacts GitHub**, sans leur attribuer des capacités imaginaires : aucun accès aux messages internes d'autres sessions, aucun message inter-chat instantané, aucune exécution autonome continue, aucune notification automatique sans mécanisme dédié.

## Cycle obligatoire à chaque reprise

1. Ouvrir la **branche exacte** `coordination-retoucheproai-v1`; lire `coordination/README.md` et `coordination/REGISTRE.json`.
2. Relire `REGISTRE_LIVRAISON_PERMANENT.md` depuis `main` lorsqu'un état de production ou de restauration est concerné.
3. Vérifier branche, dernier commit, PR et résultats CI actuels de son laboratoire. Le registre est un index, **pas une source de vérité instantanée**.
4. Identifier un périmètre de fichiers et ses dépendances avant modification. Si deux laboratoires touchent le même composant, créer un contrat d'interface et laisser une PR de coordination; ne pas écraser le travail concurrent.
5. Développer **réellement**, tester les résultats, distinguer tests unitaires, synthétiques, WebKit/Chromium et iPhone physique.
6. Laisser les preuves dans le travail du laboratoire: lien de PR, commit(s), commandes et résultats de test, limites, risques, prochaine étape.
7. Le coordinateur actualise le registre sur la branche de coordination **après vérification**, idéalement par une PR isolée.

## Branches et gouvernance

- `main` : pas de push, pas de merge, pas de publication, pas de modification de déploiement.
- `coordination-retoucheproai-v1` : documentation et index seulement; **aucun runtime** de l'application ni média privé.
- Chaque laboratoire : sa propre branche / PR; aucune branche n'est « possédée » exclusivement par une conversation qui pourrait être interrompue.
- Des PR de recherche restent **draft** tant que les essais adaptés n'ont pas été validés.
- Aucune fusion, aucun déploiement sur `retoucheproai.com`, aucun GitHub Pages de préproduction, aucun partage externe de médias sur simple présence dans l'index.
- Pas d'affirmation d'essai Safari physique à partir d'un simulateur, de WebKit Linux ou de Chromium.

## Format de relais conseillé

Créer **sur la branche du laboratoire**, dans sa PR, un fichier Markdown distinct et non conflictuel (ex. `research/<laboratoire>/relais-AAAA-MM-JJ-objet.md`) ou un commentaire PR :

```text
LABORATOIRE :
BRANCHE / PR / COMMIT :
OBJET :
FICHIERS CHANGÉS :
RÉSULTAT RÉEL :
TESTS EXÉCUTÉS (avec résultats) :
NON TESTÉ / REFUS / LIMITES :
CONSÉQUENCES POUR LES AUTRES LABORATOIRES :
BESOIN D'INTÉGRATION / BLOQUEUR :
PROCHAINE ACTION :
DONNÉES PRIVÉES PUBLIÉES : non
```

Pas d'édition concurrente du même fichier journal central. Les fichiers de relais sont **append-only par nouveau nom**. Le coordinateur lit les PR et intègre les découvertes dans l'index, sans réécrire leur preuve d'origine.

## Niveaux de preuve distincts

- `concept` : proposition, aucune preuve de fonctionnement.
- `code-present` : code réellement commité; pas de validation implicite.
- `unit-tested` : tests unitaires vérifiés sur une révision identifiée.
- `synthetic-tested` : mesure reproductible sur médias/données synthétiques.
- `real-authorized-tested` : médias réels autorisés, sans publication.
- `physical-iphone-tested` : essai physique iPhone avec observation explicite.
- `integrated-unverified` : branché à un parcours app, pas encore certifié.
- `production-verified` : revue, déploiement autorisé et preuve de fonctionnement réel.

Ne jamais transformer une preuve de niveau inférieur en preuve de niveau supérieur.

## Décisions inter-laboratoires

- Un module ne doit pas modifier automatiquement une vidéo si la confiance est non calibrée ou les garde-fous de fidélité échouent; diagnostic consultatif par défaut.
- Pour les visages, filtres AR, gestes et 3D : séparer ce qui est **observé** de ce qui est **inféré/reconstruit**; ne pas créer de fausses données de vérité terrain.
- Pour les exports : son conservé par défaut et refus explicite si conservation impossible (sauf choix utilisateur), cadence et colorimétrie évaluées.
- Ne pas fusionner des poids/médias privés dans une branche publique. La licence et l'autorisation d'entraînement ne valent pas permission de publication.
- Lors de limites d'encodeur/codec, chercher des alternatives légales, gratuites et reproductibles; indiquer clairement les compromis.

## Conflits et communication

GitHub peut signaler les changements entre branches; les conversations n'en reçoivent pas la notification en temps réel. Une session doit **vérifier GitHub** à chaque reprise et avant tout push. Toute décision irréversible ou susceptible de toucher la production nécessite une validation explicite de l'utilisateur. Les essais limités aux branches de labo et aux médias synthétiques peuvent se poursuivre sans reposer les questions déjà tranchées.

## Sécurité de l'index public

Le registre ne contient que des pointeurs GitHub, des catégories techniques, les noms des branches et des statuts vérifiés. Aucun nom de fichier privé, référence de personne, prompt secret, image, vidéo, audio, coordonnées ou information d'authentification n'y est conservé.
