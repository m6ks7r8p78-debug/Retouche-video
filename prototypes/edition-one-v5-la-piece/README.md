# RetoucheProAI — Étude issue de la V5 : « La Pièce »

## Statut
**Étude indépendante de design et de comportement. NON validée artistiquement.** Aucune fusion, aucun déploiement et aucun remplacement de la V5 ni de la PWA. Prototype autonome sans librairie externe, photographie de démonstration **déjà intégrée dans le prototype V5** (aucune vidéo personnelle).

Cette étude part de la **V5 réelle** (`design-edition-one-v5-controls`, PR #7) et des remarques de l'utilisateur du 15 novembre 2026 : la V5 est plus proche de la direction recherchée que Signature 07, V8 et Atelier Cinéma, mais demeure encore trop générique. Elle ne prétend pas retrouver la V7 préférée ni constituer la réponse graphique définitive.

## Différences structurelles observables par rapport à la V5

| Élément | V5 originale | Étude « La Pièce » |
|---|---|---|
| Centre de l'accueil | Grand objectif graphique non fonctionnel | Cadre photographique **fonctionnel**, comparateur tactile/clavier avant/après |
| Import | Déclencheur nacré asymétrique | **Pièce d'import double matière**, face émaillée et actionneur encastré à arêtes taillées, déclenchement réel du sélecteur |
| Molette | Objet de galerie qui alterne un état « allumé » | **Molette physique de luminosité** utilisable par glissement vertical et flèches, synchronisée avec l'image et son export |
| Atelier | Photo, trois filtres et comparateur | Image et comparateur, trois rendus + trois **réglages réels** (luminosité, contraste, couleurs) et remise à zéro |
| Décor / composition | Objectif central, orbit et titre héro | Photographie au premier plan, découpe asymétrique, gardes latérales et annotations discrètes |
| Export | JPEG/PNG d'aperçu local et profil X | Export via canvas, dimensions source pour JPEG/PNG ; JPEG côté long max 1920 px pour X, publication manuelle |
| Galerie | Texte conceptuel | **Dernier média de session**, sans stockage persistant |

La finition utilise graphite, émaux chauds, laiton désaturé, arêtes découpées et gravures. Les transitions sont courtes, sans halos. Les surfaces tactiles principales mesurent au moins 44 px. Un mode grand texte et réduction des animations est prévu.

## À essayer

Ouvrir `index.html` dans un navigateur moderne : **aucune dépendance réseau**. Sur iPhone, utiliser Safari via un hébergement isolé (non déployé ici) ou un aperçu HTML autorisant JavaScript et l'accès aux fichiers.

Parcours d'essai :
1. Accueil : faire glisser la séparation de la photo exemple, ou utiliser les flèches du clavier sur l'image.
2. « Ajouter un média » : importer photo ou vidéo locale.
3. Photo : choisir Naturel, Velours ou Éclat ; tester la molette et le volet « Affiner à votre goût », voir l'original en maintenant.
4. « Enregistrer l'aperçu » : JPEG, PNG ou JPEG « Pour X ».
5. Projets : vérifier le dernier média de **cette session**.
6. Préférences : tester grand texte et réduction des animations.

## Précision fonctionnelle

- Les filtres sont de simples opérations Canvas 2D/CSS. **Aucune IA, restauration, super-résolution, suppression AR, traitement vidéo, analyse de scène ou Directeur IA connecté.**
- Import vidéo en **lecture locale seulement**. Export photo et commandes de traitement désactivés pour les vidéos.
- La comparaison gauche/droite conserve l'**original** intact et affiche à droite l'aperçu corrigé.
- `Qualité maximale` signifie seulement **PNG aux dimensions d'origine**, **pas** upscale 4K/8K.
- `Pour X` signifie JPEG préparé localement, jamais publication directe ni garantie contre la recompression de X.
- Aucune persistance : un rechargement perd les médias importés. Aucun transfert vers des serveurs.
- Grandes photos, HEIC Safari, encodage P3/HDR, performances thermiques, VoiceOver matériel : non vérifiés ; certaines images peuvent échouer à l'export selon le navigateur.

## Tests Chromium exécutés

Script reproductible : `python tests/check.py` (nécessite Python, Playwright, Pillow et Chromium en `/usr/bin/chromium`). Dans cet environnement, les URL `file://` et localhost sont bloquées par politique du navigateur, donc la vérification s'effectue avec **`page.set_content`**, à partir des octets HTML réels.

- Six formats : `320×700`, `375×812`, `390×844`, `430×932`, `768×1024`, `1024×768`.
- Aucune erreur JS ni débordement horizontal constatés dans les parcours testés.
- Comparateur clavier, presets, molette au clavier, réglages, remise à zéro, focus de la feuille d'export, import JPEG, extraction de dimensions, export PNG (512×512 exemple), export JPEG X (300×170 média synthétique), navigation et options d'accessibilité.
- Vidéo synthétique MP4 : ouverture locale, lecture seule, commandes incompatibles désactivées ; **aucun export vidéo**.
- Captures réelles de Chromium : `captures/accueil_430.png`, `captures/atelier_430.png`, `captures/accueil_desktop_1024.png` et comparaison avec archive V5.
- **Safari physique iPhone : pas testé.** Les tests Chromium ne constituent pas une validation Safari, ni un audit de performance ni une preuve de qualité du design.

## Critères avant toute intégration

1. Retour artistique explicite sur la comparaison V5 / étude ; ne jamais auto-proclamer la proposition supérieure.
2. Raffinement des typographies, matériaux, gravures et commandes sur iPhone réel, incluant VoiceOver et texte agrandi.
3. Raccordement à l'application existante **uniquement via adaptateurs d'interface**, avec contrat Directeur IA, imports, modules, projets, consentements et exports vérifié.
4. Tests de non-régression PWA, import, moteurs IA, traitement vidéo, offline et confidentialité.
5. Aucune fusion sur `main` ni publication sans accord explicite de l'utilisateur.