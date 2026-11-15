# Retouche Neural Engine — RNE 0.3+ (cycle sur 157 vidéos)

**14 novembre 2026. Prototype privé de recherche, pas une fonctionnalité déployée.**

## Couverture du corpus
- 157 vidéos autorisées, 157 empreintes SHA-256 contrôlées durant l'entraînement ; 154 contenus uniques et 3 copies exactes non surpondérées.
- 37 groupes conservateurs de scènes/versions.
- 6 fenêtres temporelles prévues par vidéo unique, réparties dans la durée. **919 triplets valides**, 0 triplet illisible ou répété à l'intérieur d'une même vidéo ; 2 vidéos ont fourni moins de 6 fenêtres et 154/154 contenus ont été représentés.
- Les trames sont échantillonnées : **il ne s'agit pas d'une lecture/extraction de toutes les images de toutes les vidéos**.

## Entraînement réel
- Départ : poids privés du checkpoint **RNE 0.3 entraîné précédemment sur les 157 vidéos**.
- Nouveau fine-tuning de **420 étapes × batch 8** sur un réseau tri-images **13 684 paramètres**, à partir des 919 nouveaux triplets. Tous les triplets ont été utilisés au moins une fois avant le rééchantillonnage équilibré selon les 37 groupes.
- Total des présentations à l'optimiseur : **3 360**.
- Paires basse/haute résolution fabriquées par sous-échantillonnage ×2, puis dégradations JPEG et bruit **synthétiques**.

## Résultats sur les MÊMES données sources que l'entraînement

| Modèle | PSNR moyen (dB) sur 919 patchs |
|---|---:|
| Bicubique | 30,2460 |
| RNE 0.3 précédent | 30,4011 |
| **RNE 0.3+** | **30,4590** |

**Gain : +0,0579 dB** face à RNE 0.3 précédent, +0,2130 dB face au bicubique. **29 groupes sur 37** progressent face au checkpoint de départ. **3 échantillons sur 919** régressent de plus de 0,5 dB face à l'ancien modèle ; 2 régressent de plus de 0,5 dB face au bicubique.

**Ces chiffres ne constituent pas un test indépendant.** Depuis la passe précédente, les 157 vidéos ont servi à l'apprentissage ; aucune scène n'est vierge pour ce nouveau modèle. Les mesures PSNR sont des comparaisons sur des patches à dégradation simulée, pas des preuves de réalisme, de visages fidèles ni de qualité 4K.

## QA vidéo
- 3 vidéos du corpus déjà vu, 16 images lues chacune, 48 images réelles décodées. Les deux modèles ont traité les frames en mémoire sans exporter ni publier d'images privées ; 42 frames ont suivi le chemin temporel.
- Différence absolue moyenne des valeurs RGB du nouveau modèle face à l'ancien : environ **0,414/255** sur le sous-ensemble exploratoire. Cela mesure la différence, **pas une amélioration** de la qualité visuelle.
- Démonstration séparée et entièrement synthétique : **24 frames à 12 fps**, entrée 128×96, sortie 256×192 ; 22 traitements temporels, vidéo et piste audio AAC confirmées par ffprobe. Ce test ne mesure pas le débit 4K, ni Safari iPhone.

## Code et sécurité
- `outils/rne/expanded_sampler.py` : consentements, SHA-256, filtrage des copies exactes, échantillonnage temporel, refus de sortie dans un dépôt Git.
- `outils/rne/balanced_finetune.py` : couverture complète des fenêtres, entraînement équilibré par groupe, conservation du modèle de départ, comparaison **in-sample** clairement étiquetée.
- `outils/rne/quality_gate.py` : **refus d'activation automatique** tant que des résultats indépendants sur paires réelles, des tests de visages/temporalité et un essai iPhone ne sont pas disponibles ; voie de repli bicubique en l'absence de preuve, aperçu neuronal expérimental seulement sur choix manuel.
- Tests unitaires sur fichiers synthétiques, sans vidéo ni modèle personnel envoyé à GitHub. Les tests locaux du cycle sampler/gate sont réussis ; CI GitHub distante non confirmée.

## Étapes suivantes
1. Obtenir de **nouvelles scènes indépendantes** (avec droits et consentements appropriés) pour une vraie validation de généralisation. Il n'existe plus de lot de test totalement vierge dans les 157 vidéos.
2. Mesurer qualité perceptuelle, scintillement compensé par mouvement, hallucinations, identité des visages et stabilité en compression ; ne pas promouvoir une solution à cause du seul PSNR.
3. Tester ressources et fidélité sur un **véritable iPhone Safari**. RNE n'utilise **aucun SDK NVIDIA DLSS 5** et ne lui est pas équivalent.
4. Préserver les anciens checkpoints et le bicubique de référence, ne pas activer RNE sans examen humain et preuve indépendante.

**Vie privée :** l'archive privée contient des poids potentiellement spécialisés mais aucun fichier vidéo personnel, aucune trame originale, aucun manifeste détaillé, aucun hash source individuel. Ne pas publier les poids ni les médias.