# RetoucheProAI — laboratoire de fidélité audiovisuelle (preuve reproductible)

**Lab responsable :** SmallMotion / préproduction, issu de PR #28. Le module audio/vidéo de l'application est sous responsabilité NOVA (PR #3). **Aucun changement de `app.js` ni de la chaîne d'export NOVA ici.**

## Objectif

Empêcher de déclarer une conversion « fidèle » sans avoir vérifié la conservation de la chronologie des images et du son. Les observations d'un fichier converti ne constituent pas une preuve de restauration visuelle ou de super-résolution.

## Contenu

- `export_fidelity_gate.py` : analyse de deux MP4 originaux/exportés **en lecture seule** ; FFprobe dénombre les images, examine les métadonnées AAC et compare les hachages de paquets **en mémoire**, FFmpeg décode uniquement un extrait PCM dans la RAM et NumPy aligne les signaux. Le rapport omet chemins, noms, pixels, données PCM et empreintes de paquets.
- `test_export_fidelity_gate.py` : **8 cas entièrement synthétiques** sur AAC 44,1 / 48 kHz ; test positif avec remux fidèle ; tests négatifs pour disparition de son, images terminales manquantes, décalage volontaire de 80 ms. Les clips sont produits dans `TemporaryDirectory`, supprimés après validation.

## Commandes (analyse privée facultative)

```bash
python -m pip install numpy
python research/preprod/tests/test_export_fidelity_gate.py
python research/preprod/export_fidelity_gate.py --original SOURCE.mp4 --exported SORTIE.mp4 --output diagnostic_local.json
```

Dépendances : FFprobe et FFmpeg installés localement, NumPy. **Ne pas exécuter avec des médias privés sur un runner public GitHub**. Ne pas committer `diagnostic_local.json` d'un média personnel dans le dépôt. Le diagnostic est limité aux fichiers *sans montage ni découpage intentionnel*, et à la comparaison de première piste audio/vidéo.

## Interprétation

- `pass` : pas de défaut détecté sur ce sous-ensemble de critères, **pas** un label de qualité 8K ni une preuve d'identité des images.
- `fail` : perte de piste, d'images, de paquets AAC ou différence de synchronisation mesurée au-delà de 20 ms sur un signal corrélable.
- `inconclusive` : signal trop silencieux/ambigu, métadonnées insuffisantes ou décodeur indisponible.

**Signes de causalité :** les données `skip_samples` et l'écart temporel PCM rendent la perte de priming AAC plausible ; elles ne prouvent pas à elles seules la ligne de code responsable. NOVA devra intervenir sur un export réel, préserver les métadonnées ou le cadrage temporel AAC sans imposer un décalage fixe, puis passer ce gate et un vrai test Safari. Ne jamais bloquer un utilisateur sur un diagnostic qui compare des montages intentionnellement différents.

## Confidentialité et périmètre

Aucun appel HTTP, aucun upload, aucun stockage de média dans le dépôt, aucune action automatique sur les vidéos. Les nombres de frames/durations dans un diagnostic **sont eux-mêmes potentiellement sensibles** : ne partager le rapport d'une vidéo privée qu'avec l'accord explicite de son propriétaire. Seuls les résultats des tests synthétiques et un bilan technique dépersonnalisé sont destinés à la PR de recherche.