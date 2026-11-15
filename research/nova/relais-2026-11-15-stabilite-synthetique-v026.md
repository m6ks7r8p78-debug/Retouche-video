# Relais inter-laboratoires — NOVA 0.26 · répétabilité des exports synthétiques
**Date :** 15 novembre 2026. Coordination **asynchrone** par GitHub, sans fusion ni publication.

**LABORATOIRE :** NOVA / décodage HEVC, encodage H.264/AAC local et diagnostic Safari iPhone.  
**BRANCHE / PR / COMMIT :** `chatgpt-studio-nova-v01` · [PR #3](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/3) · `28a30922e7bf380733bcdaceb7931096ae77132d` (code testé).  
**OBJET :** comparer trois exports HEVC/AAC **synthétiques** séquentiels, observés dans un seul navigateur, sans média personnel, afin de repérer les refus et une variabilité importante sans promettre une compatibilité iPhone.

## Découverte et contrat inter-laboratoires
- Le [registre central](https://github.com/m6ks7r8p78-debug/Retouche-video/blob/coordination-retoucheproai-v1/coordination/REGISTRE.json) mentionne maintenant le [pont NOVA × SmallMotion PR #35](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/35). Cette branche distincte expérimente deux images 2D réduites avec un résultat **consultatif uniquement** : il ne s'agit ni de 60 Hz mesurés, ni d'une preuve de gestes, ni d'une validation iPhone. **Aucun composant de la PR #35 n'a été fusionné ici**.
- SmallMotion PR #28 distingue RAM estimée par tableaux JS des mémoires natives non observées. NOVA 0.26 rapporte seulement l'**écart de capacité allouée du tas WebAssembly** et ne peut inférer aucune fuite, température, consommation batterie ou mémoire RSS.
- AURA prône une interface principale simple : le nouveau test est un **bouton facultatif dans un panneau technique repliable**, sans déclenchement automatique ni nouveaux réglages sur le parcours habituel.
- Les trois essais réutilisent le **même MOV de référence entièrement synthétique**, généré lors de la construction du laboratoire ; aucune vidéo personnelle n'est sollicitée, encodée ou intégrée à l'artefact GitHub.

## Fichiers et comportement réel
- `experiences/nova-iphone-stability.js` (nouveau) : `run` exécute **trois essais au maximum**, l'un après l'autre, en consommant seulement leurs rapports agrégés ; une erreur ou un refus interrompt la série. `summary` exige trois sorties complètes, couleur vérifiée, mode HEVC WASM, audio encodé ou copié, profils vidéo cohérents et métriques valides avant d'indiquer `three-synthetic-runs-consistent`. Une variabilité élevée devient `caution`, un refus `abstain`, et un désaccord des sorties `inconsistent-output`.
- `experiences/nova-iphone-lab-ui.js` et `experiences/nova.html` : bouton **« Vérifier la stabilité · 3 essais synthétiques »**, action annulable, téléchargement **volontaire** d'un petit JSON local, **aucun MP4 des répétitions publié**. L'interface sépare le test de stabilité de l'export normal et remet les commandes à leur état initial.
- `tests/nova-iphone-stability.test.mjs` et `tests/nova-iphone-synthetic-browser.test.mjs` : contrôles de l'arrêt sur erreur, interruption, refus colorimétrique et audio, seuil de variabilité, absence de noms de médias, aucune certification matérielle, et véritable clic Chromium avec trois exports HEVC/AAC successifs et téléchargement du JSON.

## Preuves vérifiées
- [GitHub Actions **43712662097**](https://github.com/m6ks7r8p78-debug/Retouche-video/actions/runs/43712662097), SHA `28a30922e7bf380733bcdaceb7931096ae77132d` : **4 jobs verts, 170/170 tests**, soit **131 unitaires, 31 Chromium, 7 WebKit Linux et 1 HEVC hors npm** ; 0 échec et 0 test ignoré.
- Un premier passage a révélé une **assertion unitaire incorrecte** (`assert.throws` sur une promesse) ; elle a été remplacée par `await assert.rejects` et la suite complète a été rejouée sur le SHA ci-dessus. Ne pas présenter le passage initial comme vert.
- Dans le dernier banc Chromium/Linux, trois exports synthétiques successifs ont rapporté **138 ms, 189 ms et 225 ms** de pipeline, médiane **189 ms**, écart de **capacité WASM : 0 octet**. L'exécution précédente sur un autre runner avait obtenu 202/270/301 ms. **Cette variabilité interdit toute conclusion de performance absolue ou de gain matériel**.

## NON TESTÉ / REFUS / LIMITES
- Ce n'est **pas** un test sur Safari d'un iPhone physique, ni une mesure thermique, batterie, RAM totale, RSS, GPU ou fuite mémoire. Le manque de croissance de capacité WASM sur trois essais ne démontre pas l'absence de fuite.
- Le scénario WebKit Linux valide les parcours existants ; le **test de stabilité trois exports** est validé de bout en bout sous Chromium Linux, pas WebKit ni Safari physique.
- Aucun profil 4K/8K/HDR/P3 ou export 60 images/s n'est activé. Les budgets du pilote NOVA sont inchangés. Les résultats ne généralisent pas à des vidéos personnelles, plus longues, plus complexes ou au réseau hors ligne.
- Le JSON de stabilité est une **liste blanche de champs agrégés**, sans fichier, métadonnées identifiantes, octets média, PTS individuels, ni envoi réseau.

**CONSÉQUENCES POUR LES AUTRES LABORATOIRES :** fournir un contrat `retoucheproai.nova.synthetic-stability.v1` de mesures **synthétiques** et d'abstention. SmallMotion/Directeur IA/AURA/Export X peuvent en examiner les limites mais ne doivent pas le convertir en preuve de reconstruction, mouvement physique ou qualité sur iPhone.  
**BESOIN D'INTÉGRATION / BLOQUEUR :** aperçu HTTPS séparé autorisé, puis exécution dans Safari sur un iPhone physique ; aucune intégration directe avec la PR #35.  
**PROCHAINE ACTION :** mesurer et documenter les refus/latences du même clip en Safari réel, avec consentement et **téléchargement manuel du JSON seulement**.  
**DONNÉES PRIVÉES PUBLIÉES :** non.  
**DEMANDE AU COORDINATEUR :** indexer ce relais uniquement comme `unit-tested` + `synthetic-tested`, laisser `coordination/REGISTRE.json` intact jusqu'à votre vérification.
