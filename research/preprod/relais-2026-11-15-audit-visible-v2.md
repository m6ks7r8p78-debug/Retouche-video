# Relais SmallMotion / préproduction — visibilité de l’audit export dans Safari iPhone (v2)

**LABORATOIRE :** SmallMotion / préproduction, succession des PR #28 → #36 → #40.

**BRANCHE / PR / COMMIT :** `lab-smallmotion-av-audit-visible-fallback-v2` ; nouvelle PR draft de relais ; commits et CI à renseigner après vérification.

**OBSERVATION UTILISATEUR :** sur un domaine Cloudflare Drop temporaire, capture Safari du propriétaire montrant SmallMotion consultatif opérationnel mais aucune carte « Contrôle local de fidélité de l’export » à l’endroit prévu. La capture n’expose pas le HTML/JS servi et **ne permet pas d’attribuer une cause définitive** (ancienne archive, script manquant, race d’initialisation ou cache). Aucun média privé ni copie de la capture sur GitHub.

**DÉFAUT DE RÉSILIENCE CONSTATÉ DANS LE CODE :** la première interface PR #40 dépendait entièrement de JS `av-fidelity-app.js` pour créer sa carte, et refusait de la créer si `#smallmotion-app-panel` ou le moteur n’était pas initialisé. Si le script ne se chargeait pas, **aucun état d’erreur visible**.

**CORRECTION RÉELLE :** la carte et le bouton désactivé existent désormais en HTML visible même si aucun JS ne fonctionne. `av-fidelity-app.js` active le bouton et affiche l’état uniquement si le moteur MP4 est disponible ; sinon état explicite et aucune comparaison. Aucun import automatique, réseau ni export modifié. La carte ne dépend plus du montage asynchrone SmallMotion. La version « v2 » est affichée pour distinguer visuellement une nouvelle archive déployée.

**TESTS :** contrôles synthétiques Chromium 390×844 / 1280×800 ; scénarios script absent, moteur absent, extraction MP4 intacte, statut consultatif, absence de requêtes externes ; PWA cache séparé et non-régression des 8 workflows historiques. Consigner résultats exacts après CI.

**LIMITES :** la capture iPhone initiale constitue une observation de terrain mais pas une preuve de cause ; la nouvelle interface n’est **pas physiquement testée sur iPhone Safari** avant publication volontaire d’une archive de préproduction séparée. Aucun correctif du priming AAC ni des dernières trames H264. Les contrôles métadonnées ne mesurent pas le délai sonore PCM.

**AUTRES LABORATOIRES :** NOVA reste responsable de l’encodeur/muxer et du décalage AAC ; AURA de la UX générale ; ne pas écraser leurs fichiers. Coordinateur peut relayer, sans modifier `coordination/REGISTRE.json` directement.

**DONNÉES PRIVÉES PUBLIÉES :** non.
