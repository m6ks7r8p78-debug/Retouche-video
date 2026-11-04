# Cloud gratuit : étude et décision

**Décision v3.0, confirmée en v3.3 : aucun traitement cloud intégré.** Tout reste sur l’iPhone. L’effacement (MI-GAN) et la sélection (EdgeTAM)
tournent en quelques secondes sur l’appareil (mesuré sur processeur d’ordinateur, à confirmer sur iPhone) : le cloud n’apporterait rien ici,
sauf pour un futur modèle plus lourd (LaMa pour les grandes zones, remplissage vidéo), qui exigerait une autorisation à chaque envoi.

| Solution | Ce qui est réellement possible | Pourquoi pas intégré |
|---|---|---|
| Google Colab (gratuit) | GPU parfois disponible, sans garantie, sessions interactives limitées dans le temps | il faut un compte Google, lancer le notebook à la main, envoyer ses vidéos chez Google ; l’automatiser comme un service irait contre ses conditions |
| Kaggle Notebooks | quota hebdomadaire de GPU (variable, compte vérifié par téléphone) | mêmes raisons : démarrage manuel, envoi des médias, quota non garanti |
| Cloudflare Workers (déjà utilisé) | tâches légères (récupérer une vidéo par lien) | pas de GPU : inadapté au calcul IA lourd |
| Hugging Face ZeroGPU *(revu en v3.3 sur la documentation officielle)* | sans compte : 2 min de GPU par jour ; compte gratuit : 5 min ; PRO (payant) : 40 min ; un compte gratuit de plus de 30 jours, e-mail vérifié, peut héberger 2 Spaces ZeroGPU ; Gradio et PyTorch uniquement | seule piste appelable sans manipulation ; trop court pour de la vidéo ; candidat pour des retouches de photos lourdes (voir RESTAURATION_IA.md) |

Les quotas et conditions de ces offres changent souvent : les vérifier sur leurs pages officielles avant usage.
Si un jour un traitement cloud est ajouté, il devra être facultatif, demandé à chaque fois, et indiquer le service, la durée de conservation et le besoin de compte.
