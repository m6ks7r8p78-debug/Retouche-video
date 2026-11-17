# Atelier de capture du mouvement v0.22

## Ce qui est maintenant raccordé

`film-pose-reference-v22.html` est relié depuis l’index de Retouche 3D. Il accepte une vidéo choisie dans le navigateur, conserve cette vidéo dans une URL objet locale et extrait jusqu’à 1 500 instants de pose à 5 images/s, sur une séquence de cinq minutes maximum. Les premiers et derniers instants sont échantillonnés au centre de leur intervalle, sans couper volontairement 4 % de la durée.

Pour chaque instant, MediaPipe Pose Landmarker estime 33 repères corporels. Le résultat est exporté au contrat partagé `retoucheproai.film-pose-track.v0.1` : 33 repères, résolution source et une base temporelle de 24 images/s qui conserve les instants échantillonnés. Les coordonnées donnent x/y normalisés et z relatif estimé ; ce z n’est pas une profondeur calibrée. Le validateur partagé vérifie chaque piste avant l’export. L’atelier affiche cette même piste et produit un GLB proxy animé avec interpolation linéaire entre les poses retenues. Les images source ne sont ni exportées ni conservées par l’application ; l’utilisateur choisit explicitement s’il exporte le JSON des points ou le GLB.

Le chargement du runtime web est soumis à une case de consentement. Le runtime et le modèle peuvent être chargés depuis Internet ; la vidéo demeure locale. Un modèle `.task` sélectionné dans Fichiers évite le téléchargement de ses poids, mais le runtime JavaScript dépend encore d’Internet. Le texte de l’interface signale la télémétrie technique possible du fournisseur.

## Garde-fous et limites observables

- Une seule personne peut être détectée par instant ; l’analyse refuse un instant qui contient plusieurs poses.
- Le suivi n’établit pas une identité certaine d’une image à l’autre ni entre plusieurs vidéos.
- Les points représentent une estimation du modèle, pas une mesure de capture optique ni une vérité anatomique. La profondeur z est relative à la caméra et n’a pas d’échelle absolue.
- Le GLB représente les segments visibles avec des formes proxy articulées. Ce n’est pas un maillage humain réaliste et il ne reconstruit pas les vêtements, le visage détaillé, les objets ou les contacts main-objet.
- Les changements rapides peuvent être manqués entre deux échantillons (200 ms). L’interpolation rend la lecture continue, mais n’invente pas de mesures intermédiaires fiables.
- Une séquence supérieure à cinq minutes doit être découpée avant analyse. Les segments sont actuellement exportés séparément ; leur raccord temporel et l’identité persistante multi-vidéo restent à construire.
- L’analyse peut durer sensiblement plus longtemps que la vidéo sur un iPhone : chaque échantillon attend un décodage et une estimation de pose. Le statut donne le compte traité et permet l’annulation sans publier de résultat partiel.

## Prochaine étape de recherche

La suite utile est un format de projet multi-clips qui conserve les horodatages source, recale les segments, visualise la confiance par articulation et signale les pertes de suivi. Ensuite, ajouter le suivi de mains et d’objets permettra de travailler les interactions (par exemple main vers tasse) sans prétendre que les articulations seules déterminent un contact exact. Les vidéos personnelles restent sur l’appareil ; elles ne doivent pas être ajoutées au dépôt.
