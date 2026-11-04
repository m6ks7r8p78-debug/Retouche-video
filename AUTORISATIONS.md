# Autorisations (état réel du code, v3.3)

Source : `studio.js` (objet `PERM`, fonctions `consent`, `granted`, `grant`, `revoke`). Les autorisations sont gardées
sur l'appareil (clé `autorisations` du stockage local) et peuvent être données, retirées ou redemandées dans **⚙️ Paramètres**.

## Ce qui existe

| Clé | Usage | Ce qui quitte l'iPhone | Où c'est vérifié dans le code | Testé |
|---|---|---|---|---|
| `lien` | Charger une vidéo par lien (TikTok, Instagram, X, Reddit…) | le lien collé (et la vidéo récupérée transite par le serveur de l'app, qui ne stocke rien) | `index.html`, début de `LINK.go` : refus = aucune requête | oui (`tests/studio.test.mjs`) |
| `modele` | Télécharger un modèle IA facultatif (relief ; *v3.3* : effacement MI-GAN, sélection au toucher EdgeTAM) | rien de personnel : seule la demande du fichier, à Hugging Face | `models.js`, `download()` | oui |
| `analyse_ia` | Analyse IA d'une image (version Claude uniquement) | une image réduite (768 px) de la vidéo | `index.html`, bouton « Analyse IA » | non (n'existe pas hors de Claude) |
| `diagnostic` *(v3.2)* | Envoi automatique des mesures (version Claude uniquement) | des nombres : réglages, tailles, durées, vitesse de l'IA, navigateur — ni image, ni son, ni nom de fichier | `index.html`, `DIAG.flush()` | oui |

Règles appliquées :
- Une autorisation est demandée **au premier usage**, avec ce qui part et le compte nécessaire, puis mémorisée.
- Un refus est mémorisé aussi : l'action ne fait aucune requête et l'explique.
- **Aucune autorisation n'est déduite d'une autre** : chaque clé est vérifiée séparément.
- Le bouton « 📋 Copier le diagnostic » reste local : il copie dans le presse-papiers, tu choisis où le coller.
- Tout le traitement des photos, vidéos et sons se fait sur l'appareil : il n'a pas besoin d'autorisation réseau.
- *v3.3* : importer, analyser (toucher), reconstruire, garder et exporter une photo dans « Effacer une zone » sont des actions locales,
  chacune déclenchée par un geste explicite (rien n'est fait automatiquement) ; aucune ne fait de requête réseau. Pas de transfert cloud,
  d'entraînement ni de réutilisation : ces autorisations n'existent toujours pas, faute de fonction.

## Ce qui n'existe pas encore (demandé par le cahier des charges)

Les autorisations suivantes n'ont pas d'objet tant que les fonctions correspondantes n'existent pas ; elles devront être
ajoutées **avec** ces fonctions, jamais avant (une autorisation sans fonction serait trompeuse) :
transfert cloud, conservation chez un fournisseur, entraînement, utilisation de l'apparence, des mouvements ou de la voix
d'une personne, reproduction vocale, références visuelles, reconstruction du visage ou du corps, création de personnages.

Limites actuelles, à traiter avec ces futures fonctions :
- pas de durée d'expiration (une autorisation vaut jusqu'à son retrait) ;
- la preuve d'autorisation est la date d'accord gardée sur l'appareil, pas un document signé ;
- le consentement d'une **autre personne** (photo, voix) ne peut pas être vérifié par l'app : il faudra un formulaire
  explicite par personne et par usage, révocable, avant toute reconstruction ou reproduction de son apparence ou de sa voix.

## Suppression

- ⚙️ Paramètres → « Effacer l'historique » ; 🧠 Modèles IA → supprimer un modèle ou « Nettoyer ».
- L'app ne peut pas effacer les photos et vidéos de la photothèque de l'iPhone (interdit aux apps web) : elle n'y écrit
  que ce que tu enregistres toi-même.
- Pour tout effacer : Réglages de l'iPhone → Safari → Avancé → Données de sites web → chercher « github.io » → Supprimer
  (ou supprimer l'icône de l'app de l'écran d'accueil).
