# Retouche Cinema AI P12 — repères et micro-mouvements (15 novembre 2026)

**Statut : expérimental, hors production.**

## Résultats du laboratoire
- P12 développe un suivi OpenCV CPU **de points 2D sélectionnés manuellement** sur une image source, puis suivis d'image source en image source (flux Lucas–Kanade aller-retour, refus des dérives/occlusions détectables).
- Un atelier HTML iPhone autonome permet de poser des points sur lèvres, yeux, joues, doigts, filtre de cigarette et poignet ; export **de métadonnées JSON seulement**.
- Un adaptateur optionnel pour Face Landmarker / Hand Landmarker est préparé, **mais MediaPipe et les fichiers modèles ne sont pas installés** ici : aucun repère de modèle ni aucune inférence n'ont été réellement obtenus.
- **60/60 passages de vidéos privées** ont été réexaminés à leur cadence source : **5 107 images décodées**, **840 points de texture** (14/passages, non anatomiques) et 0 erreur de décodage. **21/60 passages** ont une couverture médiane des points inférieure à 80 %. Une couverture de suivi élevée n'est pas une preuve que la trajectoire suit la bonne partie du corps.
- Sur un extrait réel avec **10 points manuels provisoires**, le point du filtre est suivi sur 100 % des 29 images, mais le point approximatif du centre de la bouche sur seulement 17,24 %. Ces annotations ne sont ni prouvées par un modèle facial ni validées par deux relecteurs.
- **35 tests P12 réussis (22 Python, 13 JS)**, **28 tests de non-régression P11 réussis**. Chromium 390×844 et 1280×820 : vidéo fictive importée, deux points ajoutés, JSON exporté sans erreur JS ni trafic externe. Safari physique iPhone non testé.

## Ressources de code
Le moteur complet (`p12_anchor_tracking.py`, `p12_texture_probe.py`, `p12_mediapipe_optional.py`), l'atelier HTML, les tests, les démonstrations et le rapport ont été assemblés dans l'archive de laboratoire P12. La partie centrale de validation des points est versionnée ici dans `p12_ui_core.js` ; **ne pas confondre une documentation GitHub avec le déploiement de l'atelier**.

## Confidentialité
Aucun original privé, visage, image extraite, voix, nom de fichier privé, empreinte de source ou annotation réelle n'est ajouté à la branche GitHub publique. La recherche ne conclut pas qu'une personne fume ni qu'une respiration est audible. Âge, droits et éligibilité à l'entraînement supervisé nécessitent des vérifications distinctes.

## Suite
(1) Installer localement un vrai modèle facial et main avec licence vérifiée ; (2) mesurer les erreurs des repères et la cohérence des gestes sans les masquer ; (3) obtenir deux annotations humaines indépendantes ; (4) porter le suivi sur WebAssembly/WebGPU iPhone ; (5) évaluer des mouvements *réellement générés*, pas seulement la sortie 60 images/s.

**PR en brouillon. Ne pas fusionner ni déployer sur retoucheproai.com.**
