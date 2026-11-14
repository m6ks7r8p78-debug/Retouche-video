# Reprise fiable du développement RetoucheProAI — ChatGPT

**Objet :** éviter de refaire le travail déjà validé lorsqu'une requête ChatGPT expire. Cette procédure **n'empêche pas l'expiration** et ne relance **pas** une conversation toute seule. Le code validé reste dans GitHub, et chaque exécution de CI produit un instantané consultable.

## Périmètre et protection de Claude

- Dépôt : `m6ks7r8p78-debug/Retouche-video` ; **seule branche de travail** : `chatgpt-ai-director-v01` ; PR **#1 brouillon**.
- Ne jamais pousser sur `main`, fusionner la PR, déployer, modifier des branches de Claude ou réécrire l'historique pour « reprendre ».
- N'enregistrer ni photos/vidéos personnelles ni secrets dans les commits, les journaux ou les artifacts CI.
- Les fonctions de sauvegarde et les vérifications de CI ne modifient pas les modules photo/vidéo ni leurs réglages.

## Deux points de reprise complémentaires

1. **Permanent, versionné** : `suivi/directeur-ia.json`. Décrit le dernier succès *connu au moment où il est écrit*, les étapes réalisées, les prochaines étapes et les garde-fous. Le modifier à chaque jalon vérifié (ne jamais déclarer un succès avant la fin **de tous les jobs**). Les commits Git conservent l'historique.
2. **À chaque exécution CI** : `.github/workflows/directeur-ia.yml` capture, **même après l'échec d'un test**, un JSON par job dans les artifacts GitHub Actions `directeur-reprise-{nom-du-job}-{tentative}` (rétention 30 jours). Contient SHA, numéro d'exécution, résultat **du job**, lien vers les logs et prochaines étapes. Pas de médias ni de résultats inventés. Les annulations du runner peuvent empêcher la sauvegarde : les logs GitHub et les commits restent la source de secours.

Le script `outils/directeur-reprise.cjs` gère les captures ; les tests `tests/directeur-reprise.test.mjs` vérifient les limites de branche, le format, la provenance, l'écriture atomique et l'absence d'export des variables arbitraires.

## Pour reprendre après « La requête a expiré » (depuis iPhone)

Dans une nouvelle requête ChatGPT, écrire simplement :

> Continue RetoucheProAI depuis le dernier point de reprise GitHub. Consulte `suivi/directeur-ia.json`, `REPRISE_CHATGPT.md`, la branche `chatgpt-ai-director-v01`, la PR #1 et les **dernières** exécutions GitHub Actions. Reprends au dernier commit validé, corrige d'abord les erreurs éventuelles, teste, sauvegarde le progrès uniquement sur cette branche. Ne touche pas à `main` ou aux branches Claude, ne fusionne pas et ne demande pas de confirmer chaque étape.

### Procédure suivie par l'assistant

1. Lire `suivi/directeur-ia.json` et `REPRISE_CHATGPT.md`, vérifier le **HEAD en ligne**, le statut de la PR et le dernier workflow **complet**. Ne pas supposer que le journal permanent est à jour.
2. Examiner les artifacts de la dernière exécution et les logs des jobs ; si artifact absent ou expiré, utiliser les logs GitHub. Ne considérer la nouvelle version validée que si tous les jobs requis sont verts.
3. En cas d'échec, identifier le test fautif, résoudre la cause, relancer la validation. Ne pas masquer les erreurs et ne pas prétendre qu'une validation a eu lieu sans preuve.
4. Faire des modifications petites et réversibles, tester avant le commit, pousser sur **`chatgpt-ai-director-v01` seulement**. Éviter les conflits avec Claude et les changements concurrents ; avant un push, comparer de nouveau le HEAD.
5. À chaque jalon, actualiser `suivi/directeur-ia.json` (faits prouvés, résultat CI, prochaines étapes). Enregistrer les décisions importantes dans la PR brouillon sans fusion.

## Vérification locale ou dans GitHub Actions

```sh
node outils/directeur-reprise.cjs inspecter
node --check outils/directeur-reprise.cjs
node --test tests/directeur-reprise.test.mjs
```

GitHub Actions exécute ces tests et capture automatiquement les bilans. `capture --out ...` n'est utilisé qu'en CI avec les variables `GITHUB_*` et `JOB_RESULT`. La sortie JSON présente le résultat du **job individuel** : elle ne certifie jamais à elle seule le succès du workflow entier.

## Règle de qualité

Une vidéo encodée en 8K n'implique pas la récupération de détails réels ; le prototype FFmpeg reste séparé de Safari iPhone. Les analyses, stockages et entraînements à partir de médias utilisateur requièrent des consentements distincts. Les progrès doivent être mesurables, réversibles et testés.
