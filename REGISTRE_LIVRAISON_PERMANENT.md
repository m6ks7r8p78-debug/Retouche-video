# Registre permanent de livraison — RetoucheProAI

Document central et permanent. **On n'y efface jamais rien** : un statut qui change est réécrit dans la fiche, et l'ancien statut
reste dans l'historique en bas. Une fonction ne change de statut qu'avec une preuve (test exécuté, mesure, diagnostic reçu).
Le tableau de bord décrit **le code réel**, pas les ambitions.

Statuts : NON COMMENCÉ · RECHERCHE EFFECTUÉE · PROTOTYPE · EN DÉVELOPPEMENT · INTÉGRÉ NON VALIDÉ · VALIDÉ SUR DONNÉES SYNTHÉTIQUES ·
VALIDÉ SUR MÉDIAS RÉELS AUTORISÉS · VALIDÉ SUR IPHONE · TERMINÉ SELON LES CRITÈRES DÉFINIS · BLOQUÉ PAR UNE DÉPENDANCE EXTERNE

À chaque reprise : relire ce registre → vérifier les statuts contre le code et les tests → choisir la prochaine tâche → la faire.
À chaque livraison : fiche(s) + preuves + historique + tableau de bord + prochaine tâche.

---

## Tableau de bord (à jour : v7.2, 12/11/2026)

| | Fonctions |
|---|---|
| **Terminées selon les critères** | aucune |
| **Validées sur iPhone** (usage réel du propriétaire / diagnostics reçus) | F01 amélioration vidéo classique · F03 IA locale (photo) · F19 voix plus claire · F05 retrait de filtre couleur (vidéo) |
| **Validées sur médias réels autorisés** (pas sur iPhone) | **F13 restauration des visages (photo)** — nouvelle en v6.9 |
| **Validées sur données synthétiques** | F06 diagnostic des filtres couleur/lumière · F08 zones de filtre AR proposées (photo) |
| **Intégrées, non validées** | F02 reprise des exports 4K · F04 IA rapide Kaggle · F07 effacer une zone · F17 anti-scintillement/stabilisation · F18 vitesse / Time Repair · F20 caméra virtuelle · F21 export X · F22 hors-ligne · F26 pubs/Premium (éteints) · F28 thème Néon |
| **Prototypes** | F09 suivi vidéo du visage + report de masque · F16 directeur de traitement (`ANALYSE.plan()`, non branché) |
| **Nouveau v7.2** | **F31 studio (refonte de la composition)** : INTÉGRÉ, testé dans Chrome (10 tests `tests/atelier.test.mjs` + suites existantes) ; non validé sur iPhone ; remplace F28 |
| **Nouveau v7.1** | **F30 retirer les éléments d'un filtre AR (photo)** : VALIDÉ SUR MÉDIAS RÉELS AUTORISÉS (74 vrais clips Snapchat du propriétaire, validation croisée par vidéo ; une seule personne) + veto « mains » · **F11 proportions (réglage guidé)** : INTÉGRÉ ; correction automatique mesurée inutile sur vrais filtres |
| **Prototypes (labo, non intégrés à l'app)** | F29 recopie / référence (référence sans effet mesurable sur les faux repérages réels) · F12 lissage / maquillage : mesurés sur vraies paires, **pas mieux que ne rien faire** |
| **Non commencées** | F10 effacement AR en vidéo · F14 restauration des visages en vidéo |
| **Laboratoire** | F15 : EN DÉVELOPPEMENT (+ v7.1 : 74 vrais clips Snapchat privés avec vérité terrain, 359 visages NASA, validation croisée par vidéo) |
| **Bloquées (dépendance externe)** | F23 serveur de consentement (déploiement + juriste) · F24 collecte pour l'entraînement (juriste) · **F13 en usage commercial** (décision juridique sur la licence des poids) |
| **Régressions détectées** | aucune introduite par la v6.9. **Échecs déjà présents en v6.8** (trouvés en relançant tout) : `tests/pub.test.mjs` 1 cas (pub indisponible → l’enregistrement ne part pas dans le test), `tests/v3.test.mjs` 3 cas (rendus « équilibre / nuit / jour » de photo sombre) — à expliquer et corriger |

**Priorité donnée par le propriétaire le 11/11 au soir** : uniquement le retrait des filtres beauté / visage / animaux (cagoule et flou qui cache un visage : exclus, voir F29). **Ancien ordre** : F14 visages en vidéo (Kaggle + local) → F11/F12 filtres beauté et déformations
sur photo → F10 effacement AR en vidéo (suivi F09 déjà prêt) → F15 laboratoire de filtres → F16 directeur branché sur l'export →
mesures iPhone de tout ce qui est « intégré non validé ».

**Prochaine tâche concrète (v7.1)** : F30 sur iPhone (protocole ci-dessous) avec d'autres visages que le propriétaire ; puis F14. **Ancienne** : F14 — restauration des visages image par image en vidéo avec le suivi de F09 (positions lissées,
même transformation d'une image à l'autre pour éviter le scintillement), d'abord sur le serveur Kaggle (carte graphique), mesure de
scintillement sur `tests/medias/video_portrait.mp4`.

---

## Fiches des fonctions

Format de chaque fiche : objectif · priorité · statut · implémenté · fichiers · modèles/algorithmes · tests exécutés · résultats ·
médias de validation · appareils testés · défauts · limites · reste à faire · critère de fin · preuve de la dernière livraison.

### F13 — Restauration des visages (photo) · priorité 1
- **Objectif** : rendre lisibles les visages flous, petits ou compressés (yeux, peau, cheveux) sans toucher au reste de la photo, en
  distinguant ce qui est **retrouvé** de ce qui est **inventé**.
