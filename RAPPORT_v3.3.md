# Rapport v3.3 — Effacer une zone (4 novembre 2026)

Environnement de travail : conteneur Linux, Chrome sans écran (Playwright), GPU **simulé** (SwiftShader), ONNX Runtime Web en WebAssembly
(1 fil : le site n’est pas « isolé » entre origines, comme sur GitHub Pages). **Aucun iPhone n’était disponible : rien n’a été essayé sur un vrai appareil.**

## 1. Audit préalable de la v3.2 (avant toute modification)

| Contrôle | Résultat |
|---|---|
| Dépôt | `m6ks7r8p78-debug/retouche-video` (GitHub), branche principale `main` |
| Dernier commit de `main` | `b458e8d` (4 nov. 2026, 20:27) « v3.2 : rapport de tests… » ; identique à la branche `audit-v3.2` |
| Version dans le code | `VER="v3.2"` (`index.html`), cache `retouche-v22` (`sw.js`) |
| Version publiée | `https://m6ks7r8p78-debug.github.io/Retouche-video/` sert `VER="v3.2"` ; tailles des fichiers identiques au dépôt |
| Serveur Cloudflare | `retouche-serveur…workers.dev/etat` → `{"ok":true,"version":"5"}` |
| Correctif 1 — modèles et /radar/ gardés | présent : `sw.js` ne retire que `retouche-vN` anciens ; ignore `/radar/` |
| Correctif 2 — injection par sauvegarde | présent : `esc()` sur chaque champ de l’historique (`studio.js`) |
| Correctif 3 — polices locales | présent : aucune adresse `googleapis`/`gstatic` dans le code ; `polices/` |
| Correctif 4 — secours mp4-muxer + diagnostic | présent : SRI `sha384-Sujeb…ptj`, **recalculée** sur `mp4-muxer.js` local : identique ; autorisation `diagnostic` + bouton « Autoriser » |
| Sauvegardes `sauvegarde-v2.49 / v2.50 / v3.0 / v3.1` | existent ; chacune récupérée et ouverte : `VER` = v2.49 / v2.50 / v3.0 / v3.1, 26 / 56 / 81 / 82 fichiers, même `sr.bin` → **restaurables** |
| Empreintes des fichiers livrés | `sr.bin`, `filtres.png`, `rnnoise.mjs` = empreintes déclarées dans `models.js` |
| Modèle de relief | téléchargé à l’adresse figée : `fcf51f1b…f20d` = empreinte déclarée |

Conclusion : la v3.2 est identifiée avec certitude ; base de référence vérifiable. Sauvegarde créée **avant** toute modification :
branche `sauvegarde-v3.2` = `b458e8d`.

## 2. Tests de référence de la v3.2 (copie propre)

RESULTATS_V32

## 3. Nouveautés v3.3

**A. Résumé**
- Outil **Effacer une zone** (accueil, ou depuis une photo améliorée) : pinceau, gomme, zoom/déplacement, reconstruction MI-GAN,
  proposition à garder ou refuser, annuler, recommencer, revenir à l’original, exports.
- **Sélection au toucher** (EdgeTAM) : un toucher propose le contour d’un élément (objet, accessoire, élément de filtre AR).
- **Carte des zones inventées** : trois versions (original, résultat, carte), opacité réglable, badge permanent, carte exportable
  en pleine taille, **fiche de provenance** JSON, historique.
- 3 modèles au gestionnaire (adresses figées, SHA-256, licences, secours) ; assistant « Dis ce que tu veux » qui oriente vers l’outil.

**B. Corrections**
- Message trompeur corrigé (pendant le développement) : un téléchargement refusé disait « la partie reçue est gardée ».
- Collision de style corrigée (pendant le développement) : les boutons de l’outil héritaient d’émojis décoratifs de l’app.
- Collision de port entre deux suites de tests (8768) évitée.

**C. Réellement opérationnel (testé de bout en bout, vrais modèles, navigateur d’ordinateur)**
- Effacement réel sur photo ; hors de la zone, **0 pixel modifié** (contrôlé sur 600×400 et 4032×3024).
- Masque modifiable (pinceau, gomme, recommencer, annuler) ; sélection au toucher.
- Zones générées visibles (carte, badge), original préservé (copie figée, « Revenir à l’original » exact au pixel près).
- Comparaison avant / après (bouton à maintenir + vue Original).
- Exports JPEG, PNG (identique au pixel près au résultat), carte, provenance.
- Gestion des modèles sécurisée : téléchargement refusé = aucune requête ; fichier abîmé = refusé, non installé.

