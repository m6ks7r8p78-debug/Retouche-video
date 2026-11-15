# RetoucheProAI — AURA, étude interactive simplifiée (référence acceptée)

## Référence artistique immuable
Cette étude repart **exclusivement** de la maquette V6 AURA fournie par l'utilisateur dans la conversation du 15 novembre 2026, puis de son évolution épurée. **Ne pas revenir aux interfaces V5, V8, Signature 07, Atelier Cinéma ou « La Pièce ».** Conserver le studio cinématique chaleureux, cuir, métal, bronze et bois, le moniteur photo, la commande ronde de traitement automatique, et l'importation comme geste principal.

## Correction voulue par l'utilisateur
Les commandes Qualité & détails, Visages/filtres, Couleurs/style et Mouvement/stabilisation **ne doivent plus apparaître en blocs principaux**. Elles appartiendront au futur moteur automatique et resteront seulement consultables et ajustables dans des options avancées facultatives. Accueil = **importer, traitement automatique, accès discret aux options**. Atelier = comparer et enregistrer.

## Ce qui fonctionne vraiment aujourd'hui
- HTML/CSS/JS autonome, sans réseau externe, avec photo de démonstration illustrative intégrée dans le HTML.
- Import local photo JPEG/PNG/WebP (selon décodeur), MP4 lisible localement ; aucun upload.
- Photo : corrections colorimétriques classiques par Canvas ; analyse basique de luminance moyenne et contraste local, presets, intensité, luminosité, contraste, saturation, molette conceptuelle de lancement auto, comparateur tactile/clavier avec original conservé en mémoire de session.
- Vrai téléchargement JPEG, PNG ou JPEG pour X (publication manuelle ; aucune garantie de non-recompression par X).
- Le PNG « qualité maximale » ne crée ni détail ni résolution. Le plus grand côté est limité à 4096 px en mode normal/PNG et à 2048 px pour X ; ces limites sont propres à cette démo.
- Import vidéo = **lecture locale seulement**. Boutons d'export vidéo désactivés, aucun traitement ni suppression d'audio.
- Projet local en mémoire de session, sans persistance IndexedDB. Préférences texte agrandi, réduction des mouvements, contraste.

## Ce qui n'est PAS connecté
**Pas de moteurs IA, Directeur IA, reconstruction de visages/AR, super-résolution, stabilisation vidéo, vraie restauration photo, ni export vidéo.** Le traitement « automatique » de cette étude signifie uniquement une correction photo classique locale. Aucun des 157 médias personnels utilisés. Ne jamais présenter la photographie de démonstration comme un résultat de restauration IA.

## Tests effectués le 15 novembre 2026
Chromium depuis le véritable HTML autonome, injecté dans la page pour éviter le blocage des navigations localhost/file:// : **320×700, 375×812, 390×844, 430×932, 768×1024, 1024×768** : 0 débordement horizontal, 0 erreur JS, atelier, comparaison clavier, panneau de réglages, exports PNG, préférences testés. Import JPEG synthétique 301×157 puis téléchargement JPEG Pour X avec résolution et changement de pixels vérifiés. Vidéo MP4 synthétique 160×90 : lecture locale et export désactivé. **Safari iPhone physique, VoiceOver, HEIC, charge/thermique : non testés.**

## Protection
Branche isolée de `main`, PR en brouillon. Ne pas fusionner, déployer, remplacer l'application publiée ni toucher aux moteurs/données/consentements sans validation artistique explicite, puis tests d'intégration et de non-régression.
