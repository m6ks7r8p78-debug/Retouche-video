# Retouche Neural Engine — premier banc photographique extérieur au corpus des 157 vidéos

**14 novembre 2026 — recherche indépendante, aucun déploiement.** Les précédents scores de RNE 0.4 avaient été calculés sur des images de vidéos déjà utilisées par les modèles. Ce protocole ajoute des **sources visuelles différentes** des 157 vidéos privées : six photographies standard de `scikit-image.data`, sans transférer ni exposer les originaux personnels. Ce sont des clichés, **pas des séquences naturellement filmées**, et ils n'ont pas servi à entraîner les modèles maison. Le benchmark n'a pas créé un nouveau modèle.

## Protocole exécuté localement

- **6 images-source naturelles :** `astronaut`, `coffee`, `chelsea`, `camera`, `rocket`, `hubble_deep_field` de scikit-image (ressources locales de test).
- **× 3 déplacements simulés** (translation horizontale, diagonale, rapide) × **2 traitements LR** (sous-échantillonnage propre ou JPEG qualité 65) × **3 images reconstruites** = **108 comparaisons** par checkpoint.
- L'image d'origine redimensionnée puis recadrée est la référence HR (192×192). La reconstruction est ×2 depuis l'image LR (96×96). Utilisation de **trois images successives construites par déplacement de la fenêtre** et du flux optique causal. PSNR, erreur sur forts contours, propositions faciales non vérifiées et variation entre images sont mesurés.
- **Unités d'indépendance : 6 photographies, PAS 108 sources indépendantes.** Les différentes reconstructions d'une même image sont corrélées. Aucun visage d'origine réellement occulté n'a été reconstitué ; aucun mouvement naturel réel ni appareil iPhone n'a été testé.
- Les poids privés RNE 0.4 ont été chargés avec `torch.load(weights_only=True)`. Aucune image externe et aucun frame privé ne sont publiés ; les scripts de benchmark et les agrégats complets sont remis dans l'archive propriétaire, sans les photos ni les poids. Les métriques agrégées ne contiennent aucun identifiant personnel.

## Résultats d'exécution sur les 6 sources

| RNE chargé | Gain PSNR moyen vs bicubique, dB | Variantes gagnantes /108 | Plus mauvaise différence PSNR, dB | MAE temporelle simulée (bicubique : 12,643) |
|---|---:|---:|---:|---:|
| RNE 0.4 témoin supervision | **+0,31051** | non ventilé | −0,09305 | 13,10970 |
| RNE 0.4 avec perte de gradients | **+0,31064** | non ventilé | −0,09555 | 13,09879 |
| **RNE 0.4 avec perte temporelle** (checkpoint conservé) | **+0,29936** | **97/108** | **−0,06953** | **13,07629** |

Pour le modèle temporel, **11/108** reconstructions ont un PSNR plus faible que le bicubique, mais **aucune** ne régresse de plus de 0,5 dB ; la moyenne du changement de MAE sur les contours est **−0,96921 niveau RGB /255** (mieux pour ce critère). Sur **14 images** où une cascade Haar a proposé une région de visage, la variation moyenne de MAE de cette seule zone est **−0,44178 niveau RGB /255**. **Aucune identité, géométrie faciale ou authenticité de détail humain n'a été vérifiée.**

Gains PSNR du modèle temporel par photo : astronaut +0,38759 dB ; coffee +0,36481 ; chelsea +0,05845 ; camera +0,67180 ; rocket **−0,00040** ; hubble_deep_field +0,31392. Un intervalle bootstrap **illustratif**, en rééchantillonnant seulement les six moyennes de photo (10 000 tirages, graine fixe), est **+0,131 à +0,475 dB**. Il ne remplace ni davantage de scènes ni une vraie inférence de généralisation vidéo.

### Risque temporel toujours présent

Sur les **72 transitions simulées**, la MAE temporelle moyenne de RNE 0.4 reste **13,07629**, contre **12,64300** pour le bicubique. Cette mesure compare des sorties alignées par les déplacements connus de photos recadrées ; elle n'évalue pas le mouvement naturel de caméras/visages. Le fait que le modèle neuronal conserve un meilleur PSNR sur ces photos **ne compense pas automatiquement** la variabilité temporelle. Le témoin et le candidat gradients gagnent légèrement en PSNR moyen mais sont eux aussi moins stables : aucun nouveau checkpoint n'est promu.

## Nouveau garde-fou versionné

`outils/rne/external_evidence.py` est un contrôle pur et sans données privées : il interprète seulement les agrégats et ajoute explicitement les raisons de refus d'activation (photos ≠ vraies vidéos filmées, mouvements simulés, aucune preuve d'identité faciale ou de Safari iPhone, erreur temporelle supérieure, quelques régressions PSNR). Même avec des métriques idéales, ce module **ne peut ni promouvoir un poids ni autoriser un export automatique**.

`tests/test_rne_external_evidence.py` : **16 tests synthétiques**, à confirmer sur GitHub Actions. Le script complet d'évaluation photographique est conservé dans l'archive de recherche privée remise au propriétaire, exécutable localement avec `torch`, `numpy`, `opencv-python`, `scikit-image`, et le module public RNE `triad.py`.

Les résultats sont une **validation exploratoire sur photos extérieures au corpus**, pas un test scellé définitif : les trois checkpoints ont désormais été comparés sur ces photos. Toute nouvelle sélection de modèle devra utiliser encore **d'autres sources inédites**, puis surtout de véritables vidéos avec mouvements naturels filmés, masques faciaux vérifiés et essais réels iPhone Safari.

**Décision : garder RNE en laboratoire et continuer la recherche temporelle.** Aucun NVIDIA DLSS 5 intégré ; aucun support Safari ni 4K temps réel démontré ; originaux et modèles personnels demeurent privés.
