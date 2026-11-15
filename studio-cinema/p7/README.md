# Retouche Cinema P7 — Geste, bouche, regard (prototype)

**Statut** : étude expérimentale sur un personnage adulte fictif. Aucun apprentissage de modèle vidéo, aucun modèle de reconnaissance faciale ou physique vérifié.

## Ce que nous avons fait

- Reprise de **12 images originales générées** représentant un même personnage fictif et une séquence de cigarette.
- Annotations **manuelles approximatives** : phase, regard à l'objectif, contact cigarette–lèvres, bouche, doigts, apparition de la fumée. Elles ne sont pas des mesures automatiquement détectées, ni des preuves biomécaniques.
- Rendu d'un MP4 de ~6,93 s encodé à 24 i/s via interpolation bidirectionnelle par flot optique et H.264 Constrained Baseline/AAC, `+faststart`, vidéo sans voix ni musique.
- Lecteur HTML autonome avec MP4 embarqué, secours GIF, choix des étapes et ralenti.
- Nouveau contrôleur `gesture_qa.py` qui vérifie la cohérence chronologique et approximativement spatiale des **annotations fournies**. Il ne classe pas la vidéo comme réaliste.

## Résultats vérifiés

- **33/33 tests P7** réussis ; **18/18 tests P5 Python et 15/15 P5 JavaScript** de régression réussis.
- MP4 720×720, 166 images encodées, 24 i/s, 6,917 s, audio AAC silencieux. Décodage complet FFmpeg sans erreur.
- Interface testée en Chromium 390×844 et 1240×820 : 7 boutons de phase, ralenti, bascule GIF, absence d'erreur JavaScript et de requête réseau. Safari physique iPhone **non testé**.
- L'audit P7 renvoie `review_required`, notamment `cheek_inhalation_not_demonstrated` et `human_review_pending`. C'est un échec à résoudre, non une validation du réalisme.

## Reproduire hors ligne

`python -m pytest -q tests/test_gesture_qa.py`

Pour un rendu, déposer une source GIF **100 % fictive** nommée `synthetic_12_keyframes.gif` à côté de `render_p7.py`, puis lancer `python render_p7.py`. Les paquets de démonstration contiennent cet actif ; le dépôt GitHub ne comprend que le code et les annotations fictives, pas les octets de la vidéo ni les données personnelles.

`render_p7.py` utilise OpenCV, Pillow, NumPy, FFmpeg. Un chemin de sortie local `/mnt/data` est utilisé dans la démonstration ; l'adapter selon la plateforme. **L'interface sur iPhone n'entraîne pas de modèles**.

## Références privées et limites

Une seule séquence du corpus privé a été inspectée précédemment pour comprendre l'ordre des gestes : approche (~2,1 s), contact (~2,3–3,7 s), retrait (~3,9 s), expiration (>4,1 s). Cette séquence ne suffit pas à constituer un jeu de données, et les temps ne sont pas des normes générales. Aucune image ou nom de cette source n'est copié dans GitHub ou la démo. L'admissibilité des sources à l'entraînement demande des qualifications séparées.

Les images intermédiaires du MP4 sont **estimées**, et la fumée peut rester trop artificielle. Un vrai modèle temporel devra produire des variations de la bouche, des joues, du poignet et de la fumée, avec tests humains et données d'entraînement adaptées. Le contrôle de gestes n'est pas un détecteur d'identité, ni une preuve de biomécanique réaliste.

## Confidentialité

Aucun média privé des 157 vidéos, aucune copie de visage réel, aucun poids entraîné sur une personne, aucune publication de références réelles. Utilisation de personnages fictifs adultes exclusivement dans les démos. Ne pas relier ce module au site public sans validation complète.