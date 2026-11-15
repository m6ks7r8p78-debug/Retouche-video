# RetoucheProAI · Édition One V8 — Aube Optique

## Direction de design
Continuité de la V5 choisie par l’utilisateur, enrichie de la chaleur recherchée dans la V6. La direction expérimentale Signature 07 n’est pas utilisée.

- Retient l’objectif optique V5, les boutons asymétriques en facettes, les molettes crantées et le pont de navigation.
- Nouvelles matières : porcelaine pêche, cuivre rosé satiné, vert d’eau, ivoire et graphite. Peu de néons ; lisibilité prioritaire.
- Bouton « Ajouter un média » unique, visible avant la barre du bas sur les formats testés.
- Atelier : avant original intact, après = aperçu colorimétrique local, et non restauration IA.
- Choix d’export : JPEG, PNG et JPEG « Pour X » (publication manuelle, compression de X possible).

## Tests (Chromium, automatisés)
- 320×700, 375×812, 390×844, 430×932, 768×1024.
- Pas de débordement horizontal ; action principale visible sans chevaucher le dock.
- Navigation, style de rendu, comparaison clavier, import PNG et vrai téléchargement de l’aperçu PNG.
- Vérification des options d’accessibilité : texte agrandi et mouvement réduit.
- Import d’une vidéo MP4 synthétique : vidéo visible, commande d’export vidéo désactivée.
- Aucune exception JavaScript dans les parcours automatisés.

## Limites et règles de publication
- Prototype autonome, sans raccord aux moteurs IA, ni reconstruction AR ni export vidéo.
- Pas de test Safari iPhone physique, pas de test de charge matériel ni de performance sur long média.
- Pas de données privées uploadées. L’exemple de photo est celui déjà intégré au prototype V5.
- **Ne pas fusionner dans main, ni déployer sur retoucheproai.com avant une validation explicite de l’utilisateur et une intégration avec tests de non-régression.**