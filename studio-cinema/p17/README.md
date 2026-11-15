# Retouche Cinema AI — P17, pont entre laboratoires

**15 novembre 2026 — démonstrateur de planification, hors production.**

## Ce qui est réellement intégré

1. `src/presence_director.js` (reprise locale du moteur P16 de la branche de recherche) : gestes et direction d'acteur, cinq dimensions de présence, chronologie superposée.
2. `src/cinema-render-plan.js` (reprise locale du planificateur P2 de la branche de recherche) : découpage, durée, personnages et accessoires, validation stricte.
3. `src/acting_clip_bridge.js` **nouveau** : transforme les gestes P16 en instructions de rendu P2 propres à chaque clip ; reporte la continuité aux coupes, relève des contradictions non corrigées silencieusement, garde le même personnage et objet.
4. `src/cross_lab_handoff.js` **nouveau** : interfaces optionnelles de NOVA (synchro/conformité d'export), CameraGuard (compensation de caméra 2D), et SmallMotion (politique PWA de mise à jour sans interruption). **Les trois fournisseurs ne sont pas connectés pour un rendu dans cette livraison.** Les adaptateurs signalent clairement `not_executed` et refusent les affirmations sans preuve.
5. `public/RetoucheCinema_P17_Studio_iPhone.html` : un seul fichier HTML hors ligne, interface iPhone et ordinateur ; choix de scène, personnage fictif adulte, durée, format, cadence visée 30/45/60, sliders d'intention, timeline des clips, alertes, export JSON.

**Le mode 60 i/s n'est ici qu'un objectif d'encodage : 0 image vidéo créée, 0 GPU ou moteur texte-vers-vidéo exécuté.**

## Laboratoires repérés pour réutilisation future

| Projet | Branche / PR | Ce qu'on peut reprendre | État dans Cinema P17 |
| --- | --- | --- | --- |
| NOVA 0.19 | `chatgpt-studio-nova-v01` / PR #3 | Sync audio vidéo, couleur, export compatible iPhone | Contrat seulement, exécution distincte nécessaire |
| CameraGuard v4.3 | `lab-3d-v43-camera-evidence` | Mouvement caméra 2D, refus de fausses conclusions anatomiques | Contrat seulement |
| SmallMotion PWA | `lab-3d-smallmotion-pwa-safe-update-v1` / PR #26 | Mise à jour attend la fermeture des clients actifs | Politique spécifiée, Service Worker non intégré |
| Cinema P16 | `chatgpt-cinema-ai-rfc-v01` / PR #5 | Présence, regard, expressions et jeu | **Relié à P2 et testé** |
| Cinema P2 | même branche / PR #5 | Manifestes de clips, continuité et consentements | **Relié à P16 et testé** |

Le système de liaison permet l'ajout de futures versions **sans fusionner automatiquement** les PR expérimentales. Chaque version devra avoir ses propres tests de contrat, de non-régression, de confidentialité et des essais iPhone physiques avant toute activation en production.

## Validation

```bash
node --test tests/test_acting_clip_bridge.cjs tests/test_cross_lab_handoff.cjs
python -m pytest -q tests/test_private_review_queue.py
python -m pytest -q tests/test_p17_browser.py
```

- 51 tests JavaScript de planification/adaptateurs réussis ; 12 tests Python privés de file de revue réussis.
- Chromium `390 × 844` et `1240 × 820` : génération de 3 clips pour une séquence fictive de 15 s, changement de scène, export JSON, modules externes désactivés, aucun chargement externe ni erreur JS ; navigateur physique Safari non testé.
- La file de revue **privée** P17 associe les 60 passages de P11 et P14 par clé temporelle complète, pas seulement par identifiant vidéo, pour éviter les croisements. Elle ne contient aucune annotation humainement validée et reste exclue du dépôt public.

## Confidentialité

Ni les 157 vidéos privées, ni des noms de source, ni leurs empreintes et leurs annotations ne sont inclus dans l'archive publique ou dans GitHub. Aucun chargement réseau dans l'atelier. Les observations artistiques ne sont pas des preuves d'intentions réelles. Aucune publication, génération vidéo, entraînement supervisé ni modification de retoucheproai.com.
## État des fichiers sur cette branche GitHub

Versionnés ici : ce README, `cross_lab_handoff.js` et `module_registry.json`. Le **code complet du pont P2/P16**, l'interface HTML autonome et les tests correspondants sont disponibles dans **l'archive locale P17** fournie dans la conversation. Cette PR ne représente pas encore l'intégration intégrale du prototype dans le dépôt et n'active aucune fonction de production.
