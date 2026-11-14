# Studio 3D — démonstration publique v1.6

- Ouvrir `index.html` dans un navigateur compatible ou héberger sous `/studio-3d/` sur HTTPS.
- Entrer une description de **personnage adulte fictif** ; le moteur local produit un modèle **stylisé procédural** GLB avec animations de pose, geste main-vers-bouche, salut et marche sur place selon le texte.
- L'atelier permet de sélectionner les animations, changer leur vitesse, tourner et zoomer le personnage, exporter un GLB et un diagnostic JSON.
- Les descriptions et les fichiers ne sont pas transmis à un serveur ; une règle CSP bloque `connect-src`.
- **Limites :** aucun modèle neuronal exécuté, aucun photoréalisme, pas de skinning, de rendu réaliste de fumée, de synthèse de voix ni de génération de tous les gestes.
- Aucune vidéo de l'archive privée (157 sources), ni image de personne, ni avatar reconstruit ne figure dans ce module.
- **Déploiement :** revue et fusion de la PR nécessaires ; ne pas confondre le dépôt de code et un produit en production.