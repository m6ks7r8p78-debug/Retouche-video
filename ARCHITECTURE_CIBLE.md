# Architecture cible

## Sur l’appareil (livré en v6.7)
- `analyse.js` : mesures (dominante, saturation, voile, écrêtage, vignettage, lissage, blocs, flou, bruit) → détections avec confiance et réversibilité → plan « Fidélité » / « Reconstruction IA » → cibles 720p/1080p/4K étiquetées → tuiles sous budget mémoire → contrôle du scintillement → profil X.
- `contribution.js` : règles du programme (12 états, verrou d’envoi, invitations à usage unique, registre chaîné, minimisation des métadonnées). `DISTANT_ACTIF = false`.

## À construire (non livré)
1. **Segmentation visage/accessoires + suivi vidéo** : propagation de masques (EdgeTAM déjà présent pour la photo) puis inpainting image par image avec lissage temporel. Bloqué par : coût sur iPhone à mesurer, licence des poids.
2. **Chaîne automatique** analyse → retrait → restauration → cohérence → agrandissement → contrôle → export, pilotée par `ANALYSE.plan()`.
3. **Backend de consentement** (séparé du site) : API validant côté serveur avec les mêmes règles que `contribution.js` ; stockage privé chiffré ; médias, métadonnées, identités et preuves dans des espaces distincts ; URL signées temporaires ; journal d’accès ; purge automatique. Option sans coût fixe : Cloudflare Workers + R2 + D1 (quotas gratuits limités, non garantis, à revérifier). Aucun fournisseur n’est activé.

## Règle
Aucune collecte tant que : backend audité, textes validés par un juriste/DPO, parcours « personne représentée » testé, tests iPhone réels passés.

## Ajouts v6.8
`visage.js` (YuNet : repérage, zones proposées, suivi, report de masque) branché sur `effacer.js` pour la photo. `serveur-consentement/` (Workers + D1, `schema.sql`, purge planifiée) : écrit et testé, non déployé. Reste : reconstruction image par image en vidéo à partir du suivi.
