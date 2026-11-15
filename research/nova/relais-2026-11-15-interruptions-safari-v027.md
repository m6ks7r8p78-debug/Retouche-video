# Relais inter-laboratoires — NOVA 0.27 · interruptions et invalidation des succès tardifs

**Date :** 15 novembre 2026. Échange asynchrone par GitHub uniquement ; aucune communication directe entre conversations.

**LABORATOIRE :** NOVA / décodeur local HEVC/AAC, export H.264/AAC et diagnostics Safari.  
**BRANCHE / PR / COMMIT TESTÉ :** `chatgpt-studio-nova-v01` · [PR #3](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/3), brouillon · `6d5370cfafa5d96eecc0da5a3bb0aa9c79f594cb`.  
**OBJET :** rendre les annulations du banc iPhone explicites et impossibles à confondre avec un export réussi.

## Lecture et dépendances
- La branche de coordination `coordination-retoucheproai-v1` a été relue avant le développement : `coordination/README.md`, `coordination/PROTOCOLE.md`, `coordination/REGISTRE.json` ; **aucun de ces fichiers n'a été modifié**.
- Le registre mentionne NOVA × SmallMotion [PR #35](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/35) et NOVA HTTPS [PR #38](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/38). Les deux sont des branches distinctes, encore en brouillon, non fusionnées. **Aucun code de ces PR n'a été copié ou fusionné automatiquement.** La prévisualisation HTTPS est un périmètre de la PR #38 : NOVA 0.27 ne publie donc pas de site de test.
- Les règles SmallMotion d'abstention si les ressources matérielles ne sont pas connues et les principes AURA d'options avancées discrètes sont préservés, sans prétendre que les tests Linux valident Safari sur iPhone.

## Modifications exécutées sur notre branche
- `experiences/nova-iphone-stability.js` : un signal d'annulation invalide **même le troisième succès provisoire**. Les séries interrompues produisent `abstain` / `run-cancelled`, avec un champ `interrupted:true`, et ne sont pas qualifiées `three-synthetic-runs-consistent`. Aucun essai ultérieur n'est déclenché après annulation.
- Le JSON de stabilité `retoucheproai.nova.synthetic-stability.v1` utilise désormais une **liste blanche stricte** de statuts, motifs, chiffres et booléens ; les champs libres d'un appelant ne peuvent pas être intégrés au rapport. Les informations telles que chemin, nom de fichier, userAgent, GPS ou contenu média sont exclues.
- `experiences/nova-iphone-report.js` vérifie l'annulation **avant** de démarrer le probe MOV et immédiatement après le retour du probe, avant de lancer l'audit SPS/VUI ou l'export.
- `experiences/nova-export.js` vérifie le signal après la lecture des métadonnées finales, après le second probe colorimétrique et avant le retour du `Blob`. Un résultat tardif ne peut pas être publié comme succès une fois le signal annulé.
- `experiences/nova-iphone-lab-ui.js` restaure les commandes et affiche un état « annulé/interrompu par Safari » après `pagehide`. Aucun ancien lien JSON ou MP4 n'est réutilisé comme nouveau résultat.
- `tests/nova-iphone-abort-browser.test.mjs` (nouveau) simule la réception tardive d'un succès après `pagehide` dans le **paquet autonome**. Les deux cas incluent l'annulation au troisième essai synthétique. Même sous une promesse différée contrôlée, **aucun fichier n'est proposé**, les boutons redeviennent utilisables, et aucune requête externe/upload n'est effectuée.

## Preuves vérifiées et limites
- **CI du code exact** : [GitHub Actions 43714330859](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43714330859) sur commit `6d5370cfafa5d96eecc0da5a3bb0aa9c79f594cb` : **4 jobs success, 179/179 tests**, 136 unitaires, 33 Chromium, 9 WebKit Linux, 1 HEVC WASM Node hors npm, **0 échec, 0 ignoré**.
- Le test `pagehide` est un **événement synthétique navigateur** : il prouve l'invalidation des liens tardifs et la remise à zéro de l'interface, **pas** la suspension iOS réelle ni la libération de mémoire par WebCodecs.
- Aucun benchmark de RAM/RSS, GPU, batterie, température ou fuite native ; aucun test sur un véritable iPhone physique. L'absence d'échec aux tests Chromium/WebKit ne suffit pas à certifier Safari.
- Les plafonds HEVC (source 640×360 / 90 échantillons, vidéo sortie 15 images/s, max 12 s / 60 Mio, BT.709 SDR) ne sont pas augmentés ; pas de HDR/P3/4K/8K ni sortie 60 images/s validés.
- **Données privées publiées :** aucune. **Fusion, déploiement, site public, branche main :** aucun changement.

**CONSÉQUENCES POUR LES AUTRES LABORATOIRES :** pour tout pont vers NOVA (SmallMotion, AURA, Directeur IA, export X), un `cancelled` et même un « succès » reçu après `pagehide` doivent **invalider** la publication de nouveaux résultats. Les rapports de diagnostic et les MP4 restent locaux, exportables seulement après une opération explicitement autorisée.

**BLOQUEUR :** une prévisualisation HTTPS distincte **approuvée** et un essai sur iPhone Safari physique (PR #38, non fusionnée).  
**PROCHAINE ACTION :** tester physiquement le passage en arrière-plan et le retour Safari avec une vidéo HEVC/AAC **synthétique** ; noter si le navigateur reprend ou annule, sans collecter de vidéo privée.  
**DEMANDE AU COORDINATEUR :** indexer ce relais comme `unit-tested + browser-synthetic-tested` seulement ; ne pas fusionner ou publier automatiquement.
