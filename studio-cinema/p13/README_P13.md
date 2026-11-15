# Retouche Cinema AI P13 — Détecter plutôt que deviner

**Statut : démonstrateur de recherche, 15 novembre 2026. Aucun nouveau modèle génératif.**

## Ce qui est réel

Les scripts exécutent **le détecteur de visage et d'yeux préentraîné d'OpenCV Haar**, sur CPU et sans accès réseau. La P13 reprend les 60 passages privés de P11 en **décodage FFmpeg séquentiel**, à 6 images sélectionnées par seconde (taille normalisée 320 × 320 avec conservation des proportions et bordure de remplissage). Aucun photogramme privé n'est sauvegardé ; seules des coordonnées candidates et des métriques sont stockées localement.

## Mesures de la campagne P13 (sources privées absentes de ce pack)

| Indicateur | Mesure |
|---|---:|
| Passages décodés | 60/60 |
| Images échantillonnées | 1 020 |
| Images avec un visage candidat | 571 / 1 020 (56,0 %) |
| Images avec deux yeux candidats | 167 / 1 020 (16,4 %) |
| Passages avec visage candidat au moins une fois | 49 / 60 |
| Passages avec deux yeux candidats au moins une fois | 27 / 60 |
| Passages avec visage sur au moins la moitié des images | 37 / 60 |
| Passages avec visage sur moins de la moitié | 23 / 60 |
| Paires temporelles adjacentes de boîtes détectées | 491 |
| Recouvrement IoU médian entre boîtes adjacentes | 0,883 |

Les boîtes sont des **hypothèses du détecteur**, non annotées par un expert. **Le recouvrement IoU n'est pas une précision de détection et ne valide pas l'identité de la personne.** Certains faux positifs restent possibles.

## Livrables

- `p13_face_eye_detector.py` : cascade OpenCV visage/yeux, retour de coordonnées normalisées. Variante de décodage FFmpeg rapide, fenêtres 12 secondes au plus, *timestamps nominaux approximatifs*.
- `p13_quality.py` : métriques d'images valides, couvertures et recouvrement entre boîtes.
- `RetoucheCinema_P13_Atelier_iPhone.html` : lecteur local pour afficher les mesures sur la vidéo correspondante, export d'un résumé agrégé sans identité. Interdit les requêtes réseau par CSP.
- `examples/P13_demo_visage_fictif.json` et `examples/RetoucheCinema_P7_Regard_Bouche_Geste_iPhone.mp4` : démonstration de détection sur un personnage fictif créé par IA.
- Tests Python et captures de démonstration fictives.

### Utilisation sur ordinateur / exécution Python

```bash
pip install opencv-python numpy pytest
python p13_face_eye_detector.py --tasks P11_REVIEW_TASKS_60_PRIVE.json \
 --source-dir /chemin/vers/les_157_videos --out P13_cascade_60_PRIVATE.json --hz 6
python p13_quality.py P13_cascade_60_PRIVATE.json P13_quality_60_PRIVATE.json
```

Les scripts refusent les chemins de fichiers échappant au répertoire source. **Ne jamais copier les rapports privés vers un dépôt public.**

### Utilisation iPhone

L'HTML est une application locale autonome, sans téléchargement de modèles. Charger le JSON de démonstration pour la version fictive, ou le rapport **privé** P13, puis sélectionner une vidéo locale correspondante. Le nom doit être identique à la source, sans garantie cryptographique de contenu : les boîtes restent non certifiées. Safari sur iPhone physique n'a pas été testé ici ; les essais Chromium en 390 × 844 et 1 280 × 820 ont réussi via contenu HTML injecté (ouverture `file://` bloquée par les règles de test).

## Ce qui n'est pas acquis

- Aucun modèle MediaPipe exécuté : ni 478 repères faciaux, ni 21 repères par main.
- La bouche est une **région heuristique relative à la boîte faciale**, pas des lèvres détectées.
- Aucun contact objet/lèvres, souffle, âge, geste de fumer, émotion ni identité confirmé.
- Aucun entraînement neuronal ni vidéo photoréaliste nouvellement créée.
- La vidéo de démonstration a été générée auparavant à partir de poses fixes ; elle ne constitue pas 45–60 poses nouvelles par seconde.
- Pas de publication de médias privés ; pas de changement sur `main` ni sur retoucheproai.com.

## Suite P14

Adapter un véritable Face/Hand Landmarker avec fichiers modèles locaux et licences vérifiées, **ne pas masquer leur indisponibilité**, contrôler les échecs avec annotations indépendantes puis relier les repères à l'analyse d'interactions et à la génération temporelle. Les modèles MediaPipe annoncés officiellement fournissent 478 points faciaux et 21 points par main, mais cela ne constitue pas une preuve de lecture de la respiration ou de la cigarette.

