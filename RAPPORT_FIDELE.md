# Rapport — conversion vertical → horizontal « Fidèle », sans génération (v8.5, 18 nov. 2026)

Demande : transformer une vidéo 9:16 en 16:9 en gardant 100 % du champ filmé, sans rien inventer, sans déformation perceptible,
avec le meilleur remplissage possible ; ne jamais activer en silence un recadrage ou une déformation.

## La contradiction, mesurée
Passer de 9:16 à 16:9 demande **3,16 fois plus de largeur**. On ne peut pas avoir à la fois : toute l'image, aucune déformation,
un écran rempli et aucun contenu ajouté. Chaque méthode sacrifie au moins une de ces quatre exigences ; l'app affiche lesquelles,
avec leurs chiffres, et ne choisit seule que celle qui n'en sacrifie aucune de visible.

| Méthode | Garde tout | Rien d'inventé | Pas de déformation visible | Écran rempli |
|---|---|---|---|---|
| **Fidèle** (par défaut) | oui | oui | oui (sujets intacts, fond ≤ 10 %) | non (≈ 32 % en 9:16 → 16:9) |
| Proportions exactes | oui | oui | oui (aucune) | non (31,6 %) |
| Remplissage accru / total | oui | oui | **non** (fond étiré jusqu'à 35 % / autant qu'il faut) | partiel / oui si des zones libres existent |
| Étirement uniforme | oui | oui | **non** (tout ×3,16, visages compris) | oui |
| Recadrage | **non** (68 % coupé) | oui | oui, mais agrandi ×3,16 (flou) | oui |
| Seam carving (étudié, écarté) | oui | duplique des coutures | **non** (cassures, ×4,5 à ×8 localement) | oui |

## Méthode retenue
Déformation **alignée sur l'axe** (famille « axis-aligned deformation », Panozzo et al., 2012), calculée par scène :
- l'image est découpée en ~90 colonnes ; visages, personnes, animaux (+ marge) : étirement **= 1 exactement**, copiés pixel pour pixel ;
- le reste est étiré selon son coût (zones unies d'abord, zones détaillées ou qui bougent épargnées), sans dépasser le seuil de
  perception (10 %), avec une transition douce (≤ 0,02 par colonne près des sujets) ;
- les lignes droites restent droites, les verticales restent verticales ; **un seul calcul par scène** → aucune ondulation possible ;
- ce qui n'est pas rempli reçoit une « ambiance » (v8.6) : la vidéo elle-même très floutée, sans aucun contour ni décor, stable dans le temps ; bandes noires au choix.

## Banc comparatif (`tests/fidele/banc_fidele.py`, vraies vidéos)
Vidéos : piétons et visages réels (Intel sample-videos, CC BY 4.0 ; OpenCV vtest, BSD), caméra fixe, balayage, caméra qui avance
(parallaxe), salle de classe 1080×1920, plusieurs scènes. Détecteurs du banc : YuNet (celui de l'app) + HOG d'OpenCV.
Résumé (min–max sur les 6 vidéos ; tableau complet : `tests/fidele/resultats_banc.md`) :

| Méthode | Conservé | Rempli | Étir. sous les sujets | Sujets identiques au pixel | Étir. local max | Gigue (px/image) | Netteté | Temps/image |
|---|---|---|---|---|---|---|---|---|
| Fidèle | 100 % | 31,6–33,5 % | **1,00** | **100 %** | 1,00–1,12 | 0 | 0,86–1,00 | 2–4 ms |
| Naturel | 100 % | 31,6 % | 1,00 | 100 % | 1,00 | 0 | 1,00 | 2–4 ms |
| Total | 100 % | 31,6–100 % | 1,00 | 100 % | 1,0–8,6 | 0–0,8 | 0,58–1,00 | 2–14 ms |
| Uniforme | 100 % | 100 % | 3,21–3,25 | 0 % | 3,2 | 0 | 0,29–0,59 | 4–6 ms |
| Recadrage | 31,6 % | 100 % | 3,15 | 0 % | 3,2 | 0 | 0,01–0,08 | 3–5 ms |
| Seam carving (par scène) | 100 % | 100 % | 1,0–8,0 | 1–83 % | 4,5–8,0 | 0 | 0,32–0,64 | 6–8 s |
| Seam carving (par image) | 100 % | 100 % | 1,0–1,12 | ≈ 100 % | 4,6–8,0 | **1,9–12,1** | 0,39–0,63 | 6–8 s |

Conclusions : le seam carving remplit l'écran mais casse la géométrie (murs et meubles brisés, voir `tests/fidele/planches/`),
fait trembler l'image d'une image à l'autre quand il est recalculé à chaque image (scintillement jusqu'à ×10,8) et est ~2 000 fois
plus lent : **écarté**. L'étirement uniforme et le recadrage ne sont jamais choisis seuls. « Fidèle » est la seule méthode qui garde
tout, n'invente rien et ne déforme rien de visible ; son gain de remplissage est faible (0 à 2 points), parce que c'est la limite
physique : dès qu'un sujet passe partout dans la scène (caméra qui balaye, piétons), plus rien ne peut être étiré sans se voir.

## Dans l'app (tests `tests/format_fidele.test.mjs`, Chromium, vraie app, 13/13)
- Taille d'origine conservée : 1080×1920 → **3414×1920**, un pixel filmé = un pixel du fichier (13 relevés, 27 millions de pixels
  comparés, **0 différence** dans les colonnes non étirées).
- Vérification **image par image** à l'export : visages détectés sur chaque image (234 sur la salle de classe), étirement sous un
  visage = 0 % ; si un visage a été manqué, il est protégé et la vidéo refaite automatiquement (testé : 57 visages corrigés).
- Durée, cadence (10, 12, 30 i/s), nombre d'images et son conservés sur toutes les vidéos ; stabilité 0,98–1,00 × l'original.
- Vitesse (Chromium sans carte graphique) : ~70 ms par image en 768×432, ~160 ms en 3414×1920, contrôle visage compris.
- **Non testé sur iPhone.**

## v8.9 — recherche de pixels réels supplémentaires
Mesure (format.js, mosaïque de la scène + mouvement de caméra) de la profondeur de côté couverte par de VRAIS pixels filmés à d'autres
moments, sur chaque image (≥ 97 % de couverture) : allée 0 / 0, classe (panoramique) 0 / 2,2 %, personnes 0 / 0, rue 0 / 0, scènes 0 / 0,
visages (balayage) 0 / 0. Sans génération, l'information des côtés n'existe pas dans le fichier : le seul réglage possible est le
compromis entre la part coupée et la part de l'écran en ambiance (curseur « Garder plus d'image »).

