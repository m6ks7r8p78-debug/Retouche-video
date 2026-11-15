# Relais NOVA — diagnostic précis des limites HEVC après test Safari iPhone

**Date :** 15 novembre 2026.
**Branche :** `chatgpt-nova-real-video-preflight-v1`.
**PR :** [#42](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/42), brouillon, base PR #38.
**Contexte :** l'utilisateur a effectivement installé le panneau de précontrôle sur son laboratoire Cloudflare, a choisi une vraie vidéo sur iPhone, puis a transmis le rapport JSON généré localement. **Ce test n'est pas un succès d'export**. Aucune copie de ce JSON personnel, ni du média, ni nom ou empreinte n'est publiée dans ce dépôt.

## Observation reproductible sans données privées

Le précontrôle a catégorisé la source comme HEVC et a refusé la tentative d'export avec un statut trop générique `hevc-profile-or-timeline-incompatible`. L'audio était marqué `not-tested`, car la décision sur le profil/limites vidéo intervenait avant la planification AAC.

L'examen du code confirme que `NOVA_HEVC_RENDER.metadata` refuse un échantillon dès que plusieurs bornes techniques du pilote sont dépassées, y compris la **surface codée maximale 640×360 pixels** (`W*H <= 230400`) et **90 images source au maximum**. La durée maximale reste 12 secondes et l'export pilote est cadencé à 15 i/s. La confiance des autres contrôles (couleur / PTS) ne doit pas être exagérée lorsqu'un refus peut intervenir prématurément.

## Changements apportés

- `experiences/nova-real-preflight.js` calcule après l'analyse locale les violations **indépendamment visibles** : `coded-pixels-over-limit`, `source-frames-over-limit`, `duration-over-limit`, `coded-dimensions-not-even`.
- Ajout d'une **cadence moyenne estimée** à partir du nombre d'images et de la durée présentée. Il s'agit d'une estimation informative, pas d'un audit exact des intervalles PTS ; un avis de fidélité apparaît si la cadence estimée dépasse la sortie de 15 i/s.
- `serialiser` étend le rapport local avec `blockers`, `advisories`, `pilotLimits`, exclusivement des codes autorisés et métriques agrégées bornées, sans nom de fichier, octets média ou identifiants.
- `experiences/nova-real-preflight-ui.js` présente **toutes les limites identifiables**, et avertit explicitement que la couleur, les PTS et l'AAC peuvent encore être inconnus; aucun contournement automatique.
- Tests unitaires avec vidéos factices **entièrement synthétiques** HD/30 i/s, durée excessive, dimensions impaires, confidentialité, et contrôle navigateur du texte et de l'absence d'export.

## Preuves

[Workflow #43717764922](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43717764922) : **29/29 tests unitaires réussis**, **1/1 test Chromium sous CSP réussi**; CI archive un ZIP Cloudflare manuel. Le ZIP a été contrôlé localement : **44 fichiers, ZIP sans erreurs, index et deux modules diagnostic présents**.

**Limites :** le navigateur de CI est Chromium, non Safari iOS. Le nouveau rendu précis des motifs n'est pas encore testé physiquement par l'utilisateur. Le rejet des sources haute résolution reste volontaire et inchangé. Aucun traitement 4K/HDR, aucune hausse de plafond mémoire et aucune garantie de fidélité ne sont revendiqués.

## Instructions de coordination

Transmettre les motifs `blockers` séparément au Directeur IA et au futur moteur d'export adaptatif; ne jamais transformer le statut `ready-for-export-attempt` en garantie d'export. L'évolution véritable doit porter sur une solution de décodage en flux/budget mémoire avec un banc de fidélité iPhone réel, plutôt que sur un simple relèvement des limites numériques.

**Production :** main et `retoucheproai.com` inchangés, Cloudflare existant non redéployé par cette session, PR brouillon, aucun média privé publié.
