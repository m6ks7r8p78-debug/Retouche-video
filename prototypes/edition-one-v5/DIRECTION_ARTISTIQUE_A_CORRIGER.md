# RetoucheProAI — correction de cap artistique (15 novembre 2026)

## Décision consolidée après le rejet d'Atelier Cinéma

**L'utilisateur juge V5 PLUS PROCHE de son attente que l'exploration Atelier Cinéma.** Ce n'est **pas** une validation de V5 en l'état et ce n'est **pas** une autorisation de revenir à V8.

### Sources directes
- PR #7, branche `design-edition-one-v5-controls` : conception de la V5.
- Captures réelles archivées : `V5_430_accueil.png`, `V5_430_boutons.png`, `V5_430_atelier.png`.
- PR #9 V8 dérivée de V5 : rejetée par l'utilisateur.
- PR #8 Signature 07 : rejetée en tant que direction graphique.
- PR #12 Atelier Cinéma : refusée (« toujours le même truc moche générique »), fermée sans fusion.
- La référence dite V7 préférée et la direction Signature 07 **ne sont pas identifiées comme identiques** ; ne plus les confondre.

## Ce qui est vérifiable et intéressant sur V5
1. Grand déclencheur principal asymétrique nacré avec actionneur noir encastré, chanfreins et profondeur.
2. Clés de commandes mécaniques facettées, au lieu de rectangles à icônes et halos.
3. Molettes crantées pour des gestes réellement continus, avec potentiel tactile.
4. Atelier basé sur l'image, avec comparaison et option « voir l'original ».
5. Navigation biseautée et grammaire instrumentale cohérente.

## Critique de V5, non corrigée par les essais suivants
- La composition « titre héro + grand objectif rond + CTA + dock » est encore conventionnelle, malgré les efforts de style.
- Plusieurs commandes paraissent encore être des objets de vitrine, sans démonstration d'une fonction propre.
- L'encombrement et certaines légendes étroites pénalisent l'accessibilité mobile.
- Noir quasi uniforme et accumulation d'effets 3D peuvent nuire à chaleur, jovialité et lisibilité.
- Les V8/Atelier Cinéma ont reconditionné l'expérience sans rupture structurelle convaincante.

## Contrat de conception pour la prochaine expérimentation
- **Ne pas produire de « V9 » ni annoncer une nouvelle génération tant qu'aucune rupture de composition et d'interaction n'est démontrable dans le vrai HTML.**
- Faire une évolution **à partir de V5**, en conservant les moteurs séparés et le code existant intact.
- Supprimer l'objectif central purement décoratif : chaque pièce centrale doit être fonctionnelle (import réel, aperçu, comparaison, réglage).
- Réinventer les silhouettes et les états des **trois** commandes essentielles (Importer, Améliorer, Comparer) dans le même système de formes, avec mouvements naturels et sans haloes génériques.
- Créer une composition photographique où la matière et la profondeur soutiennent la photo plutôt qu'un spectacle de boutons.
- Éviter les dégradés bleu/rose/violet IA, l'excès de lumière et l'imitation du dashboard technique ; garder une ambiance riche, chaleureuse et unique.
- Priorité absolue à l'usage iPhone, surfaces tactiles >=44 px, VoiceOver, texte agrandi et réduction des mouvements ; labels en français explicites.
- Chemin novice : Importer -> Amélioration automatique -> Comparer -> Enregistrer. Outils avancés discrètement accessibles.
- Ne jamais maquiller une correction locale colorimétrique en « IA » ni promettre de la reconstruction ou de l'export vidéo non branchés.

## Preuves exigées avant présentation
1. Captures générées **par Chromium exécutant le HTML réel**, sur 320, 375, 390, 430 et 768 px.
2. Capture comparée côte à côte avec la **V5**, pas avec Signature 07 ou V8.
3. Démonstration que la composition **et** le comportement des commandes ont changé, pas uniquement palette, bordures ou halos.
4. Import photo, image préservée, comparaison tactile/clavier, export honnête ; aucune exception JS/overflow ; test physique Safari marqué distinct.
5. **Aucune modification de main, PWA, site ou moteurs IA ; aucune fusion ni publication sans validation utilisateur.**
