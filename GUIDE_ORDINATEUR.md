# Guide ordinateur (développeur ou tests)

```sh
git clone https://github.com/m6ks7r8p78-debug/Retouche-video && cd Retouche-video
sh tests/installer.sh          # Playwright, Chromium, outils Python
python3 tests/creer_medias.py  # médias de test libres de droits
sh tests/lancer_tests.sh       # toutes les suites, rapport à la fin
node tests/serveur.mjs         # puis ouvrir http://localhost:8766/
```
Publier : pousser sur `main` (GitHub Pages). Revenir en arrière : branches de sauvegarde `sauvegarde-v2.49`, `sauvegarde-v2.50`,
`sauvegarde-v3.0`, `sauvegarde-v3.1` (par ex. `git checkout sauvegarde-v3.1`). Les tags annoncés avant la v3.2 n'avaient jamais été créés sur GitHub.
Serveur : `cd serveur && npx wrangler deploy` (compte Cloudflare du propriétaire, offre gratuite).
