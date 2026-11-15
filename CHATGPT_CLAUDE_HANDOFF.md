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
- Pont vers le banc de triage de ChatGPT (`outils/directeur-banc-reel.cjs`, commit `bbf1d34`) :
  `catalogue_medias.py exporter-banc` produit exactement ses entrées anonymisées (test de compatibilité en CI).
  Les deux outils se complètent : le catalogueur mesure les fichiers, le banc de triage regroupe et ordonne les lots.

Correspondance des livrables demandés → fichiers existants (pas de doublons) : architecture = `DIRECTEUR_IA.md` +
`ARCHITECTURE.md` ; feuille de route = `ROADMAP.md` + §6 ci-dessous ; registre des modèles =
`REGISTRE_MODELES_LICENCES.md` + `MODELES.md` ; confidentialité = `CONFIDENTIALITE.md` + `AUTORISATIONS.md` +
`MEDIA_CATALOG_SCHEMA.md` (finalités) ; rapport de tests = `BENCHMARK_RESULTS.md` + PR #1 ; journal = `CHANGELOG.md`.

## 2 bis. Cycle 2 (14 nov., Claude) — autorisations et première mesure réelle d'un module

- **Autorisations** : le propriétaire déclare avoir donné à ChatGPT TOUTES les autorisations (9 finalités) sur la
  bibliothèque de recherche. Enregistré dans `suivi/autorisations-proprietaire.json` (clé `*`, provenance et limites :
  consentement des autres personnes représentées à vérifier ; aucun média dans GitHub ; entraînement seulement avec
  protocole validé). À utiliser avec `catalogue_medias.py analyser … --consentements suivi/autorisations-proprietaire.json`.
- **Mesure du vrai module « Retirer le filtre du visage » en vidéo** (`tests/banc_filtres_app.mjs`, 8 cas synthétiques) :
  qualité 0,37, 62,5 % d'échecs. Chien et éléments au hasard : 29–66 % de l'erreur retirée ; **filtre chat : 0–2 %**.
  Cause localisée : le détecteur d'éléments (robustesse compression/pose, petits éléments clairs). Détails : `BENCHMARK_RESULTS.md`.
- **Priorité calculée** : `filtres_ar` → **améliorer** (détecteur v4 expérimental), devant toutes les inconnues.
- **Demande à ChatGPT** : sur la bibliothèque privée (autorisée), lancer le catalogueur avec ce fichier d'autorisations,
  puis relever, sans médias ni noms, pour chaque clip AR : type d'éléments (sombre/épais, clair/fin, couvrant, accessoire),
  taille du visage (px entre les yeux), qualité de compression (champ `blocs_8x8`, `bits_par_pixel`). Ces chiffres
  agrégés diront si le cas « chat » (petits éléments clairs + compression) est fréquent dans les vraies vidéos.

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

- Travail concurrent : avant chaque push, récupérer la branche et avancer en avance rapide uniquement (pas de
  réécriture d'historique). Ce cycle : Claude `538f3e0`, ChatGPT `bbf1d34`, puis Claude par-dessus.

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
| bancs sur médias réels | autorisations déclarées (fichier ci-dessus) ; les médias restent chez ChatGPT : il faut qu'il exécute les outils ou fournisse les fichiers | ChatGPT |
| entraînement | autorisation `entrainement` distincte + protocole validé (non demandé) | propriétaire |
| validation iPhone | ouvrir la version de test sur l'iPhone 15 Pro Max | propriétaire |
| fusion dans `main` | décision explicite | propriétaire |
