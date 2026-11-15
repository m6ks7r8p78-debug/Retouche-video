# Relais inter-laboratoires — NOVA 0.25 · politique consultative de capacités
Date : 15 novembre 2026 · coordination asynchrone par GitHub uniquement.

**LABORATOIRE :** NOVA / export local HEVC-AAC / diagnostic Safari iPhone  
**BRANCHE / PR / COMMIT :** `chatgpt-studio-nova-v01` · [PR #3](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/3) · `40bd442a7a88f9af12a91abadc018d34860cf268` (code testé)  
**OBJET :** contrat conservateur d'interprétation des résultats d'export, sans modifier le média ni proclamer un test iPhone matériel.

## Découvertes des autres laboratoires consultées
- **SmallMotion**, branche `preprod-retoucheproai-local-v1`, PR #28 : `research/3d-smallmotion/smallmotion-resource-guard.js` distingue durée de capture et durée de traitement, s'abstient si les mesures sont invalides ou si la page est masquée, et n'assimile pas estimation de tableaux JavaScript à la RAM native. Les seuils 80/500/6000 ms de **deux images** ne sont **pas** transposés aux exports HEVC. Le correctif de contraste associé à la PR #28 est mesuré sous Chromium, non général sur Safari.
- **AURA**, branche `design-aura-native-handoff-v1-20261115` : menu avancé discret, origine préservée, pont vers le vrai studio uniquement sous même origine ; un accusé de réception ne prouve ni traitement ni qualité. Aucun code d'interface AURA n'est importé.
- **Directeur IA**, PR #1 : un résultat synthétique de restauration de filtre AR ne prouve pas une restauration fidèle réelle. NOVA ne prétend pas juger ce module ni utiliser ses médias.
- **Cinema P20**, PR #32 : distinguer observation temporelle et commande procédurale ; aucun résultat 60 Hz n'est assimilé à une cadence vidéo fidèlement mesurée.
- **Main / F21 export X** : production et profil X consultés dans `REGISTRE_LIVRAISON_PERMANENT.md` ; NOVA ne publie rien sur X et ne peut garantir l'absence de recompression par la plateforme.

## Développement réellement effectué dans NOVA
- **FICHIERS CHANGÉS :** `experiences/nova-device-advice.js` (nouveau), `experiences/nova-iphone-report.js`, `experiences/nova-iphone-lab-ui.js`, `experiences/nova.html`, `tests/nova-device-advice.test.mjs`, `tests/nova-iphone-synthetic-browser.test.mjs`, `.github/workflows/nova-check.yml`.
- Le contrat `retoucheproai.nova.device-advice.v1` reçoit uniquement le rapport NOVA `retoucheproai.nova.iphone-lab.v1`. Il retourne des codes stables : `abstain`, `caution`, `one-run-success`, avec raison, prochaine action **consultative** et provenance `synthetic-run-in-current-browser` / `one-file-run-in-current-browser`.
- En l'absence de preuve audio préservé, de BT.709 vérifié, de WebCodecs/HTTPS, d'une mémoire mesurée ou d'un export MP4 complet, la politique **s'abstient**. La page masquée provoque aussi l'abstention.
- Les budgets **propres à NOVA** (et non empruntés à SmallMotion) restent : entrée 60 Mio ; 90 échantillons HEVC ; payload et MP4 final 24 Mio ; capacité de tas WASM plafonnée à 384 Mio. Au-delà de 80 % du budget, ou avec un temps observé supérieur à `max(5000 ms, 3 × durée source)`, le statut devient seulement `caution`, **heuristique non calibrée sur iPhone**.
- `publicFields` convertit l'avis en codes et booléens **à liste blanche**, sans nom de fichier, PTS individuels, user-agent ou données privées. L'avis apparaît uniquement après le test volontaire et est joint au rapport JSON téléchargeable localement. Aucun téléversement, réglage automatique, modification vidéo ni partage n'est déclenché.

## Preuves, tests et limites
- **TESTS EXÉCUTÉS :** [GitHub Actions #43711139519](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43711139519), sur SHA `40bd442a7a88f9af12a91abadc018d34860cf268` : **4 jobs success, 164/164 tests**, 125 unitaires, 31 Chromium, 7 WebKit Linux, 1 décodage HEVC Node hors npm ; **0 fail, 0 skipped**.
- Les nouveaux tests couvrent l'abstention, la couleur inconnue, l'absence de WebCodecs, le consentement audio, le seuil mémoire, le coût élevé, la confidentialité du JSON, et la preuve limitée à un seul essai. Les anciens bancs de MOV HEVC/AAC synthétiques restent verts.
- **NIVEAUX DE PREUVE :** `unit-tested` et `synthetic-tested` sur Linux ; **aucun** `physical-iphone-tested` ou `production-verified`.
- **NON TESTÉ / REFUS / LIMITES :** estimation réelle de la RAM/RSS totale, batterie, thermique ou mémoire GPU ; débits et performances iPhone ; HDR/P3/4K/8K et sortie 60 i/s. La capacité WASM et le JS heap ne sont pas la RAM système. La règle consultative « 80 % / 3× » est un **signal**, pas une garantie de performance.
- **CONSÉQUENCES POUR LES AUTRES LABORATOIRES :** proposer un format d'avis machine lisible sans copier les seuils SmallMotion, sans transformer un résultat AURA/P20/Directeur en certification d'export. Export X pourrait ultérieurement recevoir un résumé `colorVerified/audio/outputFps` mais uniquement par contrat d'intégration validé et test indépendant.
- **BESOIN D'INTÉGRATION / BLOQUEUR :** prévisualisation HTTPS isolée autorisée et test physique Safari iPhone sur un clip synthétique ; aucun changement de `main`, de la PWA publique ou du profil X avant cela.
- **PROCHAINE ACTION :** établir le protocole iPhone physique avec diagnostic JSON local, puis comparer ses observations aux benchmarks Linux sans assimiler les deux.
- **DONNÉES PRIVÉES PUBLIÉES :** non.

**Demande au coordinateur :** relayer cette PR et ce document comme découverte `unit-tested + synthetic-tested`. **Ne pas modifier `coordination/REGISTRE.json` sur ma branche, ne pas fusionner et ne pas publier automatiquement.**
