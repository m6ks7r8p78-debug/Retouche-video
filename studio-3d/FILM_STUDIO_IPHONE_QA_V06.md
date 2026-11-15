# Film Studio v0.6 — protocole iPhone réel (laboratoire isolé)

## Limites des tests
La CI vérifie des fonctions Node et des navigateurs Chromium/WebKit Playwright sur Linux. Elle ne valide pas Safari sur matériel Apple, la température, la mémoire iOS, les téléchargements dans Fichiers ou l'expérience PWA. Le moteur produit une animation 3D stylisée et un GLB, pas un film MP4 ni un acteur photoréaliste.

## Paquet pour test réel
Après validation GitHub Actions, récupérer l'artefact film-studio-v06-iphone-https-package, qui contient un index.html, huit fichiers JavaScript et un fichier _headers de sécurité. Placer uniquement ce paquet sur un hébergement HTTPS de laboratoire distinct du site public, par exemple un site Cloudflare Pages de test. Aucun média privé n'est dans le paquet ; aucun remplacement de retoucheproai.com et aucune fusion de PR.

## Parcours Safari physique
1. Ouvrir l'URL HTTPS du laboratoire directement dans Safari, et non la page GitHub qui affiche simplement le code.
2. Appuyer « Créer mon animation 3D » avec le scénario fourni. Vérifier personnage, table, chaise, tasse et animations ; pause, lecture et rotation au doigt.
3. Déplacer la chronologie, tester portrait et paysage ; noter tout crash, artefact ou gel de l'écran.
4. Mettre Safari en arrière-plan puis revenir, et vérifier la réapparition de la scène et le maintien du lien d'export.
5. Enregistrer le GLB. Vérifier manuellement dans l'app Fichiers que le fichier existe ; un visualiseur 3D compatible peut être nécessaire pour l'ouvrir.
6. Appuyer « Tester la fluidité de la scène ». Lire FPS approximatifs, 95e percentile du temps d'image, nombre d'images lentes et erreurs GPU. Télécharger le rapport JSON seulement si désiré.
7. Essayer « Une femme boit puis parle. » (sans café ni tasse) : le scénario doit être refusé et les anciens liens d'export GLB et diagnostic supprimés.
8. Tester séparément le mode ajouté à l'écran d'accueil si disponible. Noter visuellement la fluidité, la chauffe éventuelle et les pertes de contexte WebGL ; ne pas inventer de mesures physiques.

## Confidentialité et gouvernance
Le rapport est construit localement sur action explicite. Il exclut prompt, médias, adresse IP, user-agent détaillé, localisation et identité. Il ne mesure pas la mémoire réelle, la batterie ou la température. Ne jamais inclure les 157 vidéos personnelles dans les artefacts GitHub. Ne pas publier de diagnostic contenant des données personnelles sans revue.

## Décision
Vert : scène réactive, export local fiable et diagnostic utilisable sur appareil réel. À améliorer : chutes prolongées de cadence, pertes WebGL, export non fiable ou blocage au retour d'arrière-plan. Non testé : aucune preuve matérielle ; la CI WebKit demeure une preuve d'interopérabilité uniquement.
