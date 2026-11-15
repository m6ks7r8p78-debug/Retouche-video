# RetoucheProAI — AURA / Studio à vue (étude fidèle, non publiée)

## Référence autorisée et objectif

La référence **est la maquette AURA approuvée dans la conversation**, avec un grand moniteur avant/après, un bouton central usiné et **seulement trois commandes visibles** : « Ajouter un média », « Traitement automatique », « Menu avancé ».

L'utilisateur a rejeté explicitement les retours à Signature 07, V5, V8, Atelier Cinéma, La Pièce et AURA HTML simplifiée. **Ne pas réintroduire un catalogue de fonctionnalités sur l'accueil.** Le modèle d'interaction souhaité est : **importer → traitement automatique → comparer → enregistrer**, les réglages avancés facultatifs s'ouvrant *sur la vidéo* sans éloigner l'image.

## Ce prototype est une véritable interface

- Fichier **`index.html` autonome**, utilisant HTML/CSS/JavaScript et assets visuels embarqués ; pas d'API ni de réseau externe ; utilisable sur téléphone hors ligne après ouverture du fichier.
- Apparence des *trois commandes* obtenue à partir de **petites textures et découpes de la maquette approuvée**, mais leurs éléments sont de **vrais boutons DOM accessibles** (pas d'un clic simulé sur une capture entière).
- Avant import : une image illustrative de la maquette approuvée est affichée avec un badge **« EXEMPLE »**. Elle n'est pas une vidéo personnelle ni une restauration réelle ; les commandes de lecture sont désactivées.
- Après import : le vrai média prend la place de cette illustration, reste visible à l'écran, et le panneau facultatif s'ouvre directement sur la zone vidéo/photo.
- Photo (JPEG/PNG/WebP/AVIF selon navigateur) : traitement *classique* Canvas local d'exposition, contraste et saturation, auto-correction indicative ; original préservé. Comparaison à glisser + flèches clavier ; réglages d'intensité, lumière, contraste et couleur.
- Enregistrement photo local : automatique = JPEG ; maximum = PNG au maximum de la résolution d'entrée (plafonné à 4096 px côté long dans cette étude, **pas de 8K généré**) ; Pour X = JPEG côté long ≤1920 px, publication manuelle, recompression X possible.
- Vidéo : lecture locale MP4/WEBM/MOV *uniquement si le navigateur prend en charge le codec*, comparaison en prévisualisation par deuxième vidéo synchronisée de façon approximative, lecture 0,5× à 2× ; audio natif sur la vidéo principale, seconde vidéo muette ; **pas d'export ni de restauration vidéo**. L'interface marque l'export comme indisponible.
- Préférences taille de texte, réduction animations et contraste ; projets et bibliothèque de session non persistants.

## Ce qui N'EST PAS livré ici

Aucun vrai Directeur IA, modèle neuronal, suppression AR, restauration faciale, interpolation vidéo, super-résolution, amélioration 4K/8K, export vidéo, synchronisation image/audio garantie ou sauvegarde de projets persistante. Une correction colorimétrique classique ou un simple changement de vitesse de lecture n'est pas une restauration IA. Aucun média personnel de l'utilisateur n'est partagé.

## Vérifications exécutées

Test Playwright Chromium du *véritable* `index.html` (avec `page.set_content` pour contourner le blocage des pages locales par l'environnement) : **320×700, 375×812, 390×844, 430×932, 768×1024, 1024×768**. Tous passent : aucun débordement horizontal ni exception JavaScript, aperçu présent, import PNG synthétique 300×170, comparaison clavier, panneau avancé, lumière, traitement photo local, export PNG dont pixels différents de l'original, export JPEG Pour X, préférences, navigation projets.

Un MP4 H.264 **synthétique généré par FFmpeg** est testé dans Chromium : lecture vidéo, commande ralenti à 0,5×, export indisponible. La hauteur calculée peut dépasser le viewport de 1 pixel à cause des arrondis CSS, **pas de défilement significatif sur les formats iPhone testés**. Sur Safari iPhone physique, HEIC/HEIF, VoiceOver, performances longues et thermique : **pas encore testés**.

Exécution : `python tests/smoke.py` (prérequis `playwright`, `Pillow`, Chromium à `/usr/bin/chromium`, FFmpeg et `libx264` pour le test vidéo ; `CHROMIUM` personnalisable).

## Protection GitHub

Projet conservé dans `prototypes/aura-studio-visible/` sur une **branche de conception indépendante** de `main` et dans une **PR en brouillon**. Aucun remplacement de l'interface de production, du PWA, des moteurs, des consentements, ni déploiement. Attendre l'avis esthétique explicite et les tests d'intégration/régression avant fusion ou publication.