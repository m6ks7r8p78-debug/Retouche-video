# RELAIS — 2026-11-15 — Fidélité export A/V (SmallMotion → NOVA)

**LABORATOIRE :** SmallMotion / préproduction (PR #28 en amont)

**BRANCHE / PR / COMMIT :** à remplir depuis la PR de recherche dédiée après validation CI.

**OBJET :** contrat de validation *lecture seule* de l'export local sans modification automatique du moteur.

**FICHIERS CHANGÉS :** `research/preprod/export_fidelity_gate.py`, `research/preprod/tests/test_export_fidelity_gate.py`, `research/preprod/README_EXPORT_FIDELITY.md`, ce relais, et une CI dédiée.

**RÉSULTAT RÉEL :** sur **une seule paire autorisée, analysée hors dépôt et hors réseau**, signalement d'un décalage AAC de l'ordre de 48 ms, de quelques dernières images absentes et d'un dernier paquet AAC perdu. L'export restait lisible. **Aucun média, nom de fichier, image, voix, forme d'onde ou empreinte de paquet n'a été versé au dépôt**. L'observation ne permet pas de généraliser à l'ensemble des utilisateurs.

**TESTS EXÉCUTÉS :** 8 scénarios synthétiques localement : 44,1 et 48 kHz × {remux valide, piste audio supprimée, dernières images supprimées, audio décalé de ~80 ms}. Vérification du signal PCM par FFmpeg + NumPy et des métadonnées/paquets par FFprobe ; tests FFmpeg synthétiques sont l'unique matière de CI publique.

**NON TESTÉ / REFUS / LIMITES :** aucune preuve d'amélioration des images, aucune nouvelle version exportée avec compensation AAC, aucune mise à jour du lecteur Safari. L'outil n'est pas adapté aux découpages/montages intentionnels ou aux fichiers à pistes multiples. Corrélation audio impossible si silence ou signal peu informatif ; abstention nécessaire.

**CONSÉQUENCES POUR LES AUTRES LABORATOIRES :**
- **NOVA (#3)** : ajouter un test de restitution du priming AAC (`skip_samples`, edit list, PTS négatifs) et de dernière image vidéo, rejeter/signaliser un export audio désynchronisé plutôt que supprimer silencieusement le son. Aucune valeur fixe de 48 ms valable pour tous les fichiers.
- **Directeur IA (#1)** : garder `no_automatic_change` sur mouvement 2D non calibré, ne pas présenter un remux fidèle comme restauration visuelle.
- **AURA / UX** : présenter « rendu identique / fidélité vérifiée » différemment de « reconstruction des détails », accessible sans jargon.
- **Export X** : conserver le son du MP4 préparé avant upload manuel, sans promettre d'éviter la compression ultérieure de X.

**BESOIN D'INTÉGRATION / BLOQUEUR :** NOVA est propriétaire de l'export. Ne pas écraser ses modules ou `app.js` depuis notre PR. Demander au coordinateur de rapprocher le gate synthétique du futur correctif NOVA, avec tests sur branche NOVA puis validation Safari physique.

**PROCHAINE ACTION :** vérifier en CI ces tests ; relayer la PR au coordinateur ; laisser NOVA proposer une correction de synchronisation et de dernière image en PR indépendante.

**DONNÉES PRIVÉES PUBLIÉES :** non.