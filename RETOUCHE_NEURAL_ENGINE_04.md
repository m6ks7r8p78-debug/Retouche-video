# Retouche Neural Engine 0.4 — apprentissage direct de cohérence temporelle

**14 novembre 2026. Statut : recherche privée, non déployable.** RNE est notre moteur vidéo neuronal 2D, **pas une intégration NVIDIA DLSS 5**. PR #1 en brouillon, `main` intacte. Les vidéos, leurs trames, le manifeste nominatif, les SHA individuels, les détails par groupe et les poids spécialisés **ne sont pas publiés**.

## Architecture réellement entraînée

- Départ : checkpoint **RNE 0.3+** existant, réseau trois images consécutives avec résidu haute résolution et cartes de confiance (13 684 paramètres).
- Données : catalogue **157 vidéos autorisées**, **154 contenus distincts** après suppression des trois copies exactes, regroupés en **37 familles conservatrices**. Source vérifiée par SHA-256 avant entraînement. **919 triplets** extraits de ces vidéos (les originaux intacts).
- Dégradation contrôlée : sous-échantillonnage ×2 et compression JPEG / bruit synthétiques. Les trames haute résolution sont les références encodées existantes, **pas des originaux sans filtre, ni des références d'une qualité absolue**.
- Deux apprentissages **appariés** depuis les mêmes poids, les mêmes exemples, le même ordre et les mêmes paramètres d'optimisation, **180 étapes, batch 8 chacun**.
- **Témoin** : MSE de reconstruction spatiale seule.
- **RNE 0.4 temporel** : même MSE + pénalité pondérée à **0,025** sur la différence entre le **résidu de détails RNE − bicubique** et le résidu prédit pour l'image précédente, recalé sur l'image courante par flux optique arrière Farneback. La cible précédente vient du checkpoint RNE 0.3+ gelé. Les zones à confiance faible ou hors champ ne contribuent pas à la perte.
- Le réseau n'utilise que les images courante et passées, sans accès à des images futures. Le *teacher* de l'image antérieure réutilise une précédente image quand l'historique ne suffit pas : **approximation**, pas réseau vidéo temporel universel. Aucun SDK ou modèle NVIDIA.

## Mesures sur les 919 triplets d'apprentissage

| Référence | PSNR moyen (dB) | Erreur résiduelle temporelle proxy |
|---|---:|---:|
| Bicubique | 30,88856 | Non applicable |
| Ancien checkpoint RNE 0.3+ | 31,11227 | 0,002967 |
| Témoin, MSE spatiale seulement | **31,12542** | 0,003307 |
| RNE 0.4 avec contrainte temporelle | 31,12229 | **0,002663** |

La contrainte diminue le proxy temporel **d'environ 19,5 % par rapport au témoin**, pour **−0,00313 dB** de PSNR par rapport à ce même témoin. Les deux modèles gardent un PSNR positif par rapport au checkpoint initial, sans régression > 0,5 dB parmi ces échantillons. **Ce sont des métriques sur les données d'entraînement et une cible temporelle de modèle, pas une preuve de détail vrai ni de généralisation**.

## Contre-vérification sur des mouvements réellement filmés, mais mêmes scènes

Un représentant **préfixé** par chacun des 37 groupes. Deux fenêtres sans retouche des seuils : vers **18 %** et vers **62 %** du clip, **9 images consécutives par fenêtre**, soit **333 images / 296 transitions** pour chacune. Résolution réduite pour recherche CPU. Erreur mesurée : moyenne des médianes de MAE RGB 0–255 après compensation du mouvement Farneback. Plus faible = plus stable selon cette mesure **seulement**.

| Méthode | Vers 18 % | Vers 62 % |
|---|---:|---:|
| **Bicubique** | **1,38190** | **1,42204** |
| RNE 0.3+ | 1,41158 | 1,43128 |
| Témoin poursuivi sans pénalité temporelle | 1,40887 | 1,42851 |
| **RNE 0.4 temporel** | **1,40139** | **1,42285** |

Le modèle temporel progresse par rapport aux deux autres réseaux RNE sur les deux fenêtres, et est presque au niveau bicubique sur la seconde ; **le bicubique reste cependant le plus stable dans les deux fenêtres**. Les segments signalés par le garde-fou sont respectivement : fenêtre 18 %, **24 → 21** (RNE 0.3+ → temporel) ; fenêtre 62 %, **21 → 19**. Les transitions locales signalées : **27 → 22** et **23 → 21**.

**Ne pas interpréter** les nombres d'alertes comme un taux d'échec perceptuel, ni une baisse de scintillement comme preuve de meilleure restauration : un détail effacé ou une sortie constante peuvent être stables mais faux. Les clips ont déjà tous participé à l'apprentissage historique ; la seconde fenêtre est nouvelle dans **cette comparaison**, pas un corpus de scènes inédites. Aucun test iPhone Safari.

## Fichiers et reproductibilité

- `outils/rne/train_temporal_residual.py` : vérification privée des droits et SHA du corpus complet ; calcul de l'alignement et de la confiance ; apprentissages appariés ; contrôle spatial et temporel ; sortie de poids et de rapports **seulement hors d'un checkout Git**.
- `tests/test_rne04_temporal_train.py` : **12 nouveaux tests Python CPU exécutés localement** sur des trames entièrement synthétiques : consentements, empruntes, fichiers absents, formes de tenseurs, confiance, smoke test apparié, sorties privées. L'ancienne suite RNE et les jobs GitHub Actions doivent être vérifiés séparément après commit.
- `.github/workflows/rne-cpu.yml` : syntaxe et tests synthétiques ; **aucun poids ou média personnel téléchargé ni entraîné par GitHub Actions**.
- Démonstrations MP4 entièrement synthétiques, 24 images à 12 fps, 128×96 → 256×192, 22 frames neuronales temporelles ; comparateur bicubique/RNE. **Ni 4K ni performances iPhone démontrées**.

Les checkpoints RNE 0.3+, témoin de contrôle et RNE 0.4 temporel, mesures individuelles et scripts de reproduction sont conservés **en archive privée destinée au propriétaire**. Aucun poids spécialisé ni manifeste personnel dans GitHub.

## Décision

**RNE 0.4 retenu pour la recherche, non activé.** La pénalité sur les détails a un signal positif sur deux audits de mouvements, mais elle n'apporte pas encore une stabilité supérieure au bicubique, ne certifie pas la fidélité des visages et ne prouve pas une qualité vidéo nouvelle. Le Directeur IA doit continuer de **se replier sur le bicubique** en cas de doute ; les aperçus expérimentaux requièrent un choix humain explicite.

**Priorités suivantes :** véritables nouveaux clips indépendants après le corpus des 157, contrôle de qualité perceptuelle / identité / géométrie et suivi des occultations, test Safari iPhone réel et éventuellement adaptation WebGPU/WASM sous contrôle des ressources. La recherche sur les filtres AR reste parallèle ; aucune prétention de réapparition fidèle de pixels masqués par un filtre.