**D. Expérimental / à confirmer**
- Toute la partie iPhone (vitesse, mémoire, gestes tactiles réels, HEIC, feuille de partage) : non vérifiée physiquement.
- **SAM 2.1** : étudié, **non intégré** (même usage qu’EdgeTAM, 7× plus lourd). **EdgeTAM** : **intégré** pour les photos.
- Suppression de filtres AR : faisable avec l’outil (toucher + effacer), mais le résultat est une **invention** ;
  aucune promesse de retrouver le visage d’origine. Qualité sur visage non mesurée (le modèle a appris sur des scènes).

## 4. Tests de la v3.3 (copie propre de la branche, clonée à neuf)

RESULTATS_V33

Contre-épreuve (les tests doivent échouer quand on introduit un défaut), sur `tests/effacer.test.mjs` :
- défaut 1 — la reconstruction recopie tout le rectangle de contexte au lieu de la seule zone : **5 échecs** (pixels hors zone modifiés : 4 489 / 3 183 / 13 245) ;
- défaut 2 — la carte des zones inventées n’est plus remplie : **5 échecs** (0 pixel marqué alors que 16 081 changent).
Le code a ensuite été rétabli à l’identique (`cmp`).

## 5. Mesures (Chrome d’ordinateur, processeur, 1 fil — PAS un iPhone)

| Mesure | Valeur |
|---|---|
| MI-GAN, reconstruction d’une zone (photo 600×400) | 2,3–2,6 s |
| MI-GAN, zone sur photo 12 Mpx (4032×3024) | 2,9–3,2 s (calcul à 512 px autour de la zone) |
| EdgeTAM, lecture de la photo (une fois par état) | 2,8 s |
| EdgeTAM, contour à chaque toucher | 0,3 s |
| Téléchargements (une fois) | MI-GAN 28,1 Mo ; EdgeTAM 19,5 + 21,0 Mo |
| Mémoire | non mesurée (le navigateur de test n’expose pas la mémoire de façon fiable) ; estimée : photo de travail + masque = 8 octets/pixel (≈ 100 Mo à 12 Mpx), carte 1 octet/pixel, modèles ≈ 70 Mo, cartes EdgeTAM ≈ 17 Mo |

## 6. Compatibilité iPhone

| Point | État |
|---|---|
| Safari iOS, WebAssembly, ONNX Runtime Web 1.22 | même moteur que le relief (déjà utilisé) — **non revérifié sur iPhone en v3.3** |
| Import Photos / Fichiers, JPEG, PNG | testé dans Chrome (PNG, JPEG) |
| HEIC | **non testable ici** (Chrome ne lit pas le HEIC ; Safari oui) |
| Grandes photos | 12 Mpx testé ; > 16 Mpx réduite (limite des zones de dessin de Safari) — testé avec 20 Mpx |
| Zoom tactile, masque au doigt | gestes à deux doigts écrits pour le tactile ; **testés seulement à la souris** |
| WebGPU / WebGL2 | non utilisés par l’outil (processeur) ; GPU simulé seulement dans les autres suites |
| Interruption / reprise | l’original n’est jamais touché ; pas de reprise d’une édition après fermeture de Safari |
| Export | testé (JPEG, PNG, carte, JSON) ; feuille de partage iOS non testée |

Liste des vérifications à faire sur ton iPhone : GUIDE_IPHONE.md, section v3.3.

## 7. Coûts et limitations

- **Coût : 0 €.** Modèles gratuits (MIT, Apache-2.0), calcul sur le téléphone, hébergement GitHub Pages. Aucun service payant, aucun abonnement.
- Cloud : non intégré (inutile pour ces modèles). Quotas officiels ZeroGPU relevés : GUIDE_CLOUD_GRATUIT.md.
- Limites : grandes zones floues ou répétitives (512 px) ; visages, mains, textes souvent mal remplis ; photo > 16 Mpx réduite ;
  métadonnées non conservées à l’export ; pas de vidéo.
- Licences : tout ce qui est intégré permet l’usage commercial (avec mention) — compatible avec un futur abonnement.
  ProPainter, CodeFormer, CompleteMe : **non commerciaux**, écartés.

## 8. Extension vidéo — préparée, non réalisée

Chaîne prévue, avec les pièces déjà présentes : extraction des images (décodeur WebCodecs de l’app) → masque de la 1re image
(pinceau / toucher) → propagation (EdgeTAM sur chaque image, avec le centre du masque précédent comme point ; EdgeTAM est conçu
pour le suivi vidéo, mais sa **mémoire de suivi n’est pas dans l’export ONNX utilisé**) → MI-GAN image par image → contrôle du
scintillement (comparaison des zones entre images voisines, mélange temporel) → réassemblage (encodeur de l’app) → export.
Risque connu : MI-GAN image par image scintille (pas de cohérence temporelle) ; un vrai remplissage vidéo (ProPainter) est non commercial
et demande un GPU de plusieurs Go. **Rien de cela n’est déclaré opérationnel** : aucune séquence réelle n’a été traitée.

## 9. Livraison

LIVRAISON
