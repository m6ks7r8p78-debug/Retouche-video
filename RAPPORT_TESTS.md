# Rapport de tests — v3.2 (audit du 4 novembre 2026)

Toutes les suites ont été relancées sur la v3.2 (branche `audit-v3.2`), dans l'ordre, après les corrections. Aucune erreur JavaScript.

Environnement : Chrome sans écran (Playwright), GPU **simulé** sur processeur (SwiftShader), FFmpeg/ffprobe, Python (PSNR, SSIM, LPIPS).
**Aucun iPhone n’était disponible : aucun test n’a été fait sur un vrai appareil.** Liste de vérifications à faire : GUIDE_IPHONE.md.

| Suite | Exécutée | Résultat |
|---|---|---|
| `tests/gestionnaire.test.mjs` (modèles : téléchargement, reprise, SHA-256, corruption, stockage, mises à jour, nettoyage…) | oui | 24 réussis, 0 échoué ; 2 non testables (éviction Safari réelle, saturation mémoire réelle) |
| `tests/app.test.mjs --ia` (photos, IA, comparateur, PNG, 12 Mpx, vidéos 4K paysage/portrait, 720p, 1080p, origine, relief) | oui | 13 réussis, 0 échoué |
| `tests/v3.test.mjs` (vitesse ×2, envers, ralenti 0,5× fluide, son, profils faible lumière) | oui | 7 réussis, 0 échoué |
| `tests/studio.test.mjs` (autorisations : lien et modèle refusés = rien envoyé ; sauvegarde chiffrée : bonne / mauvaise phrase, fichier modifié ; assistant ; fenêtre Paramètres ; **v3.2** : sauvegarde piégée sans exécution de code, diagnostic soumis à autorisation, polices locales sans requête externe) | oui | 11 réussis, 0 échoué (sur la v3.1 : 9 réussis, 2 échoués — la faille est réelle) |
| `tests/sw.test.mjs` (**v3.2** : à la mise à jour, seuls les anciens caches de l'app partent ; modèles téléchargés et /radar/ gardés ; fichiers hors ligne présents ; aucune requête Google Fonts) | oui | 7 réussis, 0 échoué (sur la v3.1 : 4 réussis, 3 échoués) |
| `tests/reassemblage.test.mjs` (v3.1 : 5 morceaux coupés sans réencodage, noms trompeurs, dates effacées, mélangés + un doublon ; puis un morceau du milieu retiré) | oui | 5 réussis, 0 échoué ; ordre retrouvé, doublon retiré, vidéo regroupée **identique image par image** à l’originale (empreinte MD5), trou signalé avec confiance faible |
| `tests/noyau.test.mjs` (calcul WebGPU 4 pixels/fil) | oui | écart 0 entre les deux versions, choix automatique opérationnel (GPU simulé : 42,5 s contre 31,2 s) |
| Serveur v5 **en ligne** (CORS par requête, origine étrangère, adresse interne) | oui, sur le serveur réel (Cloudflare) | origine de l'app acceptée ; origine étrangère → 403 ; `169.254.169.254` → refusé ; `/etat` → version 5 |
| Authenticité des fichiers (`sr.bin` contre les poids officiels, ONNX Runtime et mp4-muxer contre npm, modèle de relief) | oui | identiques |
| Banc de qualité (profils, faible luminosité) | non relancé en v3.2 (aucun calcul d'image modifié) | mesures v3.0 : voir MODELES.md |

Détails vérifiés par ffprobe : dimensions exactes (3840×2160, 2160×3840, 720×1280…), cadence conservée (30 i/s), durée à ±0,06 s, son présent ;
vitesse ×2 : 3,00 s vidéo et son ; ralenti 0,5× : 12,00 s ; à l’envers : 1re image = dernière de la source.

Constat de test : le Chrome de test n’a pas d’encodeur AAC ; les sons réencodés y sortent en Opus (secours ajouté). Sur iPhone, l’AAC est utilisé.

## Cahier « Mission complémentaire » (v3.1) : ce qui n’est pas réalisé, et pourquoi
- **Retrait de filtres de visage / réalité augmentée et reconstruction du visage « d’origine »** : non réalisé. Un filtre remplace
  des pixels ; ce qui était dessous n’existe plus dans le fichier. Le « retrouver » serait inventer un visage — ce serait présenter
  une reconstruction IA comme l’original, ce que le cahier interdit lui-même. Aucun modèle gratuit, fiable et utilisable sur iPhone.
- **Reconstruction guidée par l’identité (yeux, visage à partir d’autres photos de la personne)** : non réalisée, pour la même raison,
  et parce que cela touche à l’apparence de vraies personnes (autorisation explicite exigée) ; essai de restauration de visages
  de la v2.50 mesuré défavorable (voir RAPPORT_QUALITE.md).
- **Reconstruction hors du cadre (élargir l’image)** : non réalisée — c’est de la génération d’image (modèles de plusieurs Go).
- **Cohérence temporelle** : seulement ce qui existait (débruitage temporel, anti-scintillement, stabilisation) ; pas de modèle vidéo neuronal.
- **Ordre par le son** (raccord audio entre morceaux) : non réalisé ; l’image et la date suffisent dans les cas testés.
- **Chevauchement** (deux morceaux qui contiennent le même passage) : pas détecté à part ; il apparaît comme un raccord « trop net » ou un doublon.
- Remise en ordre testée uniquement sur des morceaux de **même format** (condition déjà exigée par « Regrouper ») ; non testée sur iPhone.

## Demandes du cahier des charges non réalisées en v3.0 (volontairement, ou faute de pouvoir les valider)
- Découpage d’`index.html` en modules : reporté (risque de régression sans iPhone de test).
- Modèles neuronaux basse lumière (Zero-DCE, Retinexformer…), restauration vidéo temporelle (BasicVSR++, RVRT), SwinIR, RIFE : non intégrés (poids/licences non validés, coût iPhone) ; méthodes classiques mesurées à la place.
- Restauration de visages : essayée en v2.50, retirée (mesurée défavorable) ; aucun modèle compatible licence + identité.
- Masques par zone, désentrelacement, correction du rolling shutter, export HDR, WebP/HEIC, file d’attente et reprise après fermeture, détection de changements de scène dédiée : non réalisés.
- Détection automatique d’une vidéo accélérée/inversée : non réalisée (pas fiable sans preuve) ; correction manuelle disponible.
- Cloud : étudié, non intégré (voir GUIDE_CLOUD_GRATUIT.md).
