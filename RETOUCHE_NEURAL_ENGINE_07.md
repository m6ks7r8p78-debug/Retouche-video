# Retouche Neural Engine 0.7 — dégradations proches des vidéos importées

**Date : 14 novembre 2026. Statut : recherche CPU privée, non déployable.** Le dépôt ne contient ni vidéo personnelle, ni image extraite, ni piste audio, ni manifeste avec chemins/empreintes individuels, ni poids entraînés.

## Résultat effectivement exécuté

- Corpus historique RetoucheProAI : **157 vidéos contrôlées par SHA-256**, **154 contenus distincts** ; trois copies exactes non surpondérées.
- **308 triplets d'images réelles**, deux moments par contenu unique (18 % et 64 % de chaque vidéo), extraits et stockés uniquement en privé. Les **41 vidéos supplémentaires**, utilisées auparavant pour des tests, restent **exclues de l'entraînement**.
- Quatre simulations de LR ×2 : `clean_area` (area/downsampling), `jpeg55` (JPEG qualité 55), `blur_noise` (flou gaussien et bruit simulé dépendant du signal), `h264_crf34` (**véritable encodage x264 puis décodage ffmpeg, YUV420p, CRF34, trois images en mémoire**). Aucune sortie personnelle n'est écrite sur disque par le simulateur H.264 ; le dossier de triplets, lui, est privé et hors Git.
- Deux bras d'entraînement depuis les **mêmes poids privés RNE 0.4**, le même optimiseur Adam (8e−5), le même ordre d'échantillons, **120 étapes / batch 8** chacun. Les deux utilisent MSE + 0,025 × pénalité temporelle des résidus de détails. Le témoin utilise `clean_area, jpeg55, blur_noise, clean_area` et le candidat remplace le dernier `clean_area` par `h264_crf34`.
- **616 comparaisons** réparties sur le second moment : 154 contenus × quatre simulations. Cette seconde fenêtre n'a pas été utilisée par ce *fine-tuning*, mais le **checkpoint RNE 0.4 connaissait déjà ces scènes**. **Mesures internes, PAS une validation indépendante.**

## Résultats par type de dégradation (candidat robuste − témoin)

| Mode LR simulé | Delta PSNR (dB) | Delta erreur des contours | Delta indicateur des détails temporels |
|---|---:|---:|---:|
| Propre / area | **−0,03306** | +0,000002 | −0,000027 |
| JPEG qualité 55 | −0,00139 | −0,000013 | −0,000031 |
| Flou + bruit simulé | −0,01692 | +0,000014 | −0,000027 |
| **H.264 CRF 34** | **+0,02433** | −0,000027 | −0,000023 |

Plus faible est préférable pour les deux dernières métriques, mais la **mesure temporelle est un indicateur indirect calculé sur des dégradations simulées** ; ce n'est ni une preuve de moindre scintillement sur vraie vidéo ni une vérification des détails authentiques.

PSNR candidat **par mode** : 36,22107 dB (propre), 30,45044 dB (JPEG), 30,72363 dB (flou/bruit), 29,85925 dB (H.264). Sur ce protocole, la variante H.264 aide légèrement pour la compression, mais n'améliore pas assez les autres cas. La règle de recherche exigeait au moins **+0,05 dB sur chacun des trois modes dégradés**, et aucune baisse supérieure à −0,03 dB sur le mode propre. **Le candidat échoue.**

**Décision : aucun modèle promu.** RNE 0.4 temporel reste la référence expérimentale, et l'agrandissement bicubique reste le repli sûr. Les poids RNE 0.7 sont conservés **privés** pour étude et comparaison. Le site RetoucheProAI, l'application iPhone et `main` ne sont pas modifiés.

## Code public / exécution

- `outils/rne/rne07/degradations.py` : quatre dégradations, véritable H.264 en mémoire, échec explicite si le codec n'est pas disponible.
- `outils/rne/rne07/prepare_corpus.py` : contrôle des SHA et extraction de triplets ; **uniquement avec autorisation privée explicite**. Le catalogue et les vidéos doivent être fournis par le propriétaire hors Git.
- `outils/rne/rne07/train_robust.py` : entraînement A/B apparié, cache privé reproductible, 157 contrôles SHA, 154 sources distinctes, deux positions, quatre modes ; sauvegarde des modèles et rapport détaillé hors Git.
- `outils/rne/rne07/robust_gate.py` : refus de promotion sans preuves équilibrées dans tous les modes ; **jamais de déploiement automatique**, même si les scores internes sont favorables.
- `tests/test_rne07_degradations.py`, `tests/test_rne07_protocol.py` : **30 tests locaux réussis** (incluant codec H.264, données synthétiques, couverture, autorisations, risques d'évaluation). CI GitHub mise à jour ; **état distant à vérifier**.

Exemple d'exécution de recherche (les trois chemins `/PRIVE/...` ne doivent pas être dans Git) :

```bash
python outils/rne/rne07/prepare_corpus.py \
  --catalogue /PRIVE/catalogue_157.csv --originals /PRIVE/videos_anciennes \
  --output /PRIVE/rne07 --private-consent-confirmed

python outils/rne/rne07/train_robust.py \
  --manifest /PRIVE/rne07/consent_manifest_PRIVATE.json \
  --cache /PRIVE/rne07/triplets \
  --checkpoint /PRIVE/rne04_reference_PRIVATE.pt \
  --output /PRIVE/rne07/models \
  --steps 120 --batch 8 \
  --private-training-authorized --acknowledge-in-sample
```

Les trois checkpoints, les scripts, les tests, le rapport complet et les modalités sont également fournis dans l'archive privée du propriétaire : `RetoucheProAI_RNE07_Degradations_H264_Privé.zip`. Elle ne contient ni vidéo brute, ni frame, ni miniature, ni cache de triplets, ni manifeste personnel.

## Limites et priorité suivante

Le mélange de dégradations réalistes n'apporte qu'une amélioration **minime** en H.264 avec 120 étapes, et dégrade les cas propres. **Ne pas inventer une qualité 4K/8K, une restauration de visage, une inversion de filtres AR ou une performance Safari iPhone**. Les anciennes scènes ont déjà servi à entraîner le point de départ ; le système reste un moteur 2D autonome et **n'utilise aucun SDK ni poids NVIDIA DLSS 5**.

Prochaine recherche : entraîner une politique de dégradation et une métrique perceptuelle robuste **sur les 157 anciennes vidéos uniquement**, fixer des critères avant toute nouvelle évaluation, puis obtenir un jeu **réellement inédit** et une mesure sur iPhone Safari avant toute promotion.
