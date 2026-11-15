# Retouche Cinema AI — P4 : mémoire visuelle & contrôle des raccords

**15 novembre 2026 · prototype expérimental · aucune génération vidéo IA photoréaliste.**

Le chantier prolonge P1 (storyboard), P2 (clips et passerelle ComfyUI), P3 (dialogues, voix synthétiques et montage). Il **n'ajoute pas de modèle vidéo GPU**. Il ajoute un moyen structuré d'expliquer ce qui doit rester identique d'un clip à l'autre et de signaler des divergences visibles après production.

## Architecture

- `../director-p4.html` : interface iPhone **autonome hors ligne**, P1–P3 conservés, et panneau P4 pour écrire les attributs de chaque personnage ; trois exports P4.
- `continuity-bible.js` : fabrique la **bible de continuité** JSON, les raccords entre clips et les annotations à compléter. Ajoute les notes validées dans les prompts P2 tout en conservant leur schéma strict.
- `continuity_gate.py` : outil CPU hors ligne qui vérifie les SHA-256 des clips MP4 et compare uniquement des **régions annotées à la main**. Il ne devine ni visages ni identités réelles.
- `tests` : tests de stabilité, confidentialité, consentement, intégrité, cas difficiles et refus de conclusion automatique.
- `examples` : JSON synthétiques, aucune image ou vidéo réelle.

## Mode d'emploi accessible iPhone

1. Ouvrir `director-p4.html` ; décrire ton film ou choisir une photo/vidéo que tu as le droit d'utiliser.
2. Préparer les plans et les dialogues. Dans **« Identité visuelle & continuité »**, indiquer ce qui doit rester stable, par exemple « manteau rouge, cheveux bruns, tasse blanche ».
3. Télécharger **Mémoire P4** (`cinema-p4-bible-v01`), **Clips enrichis P4** (toujours `cinema-p2-render-v01`) et le **Modèle de vérification P4** (`cinema-p4-evidence-v01`).
4. Après génération des clips par une installation GPU indépendante et explicitement activée, fournir au vérificateur privé les fichiers **`<clip_id>.mp4`**, leurs SHA-256 et les coordonnées des zones annotées. Le studio iPhone ne lance pas le vérificateur Python.
5. Lire les résultats ; corriger ou vérifier manuellement chaque raccord douteux.

## Évaluation visuelle CPU

Les rectangles sont des coordonnées **normalisées** `[x, y, largeur, hauteur]` entre 0 et 1, placés manuellement autour du même élément dans deux clips consécutifs. Pour éviter certains fondus, les images utilisées sont environ à 85 % du premier clip et à 15 % du suivant. Le score combine histogrammes teinte/saturation HSV (distance de Bhattacharyya) et dHash 64 bits ; les seuils sont exploratoires, **non calibrés sur des films photoréalistes**.

Un contraste fort retourne `flagged`; un aspect proche retourne **`compatible_unverified`**, jamais « identité prouvée ». Sans région annotée, ou avec une coupure de caméra déclarée, la décision est **`needs_review`**. Le rapport n'inclut jamais de pixel, de frame, de chemin local ou de photographie.

### Commande locale

```bash
python -m pip install -r studio-cinema/p4/requirements-dev.txt
python studio-cinema/p4/continuity_gate.py \
  demo/manifest_p2.json demo/same_clothes/evidence.json demo/same_clothes \
  --output evaluation.json
```

La démonstration ci-dessus est intégralement fictive ; le script `demo/run_synthetic_demo.py` permet de régénérer les MP4 et les rapports à partir de formes dessinées.

### Tests

```bash
node --test studio-cinema/p4/tests/test_continuity_bible.cjs
python -m pytest -q studio-cinema/p4/tests/test_continuity_gate.py
```

Validation du plan P4 avec la passerelle P2 :

```bash
python -c "import sys;sys.path.insert(0,'studio-cinema/p2/gateway');from retouche_render_gateway import load_manifest;print(len(load_manifest('demo/manifest_p4_locked.json')['clips']))"
```

## Risques et limites

- Deux personnes peuvent avoir la même palette, les mêmes vêtements ou la même silhouette. Le système **ne sait pas prouver leur identité**, leur âge ou leurs caractéristiques anatomiques.
- Changer de focale, de position, de décor ou de lumière peut produire une alerte injustifiée. Les découpes entre plans exigent un examen humain.
- Le contrôle actuel n'étudie pas le réalisme d'un geste « main → tasse → bouche », la synchronisation labiale ni les articulations 3D. Il n'évalue pas la fidélité à une photo de référence.
- La cohérence de personnages dans un film long reste un **objectif à développer**, pas un résultat atteint.
- Aucune requête réseau, aucun modèle de vidéo, aucun original parmi les 157 vidéos privées, aucune représentation biométrique et aucun poids entraîné n'est inclus.
- L'export texte contient des notes potentiellement personnelles : conserver les JSON privés si leur contenu est sensible.
- **Chromium et Safari iPhone physique : pas validés pour P4** (ouverture locale Chromium bloquée par le navigateur du laboratoire). L'analyse statique des scripts est passée.
- La branche GitHub et la PR #5 restent expérimentales ; `main` et le site public ne changent pas.

## Recherche scientifique

Les contrôles sont inspirés de l'importance accordée aux critères *subject consistency* et *background consistency* dans VBench, mais **ils ne sont pas une implémentation de VBench/DINO/CLIP** et ne produisent pas de score comparable au benchmark.

- VBench : https://github.com/Vchitect/VBench
- Article CVPR 2024 : https://openaccess.thecvf.com/content/CVPR2024/papers/Huang_VBench_Comprehensive_Benchmark_Suite_for_Video_Generative_Models_CVPR_2024_paper.pdf
- Routes ComfyUI : https://github.com/Comfy-Org/docs/blob/main/development/comfyui-server/comms_routes.mdx
