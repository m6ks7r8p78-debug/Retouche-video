# NOVA × SmallMotion — paquet HTTPS manuel pour iPhone (v1)

**Statut : préparé pour publication MANUELLE sur un hôte HTTPS distinct ; PAS ENCORE PUBLIÉ.**
Cette PR est expérimentale, distincte de `main`, des PR NOVA / SmallMotion et de `retoucheproai.com`.
Aucune intervention sur la configuration GitHub Pages ou le DNS actuel.

## Ce qui est livré dans l'archive

L'action GitHub `NOVA iPhone - archive HTTPS manuelle isolée` produit un artefact `nova-iphone-https-manual-zip` contenant **le fichier ZIP prêt à publier** `nova-iphone-https-manual.zip`. La racine du ZIP contient `index.html`, `_headers`, `robots.txt`, `asset-manifest.json`, `experiences/nova.html`, les scripts et le décodeur HEVC/WASM local. Le ZIP ne contient aucune vidéo personnelle.

Deux mires sont générées par FFmpeg **dans GitHub Actions**, jamais depuis des vidéos privées :

- `experiences/nova-test-synthetic.mov` : 1 seconde, 160×90, HEVC BT.709 et bip AAC, test d'export/diagnostic NOVA ;
- `experiences/nova-smallmotion-synthetic.mp4` : 1,2 seconde, 160×120, mire H.264 animée `testsrc2`, diagnostic 2D consultatif SmallMotion.

**Attention :** la mire SmallMotion teste le parcours technique, elle ne fournit pas de vérité terrain d'un petit objet indépendant ; un statut `no_supported_local_motion` ou une abstention reste recevable. Ces fichiers sont des données de test libres de contenu utilisateur, pas une preuve de qualité réelle.

## Tester sur iPhone sans modifier le site public

**Étapes manuelles, uniquement après décision du propriétaire de rendre la prévisualisation accessible :**

1. Sur iPhone Safari, ouvrir la [PR du paquet](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/36), section **Checks**, ouvrir l'exécution `NOVA iPhone - archive HTTPS manuelle isolée`. Dans **Artifacts**, télécharger `nova-iphone-https-manual-zip`. GitHub peut placer l'archive ZIP prête à publier **dans une première archive ZIP** : utiliser l'application **Fichiers** pour extraire le ZIP externe, puis garder `nova-iphone-https-manual.zip` intact pour l'hébergement.
2. Créer un **nouveau site distinct** depuis [Netlify Drop](https://app.netlify.com/drop) (sélection de ZIP possible, hébergement gratuit selon les conditions actuelles). Sur iPhone, sélectionner `nova-iphone-https-manual.zip` via le sélecteur Fichiers ; **ne jamais** connecter la production RetoucheProAI ni choisir son nom de domaine. L'URL finale sera une nouvelle adresse HTTPS du prestataire, pas `retoucheproai.com`.
3. Alternative : Cloudflare Pages → création d'une **nouvelle** application Pages → Direct Upload de ZIP, sans connexion au dépôt de production et sans configurer de domaine personnalisé.
4. Vérifier que la racine HTTPS ouvre une page avec le lien `experiences/nova.html`. Si le prestataire ne sert pas le ZIP à sa racine, annuler et vérifier le contenu du ZIP ; ne pas rediriger vers la production.
5. Déplier « SmallMotion · mouvement local (recherche) », cliquer sur **« Tester SmallMotion sans vidéo personnelle »**. Le navigateur télécharge uniquement une mire H.264 du même hôte et effectue le diagnostic local, sans requête vers un serveur de traitement. Enregistrer volontairement le rapport JSON.
6. Tester séparément « Tester Safari sans vidéo personnelle » pour le pilote MOV HEVC/AAC. Un refus par Safari peut être normal ; lire le code d'erreur du rapport, ne jamais forcer une conversion silencieuse.
7. Éventuellement sélectionner sur l'iPhone une vidéo **autorisée** de courte durée (0,3–12 secondes, au plus 60 Mio, dimensions source au plus 1920×1920 pour SmallMotion), à condition d'accepter qu'elle soit manipulée localement par cette page de test. **N'envoyer ce média à aucun support ni au dépôt**. Le traitement réel sur iPhone n'est pas certifié avant observation.
8. Si le test fonctionne, enregistrer uniquement les rapports techniques JSON volontaires et noter les résultats (iPhone réel, Safari, succès/abstention, durée). **Ne pas joindre une vidéo privée à une issue GitHub.**

Le site créé par Netlify Drop / Cloudflare Pages **est accessible publiquement par défaut**. Les fichiers générés du laboratoire sont synthétiques, mais le fait de mettre le site en ligne n'en fait pas un espace privé. Aucun hébergement n'est créé par cette PR.

## Protection intégrée

- `_headers` : CSP hachée sur l'unique script inline de `nova.html`, scripts locaux seulement, WebAssembly sous `wasm-unsafe-eval`, Workers locaux / blob, `connect-src 'self' blob:`, `form-action 'none'`, `frame-ancestors 'none'`, `no-referrer`, `no-store`, `noindex`.
- `robots.txt` : demande le non-indexage ; ce n'est **pas** une mesure de confidentialité.
- **Aucun** jeton GitHub, clé Netlify/Cloudflare ni déploiement automatique, aucun transfert de média.
- Le rapport SmallMotion a `sourceKind` égal à `synthetic-generated` ou `local-user-file`, refuse les champs arbitraires et conserve `action:no_automatic_change`.
- La construction énumère et hache les fichiers de son manifeste; le CI teste les octets et leur intégrité. Aucun Service Worker n'est ajouté.
- Les en-têtes `_headers` sont reconnus par des hébergeurs tels que Netlify et Cloudflare Pages. **Si un autre hébergeur les ignore, les restrictions HTTP ne sont pas appliquées** ; ne pas supposer une protection CSP universelle.

## Preuves automatisées et limites

Tests unitaires : génération des mires avec FFmpeg, ffprobe HEVC/AAC et H.264, empreintes SHA-256 de tous les fichiers, preuve que le hachage CSP correspond au script HTML, pas de médias privés dans le paquet.

Tests Chromium : import H.264 choisi, mire SmallMotion déclenchée d'un clic sans vidéo personnelle, rapports local/synthétique, CSP HTTP effectivement servie par le serveur de test, absence d'upload POST/PUT et d'origine externe.

**Non prouvé :** Safari physique, le débit ou la mémoire réelle de l'iPhone, le support natif de tous les MOV HEVC, les vidéos privées, les traitements 4K/8K, les températures ou la qualité perceptuelle. Une URL HTTPS ne vaut pas validation sur appareil.

Le paquet peut être téléchargé depuis GitHub Actions sans publication. Sa rétention est de 7 jours ; une nouvelle exécution Actions est nécessaire après expiration.

## Liaison avec les autres laboratoires

Branche `chatgpt-nova-iphone-https-package-v1`, **base `chatgpt-nova-smallmotion-bridge-v1`**, puis PR de pont #35 vers NOVA. Les tests et leur interprétation doivent être relayés via `coordination-retoucheproai-v1` après validation. Ne fusionner ni les branches laboratoires ni `main` automatiquement.
