# Cloud gratuit : étude et décision

**Décision v3.0 : aucun traitement cloud intégré.** Tout reste sur l’iPhone.

| Solution | Ce qui est réellement possible | Pourquoi pas intégré |
|---|---|---|
| Google Colab (gratuit) | GPU parfois disponible, sans garantie, sessions interactives limitées dans le temps | il faut un compte Google, lancer le notebook à la main, envoyer ses vidéos chez Google ; l’automatiser comme un service irait contre ses conditions |
| Kaggle Notebooks | quota hebdomadaire de GPU (variable, compte vérifié par téléphone) | mêmes raisons : démarrage manuel, envoi des médias, quota non garanti |
| Cloudflare Workers (déjà utilisé) | tâches légères (récupérer une vidéo par lien) | pas de GPU : inadapté au calcul IA lourd |

Les quotas et conditions de ces offres changent souvent : les vérifier sur leurs pages officielles avant usage.
Si un jour un traitement cloud est ajouté, il devra être facultatif, demandé à chaque fois, et indiquer le service, la durée de conservation et le besoin de compte.
