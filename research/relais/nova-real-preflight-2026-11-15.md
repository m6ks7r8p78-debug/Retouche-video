# Relais NOVA — précontrôle des vraies vidéos, sans export — 15 novembre 2026

**Laboratoire :** NOVA / iPhone Safari / compatibilité HEVC & AAC.
**Branche :** `chatgpt-nova-real-video-preflight-v1`.
**PR :** [#42](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/42), brouillon, base `chatgpt-nova-iphone-https-package-v1`, sans merge.
**Contexte :** l'utilisateur a confirmé sur iPhone la lecture vidéo H.264 et l'écoute du bip AAC du clip synthétique issu de NOVA 0.24. Ce résultat ne porte PAS sur un média réel.

## Avancement vérifiable

- Moteur `experiences/nova-real-preflight.js` : inspecte localement une vidéo choisie, sans la convertir, à partir des contrôles existants `NOVA_DEMUX`, `NOVA_HEVC_RENDER`, `NOVA_EXPORT.plan`, `NOVA_GUARD`, `NOVA_AAC_COPY.planifier`. Vérifie MP4/MOV, HEVC BT.709 et PTS, limites, budget mémoire et couverture AAC. Donne un statut codifié et un JSON à liste blanche.
- UI `experiences/nova-real-preflight-ui.js` et `experiences/nova.html` : bouton opt-in « Vérifier cette vidéo sans exporter », lien de rapport volontaire, aucune conversion automatique.
- Repli **fermé** : codecs autres que HEVC, HDR/gamut/profil/PTS non validables, mémoire ou audio AAC non conservable donnent un refus. Statut favorable **`ready-for-export-attempt` = tentative d'export envisageable, PAS une garantie d'export ni une preuve de fidélité.**
- ZIP statique Cloudflare Pages prêt pour téléchargement manuel, issu de l'action dédiée ; **aucun déploiement automatique** et aucune modification du site `retoucheproai-labo.pages.dev`.

## Tests synthétiques / preuves

[Workflow GitHub Actions #43716033911](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43716033911) : **26/26 tests unitaires réussis**, et **1/1 test navigateur Chromium réussi** sous CSP, sur les mires HEVC/AAC et H.264. Ce test vérifie absence d'export automatique et de requêtes non autorisées ; il n'est **pas** un test Safari sur iPhone physique.

Artefact `NOVA-real-video-preflight-Cloudflare` (GitHub Actions, 7 jours) contient `NOVA_real_video_preflight_Cloudflare.zip`. Le ZIP final a été extrait et vérifié (44 éléments, contrôle ZIP sans erreurs), puis mis à disposition dans la conversation. Il ne contient aucune vidéo personnelle.

## Limites et implications pour les autres laboratoires

- Safari iPhone : **pas encore testé physiquement avec une vidéo réelle** dans ce nouveau module.
- Le précontrôle ne constitue pas un rapport de présence des mouvements, un système d'entraînement IA, ni une analyse perceptuelle.
- Directeur IA : peut utiliser le statut de compatibilité comme précondition future, **jamais** comme feu vert universel ni preuve de qualité.
- Export Intelligence / NOVA : la politique audio par défaut reste « conserver ou refuser » ; pas de repli muet non sollicité.
- Design AURA : conserver ce précontrôle en panneau avancé discret, pas comme écran imposé à tous.
- Coordination : PR #42 en aval de #38, elle-même en aval de #35 ; priorité à la revue de conflits avant intégration. **Aucune fusion ni publication décidée.**

**Médias privés publiés : aucun.**
**Étape suivante :** installer manuellement la nouvelle archive sur le laboratoire Cloudflare existant **uniquement si l'utilisateur le souhaite**, puis essayer une courte vidéo réelle autorisée sur Safari physique avec lecture et rapport local.
