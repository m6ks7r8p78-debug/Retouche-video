# Schéma du catalogue privé de médias — `retoucheproai.catalogue/1`

Outil de référence : `outils/catalogue_medias.py` (Python 3.9+, numpy, ffmpeg/ffprobe ou repli OpenCV).
Tests : `tests/catalogue_medias_test.py` (16 tests sur médias **synthétiques** générés par ffmpeg).

> **Le catalogue est privé.** Il contient des noms de fichiers et des empreintes de médias personnels : il ne doit
> jamais être versionné ni publié. L'outil refuse d'écrire dans un dépôt Git hors d'un chemin ignoré (`prive/`
> est ignoré). `--anonymiser` retire les noms de fichiers.

## Commandes

```sh
python3 outils/catalogue_medias.py analyser DOSSIER --sortie prive/catalogue.json --autorisation-analyse \
        [--chatgpt catalogue_chatgpt.csv|.json] [--consentements prive/consentements.json] [--echantillons 8] [--anonymiser]
python3 outils/catalogue_medias.py valider prive/catalogue.json
python3 outils/catalogue_medias.py plan prive/catalogue.json --sortie prive/plan_benchmark.json
python3 outils/catalogue_medias.py exporter-banc prive/catalogue.json --sortie prive/banc_entrees.json
```

`exporter-banc` produit les entrées anonymisées (sans nom ni chemin) attendues par le banc de triage de ChatGPT
`outils/directeur-banc-reel.cjs` (`LABORATOIRE_REEL.md`) : `famille` = groupe de scène, `phash` = 8 premières empreintes,
`indices` déduits des défauts mesurés. Compatibilité vérifiée par test.

Lecture seule : aucun média n'est modifié, déplacé ou supprimé (vérifié par test). Aucun accès réseau.

## Import du catalogue de ChatGPT (103 vidéos, puis 54 + 1 image)

Format accepté : CSV (UTF-8) ou JSON (liste, ou objet `{"medias": [...]}`). Colonnes reconnues :

| colonne | rôle |
|---|---|
| `id` (ou `identifiant`) | identifiant conservé tel quel (ex. `V001`…`V157`, `I001`) |
| `fichier` (ou `nom`, `filename`, `nom_fichier`) | nom du fichier d'origine, utilisé si le SHA-256 est absent |
| `sha256` | empreinte : rattachement prioritaire, insensible au renommage |
| toute autre colonne | importée comme classification **hypothétique** (`source: chatgpt`, `verifie: false`) |

Modèle minimal :

```csv
id,fichier,sha256,filtre_suppose,retouche_supposee,scene,droits,remarques
V001,IMG_0001.MOV,,beaute,lissage,plage,proprietaire,
```

Rattachement : SHA-256 d'abord, sinon nom de fichier **unique**. Deux fichiers identiques (ex. V090/V091) gardent
deux identifiants et apparaissent dans `doublons_exacts`. Les entrées ChatGPT sans fichier présent sont listées dans
`entrees_chatgpt_sans_fichier` (= médias manquants exacts). Les fichiers sans entrée reçoivent `M001`, `M002`…

## Structure

```text
schema, genere_le, outil{lecteur, echantillons_par_video, seuils, graine_partition}, confidentialite, resume{…}
medias[] :
  id, origine_identifiant (chatgpt_sha256 | chatgpt_nom_fichier | nouvel_identifiant), fichier_relatif|null,
  type (video|image), sha256, taille_octets,
  metadonnees : conteneur, duree_s, debit_total_bps, date_creation_meta,
     video{codec, profil, largeur_affichee, hauteur_affichee, rotation, cadence_moyenne, cadence_nominale,
           cadence_variable_probable, nb_images, debit_bps, bits_par_pixel, pix_fmt, profondeur_bits,
           espace_couleur, transfert, primaires, plage},
     audio{codec, frequence_hz, canaux, disposition, debit_bps, volume_moyen_db, volume_max_db, saturation_audio_probable}
  mesures (médiane sur N échantillons) : luminance_moyenne/p5/p95, part_noirs_ecrases, part_blancs_brules,
     nettete_laplacien, saturation_moyenne, dominante_rouge_vert, dominante_bleu_vert, bruit_sigma (Immerkær),
     blocs_8x8, variation_inter_echantillons, echantillons, echelle
  empreintes_dhash[] (64 bits hex par échantillon)
  defauts[] : {defaut, raison (seuil explicite), source: mesure_automatique, verifie: false}
  autorisations : 9 finalités → oui | non | non_renseigne
  droits : {proprietaire_declare, consentement_personnes_representees, restrictions[]}
  classifications[] : {champ, valeur, source, verifie, confiance}
  groupe_scene (G001…), partition (entrainement | validation | test)
doublons_exacts[]     : {sha256, ids[], statut: verifie_par_sha256}
rapprochements[]      : {ids[2], distance_dhash, nature (similaire ≤10 | meme_scene_probable ≤16), confiance, statut: hypothese_non_verifiee}
couples_candidats[]   : {ids[2], indices[], original_designe: null, statut: hypothese_non_verifiee, avertissement}
groupes[]             : {id, medias[], partition}
entrees_chatgpt_sans_fichier[], erreurs[]
```

## Autorisations (finalités séparées)

`analyse_technique` (posée à `oui` uniquement par `--autorisation-analyse`), `evaluation_benchmark`,
`stockage_durable`, `annotation`, `creation_dataset`, `entrainement`, `recherche_externe_partage`, `publication`,
`avatars_personnages`. Par défaut : `non_renseigne`. Fichier `consentements.json` (privé), clé = identifiant ou SHA-256 :

```json
{"V002": {"evaluation_benchmark": "oui", "entrainement": "non"}}
```

Une valeur ou une finalité inconnue fait échouer l'analyse. `plan` n'inclut que les médias à
`evaluation_benchmark = oui` ; la partition `entrainement` n'est jamais utilisée sans `entrainement = oui` **et** un
protocole validé. L'utilisation pour des tests ne vaut pas autorisation d'entraînement.

## Règles de vérité

- Doublon **exact** = SHA-256 identique (vérifié). Tout le reste est hypothèse : distance dHash moyenne symétrique
  « plus proche voisin » entre échantillons (robuste au réencodage et au changement de résolution, pas au miroir ni
  aux recadrages forts).
- Les couples original/retouché ne sont **jamais** décidés : seuls des indices mesurés sont listés (résolution, débit,
  saturation, netteté, bruit, luminosité, durée). `valider` rejette un original désigné ou un statut « vérifié » sans
  champ `verifie_par`.
- Groupes de scène par union des rapprochements ; la partition est tirée par groupe (SHA-256 du plus petit SHA du
  groupe + graine) → aucune variante d'une même scène ne peut tomber dans deux partitions (contrôlé par `valider`).
- Les seuils des défauts (bruit > 6, blocs > 1,25, < 0,04 bit/pixel, luminance < 60, etc.) sont **non calibrés** :
  à ajuster sur le corpus réel puis à figer avec leur date dans `BENCHMARK_PROTOCOL.md`. Les motifs synthétiques
  alignés sur la grille 8×8 (mires) gonflent artificiellement `blocs_8x8`.
- Filtres AR / beauté : l'outil ne fournit que des indices colorimétriques ; il **ne détecte pas** un filtre AR.
