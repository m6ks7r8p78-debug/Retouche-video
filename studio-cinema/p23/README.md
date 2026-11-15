# Cinema P23 — continuité temporelle des micro-gestes procéduraux

**Laboratoire Cinema AI. PR brouillon dédiée sur la branche `chatgpt-cinema-p23-temporal-qa-20261115`, fondée sur la branche P21/P22 de la PR #33.** Ne touche ni `main`, ni la production, ni la coordination.

## Problème réellement constaté

Le banc P22 démontre que les nouveaux mouvements lèvre/langue se traduisent par des changements de pixels localisés. Mais le renderer P22 traite plusieurs gestes comme **états booléens** : le trait passe soudain d'absent à pleinement visible lorsque le drapeau P21 devient vrai, même lorsque sa courbe d'intensité numérique est encore faible. Un geste peut donc satisfaire les tests de visibilité P22 sans fluidité à son apparition.

## Développement P23

- `src/temporal_blend.py` utilise les **vrais modules P19/P21/P22**, sans les modifier : image vectorielle P19, trait P22 par geste, puis composition alpha dépendante de la **courbe continue** P21 pour quatre gestes (morsure inférieure, léchage inférieur, langue visible, rétraction).
- Les valeurs d'intensité non finies, négatives ou incohérentes déclenchent un **refus**. La langue ne reçoit **jamais** de faux repère anatomique quand sa pointe 2D est absente.
- À l'apparition de chaque geste, compare la différence moyenne des pixels de bouche dans le rendu original P22 avec la version P23, **deux images consécutives**. Test unitaire : les pics d'entrée doivent diminuer ; ne pas les confondre avec une métrique de naturel humain.
- Re-vérifie que les images où aucun geste n'est actif restent identiques, et que **rien hors bouche n'est dessiné**.
- À amplitude maximale, mesure les pixels différenciés en 720×720 et après réduction du rendu synthétique à **360×360 et 240×240**. Des pixels restants ne prouvent **pas** la perception à l'œil ni l'affichage Safari.
- Produit facultativement un MP4 illustratif 720×720 H.264/AAC à 60 i/s pendant 8 s depuis les **480 poses synthétiques** ; le workflow CI contrôle l'encodage, les flux audio/vidéo, la durée et le décodage entier.

## Reproduire depuis la racine du dépôt

```sh
python -m pip install 'numpy<3' 'opencv-python-headless>=4.9,<5'
node --test studio-cinema/p21/tests/test_p21.cjs studio-cinema/p20/tests/test_p20.cjs studio-cinema/p19/tests/test_p19.cjs studio-cinema/p15/tests/test_behavior_ontology.cjs
node studio-cinema/p22/src/build_p22_controls.cjs studio-cinema/p22/results/controls.json
python -m unittest discover -s studio-cinema/p22/tests -p 'test_p22_visual.py' -v
python -m unittest discover -s studio-cinema/p23/tests -p 'test_p23_temporal.py' -v
python studio-cinema/p23/src/temporal_blend.py --data studio-cinema/p22/results/controls.json --out studio-cinema/p23/results/proof --render-preview
```

Dépendances : Python 3.11, Node 22, NumPy, OpenCV, FFmpeg/libx264/AAC. Le workflow `.github/workflows/ci-cinema-p23.yml` installe FFmpeg si absent. Les données et images de preuve ne sont **pas commités** dans le dépôt, sauf code et tests. Les fichiers synthétiques produits en CI ne sont accessibles que via artefact GitHub temporaire.

## Protocole de validation et limites

- `synthetic-tested` uniquement quand la CI identifie un commit précis et retourne `SUCCESS`.
- Les mesures de réduction des sauts sont effectuées **sur l'énergie résiduelle dans une zone de bouche**, pas sur un suivi des lèvres ou une réalité physique. Le score peut être réduit artificiellement en rendant le trait trop discret ; la vérification à amplitude maximale évite une disparition totale du geste, **sans** garantie de naturel.
- Les résultats 240/360 pixels viennent d'un **redimensionnement OpenCV**, pas d'un navigateur ni d'un iPhone physique.
- Rendu vectoriel illustratif, **aucun visage photoréaliste**, aucune nouvelle vidéo neuronale, aucun entraînement, aucune source privée et aucune reconnaissance d'une personne.
- Aucun changement automatique de vidéo, aucun dépôt de média privé, aucun déploiement ni fusion.
- Les tests de *continuité entre toutes les images* et de robustesse après la compression H.264 (mesures chiffrées temporelles) nécessiteront un banc indépendant supplémentaire ; P23 mesure ici d'abord les frontières des quatre événements et l'intégrité de l'encodage.

## Relais aux autres laboratoires

- **NOVA PR #3 :** le clip P23 H.264/AAC synthétique peut être réévalué avec ses diagnostics A/V, mais aucun code NOVA n'a été importé.
- **SmallMotion PR #28 :** ses deux images ne sont **pas** une preuve de geste facial.
- **AURA PR #31 :** un aperçu opt-in nécessitera une PR d'intégration séparée ; pas de modification de l'interface.
- **Directeur IA :** `synthetic_temporal_gate_pass` ne signifie **pas** confiance calibrée ni restauration automatique autorisée.
- **Coordination :** le coordinateur seul met à jour `coordination/REGISTRE.json`; preuves attachées à la PR Cinema.
