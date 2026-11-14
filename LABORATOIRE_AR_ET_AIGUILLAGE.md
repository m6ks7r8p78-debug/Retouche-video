# Directeur IA — jalon laboratoire AR et garde-fou de débruitage

14 novembre 2026. Expériences privées : seules les observations non identifiantes figurent ici.

## Contrôleur appris de débruitage (hors application)

Sur 157 vidéos mises à disposition pour évaluation et apprentissage privé, 122 vidéos d'apprentissage et 35 de validation ont servi de fonds à des dégradations artificielles (bruit gaussien connu et JPEG simulé), après regroupement des variantes pour éviter la fuite entre lots. Le contrôleur classifie le type de dégradation et estime l'intensité du bruit. Seuils expérimentaux: confiance >= 0,90 et sigma estimé >= 0,035.

Sur 630 cas de validation synthétiques : 0 application sur les 70 images sans dégradation ajoutée, les 210 JPEG simulés et les 70 cas à bruit très faible; 0 dégradation supérieure à 0,5 dB dans ce lot. Les 280 cas de bruit plus fort sont traités. Un seuil qui marche pour ces dégradations artificielles n'est pas validé sur le bruit réel, les visages ou l'iPhone. Les poids et la préparation des images sont conservés en privé; ils ne sont pas présents dans ce dépôt.

## Retrait des accessoires AR : travaux et limites

Le premier réseau de segmentation, entraîné sur des **surimpressions AR artificielles** (fleur, oreilles, lunettes) placées sur des fonds de vidéos, a échoué à surpasser une référence couleur sur les fleurs, et a produit trop de faux positifs; une variante plus stricte avait un rappel nul. **Aucun modèle de ce pilote n'est déployable.** Les scores ont uniquement porté sur des incrustations procédurales, pas sur des vrais masques.

Une règle de présélection sur la signature de fleur jaune/blanche a été appliquée à une frame médiane des 157 vidéos : 4 propositions examinées visuellement, toutes associées à une fleur AR réelle. L'absence de proposition n'est pas une preuve d'absence de filtre; le rappel global est inconnu. Plusieurs extraits peuvent appartenir à la même scène.

La prochaine étape de recherche consiste à produire des masques d'objets exacts et des suivis temporels, puis à vérifier les cas difficiles sur des scènes distinctes. SAM 2/2.1 fournit une méthode de segmentation suivie par boîtes et points, à évaluer localement sans transfert de médias, avec vérification des coûts et licences.

## Garde-fous

- Le script générique directeur-selection-pilotes.cjs n'accède pas aux médias ni au réseau et ne lance aucun modèle.
- Ses recommandations restent explicitement **non appliquées**; les choix manuels prévalent, et une validation matérielle est nécessaire.
- Pas de données privées, noms de fichiers, empreintes, captures, modèle entraîné ni autorisations individuelles dans Git.
- Ne pas confondre gains sur dégradations simulées avec amélioration perceptuelle réelle.
- Brancher un véritable classificateur seulement après validation perceptuelle, non-régression des modules historiques et test sur Safari iPhone.
- Branche de laboratoire uniquement ; aucune fusion, publication ou déploiement automatique.
