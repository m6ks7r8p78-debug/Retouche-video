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
