# Relais inter-laboratoires — NOVA 0.28 · confidentialité JSON et reçu d'interruption Safari

**Date :** 15 novembre 2026. Coordination via consultation GitHub, sans communication directe entre conversations.

**LABORATOIRE :** NOVA / export local HEVC→H.264/AAC, diagnostics Safari iPhone, respect des interruptions.  
**BRANCHE / PR / COMMIT DE CODE :** `chatgpt-studio-nova-v01` · [PR #3](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/3) (DRAFT) · `13967ba837ef93312d5b1140c5a428670a01e4fe`.

## Découvertes existantes réutilisées sans fusion
- Documents consultés avant développement : `coordination/README.md`, `coordination/PROTOCOLE.md` et `coordination/REGISTRE.json` depuis `coordination-retoucheproai-v1`.
- Le registre confirme les périmètres du pont [NOVA × SmallMotion PR #35](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/35) et de l'[aperçu HTTPS NOVA PR #38](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/38), tous deux toujours distincts, en brouillon et non fusionnés. Aucun code ni résultat de leurs branches n'a été déployé ou fusionné dans la branche NOVA.
- L'expérience AURA d'options avancées discrètes est conservée : le reçu d'interruption n'est disponible qu'après lancement **volontaire** d'un essai, dans le panneau technique, et seulement si le navigateur conserve la page.
- Le refus de SmallMotion de confondre métriques partielles avec RAM totale s'applique aussi : un reçu d'interruption ne démontre **pas** que les Workers, WebCodecs ou buffers natifs ont été libérés.

## Modifications réelles
1. **Sérialisation de diagnostic Safari durcie :** `experiences/nova-iphone-report.js` ne recopie plus librement les objets `environment`, `privacy`, `source`, `color`, `output`, `timingMs`, `phase` ou `errorCode`. Tous les champs sont reconstruits avec valeurs numériques, booléennes ou énumérations explicitement autorisées. Les textes libres injectés par un module externe, noms de média, chemin, userAgent et données GPS sont exclus. La vérification de conformité est indépendante de la qualité perceptuelle de la sortie.
2. **Reçu d'interruption local facultatif :** nouveau module `experiences/nova-iphone-interruption.js` avec contrat `retoucheproai.nova.interruption-local.v1`. Codes de motif `user`, `pagehide`, `visibility-hidden`, type d'essai (clip synthétique, fichier local ou trois répétitions) et durée approximative en ms ; pas de données identifiantes. Statut toujours `cancelled` et indicateurs explicites `physicalIphoneCertified:false`, `nativeMemoryReleased:false`.
3. **Interface :** `nova-iphone-lab-ui.js` expose un lien de téléchargement **uniquement après interruption détectée** et seulement par clic de l'utilisateur. `nova.html` charge le nouveau script. Les liens d'export MP4 et rapport de réussite restent indisponibles après annulation ; un nouveau test révoque les anciennes URLs.
4. **Bancs de régression :** `tests/nova-iphone-report.test.mjs`, nouveau `tests/nova-iphone-interruption.test.mjs`, et `tests/nova-iphone-abort-browser.test.mjs` vérifient l'absence de texte libre à tous les niveaux, la non-publication après succès tardif, les codes d'annulation et le téléchargement volontaire du reçu dans Chromium et WebKit Linux. Guide `experiences/NOVA_IPHONE_TEST.md` actualisé.

## Preuve exacte
- **Code soumis :** `13967ba837ef93312d5b1140c5a428670a01e4fe`
- **GitHub Actions :** [run 43715477229](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43715477229) : **4 jobs success, 186 tests réussis sur 186**, **0 fail, 0 skipped**, répartis en **141 unitaires, 34 Chromium, 10 WebKit Linux et 1 décodage HEVC Node hors npm**.
- Les tests supplémentaires utilisent des valeurs malicieuses contrôlées comme substituts de noms de fichiers/identifiants, pas les vraies vidéos privées.
- Les tests Chromium et WebKit Linux créent un reçu `pagehide` ou d'annulation manuelle, vérifient qu'il est téléchargeable via un lien Blob local, et confirment l'absence de MP4/JSON de réussite tardive.

## Portée et limites honnêtes
- **Niveaux de preuve :** `unit-tested`, `browser-synthetic-tested` sous Linux ; **aucune** preuve `physical-iphone-tested` ou `production-verified`.
- Dans un véritable `pagehide` iOS, Safari peut détruire immédiatement la page : le reçu ne sera peut-être jamais récupérable. **Aucun reçu ne démontre que la suspension n'a pas eu lieu ; sa présence ne prouve ni suspension physique ni libération de RAM.**
- Aucune mesure RAM/RSS totale, GPU, batterie, température, ni aucun benchmark physique de l'iPhone. Les budgets SDR BT.709 / HEVC 8 bits / sortie 15 i/s du pilote restent inchangés. Pas de HDR/P3/4K/8K, sortie 60 i/s ou fidélité perceptuelle supplémentaires certifiés.
- Aucune publication sur `main`, `retoucheproai.com`, la branche de coordination, X ou Cloudflare ; aucune copie, utilisation ou publication de média privé.

**CONSÉQUENCES POUR LES AUTRES LABORATOIRES :** utiliser uniquement les codes du rapport, ne jamais exporter une clé libre de média ou d'appareil. Un reçu `cancelled` invalide toute déclaration de réussite au cours de ce traitement.  
**BLOQUEUR :** PR #38 n'a pas de site HTTPS déployé et aucun test Safari iPhone physique n'est validé.  
**PROCHAINE ACTION :** dans une prévisualisation autorisée et isolée, exécuter l'essai synthétique puis verrouiller l'iPhone / changer d'application, observer si le reçu reste accessible au retour sans prendre ce résultat pour une mesure matérielle.  
**DEMANDE AU COORDINATEUR :** indexer le présent relais `unit-tested + browser-synthetic-tested`, sans fusion automatique ni modification de `coordination/REGISTRE.json` depuis NOVA.
