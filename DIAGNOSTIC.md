# Diagnostic anonyme (v6.0) — mise en service

But : recevoir automatiquement les mesures de chaque utilisation (avec l'accord de la personne) pour régler la caméra virtuelle et
les corrections par type d'appareil, sans que le propriétaire ait à copier-coller le diagnostic.

Ce qui part de l'app : des nombres (mesures, réglages, fiche de l'appareil qui a filmé, modèle de téléphone, système simplifié).
Jamais d'image, de son, de nom de fichier ; l'adresse IP n'est pas enregistrée ; lignes effacées après 13 mois (serveur).
L'accord est demandé une fois, après un premier résultat réussi, et se retire dans ⚙️ Paramètres. Sans accord, rien ne part.

## Mise en service (à faire une fois, par Claude, avec une clé Cloudflare du compte « Jmy.maelhys »)
Clé à créer dans Cloudflare → Mon profil → Jetons d'API → « Créer un jeton » → modèle « Modifier les Workers Cloudflare »,
en ajoutant la permission **Compte → D1 → Modifier**. Puis, depuis `serveur/` :
```sh
export CLOUDFLARE_API_TOKEN=…   # jamais écrite dans le dépôt
npx wrangler d1 create retouche-diag          # → recopier database_id dans wrangler.jsonc
npx wrangler deploy                           # serveur v7 (inclut aussi la route /abo/verifier de la v6)
openssl rand -hex 24 | npx wrangler secret put DIAG_CLE   # clé de lecture, gardée par le propriétaire
curl https://retouche-serveur.retouche-ia.workers.dev/etat    # → version 7
```
Lecture : `curl -H "authorization: Bearer <DIAG_CLE>" "https://retouche-serveur.retouche-ia.workers.dev/diag/export?depuis=2026-11-01&kind=camera"`.

Tant que le serveur n'est pas déployé, les mesures restent sur le téléphone (300 au plus) et partent dès qu'il répond.
