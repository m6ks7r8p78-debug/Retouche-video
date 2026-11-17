# Film Studio — films longs : première infrastructure v0.21

## Objectif produit

Un adulte novice décrit un film de 30 à 60 minutes : personnages et apparence,
lieux, accessoires, gestes, interactions, dialogues, voix, caméra et son. Le
résultat visé est un film cohérent et exportable depuis un parcours simple sur
iPhone. Ce jalon ne réalise pas encore cette génération.

## Disponible dans le laboratoire

La rubrique « Préparer un film de 30 à 60 minutes » accepte un scénario détaillé,
découpe ses en-têtes explicites `Scène 1 :`, etc., répartit provisoirement la durée
et propose un fichier JSON local. Le texte original, y compris son préambule,
est conservé. Aucune vidéo n'est annoncée ni créée par cette action. Modifier le
texte invalide immédiatement le lien de téléchargement précédent.

La dernière version préparée ou importée est maintenant enregistrée dans
IndexedDB, sur l'origine de ce navigateur. « Reprendre le projet enregistré » la
recharge après une fermeture/rechargement. L'import JSON valide le schéma et les
limites avant remplacement ; un fichier invalide conserve le projet précédent.
Le fichier réexporté conserve personnages, dialogues, notes et durées personnalisées.
Les modifications de texte non préparées ne sont pas enregistrées automatiquement.

Le bouton d'effacement supprime seulement la copie IndexedDB. Le texte affiché et
le fichier téléchargeable restent disponibles. Un refus ou quota du stockage laisse
la sauvegarde JSON accessible. Le navigateur peut supprimer IndexedDB ; ce n'est
ni une sauvegarde cloud ni une garantie contre la perte de données. Les checkpoints
de rendu ne sont pas encore persistés par cette interface.

Le contrat de projet conserve un catalogue de personnages, des identifiants de
scènes, les descriptions, détails et dialogues. Les bornes sont calculées en
nombres entiers d'images : une heure à 24 images/s représente 86 400 images.
Les limites actuelles sont 2 000 scènes, une heure, 20 000 caractères par champ
de scène, 200 000 caractères de description générale et un million de caractères
cumulés. Un dépassement est refusé, jamais tronqué silencieusement.

## Traitement par blocs

`film-long-runtime-v21.mjs` relie le plan au générateur 3D existant. Il prépare
un seul GLB par bloc et transmet une pose à la fois à un consommateur, en attendant
la fin de chaque écriture. Les blocs ne franchissent pas les limites de scène.
Le consommateur du banc navigateur dessine réellement ces poses dans WebGL2 ou
Canvas 2D. Aucun encodeur audio/vidéo n'est encore raccordé.

Le générateur doit produire la durée exacte déclarée pour la scène. Si ce n'est
pas possible, le traitement refuse de fabriquer une longue durée avec une boucle,
un arrêt sur image ou un ralentissement. Les identités persistantes, dialogues et
consignes de mise en scène structurées restent planifiables, mais leur exécution
est explicitement refusée par cet adaptateur limité.

Le consommateur implémente `beginChunk`, `writeFrame`, `commitChunk`, `abortChunk`.
Un checkpoint n'avance qu'après la validation du bloc. Sa signature SHA-256 porte
sur le scénario complet, la cadence et les paramètres de découpage ; une édition
invalide la reprise. Cette signature identifie un projet, elle n'authentifie pas
un fichier tiers et ne prouve pas que les images précédentes ont été exportées.

Les transactions possèdent un identifiant stable. Un futur encodeur/stockage doit
être idempotent : si un bloc est persisté mais son accusé perdu, la reprise doit
reconnaître cet identifiant sans doubler les images. Le stockage durable du
checkpoint et des blocs est à implémenter. La reprise testée ici fonctionne avec
un checkpoint sérialisable fourni par l'appelant ; elle ne promet pas de sauver
automatiquement un rendu après la fermeture de Safari.

## Validation et limites

- Plans de 30 et 60 minutes parcourus intégralement : aucune lacune ni superposition
  entre blocs. Ces chronologies synthétiques ne sont pas des films générés.
- Poses de vrais GLB transmises séquentiellement, interruption et reprise de blocs,
  échec d'écriture, changement de scénario, scènes non exécutables et durée trompeuse.
- Sauvegarde JSON du scénario par le parcours navigateur ; court bloc synthétique
  dessiné dans le vrai moteur Chromium/WebKit, y compris son repli 2D.
- Aucune preuve de tenue mémoire/thermique pendant une heure sur iPhone physique.

## Prochains composants indispensables

1. Réalisation de chaque scène détaillée, identité et état des personnages/objets
   conservés d'un plan à l'autre, continuité des gestes et décors.
2. Dialogues, voix autorisées, synchronisation labiale, ambiance et mixage audio.
3. Encodeur de segments audio/vidéo avec timestamps exacts, stockage durable,
   reprise idempotente et assemblage final MP4 sans dérive.
4. Validation du rendu, de la cohérence narrative et tests longs sur iPhone réel ;
   exécution distante adaptée aux scènes que le téléphone ne peut pas calculer.

Le projet reste expérimental. Aucun média privé utilisé et aucun déploiement public.
