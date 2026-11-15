# NOVA — classification locale des refus HEVC (expérience isolée)

**Branche :** `chatgpt-nova-hevc-diagnostic-cause-v1-20261115`, basée sur le commit `982b0d545cf85ca53d429a69f69c71b0d2430286` de la [PR NOVA #42](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/42). **Aucun merge, aucune publication, aucune modification de `main`.**

## Objet du développement réel

Le pilote [NOVA #42](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/42) renvoyait une raison trop large (`hevc-profile-or-timeline-incompatible`) lorsque le validateur HEVC échouait, même en présence de limites source déjà connues. Dans un parcours d'import général, une vidéo H.264 valide n'est pas pour autant « corrompue » : elle est simplement hors du chemin HEVC.

Ajouts **sur la branche expérimentale uniquement** :

- `experiences/nova-hevc-refusal-diagnostic.js` — lecture **uniquement** des métadonnées déjà analysées, sans lire ou modifier le fichier ; sous-codes statiques de limites pilote, géométrie, couleur, SPS/VUI et PTS.
- `experiences/nova-real-preflight.js` — en cas de refus du validateur, enregistre facultativement ce sous-diagnostic et le sérialise par **liste blanche**, sans copier d'exception brute. Le refus précédent et `readyForExportAttempt:false` restent inchangés.
- `experiences/nova-real-preflight-ui.js` — affiche une explication française uniquement pour des codes préautorisés. Signale les contrôles non concluants sans prétendre identifier une sous-cause.
- `experiences/nova.html` — charge le petit module avant le précontrôle.
- `tests/nova-hevc-refusal-diagnostic.test.mjs`, workflow de test et reconstruction du bundle synthétique HTTPS manuel.

## Niveaux de certitude

`confirmed-by-metadata` signifie seulement : **la condition codifiée est observable dans les métadonnées analysées**. Elle ne certifie pas que c'est la **seule** cause du refus ni que le fichier ne peut être lu autrement.

`unverified` signifie : la vérification nécessaire n'a pas abouti ou n'est pas disponible. Une exception SPS/VUI opaque n'est jamais transformée en « profil HDR confirmé ». Aucun résultat de ce module n'autorise export, repli automatique ou suppression du son.

Les refus détectables incluent : limites de la **version pilote** (60 Mio / 12 s / 90 trames / 640×360, selon les étapes du précontrôle), pixels non carrés, couleur colr non conforme SDR BT.709, SPS/VUI non démontré, doublons PTS, preroll excessif, origine PTS différente de zéro, durée PTS incohérente ou première image non clé.

## Connu / non fait

- Le module n'ajoute **aucun** nouveau décodeur, encodeur, remuxer, serveur, modèle IA ou capacité universelle.
- Les conditions SPS/VUI peuvent encore rester indéterminées en présence d'erreurs de parsing ; il faut des fixtures ciblées pour distinguer *absence de VUI*, *mauvaise profondeur* et *métadonnées contradictoires* dans ce sous-cas.
- Un AVC/H.264 ne passe toujours pas le chemin HEVC, mais le vocabulaire du diagnostic indique explicitement la limite du **pilote**, pas une corruption du fichier.
- Un AAC déclaré « copiable » n'est pas un AAC dont la synchronisation de **sortie** a été vérifiée ; utiliser séparément les contrôles SmallMotion [#36](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/36) et [#44](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/44).
- Aucune vidéo réelle privée, aucun poids de modèle, aucune métadonnée identifiante dans la branche. Tests synthétiques seulement, distincts d'un essai Safari iPhone physique.
- L'aperçu Cloudflare n'est pas déployé automatiquement. Une CI verte ne prouve ni un hébergement réussi ni l'essai iPhone.

## Relais inter-laboratoires

**NOVA #42 (précontrôle)** : vérifier le nouveau contrat, distinguer les sous-causes et éviter les intitulés « vidéo impossible » pour les simples limites de pilote.

**NOVA #3 (export)** : utiliser ces sous-causes uniquement pour décider quel autre chemin **déjà démontré** tester ; jamais pour ignorer la protection AAC, couleur et PTS.

**AURA #31 (UX)** : montrer une raison lisible et la prochaine action techniquement disponible. Pas de faux « export universel garanti ».

**Coordinateur #34/#46** : indexer les preuves de la PR après validation de tests, sans toucher au registre commun depuis cette branche.

## Prochain critère technique

1. Suite unitaires du nouveau module **et** suite préexistante #42 passent.
2. Bundle HTTPS **construit localement en CI** inclut le module, mais aucun upload ni déploiement.
3. Test Chromium préexistant sous CSP passe.
4. Essai **physique** sur iPhone Safari, avec média autorisé, séparé et non revendiqué à l'avance.

Statut initial : **code commité, tests CI à vérifier**. Ne pas confondre avec intégration dans `main`.
