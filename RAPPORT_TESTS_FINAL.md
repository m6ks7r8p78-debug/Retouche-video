# Rapport de tests final — v6.7 (11/11/2026)

Résultats des suites : voir le message de commit et `tests/lancer_tests.sh`.

## Réalisé et testé
- `tests/v67.test.mjs` : **18/18**. Calculs réels sur images de synthèse : détection de filtre chaud, noir et blanc, effet rétro, écrêtage, vignettage ; aucun faux positif fort sur l’image neutre ; flou et compression mesurés ; mode Fidélité sans étape générative ; cibles 144p→4K (ratio, parité, étiquettes) ; tuiles (couverture complète, budget mémoire) ; scintillement et coupes ; profil X ; verrou de contribution (15 cas de blocage) ; cycle de vie ; invitations (usage unique, expiration, faux jeton) ; registre chaîné ; métadonnées.
- Non-régression : `sw` 7/7, `gestionnaire` 24/24 (2 non testables ici), `studio` 11/11, `reassemblage` 5/5.
- Navigateur (Chromium, écran 430×932) : modules chargés, version v6.7, diagnostic affiché dans « Retirer un filtre » sur une vidéo de test, aucune erreur JavaScript.

## Non concluant / non exécuté
- `v3`, `noyau` : plantage du navigateur de test, **identique sur l’archive v6.5 d’origine**.
- `effacer` : modèle de test absent. `app` (suite longue) : non exécutée.
- **Aucun test sur iPhone/Safari réel**, aucune mesure de mémoire ou de chauffe. Conversions 144p→4K : seule la planification est testée, pas le rendu.

## Préparé mais désactivé
Programme de contribution (règles prêtes, envoi verrouillé). Profil X (`ANALYSE.profilX`) : calculé et testé, **pas encore branché sur un bouton d’export**.

## Non réalisé
Détection et retrait automatiques des accessoires AR, déformations et maquillage ; suivi de masques vidéo ; restauration de visage ; nouveaux modèles ; backend ; annotation/benchmarks sur données réelles ; analyse RGPD validée. La v6.7 n’est **pas** « la version finale » décrite par le prompt maître : c’est une étape vérifiée.
