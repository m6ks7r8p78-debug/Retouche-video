# Studio 3D — démo publique v1.7

**État :** prototype hors ligne, non déployé, personnages adultes **fictifs et stylisés**.

- Ouvrir `index.html` dans un navigateur ou servir `/studio-3d/` via HTTPS.
- Exemple : « Une femme adulte brune en robe noire qui marche puis fume lentement de la main gauche et salue ».
- Le moteur utilise des règles locales (sans LLM ou modèle neuronal) pour comprendre les attributs et l’ordre des actions reconnues.
- Animations : pose, main-vers-bouche, salut, marche sur place, inclinaison de la tête. Un clip `scenario` enchaîne plusieurs actions dans l'ordre du texte, séparées par 250 ms de retour au repos.
- Prévisualisation tactile, pause/reprise, vitesse, déplacement dans la chronologie. Export GLB avec clips, export JSON, import JSON compatible v1.6/v1.7 (taille maximale 64 Ko).
- Aucune connexion réseau ni bibliothèque externe. La CSP refuse les connexions réseau. Les descriptions et modèles ne sont pas sauvegardés sur serveur ; l'export JSON est nécessaire pour les conserver.
- Aucun rendu humain photoréaliste, aucune garantie de compréhension de texte libre, ni reconstruction de personnes réelles. Les mouvements restent schématiques.
- Aucun extrait ni donnée des 157 vidéos privées dans ce dossier. Ne pas publier les archives privées du laboratoire.
- Tests : 58 tests Python, Chromium headless mobile + desktop (export/import/timeline et aucune requête réseau), GLB chargé avec Trimesh. Safari iPhone physique **non vérifié**.

## Fichiers
- `index.html` : studio autonome (moteur JavaScript inclus en ligne).
- `generateur.js` : module source Node/navigateur équivalent au moteur embarqué.
- `exemples/` : deux personnages GLB 100 % synthétiques uniquement.

**Déploiement :** n'est pas activé en production ; la PR GitHub reste en brouillon jusqu'à validation sur appareil réel.