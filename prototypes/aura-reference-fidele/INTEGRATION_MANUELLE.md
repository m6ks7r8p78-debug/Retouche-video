# RetoucheProAI AURA — atelier manuel + accès au studio complet (étude isolée)

## Identité graphique verrouillée

Cette étude continue **exactement** la référence AURA de la PR #27, sans redessiner l'accueil, les matières cuir/métal, l'aperçu vidéo/photo ni les trois commandes principales. Captures d'accueil comparées **bit pour bit** à 320, 375, 390, 430, 768 et 1024 pixels en Chromium, mêmes conditions. Ne pas réutiliser les variantes rejetées.

## Ce qui est vraiment fonctionnel dans CE prototype

- Import photo / vidéo et comparateur avant-après interactif.
- Photo : luminosité, contraste, saturation, ombres, hautes lumières, température et teinte, netteté numérique de type accentuation, réduction de bruit de lissage local, correction de gamma « Nuit ».
- Cinq profils classiques **non neuronaux** : Naturel, Équilibré, Détails, Faible lumière, Nuit → jour (simulation colorimétrique ; ne reconstitue pas une scène diurne réelle).
- Panneau facultatif sur le média : groupes Lumière / Couleur / Détails / Nuit / Profils / Sortie, molette tactile/clavier, Annuler/Rétablir (32 actions), Réinitialiser, projets par session.
- Export photo réel JPEG ou PNG avec résolution source, Full HD ou 4K UHD selon le rapport hauteur/largeur, et JPEG « Pour X ». La mise à l’échelle n'est **pas une super-résolution IA**. Limite source nominale de 4096 pixels, traitement jusqu'à 64 MiB de surface RGBA, selon limites du navigateur. Pour X : dimensions plafonnées au cadre 1920×1080 (paysage) ou 1080×1920 (portrait). X peut recompresser.
- Vidéo : lecture et vitesse 0,5× à 2×, aperçu uniquement des changements de luminosité, contraste, saturation et nuit, sans export vidéo depuis le prototype. **Ne jamais présenter cette prévisualisation comme une vidéo transformée/exportée.**

## Accès aux vrais moteurs d'origine

Le bouton **Outils complets de RetoucheProAI**, dans les réglages avancés, charge facultativement le fichier racine `../../index.html` **sur le même hébergement** et transfère, après clic explicite, le média local sélectionné au champ d'import du studio principal (`#fp` photo / `#f` vidéo). Cela donne accès à l'interface **réelle existante** et à ses capacités dans la même page, sans les réimplémenter ni les simuler : export Full HD/4K vidéo, profils, modèle IA, effacement, filtres, montage, vitesse, etc., sous réserve de compatibilité / de disponibilité des modèles / de leurs propres tests.

**Restriction importante :** le transfert même-origine a été vérifié avec un studio natif simulé en Chromium (File + `change`). **Le fonctionnement de l'iframe avec l'ensemble de l'app réelle et le déploiement en ligne n'a pas pu être testé** dans ce conteneur (navigations HTTP locales bloquées). Sur un hébergement qui ne sert que l'HTML AURA, `../../index.html` ne contiendra pas la vraie app. Le prototype affiche alors un avertissement et un lien de secours vers le site principal. Ce n'est pas une intégration moteur complète et validée.

## Recherche et innovations

Aucun nouveau modèle neural, reconstruction de visage/filtre, stabilisation, super-résolution neuronale ou conversion vidéo révolutionnaire n'est introduit dans cette PR. Les fonctions de recherche sont **laissées dans leur état d'origine**. Elles ne seront proposées dans AURA comme « amélioration validée » qu'après des essais comparatifs mesurés sur des médias de référence avec non-régression et garde-fous de qualité.

## Vérifications effectuées

- `test_integral.py` : 6 écrans Chromium (320×700, 375×812, 390×844, 430×932, 768×1024, 1024×768), accueil bit pour bit identique, luminosité/nuit/netteté/profils, Annuler, export PNG FHD 1440×1080 pour source 4:3, export PNG 4K 2880×2160 pour source 4:3. Aucune exception JS ni débordement horizontal.
- `test_quality.py` : image synthétique de référence ; augmentation mesurée du contraste de contour (110→166), bruit de zone plate réduit (variance ~80→46), ombres éclaircies (55→80), nuit (55→92), réchauffement réel des canaux RVB.
- `test_video_integration.py` : MP4 H264 synthétique ; ralenti 0,5× ; aperçu couleur, Annuler, export vidéo désactivé.
- `test_bridge.py` : transfert `File` vers les champs du studio à même origine avec un substitut du studio ; le vrai studio complet n'a pas été validé.

Tests **non réalisés** : Safari physique iPhone, VoiceOver, HEIC/HEIF, photos 12+ Mpx, vidéo longue, chaleur/batterie, modèles IA réels et export vidéo du studio embarqué. Ne pas prétendre à leur validation.

## Sécurité et publication

Prototype dans `prototypes/aura-reference-fidele/` sur une branche expérimentale dérivée de la PR #27. `main`, retoucheproai.com, la PWA et les vrais moteurs IA ne sont pas modifiés. Aucune vidéo privée ni aucun jeton ajouté. **PR en brouillon, aucune fusion ni mise en ligne avant accord explicite.**