# Architecture (v3.3)

Application web installable (PWA), sans serveur de calcul : tout tourne dans Safari sur l’iPhone.

| Module | Rôle | Interfaces utilisées |
|---|---|---|
| `index.html` + `app.js` (noyau, v6.4 : code sorti de la page, scripts différés ; `effacer.js`/`depth.js` chargés à la demande) | interface, import, analyse (`AZ`, `REC`, `PHOTO`), rendu WebGL (`draw`), profils (`PROF`), IA (`SRX`), export WebCodecs, Time Repair (`TR`), son | — |
| `models.js` | registre et gestionnaire des modèles (`MODELS`) | `MODELS.bytes(id)`, `register(id, {loaded, busy, unload})`, `download`, `status` |
| `sr.js`, `sr-gpu.js` | moteur Real-ESRGAN (WebGPU → WebGL2) | `SR.run(src, échelle, débruitage)` |
| `depth.js` | profondeur (ONNX Runtime Web) | `DEPTH.estimate(image)` |
| `effacer.js` *(v3.3)* | « Effacer une zone » : éditeur plein écran, masque (pinceau, gomme, toucher), MI-GAN, EdgeTAM, carte des zones inventées, provenance, exports (`ERASE`) | `ERASE.open(fichier)`, `ERASE.close()` ; utilise `MODELS.bytes`, `MODELS.register`, `STUDIO.granted`, `shareBlob`, `uniqName` |
| `modeles/` *(v3.3)* | structures ONNX d’EdgeTAM (0,2 Mo chacune, identiques à Hugging Face, vérifiées par empreinte au chargement) | chargées par `effacer.js` |
| `studio.js` | autorisations, sauvegarde chiffrée, historique, assistant (`STUDIO`) | `consent(k)`, `granted(k)`, `grant(k)`, `revoke(k)`, `backup(pass)`, `restore(o, pass)`, `plan(texte)`, `esc(texte)` |
| `sw.js` | hors ligne | cache des fichiers de l’app (`retouche-vN`) ; ne touche pas au cache des modèles (`retouche-modeles-v1`) |
| `polices/` | polices de l’interface (OFL) | `polices/polices.css` |
| `serveur/worker.js` | récupération de vidéos par lien (Cloudflare Workers) | `/video`, `/proxy`, `/etat` |

Effacement (v3.3), sur une **copie** de la photo (taille ≤ 16 Mpx) : masque (traits vectoriels rejoués, ou masque proposé par EdgeTAM)
→ rectangle du masque élargi de 0,3 % → contexte (zone + marge ≥ 96 px) → MI-GAN (uint8, 512 px en interne) → pièce opaque sur le masque seulement
→ proposition (garder / refuser) → pose sur la copie + carte `G` (1 octet par pixel) + pile d’annulation (pixels et carte d’avant, dans le rectangle).

Ordre du traitement d’une image : décodage → poussières (vidéo) → anti-blocs → débruitage / netteté / couleurs (ou IA puis couleurs) →
relèvement des ombres (profils nuit) → protection des hautes lumières → stabilisation → encodage → relecture du fichier.
Chaque moteur déclare sa solution de secours (voir MODELES.md). Les « 12 systèmes » du cahier des charges et leur état : RAPPORT_AUDIT.md.
