# Retouche Cinema AI P2 — passerelle de rendu vidéo, sans promesse trompeuse

**Version expérimentale — 15 novembre 2026.** Le prototype iPhone crée un storyboard et une animatique stylisée (P1), puis en P2 un **plan de rendu textuel** pour un moteur vidéo externe. Les films réalistes ne sont **pas encore générés** dans le prototype fourni.

## Ce qui fonctionne

1. À partir de la description du film, le Cinema Director prépare personnages, actions, scènes et durées, puis un plan de rendu P2.
2. Les séquences sont divisées en clips de 3, 4 ou 5 secondes, avec IDs stables de personnages/objets, graines reproductibles et ordre déterministe. Une scène de 120 s devient 24 clips de 5 s.
3. Export JSON de la feuille de calcul à fournir à un moteur, ou TXT de la feuille de tournage.
4. Passerelle opérateur Python avec un **adaptateur réel vers l'API ComfyUI** : POST `/prompt`, GET `/history/{prompt_id}`, GET `/view`. Elle requiert un workflow vidéo ComfyUI exporté en format API, adapté à un modèle installé (LTX ou Wan, par exemple). Aucun modèle, service cloud ou clé n'est inclus.
5. Toutes les opérations de réseau de la passerelle sont **désactivées par défaut** ; l'opérateur doit explicitement passer `--execute`. Les adresses distantes exigent `--allow-remote`. Seules les descriptions textuelles de plans sont transmises ; jamais la photo ou la vidéo utilisateur.

## Vérifier sans GPU ni réseau

```bash
node --test tests/test_render_plan.cjs
python -m pytest -q tests/test_render_gateway.py tests/test_integration_stub.py tests/test_assembly.py
python gateway/retouche_render_gateway.py sample_manifest_390.json
```

Les tests d’intégration emploient un faux ComfyUI sur 127.0.0.1 et des vidéos synthétiques créées avec ffmpeg. **Ce test vérifie seulement le transport**, et n'est **pas** une preuve de génération vidéo par IA.

## Utiliser un vrai moteur local (après installation GPU et modèle)

1. Installer ComfyUI et un workflow vidéo compatible avec le matériel et les droits d'exploitation : modèles non inclus.
2. Dans ComfyUI, exporter le workflow **au format API** dans `mon_workflow_api.json` : le workflow doit produire une sortie vidéo dans `/history` (`videos` ou `gifs`, selon le nœud de sauvegarde).
3. Repérer les identifiants des nœuds et leurs entrées réelles dans le JSON API (par exemple un champ texte `text` et un champ numérique `seed`). Les renseigner dans `mapping.json`, en s'inspirant de `gateway/COMFYUI_MAPPING_EXEMPLE.json` ; les IDs d'exemple ne sont pas universels.
4. Depuis le répertoire P2 :

```bash
python gateway/retouche_render_gateway.py retouche-cinema-P2-CLIPS-texte-seul.json \
  --workflow mon_workflow_api.json --mapping mapping.json \
  --url http://127.0.0.1:8188 --out ./rendus_prives --execute --limit 1
```

5. Vérifier le premier clip (fidélité, cohérence, coût). Retirer `--limit 1` uniquement après validation. Chaque sortie est enregistrée sous ID de clip, avec SHA-256 dans `render_report.json`. Une erreur stoppe l'exécution ; aucun « film complet » n'est annoncé si des clips manquent. **Aucun montage automatique des clips issus d'un modèle n'est encore réalisé.**

## Confidentialité et limites

- Ni photo, ni vidéo, ni nom de fichier original dans le manifeste P2. Les **descriptions textuelles peuvent contenir des informations personnelles**, donc garder le JSON privé.
- Ne pas transmettre un visage ou une voix réelle à un prestataire sans les autorisations correspondantes et un opt-in séparé ; le P2 ne prend pas en charge les références média distantes.
- L'interface HTML ne contacte pas un GPU, ne demande pas de clé API, ne contourne pas l'accord utilisateur et ne possède aucun rendu vidéo IA connecté.
- Le format final, la résolution, les voix et les gestes dépendent d'un workflow vidéo externe ; ces paramètres ne sont pas encore garantis par le planificateur P2. Les prompts textuels peuvent aider la cohérence narrative mais **ne garantissent pas l'identité du personnage entre clips**.
- La passerelle CLI s'adresse à un opérateur qui dispose d'une machine GPU, non à l'utilisateur novice sur iPhone. L'automatisation transparente est la prochaine étape lorsque le backend sera prêt, sécurisé et financé.
- Rien n'est fusionné ni déployé en production. Safari sur iPhone physique non testé.

## Licences de modèles

LTX-2.5 : code Apache-2.0 ; **poids sous LTX-2.x Community License**, à vérifier avant usage commercial. Wan2.2 : utiliser uniquement la version et le workflow dont les licences sont compatibles avec l'utilisation prévue. Dépôts consultés le 15 novembre 2026 : [LTX-2](https://github.com/Lightricks/LTX-2), [Wan2.2](https://github.com/Wan-Video/Wan2.2) et [API ComfyUI](https://docs.comfy.org/development/comfyui-server/comms_routes).

