# Décisions techniques

| Décision | Raison |
|---|---|
| Garder Real-ESRGAN general v3 comme seul réseau de restauration | meilleur compromis mesuré (LPIPS) ; plus gros = trop lent sur iPhone ; modèle rapide refusé (perte de qualité) |
| Retirer la protection des visages (UltraFace) | mesurée défavorable (LPIPS visage 0,370 → 0,459) |
| Pas de CodeFormer / GFPGAN | licence non commerciale / ~350 Mo et risque de changer l’identité |
| Faible luminosité par méthode classique (gamma sur luminance, gain ≤ ×3) | gain mesuré (LPIPS 0,421 → 0,347) sans modèle à télécharger ; un réseau devra battre ce chiffre pour entrer |
| Son à vitesse modifiée par WSOLA | garde la hauteur de la voix, sans bibliothèque externe |
| Secours Opus si pas d’AAC | évite un export muet ; fichier relu, sinon export sans son expliqué |
| Pas de cloud intégré | offres gratuites manuelles, non garanties, envoi des médias chez un tiers (GUIDE_CLOUD_GRATUIT.md) |
| Pas de génération / personnages / 3D | modèles de plusieurs Go, GPU puissant ou service payant requis ; incompatible avec 0 € sur iPhone (ROADMAP.md) |
| Autorisations demandées au premier usage réseau | rien ne part de l’iPhone sans accord ; révocable |
| Sauvegarde AES-256-GCM (PBKDF2 250 000 tours) via WebCrypto | chiffrement standard intégré au navigateur, sans dépendance |
| Découpage progressif d’`index.html` (premier module : studio.js) | réécrire tout sans iPhone de test ferait courir trop de risques de régression |
