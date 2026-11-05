# RetoucheProAI — apps App Store et Google Play

L'app des stores reprend **exactement** l'app web (dossier parent), emballée avec Capacitor 8. Aucun Mac n'est nécessaire :
les deux apps sont compilées dans le cloud par GitHub (`.github/workflows/apps-stores.yml`).

| | |
|---|---|
| Identifiant | `com.retoucheproai.app` |
| Nom affiché | RetoucheProAI |
| Android | API 24 (Android 7) minimum, cible API 36 |
| iPhone | iOS 15 minimum (Capacitor 8) |

## Ce qui change par rapport au site
- **Enregistrer** : écrit la vidéo dans le cache de l'app puis ouvre la feuille de partage (« Enregistrer la vidéo ») — `natif.js`.
- **Pubs** : Google AdMob (AdSense est interdit dans les apps) : bannière en bas + courte pub récompensée avant l'enregistrement,
  formulaire de consentement européen de Google et demande de suivi d'Apple — `pub.js`, `PUB_CONFIG.app`.
- **Premium** : achats intégrés Apple / Google via RevenueCat (droit `premium`), bouton « Restaurer mes achats » ; aucun lien
  vers le paiement web dans l'app (règle des stores) — `abo.js`.
- **« Colle un lien »** : masqué (les stores refusent les apps qui téléchargent des vidéos d'autres plateformes).
- Icônes et écrans de démarrage : `icones/logo.svg` → `node icones/creer-icones.mjs`.

## Vérifié
- Android : APK d'essai compilé (Gradle, SDK 36) le 5 nov. 2026.
- Code natif testé dans Chrome avec de faux modules natifs : `node tests/natif.test.mjs` (10 vérifications).
- iPhone : compilé par GitHub sur Mac à chaque changement (job `ios`).

## Avant de publier (propriétaire, une seule fois)
1. **Comptes** : Apple Developer (99 $/an), Google Play Console (25 $), AdMob, RevenueCat ; statut micro-entrepreneur.
2. **App Store Connect** : créer l'app `com.retoucheproai.app`, 3 achats intégrés (pass 7 jours non renouvelable 2,99 €,
   abonnement mensuel 5,99 €, annuel 34,99 €), programme « Small Business » (commission 15 %).
3. **Google Play Console** : créer l'app, mêmes 3 produits, programme commission 15 %.
4. **RevenueCat** : relier les deux stores, droit `premium`, offre « current » avec les paquets `pass`, `$rc_monthly`, `$rc_annual`.
5. **AdMob** : 2 apps (iOS, Android) avec un bloc « Bannière adaptative » et un bloc « Avec récompense » chacune.

## Ce que Claude branche ensuite
- `abo.js` → `revenuecat: { ios, android }` (clés publiques) ; `pub.js` → `app.actif`, `app.test: false`, identifiants des blocs.
- `android/app/src/main/AndroidManifest.xml` et `ios/App/App/Info.plist` : remplacer l'identifiant d'app AdMob d'essai.
- Secrets GitHub pour les versions signées :
  - Android : `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
    (clé d'envoi créée par Claude ; à garder précieusement, elle n'est jamais dans le dépôt).
  - iPhone : `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (clé API App Store Connect, rôle « App Manager »), `APPLE_TEAM_ID`.
- Lancer « Apps des stores » avec « publier » coché : AAB pour Google Play, envoi automatique vers TestFlight pour l'iPhone.
- Fiches des stores : textes, captures d'écran, lien de confidentialité https://retoucheproai.com/confidentialite.html.

## Compiler à la main (développement)
```sh
npm ci
npm run android:debug        # ANDROID_HOME doit pointer vers le SDK Android
npx cap sync ios             # puis compilation sur un Mac ou par GitHub
```
