# RetoucheProAI — Relais interlaboratoires : import vidéo universel, sortie vérifiée, fidélité avant tout

**15 novembre 2026 — SmallMotion / préproduction — complément de la PR #44.** Contrat produit partagé, pas une modification de l'exporteur.

## Décision de l'utilisateur retrouvée dans les autres conversations

**Objectif final :** accueillir tous les utilisateurs et toutes leurs vidéos sur RetoucheProAI ; l'interface doit chercher automatiquement un traitement réalisable de la meilleure qualité possible, même si un premier moteur est incompatible. Ne jamais utiliser le plafond d'un pilote expérimental comme plafond du produit final. **L'import n'est pas rejeté simplement parce que la vidéo est HEVC, haute résolution, à forte cadence ou longue.** Le refus d'un moteur est un signal de routage vers un autre moteur, pas une fin de parcours utilisateur.

Le mode par défaut doit rester « importer → traitement intelligent → résultat », sans exposer des détails techniques à un public non expert. Options avancées disponibles mais discrètes. Qualité naturelle fidèle, origine et consentements protégés, exécution locale en priorité et alternatives si nécessaires.

## Travaux réels déjà trouvés : ne pas redévelopper

- [NOVA PR #42](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/42), branche `chatgpt-nova-real-video-preflight-v1` : précontrôle local HEVC/AAC **strict**, statut `hevc-profile-or-timeline-incompatible` observé en privé chez le propriétaire ; il n'autorise pas l'export sous les contraintes de son pilote actuel. Ce statut n'est **pas** la preuve que la source est intrinsèquement non traitable.
- **Branche NOVA nouvelle et existante** `chatgpt-nova-iphone-native-fullhd-v1` : contient `experiences/nova-native-hd.js`, `experiences/nova-native-hd-ui.js` et tests. Le code explore **WebCodecs HEVC/H264 natif**, conserve PTS source, résolution et nombre d'images (quand pris en charge), copie AAC et propose un lien séparé vers l'original intact. Il est **expérimental**, avec limites de labo environ 2,2 Mpix, 360 trames, 12 secondes / 60 MiB, et une vérification de codec de l'appareil. Ne pas prétendre que ce code valide déjà n'importe quelle vidéo ou l'iPhone physique.
- [NOVA PR #3](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/3) : moteur NOVA et sûreté AAC, sans présumer l'intégration des branches #42 / HD.
- [NOVA × SmallMotion PR #35](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/35) : signal 2 images consultatif, jamais une preuve de geste ni un autorisateur d'export.
- [SmallMotion gate PR #36](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/36) et [audit UI PR #44](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/44) : vérification **après** export, uniquement pour fichiers comparables ; aucun moteur de conversion.

## Contrat de routage à implémenter par les propriétaires concernés

1. **Importer et conserver** : accepter la sélection locale sans transcodage destructif ni suppression ; identifier le conteneur, le codec, les pistes, les horodatages, le HDR/couleur, l'orientation, l'audio et la mémoire probable.
2. **Essayer le chemin de qualité maximale adapté au terminal** : utiliser les capacités réellement interrogées (p. ex. `VideoDecoder.isConfigSupported`, `VideoEncoder.isConfigSupported`, API MediaCapabilities quand applicable), pas des bornes fixes prévues pour une petite mire. Préserver résolution, cadence, PTS, durée, couleur et audio **par défaut**.
3. **Si un moteur refuse, poursuivre le routage**, avec vérifications et budgets séparés : chemin natif HEVC/H264 ; chemin compatible lecteur/décodeur alternatif réellement disponible ; traitement par segments avec reprise et assemblage vérifiable pour fichiers longs ; possibilité de calcul externe **uniquement avec consentement distinct** et protection des médias si l'exécution locale ne suffit pas. Aucun chemin non implémenté ne doit être annoncé comme déjà fonctionnel.
4. **Ne jamais réduire silencieusement** résolution, fps, audio, HDR ou qualité de préservation. Une adaptation irréversible requiert information explicite et décision de l'utilisateur ; en mode auto, préférer une solution sans perte de fidélité (ou attendre une méthode compatible).
5. **Contrôle final obligatoire** : fichier exporté réellement décodable, durée, nombre d'images/PTS, synchro et présence audio, profil couleur/orientation, absence de fichier tronqué et comparaison proportionnée. Un fichier source intact reste récupérable, mais **ne doit jamais être présenté comme une restauration**.
6. **État utilisateur/actionnable** : `imported` → `analyzing` → `native-processing` / `alternative-processing` / `explicit-consent-required` → `quality-check` → `completed`. En cas de corruption, DRM/licence ou limite non contournable, diagnostic clair et source conservée ; ne pas promettre impossiblement un traitement garanti de tout format.

## Tests d'acceptation exigés (synthétiques et sans médias privés)

- HEVC portrait Full HD / 30 fps avec AAC : ne pas bloquer pour seul dépassement du plafond 640×360/15 fps ; choisir un autre moteur si pris en charge.
- H.264 horizontal, HEVC HDR, 4K/60, cadence variable, VFR/PTS non triviaux, fichiers longs, AAC à amorçage/découpe, plusieurs pistes/rotations ; chaque fichier doit recevoir **un plan de traitement ou un état d'incompatibilité explicite et honnête**, sans succès fictif.
- Test de décodeur/encodeur absent : bascule contrôlée sans masquer une réduction ni supprimer le son ; aucune source perdue.
- Après correction : comparer réellement original/export sur codec, dimensions, cadence, trames terminales, durée, couleur et timeline AAC ; tester séparément sur Safari physique, ne pas convertir résultats Chromium en certification iPhone.

## Répartition

- **NOVA #42** : précontrôle = **diagnostic + route suivant**, non verdict final ; distinguer incompatibilité du moteur de corruption source.
- **NOVA HD (branche existante)** : faire évoluer le chemin natif et vérifier la vraie lecture/encodage sur appareils, sans le refondre ailleurs.
- **NOVA #3** : export et validation AAC/PTS, intégration dirigée des moteurs.
- **Directeur IA #1** : choix multi-moteurs selon qualité/ressources et provenance, non simple validation binaire.
- **AURA** : un bouton avec résultat compréhensible, états d'attente/alternatives discrets.
- **SmallMotion #44/#36** : fournir la mesure de fidélité, jamais piloter l'encodeur ni changer automatiquement les images.
- **Coordinateur** : mettre à jour l'index seulement après contrôle des branches, tests et PR.

**Risques et limites :** un système ne peut pas garantir de restaurer littéralement n'importe quel fichier corrompu, chiffré/DRM, ou interdit d'accès ; l'engagement honnête est une **prise en charge universelle de la demande avec recherche systématique de solution**, résultat vérifié quand réalisable, et conservation de l'original sinon. Le traitement complet universel reste **un objectif**, pas une fonctionnalité certifiée.

**Données privées jointes ou publiées : aucune.** Aucun code NOVA, `main`, registre de coordination ou site public modifié. Pas de merge ni déploiement.