- **Statut** : VALIDÉ SUR MÉDIAS RÉELS AUTORISÉS (v6.9). Non validé sur iPhone. Usage commercial : BLOQUÉ PAR UNE DÉPENDANCE EXTERNE (licence).
- **Implémenté** : bouton d'accueil « Restaurer les visages d'une photo (IA, essai) » et bouton après traitement d'une photo ;
  repérage YuNet → alignement par similitude sur le gabarit FFHQ 512 → GFPGAN v1.4 → recalage des couleurs → dosage « force »
  (80 % par défaut, réglable sans relancer le calcul) → recollage à bord fondu ; visage déjà net laissé tel quel (mesuré) ;
  visage < 12 px entre les yeux non traité ; carte rose des zones inventées et part inventée chiffrée ; avant/après à glissière ;
  enregistrement JPEG ; téléchargement du modèle avec accord, reprise, empreinte SHA-256, déchargement mémoire par le gestionnaire.
- **Fichiers** : `restauration-visage.js` (nouveau), `modeles/lourds/gfpgan14_int8w.onnx` (nouveau, 85,6 Mo), `models.js` (fiche
  `gfpgan`), `app.js` (module `visages`, boutons), `index.html` (2 boutons), `sw.js` (le modèle ne passe pas par le cache de l'app),
  `studio.js` (texte d'autorisation), `tests/rvis.test.mjs`, `tests/visage_ia/` (export, quantification, banc d'essai).
- **Modèles** : YuNet (MIT, déjà livré) ; GFPGAN v1.4 « clean » (Tencent ARC), export ONNX opset 17 avec bruit fixe (reproductible),
  poids quantifiés int8 par canal (117 tenseurs), calcul en float32, optimisations du graphe coupées (pic mémoire plus bas).
- **Tests réellement exécutés** :
  1. Export : sortie ONNX float32 = PyTorch (écart moyen 2,2·10⁻⁷, max 4,4·10⁻⁶).
  2. Banc Python (`tests/visage_ia/banc_visages.py`) : 25 portraits officiels NASA (domaine public), 4 dégradations contrôlées
     → 100 essais par variante ; vérité terrain connue.
  3. Balayage de la force et du seuil de netteté (12 portraits × 3 dégradations).
  4. De bout en bout dans Chromium (vrai moteur WebAssembly, vrai modèle) : `tests/rvis.test.mjs` — résultats ci-dessous.
- **Résultats mesurés (banc, moyenne de 25 portraits)** — LPIPS : plus bas = plus proche de la vraie photo ; repères : erreur des 5
  repères du visage / distance entre les yeux (proxy de la forme du visage, PAS une mesure d'identité) :

  | Dégradation | Entrée LPIPS | Restauré LPIPS (force 100 %) | Entrée PSNR | Restauré PSNR | Repères entrée → restauré | Surface inventée (force 100 %) |
  |---|---|---|---|---|---|---|
  | visage 64 px | 0,451 | **0,194** | 28,15 | 27,24 | 0,043 → 0,030 | 12,5 % |
  | 96 px + JPEG 35 | 0,593 | **0,213** | 26,55 | 26,38 | 0,062 → 0,031 | 12,5 % |
  | 128 px + flou + bruit + JPEG 50 | 0,531 | **0,191** | 27,82 | 27,56 | 0,048 → 0,030 | 11,4 % |
  | « vieux téléphone » 160 px + JPEG 25 | 0,514 | **0,193** | 27,82 | 27,38 | 0,047 → 0,033 | 11,9 % |

  **Sortie réelle de l'app** (Chromium, WebAssembly, 9 portraits réduits ×0,16 + JPEG 40, notés par `banc_visages.py --js`) :
  LPIPS 0,538 → **0,271** (force 80 %) / 0,259 (100 %) ; repères 0,124 → **0,051** ; PSNR 24,6 → 25,5 ; SSIM 0,724 → 0,739 ;
  surface inventée 7 à 17 % à 80 % (12 à 25 % à 100 %) ; **21,5 s par visage** (médiane, 1 fil, processeur d'ordinateur).
  Décision « déjà net » (netteté × échelle d'alignement) : 9 portraits d'origine 9,5–15,8, les mêmes dégradés 1,6–2,9 → seuil 6,
  aucune erreur sur les 27 cas ; photo identique au pixel près quand rien n'est restauré ; hors des visages, aucun pixel modifié.
  Int8 contre float32 : LPIPS identique à 0,0003 près sur les 100 essais. Force (LPIPS / surface inventée) : 60 % 0,226 / 4 % ·
  70 % 0,205 / 6 % · **80 % 0,191 / 8 % (défaut)** · 90 % 0,181 / 10 % · 100 % 0,176 / 12 %. Visage déjà net restauré quand même :
  LPIPS 0,132 contre l'original (il est changé pour rien) → justifie de le laisser intact. Mémoire (ordinateur, ONNX Runtime 1 fil) : pic ≈ 0,73 Go ; 6,5 s par visage.
  Lecture honnête : le PSNR/SSIM ne monte pas (normal : les détails inventés ne sont pas ceux de la vraie photo) ; c'est la
  ressemblance perçue (LPIPS) qui progresse nettement, et la forme du visage (repères) qui devient plus nette.
- **Médias** : réels autorisés (portraits officiels NASA, domaine public, sources et URL dans `tests/medias/visages_dp/sources.json`),
  dégradés artificiellement. Aucune vraie vieille photo de famille, aucune photo d'iPhone.
- **Appareils** : ordinateur Linux (Python/ONNX Runtime) ; Chromium sans carte graphique (WebAssembly). **Pas d'iPhone.**
- **Défauts constatés** : la ressemblance change un peu (≈ 8 % de la surface du visage inventée à 80 %) ; PSNR légèrement plus bas
  que l'entrée à force 100 %.
- **Limites** : photo seulement ; téléchargement coupé = recommence au début (GitHub Pages ne reprend pas) ; profil très marqué, visage caché, visage très sombre non mesurés ; pas de mesure d'identité
  (ArcFace et équivalents : poids non commerciaux, non utilisés) ; mémoire iPhone inconnue (risque de fermeture de l'onglet).
- **Licence (bloquant pour l'usage commercial)** : code GFPGAN Apache-2.0 ; poids publiés par Tencent sous la même licence, mais le
  générateur repose sur StyleGAN2 (licence NVIDIA : recherche/évaluation uniquement) entraîné sur FFHQ (CC BY-NC-SA 4.0). Avant
  publicité, abonnement ou boutique : **décision juridique requise** (personne d'autre que le propriétaire ne peut la prendre).
  Alternatives examinées : CodeFormer (licence S-Lab non commerciale, exclu) ; RestoreFormer++, GPEN, VQFR (même question FFHQ).
- **Reste à faire** : protocole iPhone ci-dessous ; vidéo (F14) ; mesure sur vraies vieilles photos autorisées par le propriétaire.
- **Critère de fin** : (1) LPIPS ≥ 40 % plus bas que l'entrée sur le banc ✔ ; (2) visage net laissé intact ✔ ; (3) carte des zones
  inventées ✔ ; (4) sur iPhone 15 Pro Max : 3 visages restaurés sans fermeture de l'onglet, < 60 s par visage ; (5) avis du
  propriétaire sur 5 vraies photos de famille ; (6) décision de licence écrite.
- **Protocole iPhone (5 min)** : retoucheproai.com → « Restaurer les visages d'une photo » → choisir une vieille photo floue avec
  un visage → accepter le téléchargement (86 Mo, une fois) → noter le temps affiché à la fin, si l'onglet se ferme, et si le visage
  ressemble à la personne (glisser la barre ; tester « Carte » et la force à 50 %). Le diagnostic anonyme (s'il est autorisé)
  remonte le temps et la netteté de chaque visage (`rvis`).
- **Preuve de la dernière livraison** : v6.9, `node tests/rvis.test.mjs` (voir historique), empreinte du modèle
  `40407c8037bd34a7718b9ea60257354c87eafecd6845aa98951dd760a5b33ff9`.

### F01 — Amélioration vidéo classique (WebGL, réglage auto par vidéo) · priorité 1
Statut : VALIDÉ SUR IPHONE (usage réel du propriétaire ; 42 exports reçus en diagnostic du 5 au 10/11, 30 réussis, 12 échecs tous
en 4K → F02). Fichiers : `app.js`, `analyse.js`. Avis propriétaire v3.6–3.7 : « presque parfait », netteté encore à améliorer.
Reste : netteté (« il manque quelque chose »), réglages encore trop proches d'une vidéo à l'autre selon le propriétaire.
Critère de fin : avis favorable du propriétaire sur 5 vidéos de vieux téléphones + aucun échec d'export hors 4K.

### F02 — Reprise des exports 4K après perte du moteur graphique (v6.6) · priorité 1
Statut : INTÉGRÉ NON VALIDÉ. Test simulé `tests/moteur_graphique.test.mjs` (moteur retiré exprès). Aucun diagnostic iPhone 4K reçu
depuis. Critère de fin : 5 exports 4K réussis sur iPhone (diagnostics).

### F03 — Super-résolution IA locale (Real-ESRGAN general v3, WebGPU) · priorité 2
Statut : VALIDÉ SUR IPHONE pour la photo (≈ 30 s) ; vidéo impraticable sur iPhone (26–42 s par mégapixel, mesuré par diagnostics).
Fichiers : `sr.js`, `sr-gpu.js`, `sr.bin`. Licence BSD-3. Reste : la vidéo passe par F04.

### F04 — IA rapide sur serveur gratuit (Kaggle) · priorité 2
Statut : INTÉGRÉ NON VALIDÉ (jamais essayé par le propriétaire sur une vraie vidéo longue). Fichiers : `kaggle.js`, `serveur-ia/`.
Dépend du jeton Kaggle du propriétaire (⚙️ Paramètres). Critère : une vidéo de 4 min 40 traitée de bout en bout depuis l'iPhone.

### F05 — Retrait de filtre de couleur (25 tables apprises) · priorité 1
Statut : VALIDÉ SUR MÉDIAS RÉELS AUTORISÉS (paires avec/sans filtre fournies par le propriétaire) et utilisé sur iPhone en vidéo.
Limite : couleur/lumière seulement ; pas en mode photo. Fichiers : `app.js` (`FLT`), `filtres.png`.

### F06 — Diagnostic des filtres couleur/lumière, tailles de sortie honnêtes · priorité 2
Statut : VALIDÉ SUR DONNÉES SYNTHÉTIQUES (`tests/v67.test.mjs`, 18 cas). Fichier : `analyse.js`.

### F07 — Effacer une zone d'une photo (MI-GAN + sélection EdgeTAM) · priorité 1
Statut : INTÉGRÉ NON VALIDÉ (vérifications v3.3 de `GUIDE_IPHONE.md` jamais faites ; `tests/effacer.test.mjs` demande `migan.onnx`
dans les médias de test). Licences MIT / Apache-2.0. Limite : visages mal reconstruits (modèle appris sur des scènes).

### F08 — Zones de filtre AR proposées sur un visage (photo) · priorité 1
Statut : VALIDÉ SUR DONNÉES SYNTHÉTIQUES (`tests/visage.test.mjs` 12/12, accessoires **dessinés** par le test). Non mesuré sur de
vrais filtres. Fichiers : `visage.js`, `effacer.js`.

### F09 — Suivi vidéo du visage et report de masque · priorité 1
Statut : PROTOTYPE (calculé et testé, relié à rien). Fichier : `visage.js`. Sert de base à F10 et F14.

### F10 — Effacement des accessoires AR en vidéo · priorité 1
Statut : NON COMMENCÉ (la reconstruction image par image n'existe pas). Prérequis : F09 ✔, MI-GAN ✔.

### F11 — Déformations du visage (yeux agrandis, nez, bouche, joues) · priorité 1
Statut : NON COMMENCÉ. Difficulté : aucune image de référence ; piste : repères denses + modèle de proportions moyennes, mesuré sur
le laboratoire F15 avant toute promesse.

### F12 — Retrait du maquillage numérique et du lissage « beauté » · priorité 1
Statut : NON COMMENCÉ (le lissage est seulement **mesuré** dans `analyse.js`). Piste : F13 restaure la texture de la peau d'un visage
lissé — à mesurer sur le laboratoire F15.

### F14 — Restauration des visages en vidéo (cohérente dans le temps) · priorité 1
Statut : NON COMMENCÉ. Prérequis prêts : F13 (modèle, alignement), F09 (suivi lissé).

### F15 — Laboratoire de simulation et d'évaluation des filtres · priorité 1
Statut : NON COMMENCÉ pour les filtres. Existant réutilisable : banc de dégradations contrôlées des visages
(`tests/visage_ia/banc_visages.py`, v6.9) et simulateur de caméra (`tests/camera_simuler.py`).

### F16 — Directeur de traitement (analyse → choix et ordre des modules) · priorité 2
Statut : PROTOTYPE (`ANALYSE.plan()` produit un plan ; l'export ne le suit pas).

### F17 — Anti-scintillement et stabilisation (vidéo) · priorité 2
Statut : INTÉGRÉ NON VALIDÉ (aucune mesure de scintillement sur médias réels). Fichier : `app.js` (`o_defl`, `o_stab`).

### F18 — Vitesse 0,75×–1,30×, Time Repair, images intermédiaires · priorité 3
Statut : INTÉGRÉ NON VALIDÉ (v4.8 : « reste à mesurer sur l'iPhone »).

### F19 — Voix plus claire (RNNoise) · priorité 3
Statut : VALIDÉ SUR IPHONE (dans les exports depuis la v2.3x).

### F20 — Caméra virtuelle (essai) · priorité 3
Statut : INTÉGRÉ NON VALIDÉ. Fichier : `camera.js`.

### F21 — Export « Préparer pour X » · priorité 3
Statut : INTÉGRÉ NON VALIDÉ (l'encodage H.264 ne marche pas dans le navigateur de test).

### F22 — Hors-ligne (PWA) · priorité 3
Statut : INTÉGRÉ NON VALIDÉ sur iPhone ; testé dans Chromium (`tests/sw_reel.test.mjs`, `tests/sw.test.mjs`).

### F23 — Serveur de consentement · priorité 3
Statut : BLOQUÉ PAR UNE DÉPENDANCE EXTERNE (déploiement sur le compte Cloudflare du propriétaire + validation par un juriste).
Code et tests : `serveur-consentement/`, `tests/consentement.test.mjs` (7/7 sur SQLite réel).

### F24 — Collecte de médias pour l'entraînement · priorité 3
Statut : BLOQUÉ PAR UNE DÉPENDANCE EXTERNE (F23 + juriste/DPO). Double verrou d'envoi en place (`contribution.js`).

### F26 — Publicités et Premium · priorité 3
Statut : INTÉGRÉ NON VALIDÉ, **éteints volontairement** (décision du propriétaire).

### F31 — Studio : refonte complète de la composition (v7.2) · priorité 1 (demande du 12/11)
- **Objectif** : ne plus recolorier l'accueil V2.31/V6.9 ; en faire un espace de travail : import au centre, outils par besoin,
  activité réelle, barre d'onglets iPhone, un seul système graphique.
- **Statut** : INTÉGRÉ (Chrome sans écran). Non validé sur iPhone. Remplace F28 (thème Néon, supprimé).
- **Implémenté** : 6 couches de styles successives (v2 → v6.8) remplacées par une seule feuille (jetons clair/sombre neutres,
  accent ambre pour l'action, sarcelle réservée à l'analyse IA) ; composition : barre d'app compacte → zone d'import « table
  lumineuse » (glisser-déposer, Vidéo/Photo) qui se replie en barre quand un média est ouvert → déroulé en 4 étapes qui lit l'état
  réel de l'app → atelier inchangé fonctionnellement ; colonne « Outils » par besoin (Restaurer : photo, vidéo, regrouper ;
  Reconstruire : visages, filtre, effacer, avec badge IA/essai) ; colonne « Activité » = historique réel `recettes` (état vide sinon),
  exemple avant/après réel, confidentialité ; iPhone : une colonne + barre d'onglets fixe (Importer, Outils, Activité, Modèles),
  zones sûres iOS. Supprimés : grand titre promotionnel, texte marketing, 3 gros boutons colorés, bande pellicule, étapes.
- **Fichiers** : `index.html` (styles + composition), `atelier.js` (nouveau : dépôt, outils, déroulé, activité, onglets), `app.js`
  (version), `sw.js` (fichier ajouté, cache v67), `tests/atelier.test.mjs` (nouveau), `tests/pages.test.mjs`, `tests/app.test.mjs`
  (le cas PNG passe en mode expert : il échouait déjà en v7.1 car le choix du format est masqué en mode simple).
- **Tests exécutés** : `atelier` 10/10 ; `pages` 5/5 (dont 14 vues 390 px clair/sombre sans défilement horizontal, contraste) ;
  `studio` 11/11 ; `sw` 8/8 ; `app` (parcours photo + vidéo, voir historique v7.2).
- **Limites** : rendu Safari iOS, toucher et zones sûres non vérifiés sur l'appareil ; glisser-déposer inutile sur iPhone (bouton).
- **Critère de fin** : avis du propriétaire sur iPhone 15 Pro Max (accueil, photo ouverte, export) + aucune régression d'export.
- **Protocole iPhone (2 min)** : ouvrir retoucheproai.com → vérifier que l'en-tête ne déborde pas et que la barre du bas ne cache
  rien → « Photo » → choisir une photo → « Améliorer la photo » → comparer → onglet « Activité » : le traitement apparaît.

### F28 — Thème « Néon » (nouveau design) · priorité 3
Statut : REMPLACÉ par F31 en v7.2 (ancien : INTÉGRÉ NON VALIDÉ).

---

## Historique des livraisons (ne jamais effacer)

### État initial vérifié — v6.8 (11/11/2026, commit 509d2da)
Relevé avant toute modification de cette séance : dépôt `m6ks7r8p78-debug/retouche-video`, branche `main`, site
`retoucheproai.com`. Statuts ci-dessus F01–F28 (hors F13) établis à partir du code, des rapports `AUDIT_INITIAL.md`,
`RAPPORT_TESTS_FINAL.md`, `CHANGELOG.md` et des tests relancés ici (voir v6.9 « non-régression »). Restauration de visage :
« évaluée, non intégrée » (`REGISTRE_MODELES_LICENCES.md`).

### v6.9 (11/11/2026) — restauration des visages sur photo
- **Nouveau** : F13 (voir fiche). Statut F13 : NON COMMENCÉ → VALIDÉ SUR MÉDIAS RÉELS AUTORISÉS (preuves : banc + `tests/rvis.test.mjs`).
- **Modifié** : `models.js` (fiche du modèle), `app.js` (version, module, boutons), `index.html`, `sw.js` (cache v63, modèle exclu du
  cache de l'app), `studio.js` (texte d'autorisation : le modèle peut venir du site de l'app).
- **Tests exécutés** : voir la section « Résultats v6.9 » ci-dessous.
- **Régressions** : voir « Non-régression v6.9 ».
- **Non résolu** : licence commerciale de GFPGAN ; aucune mesure sur iPhone ; vidéo.
- **Sauvegarde / retour arrière** : branche `sauvegarde-v6.8` (= commit 509d2da ; les étiquettes ne peuvent pas être poussées
  depuis cet environnement).
- **Commit** : d810dbf sur `main`. **Déploiement vérifié** le 11/11/2026 : retoucheproai.com sert `VER="v6.9"`, le bouton
  `pickv` et `restauration-visage.js` ; le modèle `modeles/lourds/gfpgan14_int8w.onnx` est servi en entier (85 566 839 octets) avec
  la bonne empreinte SHA-256 (téléchargé et recalculé). Constat : GitHub Pages ignore la reprise par morceaux (réponse 200 à une
  demande « Range ») : un téléchargement coupé recommence du début (le gestionnaire le gère, mais c'est plus long sur mobile).

#### Résultats v6.9 (exécutés dans cette séance, ordinateur Linux, Chromium sans carte graphique)
- `tests/rvis.test.mjs` : **20 réussis, 0 échoué** (après deux échecs corrigés pendant le développement : seuil « déjà net »
  mesuré à la mauvaise échelle — un portrait net était restauré pour rien —, et une erreur du test sur la part inventée).
- Banc Python (`tests/visage_ia/banc_visages.py`) : 25 portraits × 4 dégradations × 2 variantes ; `--js` : 9 sorties de l'app.

#### Non-régression v6.9 (même machine ; chaque échec comparé à la v6.8 d'origine relancée à côté)
| Suite | v6.8 d'origine | v6.9 | Conclusion |
|---|---|---|---|
| sw | 8/8 | 8/8 | ok |
| sw_reel | — | 9/9 | ok |
| v67 | — | 18/18 | ok |
| consentement | — | 7/7 | ok |
| visage | — | 12/12 | ok |
| gestionnaire (modèles) | — | 24/24 (2 non testables) | ok, fiche `gfpgan` ajoutée sans casse |
| studio | — | 11/11 | ok |
| pages | — | 5/5 | ok |
| abo | — | 14/14 | ok |
| natif | — | 10/10 | ok |
| camera / camera_app | — | 24/24 · 12/12 | ok |
| reassemblage | 5/5 | 5/5 | ok (2 échecs vus une fois quand un autre test chargeait la machine : minutage, pas le code) |
| pub | 8/9 | 8/9 | **échec déjà présent en v6.8** (« pub indisponible → téléchargement false ») : à corriger, non lié |
| v3 | 4/7 | 4/7 | **échecs déjà présents en v6.8** (sélecteur de rendu introuvable en 30 s) : à corriger, non lié |
| moteur_graphique | arrêté au bout de 500 s | arrêté au bout de 500 s (identique) | carte graphique simulée trop lente ici ; non concluant |
| noyau | — | s'arrête avant le résumé (déjà noté dans `AUDIT_INITIAL.md`) | non concluant ici |
| effacer, app | non lancées (modèle MI-GAN absent des médias de test ; durée) | — | inchangé |


### F29 — Retrait de filtre guidé par des photos sans filtre de la même personne · priorité 1 (idée du propriétaire, 11/11)
- **Objectif** : la personne importe la photo filtrée, puis 1 à 3 photos d'elle sans filtre ; l'app s'en sert pour retrouver le vrai
  visage (forme, peau, parties cachées par un museau ou des moustaches) au lieu de l'inventer. Usage limité à soi ou à une personne
  consentante. **Exclu** : cagoule, floutage volontaire d'un visage (il n'y a plus rien à retrouver ; avec une référence, ce serait
  coller le visage de quelqu'un sur une personne qui s'est cachée).
- **Statut** : PROTOTYPE (labo Python, `tests/labo_filtres/`). Rien dans l'app.
- **Mesures réelles (12 paires, filtres simulés, vérité connue)** — écart de couleur ΔE dans la zone du filtre (plus bas = mieux) :
  | Filtre | Photo filtrée | Avec référence | Sans référence (remplissage + GFPGAN) |
  |---|---|---|---|
  | museau + moustaches de chien | 96,4 | 42,6 | **25,3** |
  | nez + moustaches de chat | 31,6 | 34,8 | 25,2 |
  Repérage automatique des éléments : chien rappel 95 %, précision 42 % ; chat rappel 20 % (moustaches blanches, petit nez rose
  ratés). Photo SANS filtre passée dans l'outil : elle est encore modifiée (LPIPS 0,039, ΔE 5,3 en moyenne ; jusqu'à 0,14 sur une
  paire) → faux repérages à éliminer avant toute mise en ligne.
  Beauté (v1 du labo, avant désactivation) : lissage ΔE 12,9 → 17,3, maquillage LPIPS 0,011 → 0,059 : **pire que de ne rien faire**.
- **Ce que le labo a appris** :
  1. Les repères MediaPipe sont trop « réguliers » pour mesurer une déformation : des yeux agrandis de 27 % n'y grandissent que de
     6–8 %, un nez affiné de 12 % de 3 %. La taille de l'iris mesurée sur l'image varie de ±14 % d'une vraie photo à l'autre, la
     largeur du bas du visage de ±4 à ±18 % (pose, objectif) : autant que l'effet des filtres. **Défaire automatiquement une
     déformation à partir d'une photo ordinaire n'est pas fiable** (risque de déformer un vrai visage).
  2. Recopier la peau ou une partie du visage d'une AUTRE photo (autre lumière, autre expression) fait des taches et des rides qui
     n'existent pas : c'est moins bon que de redessiner la zone sans référence.
  3. Ce qui marche : repérer un museau ou des moustaches sombres (95 %) et redessiner la zone avec GFPGAN.
- **Reste à faire / pistes** : (a) repérage : précision et moustaches claires ; zéro modification sur photo sans filtre ;
  (b) référence utilisée seulement pour l'identité (comparer et choisir parmi plusieurs reconstructions celle qui ressemble le plus
  à la personne) au lieu de recopier ses pixels ; (c) reconstruction générative conditionnée par l'identité sur serveur gratuit
  (Kaggle, carte graphique) — licences à vérifier une par une ; (d) correction des déformations en mode guidé (curseurs, la
  référence affichée à côté) puisque l'automatique n'est pas fiable.
- **Critère de fin** : sur le labo, chaque filtre mieux que la photo filtrée ET mieux que sans référence ; photo sans filtre
  inchangée ; puis 5 vraies photos Snapchat/Instagram du propriétaire avec ses photos sans filtre ; puis iPhone.
- **Preuve** : `tests/sorties/labo_filtres/*/mesures.json` (non versionné), commande dans `tests/labo_filtres/LISEZMOI.md`.

### Historique — 11/11/2026 (soir) : laboratoire des filtres, essai du retrait guidé par photos sans filtre
- F15 : NON COMMENCÉ → EN DÉVELOPPEMENT. F29 créée : PROTOTYPE. F11, F12 : NON COMMENCÉ → PROTOTYPE (mesurés défavorables).
- Aucune modification de l'app (rien n'a atteint « mieux que l'entrée »). Commit : voir ci-dessous.


### F30 — Retirer les éléments d'un filtre AR d'une photo (museau, moustaches, oreilles, nez, autocollants, lunettes, couronne…) · priorité 1
- **Statut** : VALIDÉ SUR DONNÉES SYNTHÉTIQUES (v7.0). Pas validé sur de vrais filtres Snapchat/Instagram/TikTok ni sur iPhone.
- **Implémenté** : bouton d'accueil « Retirer un filtre du visage (IA, essai) » + bouton après traitement d'une photo ; YuNet →
  cadrage 192×192 de la tête → **détecteur appris** (U-Net 0,39 M paramètres, 1,5 Mo, entraîné ici sur 2 400 + 2 400 exemples du
  laboratoire : vrais portraits du domaine public + éléments AR simulés + graphismes de décor et maquillage appris comme « pas un
  filtre ») → zone limitée à la tête → MI-GAN (moteur d'« Effacer une zone ») → GFPGAN redessine le visage UNIQUEMENT dans la zone
  touchée (+ marge). Carte rose de tout ce qui est reconstruit (inventé), avant/après, enregistrement marqué. Photo sans élément :
  intacte au pixel près.
- **Fichiers** : `defiltre-visage.js` (nouveau), `modeles/lourds/detecteur_ajouts_v2.onnx` (SHA-256 e0ed001f…3059),
  `restauration-visage.js` (`restaurerZone`), `models.js`, `app.js`, `index.html`, `sw.js` ; labo : `tests/labo_filtres/`
  (`ajouts.py`, `entrainer_ajouts.py`, `noyau.retirer_ajouts`) ; test : `tests/dfv.test.mjs` ; médias : `tests/medias/filtres_labo/`.
- **Mesures (personnes JAMAIS vues à l'entraînement)** :
  - Détecteur seul (300 exemples) : précision 90 %, rappel 91 %, IoU 0,83 ; photos sans élément : 0,06 % de pixels signalés.
  - Chaîne Python complète (labo, 7 personnes) — écart de couleur ΔE dans la zone du filtre : chien 92 → 38 ; chien + oreilles 70 → 31 ;
    chat 32 → 13–16 ; éléments au hasard 79 → 26–28 ; photo sans filtre : ΔE 0,02 (inchangée) ; visage lissé/maquillé : inchangé.
  - **Dans l'app (Chromium, vrais modèles, `tests/dfv.test.mjs`)** — écart moyen à la vraie photo dans la zone : chien 55,8 → **24,0**
    (rappel 98 %) ; éléments au hasard 56,1 → **27,8** (rappel 85 %) ; chat 29,0 → **21,8** (rappel 77 %) ; ≈ 22 s par photo (1 fil).
    23 vérifications réussies, 11 échouées : surtout les moustaches fines du chat (seuil exigé : −40 %), deux cas « au hasard »
    (masque sur les yeux : les yeux reconstruits sont faux) et **un faux repérage** : les étoiles d'un drapeau juste à côté de la tête
    (p12) prises pour un autocollant (0,2 % de la photo, visible sur la carte).
- **Limites** : appris sur des éléments SIMULÉS ; un élément qui cache les yeux ou la bouche est remplacé par des traits inventés ;
  graphismes du décor collés à la tête ; une seule photo (pas la vidéo) ; ≈ 22 s sur ordinateur, iPhone non mesuré.
- **Reste à faire** : vrais filtres (protocole iPhone) ; moustaches claires et fines ; vidéo (F10) ; utiliser les photos sans filtre
  pour choisir la reconstruction la plus ressemblante (F29 b).
- **Critère de fin** : 5 vraies photos filtrées du propriétaire (chien, chat, autres) : éléments retirés, aucun faux repérage, avis
  favorable ; puis iPhone (temps, mémoire).
- **Protocole iPhone** : retoucheproai.com → « Retirer un filtre du visage » → choisir une photo Snapchat/Instagram avec museau,
  oreilles ou moustaches → accepter les téléchargements (1,5 + 28 + 86 Mo, une fois) → noter : éléments retirés ou non, ce qui a été
  effacé à tort (bouton « Carte »), temps, et si l'onglet s'est fermé.

### F11 — Déformations du visage : réglage guidé « Proportions » (v7.0)
- **Statut** : INTÉGRÉ, mesuré sur données synthétiques (correction manuelle ; l'automatique reste exclu, voir F29).
- **Implémenté** : dans « Retirer un filtre du visage », bouton « Proportions » : curseurs Yeux (70–115 %), Nez (85–125 %), Bas du visage
  (90–120 %), aperçu immédiat, **photo de comparaison sans filtre** affichée dans un coin (elle reste sur le téléphone : l'idée du
  propriétaire, utilisée pour comparer à l'œil). Mêmes formes de déformation que le labo, appliquées en pleine taille à l'enregistrement.
- **Mesure** (`tests/dfv.test.mjs`) : yeux agrandis de 25 %, curseur à 80 % : écart à la vraie photo autour des yeux 9,5 → 4,0 (p10) ;
  3,3 → 3,1 (p08, petit visage : effet faible) — 1 réussi, 1 sous le seuil exigé.
- **Limite** : repères YuNet (5 points) : le contour du visage est estimé, pas mesuré.

### Historique — v7.0 (11–12/11/2026, nuit)
- Nouveau : F30 (NON COMMENCÉ → VALIDÉ SUR DONNÉES SYNTHÉTIQUES) ; F11 (PROTOTYPE → INTÉGRÉ, réglage guidé). F15 : générateur
  d'éléments AR et de décor, entraînement du détecteur (v1 puis v2).
- Ce qui n'a PAS marché (gardé pour mémoire) : repérage « à la main » (couleur / contours / comparaison avec la référence) : précision
  2 à 43 % ; recopie de la peau ou du nez depuis la photo sans filtre : moins bon que sans référence.
- Non-régression : sw 8/8, v67 18/18, visage 12/12, gestionnaire 24/24, studio 11/11, pages 5/5.
- **Publication v7.0** : code sur `main` (ff141e4, puis relance dec2208). Sauvegarde : branche `sauvegarde-v6.9`. **Mise en ligne NON
  confirmée** au 11/11 22 h 15 : la publication GitHub Pages a échoué (« job not acquired by Runner », panne côté GitHub, aucune
  machine attribuée en 15 min), la relance est en file d'attente. Le site sert encore la v6.9. Les échecs du flux « Apps des stores »
  depuis la v6.7 ont la même cause apparente (15 min puis échec). À vérifier à la reprise : `VER="v7.0"` sur retoucheproai.com.
- 11/11 23 h 40 : site toujours en v6.9 ; relance bloquée en file 21 min annulée, nouvelle publication déclenchée (GitHub Actions/Pages de nouveau « operational »).
- 11/11 23 h 50 : **v7.0 confirmée en ligne** sur retoucheproai.com (`VER="v7.0"`).

### F30 — mise à jour v7.1 (12/11/2026) : appris et mesuré sur de VRAIS filtres Snapchat
- **Statut** : VALIDÉ SUR DONNÉES SYNTHÉTIQUES → **VALIDÉ SUR MÉDIAS RÉELS AUTORISÉS** (une seule personne, 2 vidéos). Pas validé sur iPhone.
- **Médias** (privés, jamais sur le dépôt, accord du propriétaire) : 2 vidéos × ≈ 37 filtres Snapchat. Vidéo « lilas » : l'original sans
  filtre est connu (calage affine + temporel automatique) ; vidéo « noire » : pas d'original, comparaison avec un clip sans élément.
  Éléments réels trouvés : fleurs (2 modèles), cornes + cœur, textes « cute » sur le visage, « mood: », crâne chauve + moustache.
  Masques exacts obtenus par différence avec la référence. Cagoules exclues (visage volontairement caché).
- **Constat v7.0 sur vrais filtres** : rappel 27 % / 12 %, précision 39 % / 13 % ; signalait les vraies lunettes, les lèvres, la fumée,
  les ongles et le piercing ; **100 % des images sans élément de la vidéo « noire » modifiées** (≈ 1 % de la photo).
- **v7.1** : détecteur v3 (`entrainer_ajouts_v3.py` : v2 + 359 visages NASA + vrais clips + éléments réels recollés ; le « crâne chauve »
  est EXCLU de l'apprentissage : il apprenait à signaler les vrais crânes chauves, vu sur le banc) + **veto mains** (`mains.js`,
  MediaPipe Hand Landmarker, Apache-2.0 : une composante posée à plus de moitié sur une main n'est pas effacée).
- **Mesures (validation croisée : entraîné sur une vidéo, mesuré sur l'autre ; réglages de l'app seuil 0,6, taille 0,04 ; veto)** :
  | | v7.0 lilas | v7.1 lilas | v7.0 noire | v7.1 noire |
  |---|---|---|---|---|
  | précision | 39 % | **93 %** | 13 % | **87 %** |
  | éléments retrouvés (rappel) | 27 % | **66 %** | 12 % | **75 %** |
  | pixels effacés à tort (images sans élément) | 0,129 % | **0,012 %** | 1,04 % | **0,155 %** |
  | images sans élément touchées | 88 % | 45 % | 100 % | 85 % (vraies lunettes : absentes de la vidéo d'entraînement) |
  Veto mains seul (détecteur v3, vidéo lilas) : pixels faux 0,050 % → 0,012 %, précision 87 % → 93 %, rappel 67 % → 66 %.
- **Dans l'app (Chromium, YuNet, vrais modèles)** : modèle final, 23 images de tes clips : 12/12 images sans élément intactes (v7.0 :
  0/12, 0,35–1,9 % de la photo modifiée) ; éléments retrouvés 46–84 % (v7.0 ≈ 20 %). (Images vues à l'entraînement : contrôle de la
  chaîne, pas une validation ; la validation est le tableau ci-dessus.)
- **Banc simulé** (`tests/dfv.test.mjs`) : 23 réussis / 11 échoués, comme v7.0 (moyennes : chien rappel 98 → 94 %, chat 77 → 71 %,
  hasard 85 → 84 % ; écarts dans la zone quasi identiques). Photo sans filtre et crâne chauve : intacts.
- **Non-régression** : sw 8/8, v67 18/18, visage 12/12, gestionnaire 24/24, studio 11/11, pages 5/5.
- **Limites** : une seule personne (à confirmer sur d'autres visages) ; vraies lunettes encore parfois signalées si jamais vues ;
  éléments jamais vus (crâne chauve) non retirés ; « mood: » (texte minuscule) raté ; veto : +22 Mo à télécharger une fois.
- **Reste à faire** : protocole iPhone ; photos filtrées d'autres personnes (avec accord) ; lunettes ; vidéo (F10).

### F11, F12, F29 — mesures v7.1 sur vraies paires (vidéo lilas, original connu)
- **F11 proportions** : déformations réelles mesurées (flux optique, repère du visage) : ≈ 1 % du visage (2–4 px sur 256), 2 filtres
  forts (≈ 14 px). Correction automatique par le champ moyen (validation « un filtre écarté ») : écart 1,29 → 1,31 px (**pas mieux**),
  et elle abîme les filtres qui ne déforment pas. Automatique toujours exclu ; réglage guidé gardé.
- **F12 lissage / maquillage** : 35 paires, LPIPS visage : rien 0,176 ; GFPGAN 100 % 0,238 ; GFPGAN 50 % 0,180 ; grain 0,260.
  La vidéo d'origine (publiée, compressée) n'a pas plus de texture que les versions filtrées : **aucune méthode ne fait mieux que
  l'entrée**. Lèvres : l'original porte déjà du rouge à lèvres → pas de vérité « sans maquillage » ; rien n'est intégré.
- **F29 référence** : une photo de référence (autre vidéo, autre jour) n'aide pas à écarter les faux repérages réels (aspect médian
  ΔE 20,8 pour les vrais éléments, 22,5 pour les faux) ; les faux venaient surtout des mains → veto mains.

### Historique — v7.1 (12/11/2026)
- F30 : VALIDÉ SUR DONNÉES SYNTHÉTIQUES → VALIDÉ SUR MÉDIAS RÉELS AUTORISÉS (détecteur v3 + veto mains). F15 : vrais clips, NASA.
- F11 : correction automatique mesurée inutile sur vrais filtres. F12 : mesuré, pas mieux que l'entrée. F29 : référence sans effet mesurable.
- Ce qui n'a pas marché (gardé pour mémoire) : apprendre le « crâne chauve » (signale les vrais crânes) ; filtre par photo de
  référence ; seuil/taille seuls (ne suppriment pas les faux « sûrs d'eux » : ongles, cigarette).

- 12/11 : **v7.1 confirmée en ligne** sur retoucheproai.com (`VER="v7.1"`, détecteur v3 et fichiers « mains » servis).

### Historique — v7.2 (12/11/2026)
- F31 (nouveau) : studio — composition refaite, une seule feuille de styles, `atelier.js`. F28 → remplacé.
- Échec déjà présent en v7.1 corrigé dans le test : « Photo au format PNG » (le format est un réglage du mode expert).
