# Rapport final — Retouche vidéo v3.2 (audit)

En ligne : https://m6ks7r8p78-debug.github.io/Retouche-video/ — retour arrière possible (branches `sauvegarde-v2.49`,
`sauvegarde-v2.50`, `sauvegarde-v3.0`, `sauvegarde-v3.1`).

## Critères de livraison
| Critère | État |
|---|---|
| L’application démarre | oui (vérifié en test) |
| Fonctions existantes conservées | oui : toutes les suites de tests repassées sur la v3.2 (RAPPORT_TESTS.md) |
| Corrections de la v3.2 | service worker (modèles gardés), faille d’injection, polices locales, SRI, autorisation diagnostic : chacune testée, et les tests échouent sur la v3.1 |
| Modèles et dépendances vérifiés | oui : SHA-256, `sr.bin` identique bit à bit aux poids officiels, ONNX Runtime et mp4-muxer identiques à npm, licences (LICENCES.md) |
| Permissions appliquées | oui, testé : refus = aucune donnée envoyée ; aucune requête externe à l’ouverture |
| Données sensibles protégées | sauvegarde AES-256-GCM testée ; aucun média envoyé |
| Serveur | v5 en ligne, vérifié sur le compte Cloudflare (origine étrangère refusée, adresse interne refusée) |
| Interruption et reprise | téléchargements de modèles : oui ; **export vidéo interrompu : non repris** |
| Performances mesurées | en GPU simulé seulement (PERFORMANCES.md) |
| Compatibilité iPhone | **non vérifiée** sur un vrai iPhone (liste de contrôle : GUIDE_IPHONE.md) |
| Aucune dépense possible | oui : aucun service payant, aucune clé |

**Version non entièrement validée** : il manque le test sur iPhone réel et la reprise d’un export interrompu.
Les systèmes « génératifs » (3 à 7) et la reconstruction de visage / corps ne sont pas intégrés : l’étude et le plan de prototypes
sont dans RESTAURATION_IA.md.
Action restante pour toi : les vérifications de GUIDE_IPHONE.md.
