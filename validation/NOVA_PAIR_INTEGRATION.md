# NOVA : comparaison lecture et relecture de l’export

Intégration des changements précédemment fournis dans le paquet iPhone.
Le bouton du laboratoire lance les deux mires 1/1/6 et 1/1/1 puis le vrai
moteur HD avec restauration désactivée pour isoler le chemin couleur.
Le rapport de lecture est disponible dès cette étape et conservé si l’export
est interrompu. Les erreurs n’ajoutent aucun score d’export fictif.

Les nouveaux MOV sont exclusivement des mires synthétiques FFmpeg, avec
15 images 384×216 et une piste AAC synthétique pour les deux sources d’export.
Chaque fichier nova-pair-*.json décrit sa référence FFmpeg décodée, pas une
certification perceptuelle. Aucun média personnel ni diagnostic utilisateur
n’est publié dans cette branche.

Validation locale : conteneurs, AAC, calculs RGB et orchestration simulée.
Le workflow ajoute une vérification Chromium du vrai export H264/AAC et de
sa relecture avec les nouvelles fonctions. Un succès Chromium ne valide pas
Safari ni le décodage HEVC sur iPhone. Aucun déploiement n’est effectué par
ce workflow. Les moteurs de restauration et d’export de la base sont inchangés.
