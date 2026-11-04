# Rapport de sécurité

- **Médias** : jamais envoyés à un serveur. Les seules sorties réseau : fichier d’un modèle (Hugging Face, adresse figée + SHA-256), vidéo par lien (serveur de l’app, qui ne stocke rien), et, dans la version Claude seulement, l’analyse IA facultative et des mesures techniques anonymes.
- **Intégrité** : tout modèle est vérifié par SHA-256 à l’installation et au chargement ; un fichier abîmé est retiré.
- **Serveur v5** : origines autorisées en liste fermée ; en-tête CORS calculé par requête ; /proxy limité à une liste d’hôtes, chaque redirection revérifiée (5 au plus) ; pas de stockage.
  Risques résiduels : limite de débit comptée par instance (contournable par répartition) ; un site source compromis pourrait faire relayer un fichier d’un autre hôte public via `stream()`.
  Pour une vraie limite globale gratuite : liaison « Rate Limiting » de Cloudflare (non activée, à vérifier sur le compte).
- **Secrets** : aucun dans l’app ni l’archive. Les identifiants publics Twitch/Imgur du serveur sont des clés client publiques déjà présentes dans leurs sites web.
- **Service worker** : ne met en cache que les fichiers de l’app et ses réponses de même origine ; ignore /radar/.
- **CSP** : non ajoutée (l’app charge Google Fonts et des blobs/wasm ; une CSP mal réglée casserait l’export sur iOS sans test réel). Piste documentée.
- **Suppression** : le nettoyage ne touche qu’aux modèles ; l’app ne peut pas supprimer les photos de l’iPhone (interdit aux apps web).
