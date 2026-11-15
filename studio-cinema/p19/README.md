# Retouche Cinema AI P19 — MicroMotion Controls

**Recherche expérimentale, novembre 2026. Aucune mise en production.**

## Livrable réel
P19 génère **480 états numériques de mouvement distincts sur 8 s à 60 Hz**, ou 360 à 45 Hz, pour un **personnage adulte entièrement fictif**. Le programme ne génère pas de visages photoréalistes et n'a utilisé aucun original des 157 vidéos.

- Variables simultanées : trajectoires 2D de la main, des doigts et du filtre, contact lèvres, ouverture labiale, joues, paupières, regard, micro-mouvements du torse, retrait, expiration, dispersion de fumée et enveloppe sonore synthétique.
- Transitions main–objet–bouche à interpolation quintique lissée (continuité jusqu'à la dérivée seconde aux points d'arrêt), contrôles vitesse/accélération/jerk, tests d'absence de téléportation et de fumée précoce.
- **P17+P16+P2** : deux clips dirigés de 4 s ; personnages et accessoires stables au raccord à 4 s. Le saut calculé du filtre à la coupe est **0,008828 unité normalisée**.
- **P18 corrigé** : provenance `synthetic_procedural` reconnue explicitement ; ne jamais la confondre avec `synthetic_manual` (annotation humaine).
- Le premier essai a **échoué** au seuil de vitesse du pilote (~0,765 unité/s). La courbe corrigée est à ~**0,552 unité/s** sous le seuil de 0,65, non étalonné sur des gestes humains.
- Le MP4 produit localement est une **animation vectorielle illustrative** 720×720 H.264 Constrained Baseline + AAC, durée 8 s, **480 images rendues individuellement à 60 i/s**. L'audio est du bruit filtré synthétique, pas une voix. Il ne s'agit pas d'une véritable séquence photoréaliste ni d'une synthèse vidéo neuronale.

## Reproduction depuis la racine du dépôt

```bash
node --test studio-cinema/p19/tests/test_p19.cjs studio-cinema/p18/tests/test_p18_motion.cjs
node studio-cinema/p19/src/build_p19_dataset.cjs --fps=60
pip install numpy opencv-python
python studio-cinema/p19/src/render_p19.py
```

Le rendu vectoriel nécessite FFmpeg sur le PATH et écrit un MP4 dans `studio-cinema/p19/public/`. Le script produit le fichier de données de poses et le rapport d'audit avant le rendu.

## Mesures vérifiées localement

- **32 tests P19 + 22 tests de non-régression P18 = 54 réussites**.
- 480 contrôles; 279 positions distinctes du filtre; 480 positions de bouche; 106 valeurs d'ouverture labiale; 50 valeurs de mouvement des joues. Attention : ces nombres numériques ne signifient pas que ces changements sont visuellement réalistes.
- Vérification MP4 avec `ffprobe` (480 images, 60/1 Hz, H.264/AAC) et décodage FFmpeg complet sans erreur.
- Lecteur autonome HTML local avec MP4 incorporé, solution de secours Canvas calculée depuis les poses et navigation en sept phases : deux simulations Chromium (390×844 / 1240×820), sans erreur JavaScript ni accès réseau. L'atelier HTML complet est fourni comme artefact indépendant, pas inclus dans cette PR.
- Safari sur **iPhone physique non testé**. Aucun modèle GPU raccordé, aucun entraînement sur les 157 vidéos P19.

## Méthode / limites

- Le modèle est **procédural et construit à partir de fonctions codées** : aucune preuve de contact anatomique, respiration physiologique, naturel du regard, sensualité perçue ni validation biométrique.
- **45 ou 60 états originaux de commande par seconde ne veulent pas dire 45/60 images de cinéma photoréalistes par seconde.** Le film vectoriel démontre les commandes, pas le réalisme.
- Les données personnelles du corpus ne sont ni incluses, ni exportées, ni transmises. Le prototype utilise seulement des identifiants de personnages fictifs et des coordonnées synthétiques.
- Ne pas fusionner dans `main` ni déployer le site avant contrôles humains sur les gestes et validation Safari.

## Étapes suivantes

Obtenir des repères anatomiques de lèvres/yeux/mains réellement vérifiés sur sources autorisées, valider plusieurs annotations humaines indépendantes, puis mesurer les écarts avec les contrôles P19. Enfin raccorder un moteur vidéo GPU réalisant de **nouvelles images cohérentes** plutôt que simplement rallonger des poses.
