# RetoucheProAI — Atelier Cinéma / étude 01 (isolée)

## Pourquoi cette branche

Le retour utilisateur du 15 novembre 2026 rejette explicitement **Signature 07** (PR #8) et son évolution (PR #10, fermée). L'objectif n'est pas un retour arbitraire à la V5 ou à la V8, mais de poursuivre l'univers graphique sombre, tactile, cinématique et premium montré dans les images historiques **V6 AURA** tout en corrigeant ses clichés visuels (objectifs centraux géants, boutons en halo, dégradés néon omniprésents).

**Important :** ces images sont des *concepts graphiques* archivés, non une preuve de l'identité exacte de la « V7 » antérieurement préférée. Cette étude est une exploration fondée sur l'esthétique vérifiée des anciens concepts, **pas** une nouvelle référence validée.

## Réalisation

- `index.html` : véritable interface autonome en français, mobile-first, sans dépendance ni requête distante ; photo exemple embarquée déjà présente dans les prototypes historiques du dépôt.
- Accueil : action primaire d'import explicitement libellée, composition focalisée sur le média, marque dessinée en SVG.
- Atelier : photo locale importée, réglages colorimétriques classiques sur **canvas** produisant de vrais pixels, 3 préréglages ; comparateur tactile/clavier avant-après ; maintien pour afficher l'original (restauration de la position précédente du comparateur).
- Export réel local de l'**aperçu photo** en PNG ou JPEG. Mode « Pour X » : JPEG 88 %, destiné à une publication manuelle ; X peut recompresser.
- Vidéo : import local et lecture native, **pas** de traitement ou d'export vidéo ; boutons d'export désactivés.
- Projets : carte temporaire de session, **pas** de persistance.
- Réglages : agrandissement de texte, réduction du mouvement, contraste renforcé ; préférences non persistantes.
- Outils avancés présentés comme **non connectés** : restauration IA, filtres AR, mouvement et montage.

## Validation réelle, sans extrapolation

- Chromium via Playwright, `page.set_content` autonome, résolutions : **320 × 700, 375 × 812, 390 × 844, 430 × 932, 768 × 1024, 1024 × 768**.
- Aucun débordement horizontal ni erreur JS sur ces six parcours ; CTA visible au-dessus de la navigation sur les formats mobiles.
- Import PNG 800 × 600 → canvas 800 × 600, filtre « Lumière » modifie effectivement les pixels, comparaison par clavier, panneau avancé, export PNG téléchargeable 512 × 512 pour l'exemple, taille du texte augmentée.
- MP4 synthétique importé et lié au lecteur via une URL locale `blob:` ; export et préréglages vidéo désactivés. Export « Pour X » JPEG téléchargeable ; aucune requête HTTP réseau externe. Les seules requêtes navigateur observées sont des URL `blob:` locales.
- Captures Chromium `capture_accueil_ecran_390.png`, `capture_atelier_ecran_390.png` (dans le paquet de revue local fourni à l'utilisateur ; pas de captures privées en dépôt).

### Limitations / protection

- **Ce n'est pas un moteur IA**, ni un export vidéo, ni une preuve de qualité supérieure. Le canvas utilise les filtres graphiques classiques du navigateur (`CanvasRenderingContext2D.filter`).
- Pour ne pas surcharger Safari, le côté le plus long de l'export photo est plafonné à 3 200 pixels ; l'original importé n'est pas modifié.
- La sélection de fichiers est locale. Aucune authentification, aucun upload, aucune connexion à l'application publiée et aucune modification de son état.
- Les 157 vidéos personnelles, les modèles IA, les données et les consentements ne sont pas inclus, ni lus, ni modifiés.
- Safari iPhone physique, HEIC, AVIF, gros fichiers, mémoire GPU, partages natifs et validation d'accessibilité avec VoiceOver **non testés**. Aucun prétendu fonctionnement 4K/8K ou restauration photo/vidéo par IA.

## Suite indispensable avant un déploiement

1. Identification et validation du véritable visuel de référence préféré, puis revue esthétique de cette étude en conditions réelles.
2. Validation Safari iPhone physique (touch, fichiers, mémoire, exports, VoiceOver, mode réduit).
3. Cartographie des points d'entrée existants de `app.js` / Directeur IA / import et exports, création d'adaptateurs progressifs, gardes de non-régression et tests E2E avec moteurs effectivement raccordés.
4. Fusion et mise en production **uniquement après validation explicite**. Cette PR reste en brouillon ; `main`, les PWA, le site, les branches IA et les données privées sont inchangés.