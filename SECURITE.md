# Rapport de sécurité (v3.2)

- **Médias** : jamais envoyés à un serveur. Sorties réseau possibles, chacune soumise à autorisation (AUTORISATIONS.md) :
  fichier d’un modèle (Hugging Face, adresse figée + SHA-256), vidéo par lien (serveur de l’app, qui ne stocke rien), et,
  dans la version Claude seulement, l’analyse IA facultative et l’envoi des mesures de diagnostic.
- **Ouverture de l’app** *(v3.2)* : plus aucune requête vers un tiers. Les polices étaient chargées chez Google Fonts à chaque
  ouverture, sans autorisation (adresse IP et heure transmises à Google) ; elles sont désormais hébergées avec l’app (`polices/`).
- **Intégrité** : tout modèle est vérifié par SHA-256 à l’installation et au chargement ; un fichier abîmé est retiré.
  Vérifié le 4 novembre 2026 : `sr.bin` est identique bit à bit aux poids officiels Real-ESRGAN v0.2.5.0 convertis en FP16 ;
  le modèle de relief correspond à l’empreinte publiée ; ONNX Runtime Web 1.22.0 et mp4-muxer 5.1.3 sont identiques aux paquets npm.
- **Code de secours externe** *(v3.2)* : si `mp4-muxer.js` manquait, l’app le chargeait depuis jsDelivr sans contrôle.
  Le navigateur vérifie maintenant son empreinte (SRI sha384) et refuse tout fichier modifié.
- **Injection de code par une sauvegarde** *(corrigé en v3.2)* : une sauvegarde non chiffrée reçue d’un tiers pouvait contenir
  du code dans l’historique, exécuté à l’ouverture de ⚙️ Paramètres. L’historique est désormais affiché comme du texte
  (test : `tests/studio.test.mjs`, « Sauvegarde piégée »). Conseil : ne restaure que tes propres sauvegardes.
- **Chiffrement des sauvegardes** : AES-256-GCM, clé dérivée par PBKDF2-SHA256 (250 000 tours), sel aléatoire de 16 octets
  et nonce de 12 octets neufs à chaque sauvegarde (WebCrypto). Mauvaise phrase ou fichier modifié : refusé (testé).
  Limite : la solidité dépend de la phrase secrète ; une phrase courte se devine.
- **Serveur v5 — en ligne** (vérifié le 4 novembre 2026 sur le compte Cloudflare, worker `retouche-serveur`, `/etat` → version 5) :
  origines autorisées en liste fermée (une origine étrangère reçoit 403) ; en-tête CORS calculé par requête ;
  /proxy limité à une liste d’hôtes, chaque redirection revérifiée (5 au plus), adresse interne refusée ; pas de stockage.
  Risques résiduels : limite de débit comptée par instance (contournable par répartition) ; un site source compromis pourrait
  faire relayer un fichier d’un autre hôte public via `stream()`. Pour une vraie limite globale gratuite : liaison
  « Rate Limiting » de Cloudflare (non activée).
- **Secrets** : aucun dans l’app ni le dépôt. Les identifiants Twitch/Imgur du serveur sont des clés client publiques déjà présentes dans leurs sites web.
- **Service worker** : ne met en cache que les fichiers de l’app et ses réponses de même origine ; ignore /radar/.
  *(Corrigé en v3.2)* : à chaque mise à jour, il effaçait **tous** les autres caches du site, dont les modèles IA téléchargés
  (relief, 27 Mo, re-téléchargé ensuite) et ceux de l’app /radar/. Il ne retire plus que ses propres anciennes versions (test : `tests/sw.test.mjs`).
- **CSP** : non ajoutée (blobs, WebAssembly, WebGPU ; une CSP mal réglée casserait l’export sur iOS sans test réel). Piste documentée,
  rendue plus simple par la suppression des polices externes.
- **Suppression** : le nettoyage ne touche qu’aux modèles et à l’historique ; l’app ne peut pas supprimer les photos de l’iPhone (interdit aux apps web).
