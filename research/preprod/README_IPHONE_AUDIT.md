# RetoucheProAI — contrôle de fidélité local iPhone (recherche)

Laboratoire **SmallMotion / préproduction**, continuation de la PR #36. Les corrections d'export AAC / H.264 relèvent de **NOVA** ; aucun code d'encodage ni de restauration n'est modifié ici.

## Fonction ajoutée dans la vraie page de préproduction

Le module `av-fidelity-local.js` inspecte les **en-têtes MP4 uniquement** par `File.slice()` (atomes `moov`, listes d'échantillons `stsz/stts`, durées, `elst` de découpe). Le module `av-fidelity-app.js` insère, après SmallMotion, le bouton accessible **« Comparer mon MP4 exporté »**. L'utilisateur importe d'abord son original dans RetoucheProAI ; après son export, il sélectionne explicitement ce MP4. L'outil présente une différence de nombre d'images et de paquets AAC, de durée et de découpe d'amorçage.

L'audit n'a **aucun accès réseau, stockage ni telemetry**, ne décode aucun pixel/audio, ne modifie aucun traitement, ne transmet aucun nom de fichier ou média au JSON. Limite d'une structure `moov` à 16 MiB et d'un fichier à 1 GiB ; fichiers/atomes inconnus → `abstain_unsupported_mp4`.

**Important :** `metadata_consistent` signifie uniquement que certaines **métadonnées sont compatibles**, pas que le résultat a la même netteté, la même qualité, les mêmes pixels ou que son et image sont synchronisés. Un `aac_edit_trim_changed` signale un **risque** de décalage, pas une mesure sonore : pour mesurer réellement les millisecondes, utiliser le gate FFmpeg hors navigateur de la PR #36. Les montages intentionnels peuvent expliquer les nombres d'images et durées différents.

## Validation

1. `node research/preprod/tests/test_av_fidelity_local.cjs` — MP4 synthétiques produits en dossier temporaire par FFmpeg, 29 assertions : remux, troncation, suppression de la piste, découpe `elst` altérée, métadonnées seules, limites de lecture, abstention.
2. `python research/preprod/tests/test_av_fidelity_wiring.py` — raccordement des scripts et présence dans le cache PWA.
3. `python research/preprod/tests/test_av_fidelity_browser.py` — véritable `index.html` et `app.js`, vidéo synthétique choisie via `#f`, audit de l'export dans Chromium 390×844/1280×800, résultat réinitialisé au nouvel import, pas de requête externe.
4. Suite préproduction historique + test du manifeste PWA v87 et migration v87→v88 pour éviter des caches mélangés.

## Validation iPhone encore manquante

Une fois une archive **HTTPS de préproduction** construite et publiée séparément, l'utilisateur doit ouvrir le site avec Safari, importer un original, exporter un MP4 puis sélectionner cet export dans le panneau de fidélité. Le diagnostic peut être copié sous réserve de ne pas contenir de nom de fichier. Il faudra comparer le verdict avec le gate FFmpeg privé. Aucune promotion vers `main` ou le site public avant vérification explicite.

## Confidentialité et coordination

Ne jamais publier les deux médias personnels testés, ni leurs images, leur nom, hachage, signal sonore, coordonnées ou métadonnées identifiantes. Le relais de laboratoire `relais-2026-11-15-audit-local-iphone.md` pointe vers la PR et spécifie les travaux réservés à NOVA.