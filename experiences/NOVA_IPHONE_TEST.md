# NOVA 0.24 — Procédure Safari iPhone physique

**Statut : laboratoire empaqueté et testé automatiquement ; aucun essai sur un iPhone réel certifié.** Aucun déploiement de production.

## Prévisualisation distincte et gratuite

Le script `node outils/build-nova-iphone-preview.mjs` construit `dist/nova-iphone-preview/`, avec la page `experiences/nova.html`, le décodeur WebAssembly local, les JS, la licence et **un clip MOV synthétique HEVC SDR BT.709 + AAC créé par FFmpeg à la construction**. Aucune vidéo personnelle n’est empaquetée. GitHub Actions produit un artefact `nova-iphone-preview` retenu sept jours. Cet artefact est **une archive**, pas une URL web HTTPS. Aucun média privé n'y est inclus et aucun Service Worker n'est enregistré.

## Essai sur un futur aperçu HTTPS séparé

1. Ouvrir dans **Safari sur iPhone** un site de prévisualisation HTTPS isolé qui héberge cet artefact. Le site public `retoucheproai.com` ne doit pas servir à ce test avant validation.
2. **Essai sans vidéo personnelle recommandé en premier :** déplier le diagnostic et appuyer sur « Tester Safari sans vidéo personnelle ». Le clip de 1 seconde, 160×90, contient une image grise et un bip AAC entièrement synthétiques. Le téléchargement est local au même site, uniquement après appui. Vérifier le MP4/rapport si le codec est disponible ; un refus explicite reste valide.
3. Ensuite, importer un **court MOV HEVC SDR BT.709 limité** : 12 secondes, 60 Mio maximum, 90 images HEVC source et 640×360 pixels pour le pilote WebAssembly. Ne pas commencer par HDR/P3/4K. Le navigateur traite le média localement.
4. Déplier « Tester sur iPhone Safari · diagnostic local » et appuyer sur « Tester Safari sur cette vidéo ». Le son est conservé par défaut ; un refus est un résultat de diagnostic légitime.
5. Après succès, si vous le souhaitez, enregistrer et écouter/visionner le MP4. **Enregistrer le rapport JSON** pour examiner les observations : aucun nom de fichier, contenu de vidéo, GPS, userAgent ou upload automatique.
6. Recommencer éventuellement en Safari puis depuis la PWA « Ajouter à l'écran d'accueil », en évitant de mettre le test en arrière-plan (cela demande l'annulation).
7. Comparer le résultat, les codecs disponibles, les durées par phase, le nombre d'images, la capacité du tas WASM et le tas JS facultatif. Ce ne sont **pas** des mesures de RAM totale/RSS, batterie ou température.

## Liaison avec les autres laboratoires

Le [centre de coordination GitHub](https://github.com/m6ks7r8p78-debug/Retouche-video/blob/coordination-retoucheproai-v1/coordination/README.md) centralise les pointeurs NOVA, SmallMotion, 3D, Cinema et Directeur IA. Une conversation doit le consulter explicitement à chaque reprise ; aucune synchronisation inter-chat n'est automatique. Les découvertes NOVA sont relayées via la PR #3 sans fusion ni déploiement.

## Points encore non validés

Il faut un aperçu HTTPS réellement hébergé séparément **et** une exécution physique iPhone. Le code GitHub et les essais WebKit Linux ne remplacent pas ces étapes. La sortie reste à 15 images/s, HEVC 8 bits BT.709 uniquement.
Le rapport contient `sourceKind = synthetic-generated` pour l’essai sans média privé et `local-user-file` pour une vidéo choisie. Le clip synthétique n’est pas un substitut à un essai avec une vraie vidéo iPhone.

### Vérification indépendante de l'archive

Un second banc de NOVA 0.24 reconstruit le paquet statique **dans un dossier temporaire autonome**, puis lance le laboratoire dans Chromium et WebKit Linux à partir de ce seul dossier. Il vérifie le parcours photo et l'export de rapport depuis un vrai MOV HEVC/AAC de test, l'absence de ressource manquante et l'absence de requête externe. Il ne doit pas être confondu avec un test physique Safari iPhone.


## NOVA 0.26 — trois essais synthétiques successifs, sans média personnel

Le panneau avancé propose désormais « Vérifier la stabilité · 3 essais synthétiques ». Cette action **volontaire** ouvre une seule fois le clip HEVC/AAC synthétique, réalise jusqu'à trois exports locaux séquentiels et fournit **uniquement un petit rapport JSON agrégé** : succès/refus, médiane/minimum/maximum du temps de pipeline, écart de **capacité** du tas WASM et plage de taille MP4. Elle ne conserve ni média personnel, ni nom de fichier, ni les MP4 des essais successifs. **Ce test ne mesure ni fuite RAM/RSS, ni température, ni batterie, et ne certifie pas un iPhone physique**. Une variation importante déclenche un avis de prudence, non un changement de profil. Sur refus ou annulation, aucun résultat de stabilité n'est revendiqué. Le rapport reste local, exporté uniquement au clic.


## NOVA 0.27 — interruptions Safari et résultats tardifs

Le banc local exige maintenant que toute annulation (y compris la réception tardive du troisième résultat d'une série) soit classée comme **abstention**, jamais « trois succès ». Le rapport de stabilité JSON est limité à des codes prédéfinis, sans champs libres. Le laboratoire vérifie le signal d'annulation avant le probe MOV, après les étapes attendues et avant de retourner un MP4 réussi ; l'interface restaure les commandes et indique l'interruption. Un **nouveau test Playwright en Chromium et WebKit Linux** simule `pagehide` tandis qu'un export synthétique différé finit par annoncer un succès : aucun MP4 ni JSON ne doit devenir téléchargeable. Cette simulation ne mesure pas les processus suspendus ou la mémoire iPhone et ne remplace pas un véritable essai Safari physique.
