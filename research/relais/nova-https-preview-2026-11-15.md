# Relais technique — aperçu iPhone HTTPS NOVA × SmallMotion — 2026-11-15

**LABORATOIRE :** NOVA × SmallMotion / préparation iPhone HTTPS.
**BRANCHE / PR / COMMIT :** `chatgpt-nova-iphone-https-package-v1`, [PR #38](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/38), commit `0ed85d67b575c03dfd82783394fab94f57132201` et commits ultérieurs de cette PR.
**BASE :** `chatgpt-nova-smallmotion-bridge-v1` (PR #35), sans changement de `main`.

## Objet, résultats et preuves

Ajout d'un clic de test SmallMotion sans fichier personnel : génération d'une mire H.264 160×120 1,2 s via FFmpeg dans le ZIP statique; diagnostic deux frames local; `sourceKind=synthetic-generated`. La mire NOVA HEVC/AAC reste séparée. Le rapport SmallMotion préserve `action=no_automatic_change`, `confidence=not_calibrated` et ne contient aucun nom de fichier.

Construction d'un ZIP racine statique à déploiement **uniquement manuel et sur hôte séparé**, avec `index.html`, `_headers` (CSP calculée par hachage du script inline, restrictions réseau/cadre), `robots.txt` et manifeste SHA256. Le workflow ne contient aucune commande de publication.

**Tests exécutés, confirmés à la date du relais :**
- [GitHub Actions 43712320533](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43712320533) : 26/26 tests unitaires réussis; 1/1 parcours Chromium avec CSP HTTP réussis, incluant vidéo H.264 locale et mire synthétique, sans POST et sans origine externe.
- Artefact `nova-iphone-https-manual-zip` créé : ZIP préparé et vérifié, **non déployé** (rétention 7 jours, expiration le 22 novembre 2026).
- Les fichiers et licences publiques sont décrits dans `experiences/NOVA_IPHONE_HTTPS_MANUAL.md`.

## Limites et intégrations possibles

- **Aucun test iPhone physique ni site HTTPS publié**. Chromium sous CSP sur GitHub Actions ne valide pas Safari.
- Le retour SmallMotion est consultatif (2D non calibrée), sans segmentation/contact/geste/donnée 3D, et n'alimente aucune correction d'image ni export.
- Le ZIP doit être téléversé manuellement sur un domaine **distinct** du site de production; l'hébergement serait **public** par défaut, donc n'y inclure aucun média privé.
- Les en-têtes `_headers` ne s'appliquent que si l'hébergeur prend en charge ce mécanisme; le test CI simule ce comportement.
- Le prochain critère de promotion est une observation réelle sur Safari iPhone, puis la revue de compatibilité et confidentialité.

**DONNÉES PRIVÉES PUBLIÉES :** non.
**BESOIN D'INTÉGRATION :** le coordinateur peut référencer cette PR dans l'index ; aucune fusion ni publication implicite.
