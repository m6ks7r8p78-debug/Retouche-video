# Rapport final — Retouche vidéo v3.0

En ligne : https://m6ks7r8p78-debug.github.io/Retouche-video/ — retour arrière possible (tags v2.49-sauvegarde, v2.50).

## Critères de livraison
| Critère | État |
|---|---|
| L’application démarre | oui (vérifié en ligne et en test) |
| Fonctions existantes conservées | oui : 13/13 tests de bout en bout, aucune régression |
| Nouveaux modules opérationnels | Time Repair, profils nuit, autorisations, sauvegarde chiffrée, historique, assistant : testés (7/7, 8/8) |
| Modèles et dépendances vérifiés | oui : SHA-256, licences (LICENCES.md) |
| Permissions appliquées | oui, testé : refus = aucune donnée envoyée |
| Données sensibles protégées | sauvegarde AES-256-GCM testée ; aucun média envoyé |
| Sauvegarde / restauration testées | oui (réglages ; les médias ne sont jamais sauvegardés par l’app) |
| Interruption et reprise | téléchargements de modèles : oui ; **export vidéo interrompu : non repris** (à refaire) |
| Exports vérifiés | oui (relecture automatique + ffprobe en test) |
| Performances mesurées | en GPU simulé seulement (PERFORMANCES.md) |
| Compatibilité iPhone | **non vérifiée** sur un vrai iPhone (liste de contrôle : GUIDE_IPHONE.md) |
| Aucune dépense possible | oui : aucun service payant, aucune clé |
| Documentation conforme | oui à la date de livraison |

**Version non entièrement validée** : il manque le test sur iPhone réel et la reprise d’un export interrompu ;
la majorité des systèmes « génératifs » du cahier des charges (3 à 7) n’est pas réalisable à 0 € sur iPhone (RAPPORT_AUDIT.md, ROADMAP.md).
Action restante pour toi : faire les 5 vérifications de GUIDE_IPHONE.md. Action technique restante : redéployer serveur/worker.js (v5).
