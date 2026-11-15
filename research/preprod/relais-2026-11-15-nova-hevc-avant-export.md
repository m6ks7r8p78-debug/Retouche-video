# Relais inter-laboratoires — précontrôle NOVA HEVC et audit SmallMotion / préproduction

Date : 2026-11-15

**LABORATOIRE :** SmallMotion / préproduction (PR #44, à la suite des PR #40, #36 et #28).

**BRANCHE / PR / COMMIT observé :** `lab-smallmotion-av-audit-visible-fallback-v2` / [PR #44](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/44) / code évalué `38e27301696d8a613e2366f21d4678e81f94a662`.

**OBJET :** relayage à NOVA du blocage d'un précontrôle HEVC local reçu directement du propriétaire et contrat de garde-fous entre les deux diagnostics ; **aucun média privé joint ou cité**.

## GitHub effectivement relu

- [Coordination README, PROTOCOLE, REGISTRE](https://github.com/m6ks7r8p78-debug/Retouche-video/tree/coordination-retoucheproai-v1/coordination), consultés sur la branche de coordination.
- **NOVA export / audio** : [PR #3](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/3), `chatgpt-studio-nova-v01` (draft), responsabilité du rendu/HEVC/AAC.
- **NOVA real video preflight** : [PR #42](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/42), `chatgpt-nova-real-video-preflight-v1` (draft), workflow [#43717957186](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43717957186) **success sur synthétiques** ; pas de validation HEVC réel iPhone impliquée.
- **NOVA SmallMotion bridge** : [PR #35](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/35), draft ; CI [#43711341644](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43711341644) success sur données synthétiques ; deux images 2D consultatives, jamais preuve de geste/3D ni décision automatique.
- **NOVA HTTPS preview** : [PR #38](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/38), draft, archive isolée ; [CI #43715223471](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43715223471) success.
- **Audit local dans vraie application** : [PR #44](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/44) (8 CI success sur l'HEAD observé) : contrôle métadonnées MP4 *après* export et panneau affiché de manière robuste, mais ce contrôle **n'encode, ne corrige et ne certifie pas** le son, la netteté ni une vidéo HEVC hors de son périmètre.

## Observation de précontrôle reçue hors dépôt

L'utilisateur a partagé **dans sa conversation privée uniquement** un JSON de précontrôle technique NOVA avec :
- `schema = retoucheproai.nova.real-preflight.v1` ;
- `status = hevc-profile-or-timeline-incompatible` ;
- `readyForExportAttempt = false` ;
- `audio = not-tested`.

Le rapport seul ne permet pas d'isoler une cause définitive entre **profil HEVC, séquence temporelle / PTS et limitations de décodage de l'appareil**. Il n'autorise pas de conclusion sur la qualité finale, ni l'absence de piste AAC ; le système **a correctement refusé d'autoriser une tentative d'export à ce stade**, selon ce statut.

**Données volontairement non consignées dans le dépôt public :** fichier JSON complet, nom original/export, tailles, dimensions, durée, nombre de trames, URL de l'instance privée, hashes, images et signal audio. Aucune pièce jointe, aucun média, aucune identification.

## Contrat demandé aux autres laboratoires

1. **NOVA #42 (propriétaire du précontrôle)** : identifier de façon reproductible, sur mires HEVC *synthétiques*, si l'abstention vient du **profil / SPS/VUI**, de l'**ordre ou de la monotonie PTS/DTS**, d'une limite navigateur ou d'une autre contrainte ; ajouter un code de refus précis **sans nom de fichier, métadonnée privée ni média** ; la simple catégorie agrégée ne suffit pas pour décider d'une réparation. Conserver `readyForExportAttempt:false` tant que les contraintes sont incompatibles.
2. **NOVA #3 (propriétaire de l'export)** : ne pas forcer la conversion HEVC ni le fallback avec perte de son sur refus du précontrôle ; conserver AAC par défaut, refus explicite si impossible ; contrôler trames terminales / priming AAC via [gate synthétique #36](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/36) et test sur appareil distinct après correction.
3. **NOVA × SmallMotion #35 (passerelle)** : `no_automatic_change` reste strict. Un état précontrôle HEVC `not-ready` ne doit **jamais** être transformé en décision sémantique SmallMotion, preuve de geste ou autorisation d'export.
4. **SmallMotion / préproduction #44 (notre équipe)** : fournir un diagnostic consultatif de fidélité *après* export avec `metadata_only` et abstention sur MP4 hors périmètre ; ne pas modifier `app.js` ni les modules NOVA, garder panneau visible et erreurs explicites.
5. **Coordinateur** : vérifier ces PR et journaux puis, **lui seul**, actualiser `coordination/REGISTRE.json`. Aucune fusion implicite entre branches indépendantes.

## Tests, limites et suite

- **Tests réalisés et vérifiés** : CI synthétique NOVA PR #42 SUCCESS (head vérifié) ; 8 workflows PR #44 SUCCESS sur code de l'audit et du panneau avec Chrome simulé ; observation privée d'un statut HEVC non compatible **sans publication du rapport**.
- **Non testé / refus** : cette conversation n'a pas exécuté d'export HEVC sur le média de l'utilisateur ; aucune preuve de correction ou de validation Safari physique de la PR #44, aucune mesure audio pour ce précontrôle. Les PR #3, #35, #38, #42 et #44 ne sont pas fusionnées entre elles.
- **Prochaine action** : NOVA #42 affine un diagnostic synthétique non identifiant et renvoie une catégorie de refus actionnable ; NOVA #3 teste un parcours de repli sûr avec conservation du son ; SmallMotion #44 vérifie les comparaisons uniquement quand deux MP4 comparables sont disponibles.
- **Données privées publiées : non.**
