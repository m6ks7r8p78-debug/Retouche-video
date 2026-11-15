# RetoucheProAI — Film Studio IA : contrat v0.1 (15 novembre 2026)

## Vision validée
Un adulte de 18 à 75 ans et plus décrit librement son film en français ou fournit une photo/vidéo de référence, choisit ses personnages, décors, gestes, interactions, conversations, durée, cadrage et rendu. L'application vise un parcours **import ou description → préparer → vérifier → créer un film** avec options avancées discrètes. La destination finale est un film vidéo/audio exportable, idéalement avec plusieurs personnages persistants.

## Réalité technique au 15/11/2026
- `studio-3d/generateur.js` (laboratoire v1.9 de la branche de base) génère des personnages **stylisés procéduraux**, dont des gestes limités comme marcher sur place, fumer ou saluer. Il ne produit pas de cinéma photoréaliste.
- Les travaux `research/3d-camera-v43/` relèvent de l'**estimation de mouvement 2D**, pas d'un avatar humain réaliste.
- Le laboratoire Cinema P30 est une **démonstration synthétique de mesures vidéo**, non un moteur texte→film.
- NOVA traite/restaure des médias ; il ne génère pas ces personnages et scènes.
- `film-project-v01.mjs` est **un contrat de scénario local et déterministe** : il extrait quelques intentions, les ordonne en scènes et refuse les références non autorisées. Il ne lit pas la photo/vidéo, ne restitue pas un visage et ne produit pas de MP4. Une analyse de texte complexe exigera un modèle de compréhension dédié et des tests.

## Pipeline cible (non implémenté en totalité)
1. **Directeur de film** : prompt libre → scénario structuré, questions uniquement en cas d'impossibilité réelle, plan de scènes.
2. **Biblio d'acteurs** : personnages synthétiques, ou reconstruction fidèle à partir de références avec provenance/droits et consentements spécifiques.
3. **Mouvement et objets** : gestes continus, contacts main–tasse, main–bouche, poses assises, marche réelle, interactions à plusieurs.
4. **Parole et voix** : dialogues, synchronisation labiale, émotions vocales ; reproduction d'une voix réelle soumise à un consentement distinct.
5. **Décors/caméras/lumière** : continuité des vêtements, regards, identité, géométrie et éclairage entre plans.
6. **Rendu et montage** : clips cohérents → assemblage → son synchronisé → export contrôlé MP4, avec traitements NOVA optionnels.
7. **Vérification** : identité et mouvement cohérents, physique plausible, absence de clignotement, contenu conforme, latence/coût/qualité mesurés.

## Interfaces prévues pour la suite
- Entrée : `{prompt, references?:[{kind:'photo'|'video', rightsConfirmed, depictsRealPerson, likenessConsent, cloneVoice, voiceConsent}]}`.
- Sortie actuelle : JSON `retoucheproai.film-project.v0.1`, étapes `planifie_non_anime`, état explicite `renderAvailable:false`.
- Références : **métadonnées de consentement seulement** ; jamais de média, d'URL, de nom, de visage ou de voix dans cette sortie.
- Toute vraie ingestion, persistance, reconstruction, réutilisation pour entraînement, partage et diffusion exigera des fonctions d'autorisation et de révocation propres à chaque usage.
- I001 et les personnes dont les droits/consentements sont incertains ne doivent pas entrer dans un entraînement d'identité ou de voix sans clarification.
- Les 157 vidéos de recherche et les poids privés ne vont **jamais** dans le dépôt public.

## Critères mesurables pour franchir le prochain palier
- Tests unitaires verts pour ordre, actions, négations, refus de référence et séparation consentement apparence/voix.
- Première scène de **personnage synthétique inédit**, sans média privé : assis → boit → pose tasse → parle, avec animation 3D observable et sans annoncer le photoréalisme.
- Vérification indépendante des contacts main-objet, persistance du personnage et synchronisation éventuelle du dialogue.
- Pas de fusion, déploiement ni promesse de rendu complet avant preuves réelles sur le navigateur cible, en particulier Safari iPhone.

## Premier pont fonctionnel vers les personnages 3D (v0.1)
- `film-preview-v01.mjs` appelle explicitement le **générateur procédural v1.9 déjà existant** pour une demande sans référence privée décrivant un seul personnage adulte. Il retourne les **octets d'un vrai GLB stylisé** et les étapes scénaristiques en attente.
- Un scénario à deux personnages ou une demande de reconstruction de personne réelle restent au stade JSON ; aucune fausse prétention de rendu n'est faite.
- `film-preview-v01.test.mjs` ajoute quatre tests Node (en-tête glTF, refus multi-personnages, refus de réutiliser une référence privée, signalement des gestes non animés). Ils sont exécutés avec les huit tests du plan par `.github/workflows/ci-film-studio-v01.yml`.
- **Attention :** le GLB n'est ni une vidéo ni un acteur photoréaliste ; les gestes boire, poser tasse, s'asseoir, parler, synchroniser les lèvres ne sont pas encore animés. Aucun média privé n'est traité.


## Suite expérimentale — Film Studio v0.2 (15 novembre 2026)

