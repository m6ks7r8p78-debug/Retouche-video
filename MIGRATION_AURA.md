# RetoucheProAI — migration contrôlée vers AURA
Date : 15 novembre 2026 · Destination **à terme** : AURA devient l'accueil et l'interface principale de retoucheproai.com.

## Décision utilisateur et limites de cette branche
L'utilisateur souhaite que l'interface AURA choisie **remplace un jour l'interface actuelle** et reprenne les fonctionnalités de l'application historique. Ce n'est pas une demande de publication immédiate. Les moteurs qui existent doivent être conservés, non reconstruits en faux outils. Les expériences du laboratoire ne sont intégrées que si une amélioration nette, reproductible et pertinente est démontrée.

**Cette branche ne remplace pas `index.html`, ne change pas `main` et ne publie aucun site.**

## Topologie réellement créée

| Fichier | Fonction |
|---|---|
| `aura-preview.html` | Copie conforme de l'AURA de la PR #30, sauf URL relative du studio -> `studio-preview.html` et `noindex`. L'accueil / commandes restent visuellement identiques. |
| `studio-preview.html` | Copie conforme de l'actuel `index.html`, sauf charge `demarrage-preview.js` et `noindex`. Le DOM et les gestionnaires d'import et de traitement sont inchangés. |
| `demarrage-preview.js` | Copie des fonctions de démarrage natives hors inscription/suppression de service worker. Les modules lourds continuent à être chargés à l'inactivité. |
| `aura-native-bridge.js` | Récepteur déjà créé par la PR #30 : `File` du navigateur, origine contrôlée, accusé de remise au formulaire natif, pas de transfert serveur. |
| `check_aura_staging.py` | Contrat automatisé : les copies ne dérivent pas de leurs originaux, scripts natifs toujours présents, pas d'enregistrement PWA, captures de l'accueil identiques aux six largeurs testées. |

**Tester sous HTTPS en hébergeant la branche entière à la racine d'une même origine** et ouvrir `/aura-preview.html`. Le navigateur charge alors `/studio-preview.html` dans l'iframe, et les scripts/modèles du dépôt restent relatifs à la même racine. Une prévisualisation constituée du seul fichier HTML ne contient pas les dépendances : elle ne peut pas assurer les fonctions natives. Aucun média personnel ne doit être ajouté au dépôt pour les tests.

## Ce qui existe dans le produit historique (constaté dans main)
- `index.html` + `app.js` : import photo / vidéo, profils Naturel / Équilibré / Détails / Faible lumière / Nuit→jour, Full HD/4K, comparaison, export, réglages et opérations vidéo ;
- `models.js`, `sr.js`, `sr-gpu.js`, `visage.js` et modules chargés à la demande : gestion de modèles et traitements IA selon disponibilité et autorisations ;
- `effacer.js`, `defiltre-visage.js`, `restauration-visage.js`, `format.js`, `mp4-muxer.js` : outils spécialisés et exports ;
- `studio.js`, `atelier.js`, `mode-simple.js` : réglages, activités et navigation ;
- `sw.js`, `manifest.webmanifest` : installation PWA et cache hors ligne ;
- tests historiques sous `tests/`, dont `app.test.mjs`, `sw_reel.test.mjs` et `qualite.test.mjs`.

L'existence de ces modules n'atteste **pas** qu'ils sont tous intégrés ou validés dans AURA aujourd'hui.

## Critères bloquants avant le remplacement public
1. **Fidélité graphique.** L'accueil est celui de la maquette AURA approuvée ; ne pas retourner aux versions refusées. Les fonctions avancées restent facultatives, sur le média.
2. **Import de bout en bout sous HTTPS.** Photo JPEG/PNG/HEIC et vidéo MP4/MOV transmises à la vraie application (pas à un formulaire simulé), entrée reconnue, traitement natif effectué, résultat exporté ; refus/error/annulation validés.
3. **Fonctionnalités essentielles.** Parcours automatique, réglages manuels, formats Full HD/4K, mode Faible lumière/Nuit, Détails, vidéo ralentie et inversée, filtrage/AR, restauration, export X ; chaque ligne validée séparément avec médias de tests autorisés.
4. **Fidélité des exportations.** Résolution, cadence, durée, pistes audio, orientation, codecs et fichier ouvrable sur iPhone ; aucune interpolation présentée comme vraie super-résolution. Mesures qualité/sans régression.
5. **Données et permissions.** Conservation des modèles en IndexedDB, projets/recettes existants, consentements et révocations ; aucune suppression de cache modèle par erreur. Un domaine de prévisualisation distinct ne partage pas automatiquement les données du domaine public.
6. **iPhone Safari réel.** Formats, gestion de fichiers Photos, gestes, VoiceOver, texte agrandi, orientation, consommation mémoire/chaleur, travail long, PWA en mode autonome/hors ligne.
7. **Qualité expérimentale.** Tout nouveau modèle ou mode révolutionnaire doit démontrer un gain sur bancs réels (mesures adaptées : SSIM/LPIPS, fidélité temporelle, visages, artefacts, temps, mémoire) et être jugé utile visuellement. À défaut : rester au laboratoire.
8. **Protection de production.** Aucun changement d'origine/racine, aucun nouveau SW public, aucune fusion dans `main` avant validation finale explicite et plan de retour arrière.

## Étape de bascule, uniquement après réussite des critères
- Archiver l'actuel `index.html` à la **racine** sous `studio.html` (pour que ses chemins de scripts continuent de fonctionner), conserver son historique Git et ses fonctionnalités ;
- adapter la version finale d'AURA pour charger `studio.html` sur la **même origine** ;
- remplacer `index.html` par la façade AURA, puis actualiser les chemins/révisions du service worker et les chemins du manifest pour la PWA ; vérifier le second démarrage hors ligne ;
- déployer par étape, comparer avant/après sur médias autorisés, conserver un plan de retour à l'ancien `index.html` et à l'ancien `sw.js`.

**Statut actuel : topologie de prévisualisation prête dans GitHub, pas de site HTTPS de cette branche confirmé, ni test du moteur natif complet sur Safari.**