# Relais inter-laboratoires RetoucheProAI — 15 novembre 2026 (v2)

**Nature :** photographie de coordination GitHub à la date indiquée, sans modification du runtime.
**Sources de gouvernance :** [README](../README.md), [PROTOCOLE](../PROTOCOLE.md), [REGISTRE](../REGISTRE.json), [PR de coordination #34](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/34).
**Source production distincte :** [registre permanent de `main`](https://github.com/m6ks7r8p78-debug/Retouche-video/blob/main/REGISTRE_LIVRAISON_PERMANENT.md), tableau de bord v8.3 au 15/11/2026.
**Statut :** propositions de relais pour le coordinateur ; **ne met pas à jour** le registre central, ne certifie aucune intégration.
**Confidentialité :** informations de PR/CI publiques uniquement ; aucun média, extrait, nom de fichier privé, métadonnée privée, poids ou secret.

## État réellement observé

| Laboratoire | Dernière source vérifiée | Preuve actuelle et limites |
| --- | --- | --- |
| Directeur IA | [#1](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/1), `79439a5` | PR brouillon ouverte ; adaptation classique par scène décrite et banc A/B ; pas d'orchestrateur final, ni validation Safari physique. |
| NOVA export | [#3](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/3), `ac629321` | PR brouillon ouverte, workflow NOVA du HEAD **success** ; export et contrôles encore à distinguer d'une preuve de fidélité sur vidéo réelle. |
| NOVA + SmallMotion | [#35](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/35) | Pont consultatif local basé sur deux images, sans décision d'édition automatique ni identification sémantique. |
| NOVA HTTPS / iPhone | [#38](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/38) | Mires synthétiques et ZIP HTTPS. Lecture vidéo+son synthétiques observée par le propriétaire sur iPhone ; cette observation ne certifie **pas** l'import/l'export d'une vraie vidéo. |
| Précontrôle vidéo réelle NOVA | [#42](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/42), `982b0d5` | PR brouillon ouverte ; workflow du HEAD **success**. Précontrôle HEVC/AAC en lecture seule, pas une validation d'export. Un cas rapporté anonymement dans #42 classe l'entrée en `hevc-profile-or-timeline-incompatible`, avec `readyForExportAttempt:false` et audio `not-tested`. La sous-cause (profil HEVC, SPS ou PTS/DTS, limite mémoire/appareil) n'est **pas identifiée** ; tests synthétiques discriminants et voie de secours fidèle restent nécessaires. Pas de « succès » simulé. |
| SmallMotion / préproduction | [#28](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/28) | Pont au véritable éditeur et contrôles synthétiques ; production non modifiée. |
| Fidélité audio/vidéo | [#36](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/36) → [#40](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/40) → [#44](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/44), `8a1abc2` | PR brouillon #44, **8 workflows success** au HEAD. Correctif pour carte de contrôle MP4 absente dans un aperçu iPhone ; la nouvelle version attend un **nouvel essai physique**, et l'audit de métadonnées ne prouve pas l'absence de décalage audio audible. |
| Cinema P21–P27 | [#33](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/33) → [#41](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/41) → [#43](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/43) → [#45](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/45), `6ce1677` | P25 : 188/188 tests rapportés, P26 : 213/213 rapportés. P27 : avertissements consultatifs issus d'encodages **synthétiques** ; workflow du HEAD **success**, [GitHub Actions #43718924871](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43718924871), **251/251 tests réussis** d'après le relais P27. Cela ne valide ni qualité visuelle humaine ni Safari iPhone. Ni recommandation automatique de CRF, ni preuve d'un film photoréaliste ou de qualité iPhone. |
| Recherche caméra 3D | [#11](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/11) et descendants | CameraGuard v4.3 : démonstration sur pixels synthétiques ; profondeur, parallaxe et gestes réels ne sont pas déduits avec certitude. |
| Studio 3D | [#2](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/2), `ee543bb` | Studio v1.9 de personnages adultes **fictifs stylisés**, avec GLB et animations ; pas une reconstruction photoréaliste de personnes ni un entraînement sur les vidéos personnelles. |
| AURA | [#31](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/31), `43b90ee` | Façade AURA expérimentalement remplaçable, studio natif préservé ; ne pas intégrer les maquettes explicitement rejetées, et ne pas déployer sans acceptation. |
| Application publique | [registre v8.3](https://github.com/m6ks7r8p78-debug/Retouche-video/blob/main/REGISTRE_LIVRAISON_PERMANENT.md) | F34 « Fidélité d'abord » intégré/mesuré sur médias de test libres, **non validé physiquement sur iPhone** ; la présence sur `main` n'est pas la preuve que les laboratoires ci-dessus y sont intégrés. |

Les SHA sont des identifiants de révision observés lors de ce relevé. Toute équipe doit relire GitHub pour connaître le HEAD actuel. La source de vérité est le code, la CI et l'essai adapté, non ce résumé.

## Signal CI distinct des prévisualisations Cloudflare

Les workflows GitHub du HEAD des PR NOVA #3/#42 et SmallMotion #44 sont au vert, mais des commentaires de déploiement Cloudflare sur ces PR signalent des **builds preview échoués**. Ces statuts portent sur des systèmes de vérification différents : une CI synthétique réussie ne prouve **pas** que la prévisualisation HTTPS correspond au HEAD ni qu'elle est testable sur iPhone. Aucun déploiement n'est déclenché par ce rapport.

## Contrats de relais proposés (aucune intégration implicite)

1. **NOVA #42 → NOVA #3 / Directeur IA #1 / AURA #31 :** séparer `unsupported`, `unverified` et `unsafe`. Si un précontrôle échoue, produire un diagnostic local compréhensible ; rechercher un repli reproductible et fidèle sans contourner aveuglément une impossibilité de préserver audio, cadence ou couleur. Le parcours iPhone doit permettre l'import local et le contrôle explicite.
2. **SmallMotion #44 → NOVA #3 :** réutiliser seulement le contrat consultatif de métadonnées MP4 pour comparer original/export et signaler un écart ; ne pas l'annoncer comme certification de pixels ou d'AAC. La nouvelle carte de contrôle doit être testée sur le site d'essai réellement mis à jour et sur Safari physique.
3. **Cinema #45 → Directeur IA / Export X :** résultats de recompression H.264 uniquement synthétiques ; présenter les variations d'erreur de pixel et de durée audio comme avertissements, jamais comme choix de CRF automatiquement optimisé pour X.
4. **AURA #31 → NOVA #3 :** intégrer seulement après contrat de navigation, transfert local de fichier et retour d'état ; conserver l'interface approuvée et les vrais moteurs du studio, avec une seule action principale pour le grand public.
5. **3D #11 / Studio #2 → Cinema et Directeur :** distinguer poses observées, trajectoires commandées, reconstruction conjecturale et animation fictive ; interdire d'appeler ces éléments une vérité terrain. Aucun artefact privé dans une PR publique.
6. **Coordination #34 → chaque laboratoire :** exiger dans la prochaine PR un relais daté, SHA, liens CI, niveau de preuve, risque, prochaine action et frontière de fichiers. Le coordinateur seul revalide et met à jour `REGISTRE.json`.

## Prochaines vérifications prioritaires

- Confirmer sur iPhone physique que le parcours NOVA importe un vrai média, distingue erreur de lecture/codec de la fidélité d'export, et conserve image, cadence, colorimétrie et piste sonore avant toute promotion.
- Vérifier l'affichage effectif de la carte d'audit MP4 issue de #44 sur une **nouvelle** archive de test, et relever sa version sans exposer le média.
- CI P27 #45 maintenant **réussie au même HEAD** ; ne promouvoir son niveau de preuve qu'à « synthétique + contrat consultatif », jamais à une qualité iPhone certifiée.
- Préparer la revue d'intégration AURA ↔ studio natif et Directeur ↔ NOVA en **PR séparées** avec tests de compatibilité.
- Maintenir `main`, `retoucheproai.com`, les médias privés et toutes les branches labo inchangés. Aucune fusion ni publication automatique.

## Mode opératoire pour chaque autre conversation

Lire [RELAIS_UNIVERSEL](../RELAIS_UNIVERSEL.md), le registre et ce relais ; revérifier ses propres PR/HEAD/CI ; continuer uniquement sur sa branche ; publier son rapport de preuves dans la PR du laboratoire. La communication est **asynchrone par GitHub**, pas entre sessions ChatGPT en temps réel.
