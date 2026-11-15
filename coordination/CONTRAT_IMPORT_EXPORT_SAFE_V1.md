# Contrat proposé — import universel, diagnostic explicite, sortie fidèle (v1)

**Relais de coordination, NON implémenté, NON fusionné.**
Branche de documentation : `chatgpt-relai-coordination-20261115-v2`, [PR #46](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/46).
**Propriétaires des composants :** NOVA #3/#42 (décodage, export, AAC), SmallMotion #36/#44 (audit consultatif après export), Directeur IA #1 (choix de chemin), AURA #31 (UX), Export X (profil local). Aucun autre labo n'a besoin de modifier ses fichiers pour examiner ce contrat.

## Constats reproductibles sur le CODE actuel de NOVA #42

Source : [`experiences/nova-real-preflight.js` PR #42](https://github.com/m6ks7r8p78-debug/Retouche-video/blob/chatgpt-nova-real-video-preflight-v1/experiences/nova-real-preflight.js) au blob `523532f9a496b87a7fca83a490557a3cf1936a61`.

- Le précontrôle limite la source à **60 Mio**, au plus **12 s**, au plus **90 images** et à une surface codée **640 × 360** pixels (230 400), avec plan d'export **15 images/s**. Il s'agit des bornes d'un **pilote**, non des limites universelles de Safari ou de RetoucheProAI.
- Le code identifie les familles HEVC et H.264, puis retourne `unsupported-video-codec` pour **toute entrée non HEVC**, même une vidéo H.264 valide. Cette décision est une limite de **ce chemin NOVA**, pas une preuve qu'aucun autre moteur ne peut ouvrir cette vidéo.
- Un échec de `NOVA_HEVC_RENDER.metadata` est regroupé sous `hevc-profile-or-timeline-incompatible`. Ce code ne distingue pas actuellement **profil/SPS/VUI**, **PTS/DTS** et **limites d'API/appareil**. Un cas d'observation privé rapporte cette catégorie ; aucune donnée source n'est copiée.
- `ready-for-export-attempt` indique seulement **essai possible**. Le contrôle AAC concerne une admissibilité de copie, non la fidélité finale constatée à l'oreille. Le contrôle post-export de #44 est limité aux métadonnées et n'est pas un certificat audiovisuel.

Ces constats sont des lectures de code et des CI synthétiques. Ils ne certifient aucun appareil ni codec général.

## Chaîne d'états commune proposée

```text
selected locally
   -> container_identified | container_unreadable
   -> track_identified | track_unsupported
   -> decode_ready | decode_unavailable | device_budget_exceeded
   -> processing_eligible | processing_restricted
   -> export_preflight_ready | audio_preservation_blocked | export_unsupported
   -> export_attempted -> output_created | export_failed
   -> output_audited | audit_inconclusive | fidelity_failed
   -> user_saves_locally
```

**Chaque étape garde sa propre preuve**. Sélectionner, inspecter, décoder, exporter et vérifier sont cinq opérations distinctes. Ne jamais synthétiser un résultat `success` à partir d'un « précontrôle favorable ».

### Statuts et messages à préserver

| Cas | Diagnostic interne | Message humain / suite proposée |
| --- | --- | --- |
| H.264 dans le pilote HEVC | `path_unsupported` | « Ce pilote ne traite pas ce codec ; recherche d'un moteur local H.264 compatible ». Ne pas qualifier le fichier de corrompu. |
| Source supérieure aux bornes du pilote | `pilot_limit_exceeded` | « La vidéo dépasse les limites de cet essai ; vérifier un traitement segmenté ou un autre moteur ». Aucun découpage silencieux. |
| Erreur HEVC générique | `hevc_cause_unresolved` | « Compatibilité HEVC non confirmée ; sous-cause à diagnostiquer » ; ne pas forcer l'encodeur. |
| Piste audio présente mais conservation non démontrée | `audio_preservation_unverified` | « L'export avec son ne peut pas encore être garanti » ; proposer une alternative sans perte prouvée ou une action explicite. |
| Budget appareil insuffisant | `device_budget_exceeded` | « Traitement trop coûteux sur cet appareil ; proposer une résolution/cadence *choisie*, un segment ou un autre chemin compatible ». |
| Média endommagé / chiffré / illisible | `source_unusable` | Expliquer le blocage réel. Ne pas prétendre le traiter ni contourner une protection. |
| Export terminé, post-contrôle absent | `output_unverified` | « Fichier produit, fidélité non encore vérifiée ». Ne pas le marquer comme pleinement validé. |

Ces identifiants sont **proposés**, pas les noms déjà implémentés par NOVA ; laisser ses statuts existants intacts en attendant une revue de contrat et des tests.

## Ordre de recherche des replis — **proposition**, pas capacité déjà démontrée

1. **Chemin natif existant adapté** : distinguer le conteneur, le codec vidéo et l'audio, vérifier le support de lecture et de sortie réellement disponible sur l'appareil.
2. **Autre moteur local existant** (notamment H.264) si l'entrée est décodable et si la sortie conserve le son ; comparer couleur, cadence, orientation, début/fin et synchronisation.
3. **Remux sans réencodage** uniquement si les pistes et le conteneur cible sont réellement compatibles ; vérifier leurs horodatages, l'edit list et l'amorçage AAC. Ne pas inventer une compatibilité.
4. **Traitement local par morceaux**, si décodable et si l'assemblage est techniquement vérifié (jonctions, durée, couleur, A/V) ; ne pas couper/tronquer en silence.
5. **Traitement distant optionnel** seulement sur consentement distinct et infrastructure sécurisée et vérifiée, sans partager automatiquement les médias privés ni la vidéo pour entraîner des modèles. Cette voie n'est pas déclarée disponible.
6. Si aucune voie ne satisfait les critères, fournir un **diagnostic utile et conserver l'original**, avec prochaine action claire. L'objectif « tout média reçu → résultat » ne permet pas de garantir une conversion fidèle d'un fichier irrécupérable ou non autorisé.

## Matrice minimale pour les laboratoires

| Entrée de test | Attendu |
| --- | --- |
| H.264/AAC synthétique court | Fichier reconnu comme vidéo ; limite du pilote HEVC distinguée de l'incompatibilité globale ; recherche de moteur H.264 documentée. |
| HEVC/AAC SDR BT.709 synthétique compatible | Précontrôle acceptable **sans** réussite d'export présumée ; suivi d'un vrai export test et audit séparé. |
| HEVC profil/SPS invalide mais tables PTS valides | Code de sous-cause **profil** ; pas de faux diagnostic « audio absent ». |
| HEVC profil valide mais PTS/DTS incohérents | Code de sous-cause **chronologie** ; aucun remux automatique. |
| Vidéo > 12 s, > 90 images, > 640×360 ou > 60 Mio | `pilot_limit_exceeded`, pas « média corrompu ». Aucun tronquage silencieux. |
| AAC priming/elst modifié, piste son supprimée, images de fin perdues | Audit après export avertit ou échoue suivant la preuve ; aucune fausse certification de fidélité. |
| Navigateur dépourvu d'un encodeur/codec | Explication de capacité locale ; recherche d'un autre chemin sans passer directement à un upload. |
| Média corrompu ou impossible à interpréter | Arrêt sûr, original conservé, aucun fichier présenté comme converti. |
| iPhone Safari physique + média réel volontaire | Observation distincte, sans média envoyé sur GitHub, séparée des tests Chromium/CI. |

## Contrat pour l'interface grand public (AURA)

- Une action principale **« Ajouter une vidéo »** ; traitement automatique uniquement lorsque les conditions nécessaires et le consentement sont établis.
- Trois informations intelligibles : **« Ouverture »**, **« Traitement/solution de secours »**, **« Export et vérification »** ; détail des raisons et outils avancés sur demande.
- Si un parcours échoue, le bouton doit permettre une action **réelle et disponible**, jamais un faux résultat ou une promesse sans moteur.
- Conserver la décision utilisateur sur format/profil de sortie et la publication **manuelle** vers X. Ne jamais dire « sans compression X garantie ».

## Critères avant intégration / responsabilités

- **NOVA #42** : tests discriminant HEVC SPS/VUI vs PTS/DTS vs WebCodecs vs budgets, sans données personnelles ; retour actionnable distinct de la catégorie générique.
- **NOVA #3** : inventaire réel des chemins H.264/HEVC/AAC disponibles et test synthétique d'export + conservation A/V, pas de secours muet.
- **SmallMotion #44** : comparaison metadata-only avant/après ; cartes de statut toujours visibles, sans certification perceptuelle.
- **Directeur IA #1** : sélection seulement parmi capacités prouvées sur la session ; refus d'actions irréversibles; provenance et abstention.
- **AURA #31** : parcours novice clair et interface dont les boutons déclenchent un chemin fonctionnel.
- **Coordinateur #34** : revue de compatibilité, licence, CI et essai iPhone avant toute PR d'intégration. Ne pas modifier `main`, aucune fusion ou déploiement implicite.

**Niveau de preuve de ce document :** `concept + code-reading` ; pas `unit-tested` du contrat, pas `physical-iphone-tested`, pas `production-verified`. **Données privées publiées : non.**
