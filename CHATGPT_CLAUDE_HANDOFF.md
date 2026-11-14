# Transmission ChatGPT ⇄ Claude — RetoucheProAI

Mis à jour par Claude le 14 nov. 2026. Aucune synchronisation automatique n'existe entre ChatGPT et Claude :
ce fichier, `suivi/directeur-ia.json` et la PR #1 sont le seul canal. Le relire en entier avant d'agir.

## 1. État vérifié

- Dépôt `m6ks7r8p78-debug/Retouche-video`, branche **`chatgpt-ai-director-v01`**, PR **#1 brouillon** (base `main`).
- Point de départ vérifié : `ce99d70` (après `4f18c54` communiqué), CI « Directeur IA » verte sur les 2 jobs
  (run 43559135621). Branche à jour avec `main` (v8.0, 0 commit de retard).
- Le contrôle « Workers Builds: retouche-serveur » (Cloudflare) échoue aussi sur `main` : préexistant, hors périmètre.
- Le commit exact de ce cycle et son résultat CI sont dans la PR #1 et dans `suivi/directeur-ia.json`.

## 2. Fonctionnalités terminées (branche)

Directeur IA v0.5–v0.9 (voir `DIRECTEUR_IA.md`) : planification, adaptation par image du débruitage et protection de
netteté, précontrôle export, prototype 8K hors navigateur, laboratoire synthétique. **Nouveau (ce cycle)** :
- `outils/catalogue_medias.py` — catalogue privé : SHA-256, métadonnées, mesures, doublons, rapprochements
  hypothétiques, groupes, partition sans fuite, 9 autorisations, import du catalogue ChatGPT (`MEDIA_CATALOG_SCHEMA.md`).
- `outils/directeur-priorites.cjs` + `suivi/etat-modules.json` — priorisation des modules faibles (besoin mesuré d'abord).
- `BENCHMARK_PROTOCOL.md`, `BENCHMARK_RESULTS.md` (résultats + journal d'expériences).

Correspondance des livrables demandés → fichiers existants (pas de doublons) : architecture = `DIRECTEUR_IA.md` +
`ARCHITECTURE.md` ; feuille de route = `ROADMAP.md` + §6 ci-dessous ; registre des modèles =
`REGISTRE_MODELES_LICENCES.md` + `MODELES.md` ; confidentialité = `CONFIDENTIALITE.md` + `AUTORISATIONS.md` +
`MEDIA_CATALOG_SCHEMA.md` (finalités) ; rapport de tests = `BENCHMARK_RESULTS.md` + PR #1 ; journal = `CHANGELOG.md`.

## 3. Ce que ChatGPT doit fournir (sans aucun média)

1. **Catalogue des 103 (puis 157 + 1) médias** en CSV ou JSON : colonnes `id, fichier, sha256` + ses observations
   (filtre supposé, retouche supposée, scène, droits, remarques). Le SHA-256 est le plus utile : il rattache sans
   ambiguïté et confirme les doublons (V090/V091 attendus en `doublons_exacts`).
2. Si ChatGPT peut exécuter Python sur les fichiers : lancer lui-même
   `python3 outils/catalogue_medias.py analyser DOSSIER --sortie prive/catalogue.json --autorisation-analyse --chatgpt son_catalogue.csv --anonymiser`
   (repli OpenCV si ffmpeg manque) et ne transmettre que `resume`, les défauts par catégorie et les identifiants.
3. La liste des rapprochements qu'il juge plausibles, **marqués hypothèses**, avec la raison.

Ne jamais déposer de vidéo, photo, nom de personne ou donnée biométrique dans GitHub.

## 4. Problèmes connus / hypothèses à vérifier

- Seuils de défauts du catalogueur non calibrés (blocs 8×8 surestimés sur mires synthétiques).
- dHash ne rapproche pas un miroir ni un fort recadrage ; un filtre AR qui couvre le visage peut empêcher le rapprochement.
- Aucune détection automatique fiable de filtre AR dans le catalogueur (indices colorimétriques seulement).
- Toutes les qualités de modules sont inconnues (`null`) : la priorisation recommande de mesurer, en commençant par
  les filtres AR, puis beauté, colorimétriques, super-résolution.
- Aucun essai sur iPhone Safari réel de la branche.

## 5. Décisions techniques

- Catalogueur en Python (numpy + ffmpeg, repli OpenCV) pour être exécutable chez ChatGPT comme en CI.
- Le catalogue refuse d'être écrit dans un dépôt Git hors d'un chemin ignoré ; `prive/` est ignoré.
- Priorisation : la faisabilité ne module le besoin que de ×0,7 à ×1 ; module satisfaisant (qualité ≥ 0,8 et échecs
  ≤ 10 %) → « maintenir » ; moins de 5 cas mesurés → « mesurer ».
- Outils de pilotage hors application : aucun changement de `app.js`, `sw.js` ni de l'empreinte PWA dans ce cycle.

## 6. Prochaines expériences (ordre)

1. Catalogue réel → résumé partageable → calibrage des seuils.
2. Autorisations `evaluation_benchmark` enregistrées par le propriétaire → `plan`.
3. Banc filtres AR/beauté (couples vérifiés + dégradations synthétiques), métriques zone/hors zone + inspection.
4. Mise à jour de `suivi/etat-modules.json` avec `source: "mesure"` → nouvelle priorité calculée.

## 7. Travaux bloqués et autorisations nécessaires

| bloqué | ce qu'il faut | qui |
|---|---|---|
| analyse des 157 vidéos + image | catalogue (CSV/JSON) ou exécution de l'outil là où sont les fichiers | ChatGPT / propriétaire |
| bancs sur médias réels | `evaluation_benchmark = oui` par média + consentement des personnes représentées si nécessaire | propriétaire |
| entraînement | autorisation `entrainement` distincte + protocole validé (non demandé) | propriétaire |
| validation iPhone | ouvrir la version de test sur l'iPhone 15 Pro Max | propriétaire |
| fusion dans `main` | décision explicite | propriétaire |