### Code livré sur la même PR en brouillon
- film-sequence-v02.mjs : **GLB 2.0 réellement animé** par le générateur procédural v1.9. Une seule scène, un personnage original, dix gestes maximum : s’asseoir (approximation), boire, poser la tasse, parler (bouche muette), regarder, sourire.
- Chaise, table et deux représentations **substituées** de la tasse : l’objet de table est masqué pendant que la copie suivie par le poignet est montrée, puis inversement. Cette substitution reste une **illusion visuelle**, pas une mesure physique du contact.
- Continuité du personnage et de ses matériaux dans le GLB ; pistes temporelles glTF, aucun rendu vidéo. Assise simulée par échelle verticale et rotations simplifiées, pas une cinématique réaliste.
- Les actions non prises en charge sont rapportées. Refus des scènes multiples, acteurs multiples, références photo/vidéo réelles même consenties, boisson non décrite, dépôt de tasse avant prise, demandes sans geste reconnu. Aucun média de référence n’est chargé.
- film-studio-v02.html + film-ui-v02.mjs : écran tactile local français, un champ texte/un bouton, compte-rendu du scénario et fichier GLB téléchargeable seulement sur action explicite. Aucun envoi, API réseau ou bibliothèque externe ; aucun déploiement.
- Tests de film-sequence-v02.test.mjs : structure GLB, animation, chronologie et refus ; film-ui-v02.test.mjs : bouton/export/refus avec DOM simulé, qui **n’est pas** une validation Safari.

### Limites non franchies
- Aucun film MP4, dialogue audio, synchronisation labiale, caméra, mouvement réellement physique, décor réaliste, IA neuronale générative, reconstruction depuis photo/vidéo ou modèle entraîné.
- Vérification GLB **structurelle** : elle ne prouve ni qualité visuelle ni contact main-tasse. Test dans un vrai moteur 3D et inspection humaine restent nécessaires.
- Page non déployée ; Safari iPhone réel non validé. Les 157 vidéos, photos privées et voix ne sont ni chargées ni publiées.
- NOVA, Cinema, et le site public restent inchangés. Ne pas fusionner ou diffuser automatiquement.

### Prochain jalon
1. Contact main-objet mesuré, prise/dépôt continus, vraie cinématique articulée pour l’assise.
2. Visualiseur local en navigateur Safari avec inspection et performance iPhone.
3. Continuité multi-personnages et multi-plans, dialogues audibles puis sortie MP4 avec consentements distincts.


## Film Studio v0.3 — preview local + continuité d’ancrage (15 novembre 2026)

### Modifications réalisées
- film-viewer-v03.mjs lit les vrais blocs JSON/BIN et pistes LINEAR d’un GLB glTF 2.0 **synthétique**. Animation échantillonnée dans les temps source, hiérarchie de matrices de transformation 4×4 conforme au modèle TRS ; rendu **approché** des volumes sphériques sur Canvas 2D, sans bibliothèque ni réseau. Ce n’est **pas** un vrai rendu maillage GPU ou photoréaliste.
- film-studio-v03.html / film-ui-v03.mjs : champ texte, bouton de création, visualisation sur écran mobile, lecture/pause, frise navigable et pivot tactile, export explicite du GLB. Lorsque le scénario est refusé, le précédent lien d’export est retiré. Aucune photo ou vidéo réelle importée.
- generateur.js : correction importante du type glTF des canaux de **translation** (VEC3, et non VEC4), sans changement pour rotation VEC4 et scale VEC3.
- film-contact-v03.mjs : réutilise l’avatar stylisé et son squelette ; remplace les copies visibles de tasse par **une seule tasse** à translation animée ; résout la portée du bras droit par IK analytique plane, adapte le point de saisie aux épaules de l’acteur, échantillonne la trajectoire à 40 Hz et mesure l’écart tasse–ancrage main à 20 Hz. Refus contrôlé si l’écart excède 0,025 m (25 mm). Il s’agit d’un **point d’ancrage mathématique** : aucune collision, préhension des doigts ou physique réelle démontrée.
- Le visualiseur supporte les matrices 4×4 et l’échelle non uniforme du torse assis ; cette correction était nécessaire pour éviter un écart artificiel au calcul du point de prise.
- tests film-viewer-v03.test.mjs, film-ui-v03.test.mjs, film-contact-v03.test.mjs.

### Résultat de la CI
Run GitHub Actions 43734295024 : **34 tests Node réussis sur 34**, SHA 05b055abc4a65240033fa95ac9d62fafe18bab69. Tests de structure GLB, sampling, projections Canvas avec contexte simulé, navigation et export de l’interface via DOM simulé, refus, calcul d’ancrage pour acteur féminin et masculin. Aucun navigateur physique ni GPU n’est testé par ces seules suites.

### Limites strictes
- Pas de film MP4, pas de voix, pas de photo/vidéo → avatar, pas de rendu réaliste, pas de communication réseau, pas d’IA générative entraînée, pas de gestion multi-personnages.
- La projection Canvas 2D ne remplace pas un moteur 3D réel : maillage, illumination, occlusions, profondeur et formes peuvent diverger du GLB interprété par une application 3D complète.
- L’IK et la continuité de l’ancrage ne prouvent ni la tenue correcte de la tasse par les doigts, ni l’absence d’intersections. La posture assise demeure simplifiée.
- Vérification de Safari physique sur l’iPhone cible : **non réalisée** ; contrôle visuel humain : **non réalisé** ; prototype **non déployé**.
- Les 157 vidéos privées, visages, voix et droits de référence ne sont pas impliqués dans cette CI ou cette branche. PR en brouillon, aucune fusion vers main.

### Prochain contrôle avant toute diffusion
Effectuer un test navigateur effectif de la page locale, puis inspection visuelle/glTF dans un véritable moteur 3D ; comparer stabilité, doigts/objets, collisions et ressources. Déployer uniquement après revue et validation du chemin iPhone.

**Renforcement des contrôles :** run GitHub Actions 43734491229, 34/34 tests Node réussis sur SHA 4a0b69e30b1f7c764649fa24d256bab055922320 avec seuil d’écart d’ancrage réduit à 25 mm. Ce seuil mesure uniquement la distance à un point de prise mathématique ; il ne certifie pas le contact doigt-tasse.
