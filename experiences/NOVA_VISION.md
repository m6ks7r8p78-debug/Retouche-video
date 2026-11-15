# RetoucheProAI NOVA — proposition de rupture et première preuve fonctionnelle

**Statut : expérimental, isolé, non déployé.** Aucune modification de `main`, de `index.html`, des modèles privés, de `sw.js` ou des médias. La branche part de `chatgpt-ai-director-v01` pour préserver les travaux ChatGPT/Claude existants.

## La rupture : de « lancer un modèle » à « choisir le meilleur résultat admissible »

La plateforme cible n'applique plus aveuglément un profil unique à toute la vidéo. Elle orchestre, **sur chaque scène et région**, plusieurs hypothèses de restauration réelles, mesure leurs compromis puis conserve l'original lorsqu'aucun candidat ne passe les garde-fous.

1. **Diagnostic temporel et spatial** : segmentation de plans, cartographie bruit/blocs/lumière/mouvement et zones AR, estimation de confiance. Distinguer mesure, supposition, annotation vérifiée.
2. **Moteur d'hypothèses** : baseline fidèle (rendu existant), traitements classiques, modèles spécialistes validés, et reconstruction générative uniquement avec accord explicite.
3. **Arbitre et contrôles** : comparer la sortie à la source, regarder sur et hors des masques, refuser les régressions (visages/identité, scintillement, textures, écrêtage, erreurs spatiales, temps/mémoire). Si aucune preuve suffisante, conserver l'original et le signaler.
4. **Continuité vidéo** : exploiter plusieurs images voisines, mouvement estimé et occlusions pour lisser les décisions entre plans sans contaminer les scènes.
5. **Carte de provenance** : résultat fidèle / hypothétique / inventé, masque par zone, version des moteurs, consentements et possibilité de désactiver un traitement sans perdre la source.
6. **Apprentissage prudent** : laboratoires privés avec groupes de scènes séparés et baselines bicubiques / classiques / RNE ; pas de promotion d'un réseau à partir d'un seul score ou d'un benchmark synthétique favorable.

### Ce qui fonctionne vraiment dans le prototype livré

- `experiences/nova.html` : interface responsive nouvelle, import local photo/vidéo, aperçu sombre neutre, grande scène, comparateur tactile avant/après et bande d'instants.
- Pour la **photo** : deux traitements d'aperçu déterministes, **éclaircissement gamma modéré** et **accentuation de contours légère**. Calcul local ; le moteur `nova-decision.js` choisit un candidat seulement s'il satisfait des contrôles prudents (sinon original).
- Mesures transparentes : luminance moyenne, proportion de très hautes lumières, variation locale horizontale de luminance, écart de pixels. **Ce sont des proxies ; ils ne mesurent ni vérité terrain ni esthétique.**
- Export PNG **de l'aperçu seulement**, limité à 1 600 pixels sur le plus grand côté ; pas de fausse promesse d'un traitement 4K/8K. La source n'est jamais écrasée.
- Pour la **vidéo** : lecteur natif et prélèvement de cinq instants (si décodables), dont le bilan de lumière. **Ce n'est pas une détection fiable de coupes**, ni une restauration, ni un export vidéo.
- Aucun CDN, service tiers, transfert réseau, téléchargement de modèle, identification faciale, reconnaissance AR ou entraînement activé par cette page.

### Ce qui n'est PAS implémenté aujourd'hui

- Aucun raccordement de cette page au pipeline d'export existant, ni orchestration vidéo par scène/région.
- Aucune comparaison réelle entre tous les spécialistes neuraux ni apprentissage sur les 157 médias depuis ce prototype.
- Aucune détection AR v4 ou reconstruction 3D réellement activée.
- Aucun test matériel Safari iPhone 15 Pro Max pour ce prototype ; l'interface doit être éprouvée physiquement.

### Pourquoi le nouveau moteur est pertinent pour nos résultats

Le banc AR de la PR #1 a encore 62,5 % d'échecs sur 8 cas artificiels et le filtre chat est très mal retiré : le nouveau moteur doit pouvoir **refuser les masques AR non fiables**. Le RNE 0.4 ne surpasse pas le bicubique temporellement sur les fenêtres auditées : le nouveau moteur doit pouvoir **préférer le bicubique** plutôt que forcer une sortie neuronale. Une apparente hausse de netteté n'est pas une preuve de restauration des détails originels.

## Essai

Après un checkout de cette branche, servir le dépôt en local, puis ouvrir `/experiences/nova.html`.
Exemple : `python3 -m http.server 8080` à la racine puis `http://localhost:8080/experiences/nova.html`.

Tests du module pur : `node --test tests/nova-decision.test.mjs`.
Le navigateur doit prendre en charge Canvas 2D et les codecs du média. L'arbitrage ne remplace jamais une validation visuelle ni un banc de vérité terrain.

## Design cible (parcours iPhone en trois gestes)

- **Importer** : un seul bouton principal, capture du format et de l'origine, résumé de confidentialité.
- **Regarder** : grand écran « avant / proposition », bande d'instants, points d'attention visibles, avec zoom sur les éléments sensibles.
- **Garder ou exporter** : une seule décision et rapport de provenance compréhensible. Les options avancées (« Fidélité », « Reconstruction » et « Pro ») restent secondaires.

Direction visuelle : papier clair et typographie éditoriale pour la navigation ; scène photo/vidéo très sombre et neutre pour juger les images ; accent menthe pour les actions, aucun faux panneau IA avec scores fantaisistes. Adapté aux zones de sécurité de l'iPhone.

## Critères de promotion vers l'application

1. Tests sur véritables paires de référence vérifiées et groupes non contaminés ; filtres AR par **type et taille**, avec mesures du masque dans/hors région et taux de faux positifs.
2. Pas de régression temporelle mesurée face au meilleur moteur classique sur plusieurs scènes, pas seulement face à RNE 0.3 ; revue humaine sur textures, peaux et yeux.
3. Vidéo : l'export doit *effectivement* refléter les réglages et préserver durée/audio/orientation ; iPhone réel et test thermique/mémoire.
4. Traçabilité et consentements par média, absence de données privées sur GitHub.
5. Tests d'accessibilité et d'usage d'une personne non experte (import → un bouton → résultat), avec possibilité claire de revenir à l'original.

**Décision de diffusion** : ne pas fusionner dans `main` ni modifier le site publié sans examen et validation.
