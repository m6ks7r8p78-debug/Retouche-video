# Pont de médias AURA → studio RetoucheProAI

## Intention

L'utilisateur a demandé de **conserver AURA graphiquement** et d'exposer les fonctionnalités déjà présentes dans l'application, sans promotion prématurée des résultats expérimentaux. Cette révision porte **uniquement sur le transfert vers le studio natif**. Le studio complet n'est pas reproduit dans une interface fictive.

### Fichiers concernés (branche expérimentale seulement)

- `prototypes/aura-reference-fidele/index.html` : interface AURA de la PR #29, inchangée visuellement à l'accueil ; transfert de `File` à l'iframe natif par `postMessage` et confirmation ; message explicite en cas d'absence de studio, plus un mode de secours pour l'ancien studio.
- `index.html` : un ajout de script `defer` après `demarrage.js`, sans changer les commandes, les modèles ou le DOM existants.
- `aura-native-bridge.js` : récepteur petit et inactif tant que l'application n'est pas intégrée dans une iframe AURA *de même origine*.
- `prototypes/aura-reference-fidele/check_native_handoff.py` : tests reproductibles du protocole avec formulaire natif simulé et vérification statique des identifiants `#f` (vidéo), `#fp` (photo).

### Garanties de confidentialité et sécurité

1. Les fichiers restent dans le navigateur. Aucun réseau, serveur ou stockage tiers n'intervient pour transférer un média à l'iframe.
2. Le récepteur exige `event.origin === location.origin`, `event.source === window.parent`, un canal et un identifiant connus. Un message ne provenant pas de l'iframe attendue est ignoré.
3. Seul un `File` non vide et compatible avec le type déclaré est accepté. Les fichiers sont remis aux gestionnaires **existants** via le même événement `change` que le sélecteur natif. L'original n'est jamais altéré par ce transfert.
4. Un accusé de réception signifie **formulaire du studio notifié** ; il ne prouve ni la fin du chargement des modèles, ni le traitement, ni l'amélioration de qualité du média.
5. Si la prévisualisation n'héberge pas l'intégralité du dépôt ou si le navigateur refuse le transfert, une erreur est présentée. L'utilisateur peut ouvrir le site public séparément, mais le fichier n'est **pas** transférable automatiquement entre deux origines différentes.
6. Si le script de pont est absent mais que le vrai formulaire natif est présent sur la **même origine**, l'interface tente l'ancien mécanisme directement ; la confirmation est plus faible et le texte le signale.

### Tests effectués (Chromium)

- AURA avant import : PNG de capture identique bit pour bit à la PR #29 aux largeurs 320, 375, 390, 430, 768 et 1024 pixels. Aucun débordement horizontal.
- Photo synthétique 301×201 : remise au champ `#fp` et confirmation du récepteur sur 320, 390, 430 et 768 pixels ; un faux accusé de réception émis par la mauvaise fenêtre est ignoré.
- Vidéo synthétique H.264 : remise au champ `#f`, export vidéo restant désactivé depuis AURA.
- Script absent mais formulaire présent : mécanisme de secours vérifié.
- Studio inexistant : message d'échec et absence de fausse confirmation.
- `node --check aura-native-bridge.js` : syntaxe valide.
- La suite existante d'AURA (photo Full HD / profils / Annuler) repasse sur six formats.

**Limite importante :** la politique du navigateur de test bloque `http://localhost` et `file://`. Les essais du pont ont utilisé `page.set_content` et un iframe `srcdoc` avec le **même script de réception**, plus un formulaire `#f/#fp` qui imite les champs de la vraie application. Le déploiement complet de l'application native (avec `app.js`, PWA, WebGPU, export vidéo), Safari physique, les autorisations système et les médias HEIC/grands fichiers **ne sont pas validés de bout en bout**.

### Critère de fusion / publication

**Ne pas fusionner ni publier** sans un test de même origine en HTTPS sur le véritable studio chargé, puis une validation sur Safari iPhone et un contrôle des fonctions d'origine. Aucune nouvelle méthode du laboratoire n'est activée ici ; les améliorations « révolutionnaires » continuent de nécessiter des comparaisons reproductibles et un avantage net.