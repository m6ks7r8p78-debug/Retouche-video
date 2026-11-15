# Retouche Cinema AI P3 — voix synthétiques et sous-titres

**Prototype expérimental, non déployé.**

La P3 complète le storyboard P1 et les clips P2 par les dialogues horodatés, un locuteur identifié, des sous-titres SRT et un MP4 avec voix française synthétique locale. Le navigateur iPhone prépare des fichiers JSON. Le rendu audio nécessite Python, espeak et ffmpeg sur un poste séparé.

## Sources

- director-p3.html dans studio-cinema : interface HTML autonome iPhone, scénario et dialogues P3.
- p3/dialogue-plan.js : horodatages, speaker sélectionné, protection des consentements.
- p3/voice_montage.py : validation manifestes P2/P3, preuve locale SHA-256 du film, voix espeak en français, mux AAC et SRT.
- p3/examples : manifestes fictifs et générateur d'un film de test purement procédural de six secondes.
- p3/tests : tests JS/Python, dont un vrai rendu voix + vidéo.

## Démonstration entièrement locale

Depuis la racine du dépôt, avec Python 3.11+, numpy, requests, pytest, les programmes espeak, ffmpeg et ffprobe :

~~~bash
python -m pip install -r studio-cinema/p3/requirements-dev.txt

python studio-cinema/p3/examples/render_demo_video.py /tmp/cinema-demo

# Dry-run (validation uniquement, aucun audio créé)
python studio-cinema/p3/voice_montage.py \
  studio-cinema/p3/examples/demo_manifest_p2.json \
  studio-cinema/p3/examples/demo_dialogue_p3.json \
  /tmp/cinema-demo/demo_sans_voix.mp4 /tmp/cinema-demo/film_voix.mp4

# Rendu véritable en local
python studio-cinema/p3/voice_montage.py \
  studio-cinema/p3/examples/demo_manifest_p2.json \
  studio-cinema/p3/examples/demo_dialogue_p3.json \
  /tmp/cinema-demo/demo_sans_voix.mp4 /tmp/cinema-demo/film_voix.mp4 --execute

node --test studio-cinema/p3/tests/test_dialogue_plan.cjs
python -m pytest -q studio-cinema/p3/tests/test_public_smoke.py
~~~

Pour un film provenant de P2, le MP4 doit être accompagné de son rapport de provenance, avec empreinte SHA-256 correcte. La P3 vérifie l'intégrité, la durée et les locuteurs. Une réplique trop longue est rejetée, pas tronquée.

## Résultats et limites

- 26 tests JS P1/P2, 29 tests Python P2, 12 tests JS P3, 15 tests Python P3 et 6 tests Python publics supplémentaires : **88 tests de code passés**, sans les assimiler à des expériences scientifiques indépendantes.
- Vérification syntaxique de quatre blocs JS HTML, aucun identifiant HTML dupliqué, aucune ressource réseau référencée dans l'interface.
- Le test Chromium P3 a été **bloqué par la politique du navigateur local** sur file et localhost. Safari physique iPhone non testé.
- La démonstration MP4 a des pistes vidéo H.264 et audio AAC. Elle est dessinée de façon procédurale en 2D et contient une voix robotique française, **pas un film créé par un générateur vidéo IA**.
- Aucun GPU, aucun modèle vidéo génératif ni entraînement utilisés en P3.
- Aucun média privé ou poids dérivé des 157 vidéos n'est ajouté à GitHub. Les textes de scénario exportés peuvent malgré tout être privés.
- Aucun transfert distant, aucun clonage de voix, aucune exploitation pour entraînement : ces consentements sont verrouillés sur false.
- La provenance SHA-256 garantit une cohérence locale des fichiers, et non une attestation externe d'origine des clips.
- Une voix française, une réplique par plan, pas de lip-sync ni d'ambiance sonore.

## Suite P4

Exécuter un workflow vidéo GPU licencié, mesurer la continuité des personnages/objets entre plans, améliorer la voix et la synchronisation labiale, puis tester sur un iPhone Safari physique avant tout déploiement. Pour un moteur tiers, vérifier coûts, droits et rétention des données.

Référence API ComfyUI : https://docs.comfy.org/development/comfyui-server/comms_routes
