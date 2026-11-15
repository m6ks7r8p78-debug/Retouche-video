# RetoucheProAI — AURA, reconstruction fidèle de la référence retenue

**STATUT : démonstrateur interactif isolé ; NON validé pour intégration, NON publié.**

## Source artistique unique
La référence est **la dernière maquette AURA aimée par l'utilisateur**, transmise dans cette conversation le 15 novembre 2026 (`retoucheproai_aura_contrôle_premium.png`). Elle montre un grand aperçu avant/après, une **pièce mécanique continue** à trois commandes (Ajouter un média / Traitement automatique / Menu avancé), trois formats de sortie et une navigation minimale.

Les PR #20 et #21 ont été explicitement rejetées, car elles reprenaient une ancienne structure. **Ne pas les réutiliser comme point de départ**. Cette étude est conçue sur une branche issue de `main` et ne modifie aucun fichier en production.

## Fidélité graphique et honnêteté technique
- Les seules parties de l'image de référence réemployées comme **textures décoratives** sont le petit bandeau d'en-tête, la barre mécanique et les touches de formats de sortie. Ce sont des *habillages* d'éléments HTML interactifs et accessibles : **le reste de l'interface n'est pas une capture entière sur laquelle on a dessiné des points chauds**.
- La photo du démonstrateur, son cadrage, son filtre et la séparation avant/après sont de vrais éléments DOM modifiables. Le moniteur et la barre de lecture vidéo sont de vrais composants.
- « Traitement automatique » dans cette étude **ne désigne pas de traitement neuronal** : correction photo locale classique, après import, avec avertissement explicite. La mention « DÉMO LOCALE » est visible sur l'habillage de la commande.
- Les moteurs IA, reconstruction AR, super-résolution, stabilisation, traitement et export vidéo ne sont pas connectés. Ne pas confondre une correction colorimétrique avec une restauration.
- Le profil « Pour X » produit un JPEG local au plus 1920 px de grand côté ; X peut recompresser. « Maximum » produit un PNG jusqu'à 4096 px de grand côté, **sans ajout artificiel de détails**.

## Comportements réellement implémentés
- Un seul appel à importer une image ou vidéo depuis le téléphone. Données traitées uniquement localement, aucune requête réseau.
- Comparaison avant/après au doigt ou au clavier. Photo originale conservée, retouche réalisée sur copie au moment de l'export.
- Traitement auto photo local : lumière, contraste et saturation. Export JPEG automatique, PNG maximum et JPEG « Pour X ».
- Menu avancé **sur la partie basse du média**, non en bas d'une page interminable. Onglets Lumière / Contraste / Couleurs ; molette fonctionnelle au doigt et clavier et curseur.
- Vidéo H.264/MP4 : lecture locale avec son, déplacement dans la séquence, vitesse 0,5–2× via molette (pas d'export vidéo).
- Navigation Accueil / Projets de session / Bibliothèque de session et préférences texte agrandi / mouvement réduit. Pas de stockage persistant dans cette étude.

## Contrôles exécutés dans Chromium (sans simulation IA)
- Viewports **320×700, 375×812, 390×844, 430×932, 768×1024, 1024×768** : aucune erreur JavaScript et aucun débordement horizontal dans les scénarios testés.
- Import photo de test PNG 300×180, déplacement comparaison clavier, réglage molette/slider, export PNG taille identique et pixels effectivement modifiés, export JPEG Pour X, préférences.
- Vidéo H.264 synthétique : chargement local, lecture, vitesse 0,5× ; export vidéo désactivé.
- **Non réalisés** : test Safari physique iPhone, VoiceOver physique, HEIC spécifique et performance sur longues vidéos. Pour ces contrôles, le statut doit rester « non vérifié ».

## Procédure de publication
Ne pas modifier `main`, l'application publiée, la PWA, les consentements, le Directeur IA ou les données privées. Cette étude doit rester en PR brouillon jusqu'à validation visuelle explicite par l'utilisateur, puis intégration progressive et tests Safari / non-régression.