# Cinema P30 — lecture HTTPS expérimentale

Ce dossier est une copie statique à usage de test des seuls fichiers contenus dans `Cinema_P30_iPhone_demo.zip`. Les 9 essais vidéo sous-jacents sont des **dessins synthétiques**, sans média privé.

**Accès :** le proxy tiers `raw.githack.com` sert les fichiers publics GitHub en HTTPS pour consultation expérimentale. Cette mise à disposition ne modifie ni les domaines RetoucheProAI, ni Cloudflare Pages, ni les moteurs NOVA et Directeur IA. Pas de PWA et pas de déploiement sur `main`.

**Données :** la page demande trois observations manuelles, puis produit un rapport JSON en mémoire du navigateur à copier ou enregistrer localement. Aucun report n'est envoyé par le code. Comme tout hébergement HTTP(S), le fournisseur du proxy voit techniquement les requêtes nécessaires au chargement de la page et leurs données réseau, même si le rapport reste local. N'y mettre aucune vidéo ou donnée privée.

**Prudence :** raw.githack peut montrer une page de confirmation anti-abus avant le HTML, ou être bloqué par Safari/réseau. Si c'est le cas, ne pas déclarer le test terminé. Ce proxy tiers n'offre pas de garantie de service et n'est pas la solution d'hébergement de production.

**Évaluation :** une vraie compatibilité iPhone physique nécessite l'ouverture de ce lien sur Safari iPhone, une validation manuelle, et éventuellement le renvoi volontaire du rapport. Les tests automatisés Linux ne sont pas des tests physiques Safari.

**Historique :** issu de Cinema P30 PR #56 ; la publication de cette démo à titre expérimental découle d'une demande expresse de l'utilisateur d'éviter toute opération manuelle.

**Contrôle de livraison :** un workflow expérimental vérifie séparément les empreintes des sept fichiers du ZIP et leur disponibilité HTTPS via le proxy public. Les informations utilisateur ne sont pas envoyées par le formulaire.
