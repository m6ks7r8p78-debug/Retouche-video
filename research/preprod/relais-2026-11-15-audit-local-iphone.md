# Relais de coordination — audit de fidélité dans l'interface iPhone

**LABORATOIRE :** SmallMotion / préproduction (reprise du gate de fidélité de la PR #36).

**BRANCHE / PR / COMMIT :** `lab-smallmotion-iphone-av-audit-v1` — PR brouillon dédiée (pointeur ajouté lors de l'ouverture).

**OBJET :** fournir sur iPhone, après export, un avis local à partir des métadonnées de deux MP4 sans FFmpeg ni transmission du média. Ce n'est **pas** une correction AAC.

**FICHIERS CHANGÉS :** `research/preprod/av-fidelity-local.js`, `research/preprod/av-fidelity-app.js`, tests Node/Chromium et de cache, `index.html` et `sw.js` de la branche expérimentale seulement, description et CI ; `app.js`, NOVA, `main`, production et branche centrale non modifiés.

**RÉSULTAT RÉEL :** le parser détecte les variations de quantité de trames, de durée, de paquets AAC et de découpe `elst`. Il est non destructif, opt-in, hors réseau, sans lecture de pixels/PCM, noms de fichiers ni stockage.

**TESTS EXÉCUTÉS :** Node sur médias MP4 synthétiques ; Chromium sur vraie page ; CI distante à consigner dans la PR après exécution. La paire privée a été vérifiée uniquement dans l'environnement local de conversation (aucun contenu sur GitHub) : 2 trames de moins et une différence d'`elst` d'environ 47,9 ms, qui ne prouve pas à elle seule le décalage audible.

**NON TESTÉ / LIMITES :** pas de décodage sonore, qualité visuelle, conversion de cadence, vérification d'un montage voulu, HEVC/MOV complexes, piste multiple, Safari physique pour cette nouvelle fonction. 

**CONSÉQUENCES POUR LES AUTRES LABORATOIRES :** NOVA doit corriger l'amorçage AAC, la durée de fin et les trames manquantes avec son propre banc, puis laisser notre audit vérifier les métadonnées ; Directeur IA ne doit pas interpréter un verdict de métadonnées comme une amélioration réelle ; AURA peut reprendre le motif d'UI après revue, sans écraser le module.

**BESOIN D'INTÉGRATION / BLOQUEUR :** PR séparée et validation iPhone avant intégration future. Aucun merge ni déploiement automatique.

**PROCHAINE ACTION :** CI, archive de préproduction isolée, essai Safari puis comparaison au gate FFmpeg privé.

**DONNÉES PRIVÉES PUBLIÉES :** non.