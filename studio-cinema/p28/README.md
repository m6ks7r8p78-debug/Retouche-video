# Cinema P28 — relais de diagnostic en lecture seule entre Cinema, NOVA et Directeur IA

## But réel

P27 a prouvé sur **des dessins fictifs** qu'une deuxième compression H.264 peut agrandir un fichier sans retrouver la fidélité des pixels source. P28 fournit **un contrat informatique de consultation** pouvant être examiné par NOVA et le Directeur IA, sans supposer qu'une métrique obtenue sur un dessin s'applique à la vidéo personnelle d'un utilisateur.

**Portée :** uniquement `studio-cinema/p28/**` et `.github/workflows/ci-cinema-p28.yml`. Aucun changement dans `main`, la branche de coordination, les sources NOVA/Directeur, retoucheproai.com ou l'interface utilisateur.

## Code réellement créé

- `src/p28_readonly_bridge.cjs` : reconstitue le vrai diagnostic P27 à partir de deux rapports P25/P26 (il ne croit pas un simple état `success`), puis prépare une enveloppe **strictement limitée à une liste blanche de propriétés**.
- `projectNova(report)` reçoit la **forme existante** de `NOVA_REAL_PREFLIGHT.serialiser()` issue de la PR NOVA de précontrôle #42. Valide schéma, version, statut, cohérence du booléen `readyForExportAttempt` et indicateurs de confidentialité. Il **conserve le code de statut uniquement**, jamais fichier, taille, codec, nom, emplacement, champ personnel ou plan d'export. Un statut favorable de précontrôle ne prouve pas la fidélité ni un export terminé.
- `projectQuality(report)` reçoit la **forme existante** de `DIRECTEUR_QUALITE.evaluer()` issue de la branche Directeur IA. Vérifie version 2, média `video`, verdict connu, comptes entiers et cohérents. Il ne conserve que verdict et nombres de signaux comparés/dégradés. **Aucune note de réalisme humain**.
- `makeHandoff(p25,p26,{novaPreflight,qualityReport})` sépare trois référentiels : synthétique Cinema, précontrôle local NOVA et comparaison technique Directeur IA. Sans résultats NOVA ou Directeur fournis par un appelant explicite, les champs restent `not_supplied` ; l'enveloppe **n'invente jamais** une connexion active ou une vidéo déjà analysée.
- `formatFrench()` rend un résumé pour revue humaine, sans détails privés, métadonnées du fichier, chemins, noms ou secrets.
- Des tests agressifs rejettent les fausses provenances, rapports incohérents, hypothèses d'export autorisé, résultats de codec inconnu, divergences P25/P26, faux fichiers Safari testés et identifiants injectés dans les entrées.

## Vérification des interfaces existantes sur le vrai code

La CI utilise explicitement des **checkouts en lecture seule**, hors de la branche de travail, et verrouille les commits suivants :

| Laboratoire | Git ref exact | API interrogée |
|---|---|---|
| NOVA précontrôle expérimental PR #42 | `982b0d545cf85ca53d429a69f69c71b0d2430286` | `experiences/nova-real-preflight.js` → `NOVA_REAL_PREFLIGHT.serialiser` |
| NOVA arbitre (branche ci-dessus) | même SHA | `experiences/nova-decision.js` → `NOVA_DECISION.arbitrer` |
| Directeur IA expérimental PR #1 | `79439a5a208248b63691d061b70494dd7711de5f` | `directeur-qualite.js` → `DIRECTEUR_QUALITE.evaluer` |

`tests/test_p28_real_contracts.cjs` exécute les **véritables exports JavaScript** de ces modules sur des mesures inventées, puis vérifie que P28 préserve les limites, ne copie pas de données personnelles factices et ne change pas le résultat de l'arbitrage NOVA.

Cette vérification des API **n'est pas** une intégration au navigateur, au moteur d'export, aux fichiers réels, ni une modification des branches associées. Les copies de code des deux laboratoires sont réservées à la CI.

## Contrat de sortie (v1)

`p28_readonly_handoff.json` contient uniquement :

- `cinema_synthetic_research` : nombre de recompressions fictives et constats P27 **sans application à un média utilisateur**.
- `nova_real_preflight_status` : statut connu ou `not_supplied`, explicitement non équivalent à une validation de fidélité.
- `director_technical_quality_status` : verdict et nombre de comparaisons (si fourni), ou `not_supplied`.
- `context_isolation` : déclarations explicites des limites.
- `permissions` : **huit booléens obligatoirement faux** (aucun encodage, modification, upload, restauration, remplacement de l'original, changement de codec ou sélection de profil).
- `advice_for_personal_file=null`, `codec_recommendation=null`, `automatically_selected_candidate=null`.

`p28_readonly_handoff_fr.md` est la version humaine, **non affichée dans RetoucheProAI** pour l'instant.

## Commande de reproduction

Avec les rapports P25/P26 réellement calculés et Node 22 :

```sh
node studio-cinema/p28/src/p28_readonly_bridge.cjs \
  studio-cinema/p25/results/proof/p25_crf_matrix_synthetic_report.json \
  studio-cinema/p26/results/proof/p26_second_generation_synthetic_report.json \
  studio-cinema/p28/results/proof
```

La CI complète `.github/workflows/ci-cinema-p28.yml` régénère les vrais rapports vidéo synthétiques P25 et P26 depuis les moteurs P19/P23, contrôle les tests hérités P15–P27 et exécute les tests P28 **avec les vraies interfaces NOVA/Directeur épinglées**. Les rapports de sortie P28 sont les seuls artefacts archivés, sans vidéo personnelle.

## Limites et prochaine étape

- **Niveau de preuve visé : `synthetic-tested` uniquement** après une CI verte. La compatibilité des **formes de réponse en Node** est testable ; le fonctionnement en Safari iPhone physique ne l'est pas par cette CI.
- Le contrôleur ne déduit aucun geste humain réel, aucune qualité perceptive, aucune compatibilité 4K/HDR/HEVC, ni aucun comportement réel d'upload X.
- **P28 ne s'intègre pas dans `app.js`, NOVA, AURA, le Directeur ou le service worker.** Une intégration demande une PR distincte, un examen des dépendances et la validation de tests sur médias **autorisés en privé** avec consentement clair.
- Les niveaux CRF du banc ne valent **aucune recommandation** pour les profils d'export de RetoucheProAI, y compris X.
- Les interactions entre conversations sont **asynchrones via GitHub** ; la présente PR et son commentaire de relais sont à consulter par le coordinateur. Le registre n'est pas édité ici.

Aucun média privé ou modèle entraîné, aucune téléversée, aucun déploiement ni fusion.
