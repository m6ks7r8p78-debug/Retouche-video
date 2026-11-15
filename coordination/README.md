# Centre de coordination — RetoucheProAI

**Point d'entrée commun de toutes les conversations et laboratoires.** Ce dossier appartient à la branche `coordination-retoucheproai-v1`, distincte de la branche `main` et du site public. **Aucune application, expérience ou donnée privée n'est déployée par cette coordination.**

> Les conversations ChatGPT ne communiquent pas entre elles en temps réel. Ce centre est un **tableau d'échanges asynchrone** via GitHub, que chaque conversation doit relire volontairement au démarrage de sa session. Une nouvelle version n'est pas automatiquement poussée dans les autres chats.

## Commencer ici (dans chaque conversation, une seule consigne initiale)

1. Lire ce `README.md` sur la **branche de coordination**.
2. Lire [PROTOCOLE.md](./PROTOCOLE.md), puis [REGISTRE.json](./REGISTRE.json).
3. Identifier son laboratoire, sa branche de travail, ses dépendances, l'état de sa PR et les fichiers déjà modifiés.
4. **Vérifier l'état réel avec GitHub et les tests**, plutôt que supposer les statuts du registre à jour.
5. Travailler sur la branche **du laboratoire**, jamais directement sur `main` et jamais sur la branche de coordination pour des changements fonctionnels.
6. Publier les preuves dans une PR / un compte-rendu de laboratoire **sans média privé** ; proposer un relais au coordinateur, qui mettra seul à jour le registre central.
7. Au prochain échange, relire le registre et les PR concernées avant de poursuivre.

**Message unique à transmettre aux autres conversations :** [RELAIS_UNIVERSEL.md](./RELAIS_UNIVERSEL.md).

## Où est la vérité ?

| Objet | Référence |
| --- | --- |
| Logiciel public / historique | `main` et `REGISTRE_LIVRAISON_PERMANENT.md` de `main` |
| Index inter-laboratoires (snapshot) | `coordination/REGISTRE.json` sur `coordination-retoucheproai-v1` |
| Règles de collaboration | `coordination/PROTOCOLE.md` sur `coordination-retoucheproai-v1` |
| Preuve technique / historique | Code réel, commits, PR, suites de tests et journaux CI |
| Travail en cours | Branches et PR propres à chaque laboratoire |
| Média / poids personnels | **Exclus du dépôt public et des registres** |

Le registre contient des pointeurs et des statuts **vérifiés à une date donnée**, pas des validations implicites de fonctionnalités. Un statut `branch-observed` ou `draft-pr-observed` ne signifie **pas** « testé », « fusionné », « déployé » ou « opérationnel sur iPhone ».

## Découpage des équipes

- **NOVA** : export vidéo local, diagnostics Safari iPhone, vidéo/son, sûreté des codecs.
- **SmallMotion** : mouvement local consultatif, ressources, PWA, résilience.
- **Cinema P20/P21** : données de posture/gestes, comparaison aux séquences 60 Hz, couches temporelles.
- **3D / caméra** : profondeur, caméra, reconstruction expérimentale et preuves.
- **Directeur IA** : orchestration, arbitrage fidélité/reconstruction, qualité.
- **AURA / Design** : interface simple et futuriste, accessibilité, contrôle utilisateur.
- **Restauration** : visages, filtres AR, couleurs et restauration naturelle.
- **Export X / média** : profils d'export, adaptation aux plateformes, sauvegarde manuelle.

Ces divisions sont **des spécialisations de travail**, non des agents autonomes permanents ou des droits d'accès distincts.

## Règle d'intégration

Aucune équipe ne promet d'intégration ou de fusion du seul fait qu'un résultat existe dans une autre PR. La procédure est : découverte → comparaison de compatibilité/licence → tests reproductibles → vérification sur média de test autorisé → validation explicite → PR d'intégration séparée.

Si le code d'une autre équipe change pendant le travail, **relecture de l'état GitHub avant écriture**. Préférer les fichiers isolés et les propositions de contrats d'interface aux réécritures concurrentes.

## Notes de confidentialité

Le dépôt `Retouche-video` est **public**. Ne jamais y ajouter médias personnels, captures issues des vidéos, métadonnées permettant d'identifier des personnes, clés, secrets, poids issus d'entraînements privés, journaux de fichiers locaux ou URL privées. Toute proposition utilisant un dépôt privé doit être vérifiée séparément et ne doit jamais être copiée automatiquement ici.
