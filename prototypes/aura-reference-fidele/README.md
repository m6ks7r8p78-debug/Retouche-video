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

## Continuité UX — sans refonte graphique (15 novembre 2026)

Cette révision prolonge la PR #23 en conservant **exactement** l'accueil de la maquette AURA déjà reconstruite. Les captures Chromium 320×700, 375×812, 390×844, 430×932, 768×1024 et 1024×768 ont été comparées pixel par pixel **avec le HTML de la PR #23 en environnement local identique : zéro pixel différent**. Cela vérifie l'absence de régression visuelle du prototype existant, et ne prétend pas que celui-ci reproduit parfaitement la maquette artistique d'origine.

### Corrections fonctionnelles
- Photo importée : aperçu **neutre** avant action ; l'original n'est pas retouché en silence. Le bouton central applique seulement des corrections colorimétriques locales (non IA). Test d'export PNG sans correction : pixels identiques sur une image synthétique.
- Réglages avancés : petit bouton « Réinitialiser » **dans le panneau superposé au média**, et non un nouveau bouton sur l'accueil ; la molette, les onglets et le glisseur restent synchronisés.
- Projets de session : chaque média importé reste réellement rouvrable depuis Projets/Bibliothèque, avec sa position du comparateur et ses réglages, tant que la page reste ouverte. Historique borné à dix médias en mémoire ; **aucune persistance** après fermeture.
- Vidéo : ralenti 0,5× à 2× uniquement en lecture ; comparaison **sans faux filtre vidéo**, export vidéo toujours désactivé, commande « Réinitialiser » rétablit 1×.
- Navigation : un seul onglet actif après réouverture d'un projet.

### Vérifications
Script reproductible : `check_ux.py` (Chromium, Pillow ; FFmpeg pour vidéo H264 synthétique). Testé localement sur six tailles d'écran : import de deux PNG, comparaison clavier, réglages et remise à zéro, PNG exporté modifié, réouverture du premier projet avec ses paramètres, aucun débordement horizontal ni erreur JS. Test vidéo : lecture, 0,5×, retour 1×, export bloqué. **Safari iPhone physique, VoiceOver, performances sur grands médias non testés.**

Aucun Directeur IA, modèle de restauration, suppression AR, traitement ou export vidéo réel n'est ajouté. `main`, la PWA et retoucheproai.com demeurent inchangés. Ne pas fusionner ni déployer sans validation explicite de l'utilisateur.


## Révision UX : historique Annuler / Rétablir (15 novembre 2026)

**Aucun changement du design de l'accueil.** Deux petites commandes ↶ / ↷ apparaissent exclusivement dans le panneau optionnel de précision, superposé à la photo ou à la vidéo. Pas de nouveaux boutons sur l'écran principal.

- Annulation et rétablissement des corrections photo locales (Lumière, Contraste, Couleurs), de l'action automatique locale et de la remise à zéro. Les gestes continus sur la molette sont regroupés en **une seule action**.
- Historique distinct par média, **32 actions maximum** ; après changement de projet dans la session, l'historique associé est retrouvé.
- Vidéo : annuler/rétablir le **ralenti de lecture uniquement**. L'export vidéo reste désactivé.
- Commandes accessibles au clavier (flèches sur la molette ; Ctrl/Cmd+Z, Ctrl/Cmd+Maj+Z). Les boutons sans action possible sont désactivés et libellés.
- L'original n'est jamais altéré ; les corrections sont locales, **sans modèle IA**. Historique perdu lors de la fermeture/rechargement de la page : aucune persistance.
- Tests Chromium effectués sur **320×700, 375×812, 390×844, 430×932, 768×1024, 1024×768**, sans erreur JavaScript ni débordement horizontal détectés, avec deux PNG, export modifié, retour d'un projet, molette souris/clavier, remise à zéro annulable. H264 synthétique : 0,5× -> 1× -> 0,5× ; export indisponible.
- Comparaison pixel à pixel de l'accueil HTML, avant import, avec la PR #25 : **0 pixel différent** sur 320, 390, 430 et 768 px dans Chromium, mêmes conditions de capture. Ce résultat ne prouve pas une identité parfaite avec la maquette 3D artistique originale.
- Script de vérification : `check_history.py`. Safari physique iPhone, VoiceOver, HEIC et charge mémoire sur grands médias **non testés**.

**PR en brouillon seulement.** Ni `main`, ni les moteurs IA, ni la PWA, ni le site public ne sont modifiés. Aucune fusion/publication sans accord explicite et tests d'intégration.
