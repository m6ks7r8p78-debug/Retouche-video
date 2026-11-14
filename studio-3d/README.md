# Studio 3D — démonstration publique v1.8

**État :** prototype stylisé local, non déployé. Personnages adultes **fictifs**, sans IA neuronale.

- Ouvrir `index.html` ou héberger `/studio-3d/` via HTTPS. Aucun service, dépendance ou accès réseau exigé pour la génération.
- Exemple : « Une femme adulte en robe noire qui fume deux fois de la main gauche, salue puis refume ».
- Le moteur local interprète un vocabulaire délimité : vêtements, couleurs, cheveux, yeux, main gauche/droite, pose, marche sur place, salut, inclinaison, cigarette/cigare/pipe et **répétitions de gestes**.
- L'ordre des gestes est conservé dans le clip `scenario` ; pour « fume deux fois », deux étapes distinctes sont enregistrées. Maximum **12 étapes** pour limiter les fichiers.
- La fumée dessinée dans l'ancien prototype est remplacée par **trois volumes synthétiques transparents animés en échelle (GLB)**, sans simulation physique ni inhalation réelle.
- Les accessoires sont purement géométriques ; un seul type d'accessoire peut être choisi par personnage/scénario, pas de changement pendant la chronologie.
- Interaction tactile, pause, vitesse, recherche temporelle, exports GLB et JSON, import de fiches JSON v1.6, v1.7 et v1.8. Pas de persistence serveur : téléchargez les exports.
- **Sécurité et limites :** pas de modèles photoréalistes, pas de reconstruction humaine anatomiquement fiable, pas de voix. Seules des personnes fictives majeures peuvent être générées. Aucune des 157 vidéos privées ni aucun modèle issu de ces vidéos ne figure dans ce pack.
- Les descriptions et sorties restent dans le navigateur. CSP `connect-src 'none'`. Test Chromium sur HTML injecté (navigation directe `file://` bloquée par l'environnement), en écrans 390×844 et 1240×820, zéro erreur JS et zéro requête externe. **Safari physique non testé**.

## Contenu
- `index.html` : studio autonome contenant son moteur.
- `generateur.js` : module source autonome utilisable sous Node ou navigateur.
- `exemples/` : deux personnages GLB originaux uniquement.

**Intégration web :** PR GitHub en brouillon. Ne fusionner qu'après contrôle Safari et revue fonctionnelle. Ne jamais publier le coffre privé.