# RetoucheProAI — recherche neural rendering (DLSS 5) et pilote AR v4
Date : 14 novembre 2026. Statut : **recherche uniquement**, branche expérimentale `chatgpt-ai-director-v01`, PR #1 brouillon.

## 1. DLSS 5 : documentation vérifiée, pas un composant disponible dans RetoucheProAI

Références officielles :
- https://research.nvidia.com/labs/adlr/DLSS5/ (publication 1er septembre 2026 : rendu génératif guidé 3D, frame courante, vecteurs de mouvement moteur, état temporel causal, diffusion une étape).
- https://developer.nvidia.com/blog/whats-new-for-game-developers-dlss-5-with-3d-guided-neural-rendering-nvidia-ace-updates-and-new-rtx-kit-capabilities/ (22 septembre 2026 : contrôle structure/tone, masques, RTX 50).
- https://forums.developer.nvidia.com/t/official-dlss-5-neural-rendering-plugin-access-for-unreal-engine-5-8-2/382731 (réponse modérateur NVIDIA 9 novembre : **SDK DLSS 5 non public**, partenaires uniquement).

DLSS 5 n'est pas un filtre générique de retouche vidéo sur iPhone. Son système exploite les tampons des moteurs 3D, qui n'existent pas dans les vidéos 2D importées. Ni licence SDK utilisable, ni backend NVIDIA sur Safari iPhone 15 Pro Max. Aucune intégration réelle DLSS 5, aucune imitation commercialisée comme « DLSS 5 », aucun chargement de poids NVIDIA et aucune prétention d'avoir reconstruit des détails originaux cachés.

### Principes transposables pour un moteur vidéo 2D distinct
1. Construire une référence structurelle **à partir des images d'origine**, avec confiance par zone et choix du mode fidélité / créativité.
2. Suivi temporel causal (flux optique **estimé**, pas vecteurs fournis par moteur 3D) ; réinitialiser après coupe ou erreur d'alignement.
3. Masquage explicite pour protéger les régions non ciblées, visages, géométrie et contours ; rejeter toute intervention en dehors du masque choisi pour une restitution fidèle.
4. Réconstruction générative facultative et signalée (« pixels inventés »), avec accord / contrôle spécifique lorsque les pixels originaux sont occultés ; préserver l'original accessible.
5. Budget mémoire, latence, batterie, modèles sous licence compatible, repli non génératif ; tests sur véritable Safari et pas seulement Chromium/SwiftShader.

`outils/directeur-garde-fou-neural.cjs` implémente **uniquement un contrôle de données numériques anonymisées**, pas de rendu ou d'inférence ; `planifierRenduNeuronal` expose les blocages et ne peut jamais activer un traitement. `tests/directeur-garde-fou-neural.test.mjs` en vérifie les garde-fous.

## 2. Pilote privé de segmentation d'éléments AR v4 — essai réel d'entraînement, références AR synthétiques

Le segmentateur antérieur a été **affiné pendant 180 étapes** sur 12 vidéos privées consenties (24 frames sources) en conservant 4 vidéos distinctes (8 frames fonds) pour validation. L'entraînement utilise des incrustations **procédurales** (petit nez/moustaches chat, chien, lunettes et absence d'effet) sur des images de ces vidéos, puis bruit, JPEG et transformations rotation/zoom/redimensionnement. Les labels des incrustations sont artificiels ; ce ne sont pas les vrais masques de filtres déjà présents dans les vidéos.

Validation de l'affinage : **96 cas synthétiques** (4 groupes).
- IoU chat : 0,0963 ancien → 0,3792 affiné.
- IoU chien : 0,0205 → 0,3371.
- IoU lunettes : 0,0707 → 0,1747.
- Faux positifs pixels témoins : 35,3973 % → 0,2838 %.

Contre-évaluation **sur trois autres vidéos et 72 nouveaux cas synthétiques** :
- IoU chat : 0,1025 → 0,2893.
- IoU chien : 0,0398 → 0,2226.
- IoU lunettes : 0,0468 → 0,0880.
- Faux positifs pixels témoins : 23,0808 % → **1,4594 %** ; **échec du seuil strict de 1 %**.

**Verdict : CANDIDAT REJETÉ POUR ACTIVATION**, même si les trois types progressent sur la simulation. L'IoU chat de confirmation demeure sous 50 %, aucune vraie annotation AR vérifiée, aucun test iPhone. La première version du modèle a déjà été exposée à une partie du corpus de 157 vidéos lors d'un entraînement ancien ; ces trois autres vidéos sont indépendantes de l'affinage récent, **pas forcément de l'entraînement historique**.

La décision expérimentale ne doit pas être confondue avec la qualité du module réel de retrait de filtre dans l'application, qui reste faible sur les benchmarks précédents. Aucun poids n'est activé ou déployé ; scripts, mesures individuelles, autorisations, poids affiné et vidéos demeurent dans le laboratoire privé ChatGPT et **hors du dépôt public**.

### Garde-fous versionnés
`auditerCandidatAr` refuse les faux positifs témoins supérieurs à 1 %, l'IoU chat sous 0,50, la régression d'autres filtres, les jeux trop petits, les masques non validés et l'absence d'essai iPhone. Même si tout passe, seul un examen humain peut autoriser un futur déploiement. Les entrées restent numériques et non identifiantes.

## 3. Prochaines recherches, par ordre de priorité
1. **Filtres AR** : jeux de masques temporels corrigés/vérifiés sur des scènes indépendantes, puis test de rappel, IoU et faux positifs. Séparer nouvelles scènes d'entraînement, de validation, de test final et de préentraînement historique ; ne pas calibrer au jugé sur le test scellé.
2. Robustesse petit nez clair/moustaches sous compression réelle, taille/pose ; réduction des faux positifs hors effet, reprise de la segmentation ou méthode classique selon difficulté.
3. **Rendu vidéo 2D inspiré des principes du neural rendering** : banc temporel multi-frames sans réinvention des détails, mesures de fidélité hors masque, stabilité, identité, géométrie, coût local.
4. Tests iPhone Safari, comparaisons avant/après en mode fidèle et en mode créatif explicite, puis décision d'intégration sur des preuves.

**Garde-fous immuables :** jamais d'auto-publication de médias privés, d'entraînement dans GitHub Actions sur ces médias, d'activation de modèle non validé, de fusion sur `main` ou de déploiement automatique.
