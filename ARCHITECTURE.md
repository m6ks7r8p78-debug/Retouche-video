# Architecture (v3.2)

Application web installable (PWA), sans serveur de calcul : tout tourne dans Safari sur l’iPhone.

| Module | Rôle | Interfaces utilisées |
|---|---|---|
| `index.html` (noyau) | interface, import, analyse (`AZ`, `REC`, `PHOTO`), rendu WebGL (`draw`), profils (`PROF`), IA (`SRX`), export WebCodecs, Time Repair (`TR`), son | — |
| `models.js` | registre et gestionnaire des modèles (`MODELS`) | `MODELS.bytes(id)`, `register(id, {loaded, busy, unload})`, `download`, `status` |
| `sr.js`, `sr-gpu.js` | moteur Real-ESRGAN (WebGPU → WebGL2) | `SR.run(src, échelle, débruitage)` |
| `depth.js` | profondeur (ONNX Runtime Web) | `DEPTH.estimate(image)` |
| `studio.js` | autorisations, sauvegarde chiffrée, historique, assistant (`STUDIO`) | `consent(k)`, `granted(k)`, `grant(k)`, `revoke(k)`, `backup(pass)`, `restore(o, pass)`, `plan(texte)`, `esc(texte)` |
| `sw.js` | hors ligne | cache des fichiers de l’app (`retouche-vN`) ; ne touche pas au cache des modèles (`retouche-modeles-v1`) |
| `polices/` | polices de l’interface (OFL) | `polices/polices.css` |
| `serveur/worker.js` | récupération de vidéos par lien (Cloudflare Workers) | `/video`, `/proxy`, `/etat` |

Ordre du traitement d’une image : décodage → poussières (vidéo) → anti-blocs → débruitage / netteté / couleurs (ou IA puis couleurs) →
relèvement des ombres (profils nuit) → protection des hautes lumières → stabilisation → encodage → relecture du fichier.
Chaque moteur déclare sa solution de secours (voir MODELES.md). Les « 12 systèmes » du cahier des charges et leur état : RAPPORT_AUDIT.md.
