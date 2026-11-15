# NOVA 0.23 — Procédure Safari iPhone physique

**Statut : laboratoire empaqueté et testé automatiquement ; aucun essai sur un iPhone réel certifié.** Aucun déploiement de production.

## Prévisualisation distincte et gratuite

Le script `node outils/build-nova-iphone-preview.mjs` construit `dist/nova-iphone-preview/`, avec la page `experiences/nova.html`, le décodeur WebAssembly local, les JS et la licence. GitHub Actions produit un artefact `nova-iphone-preview` retenu sept jours. Cet artefact est **une archive**, pas une URL web HTTPS. Aucun média privé n'y est inclus et aucun Service Worker n'est enregistré.

## Essai sur un futur aperçu HTTPS séparé

1. Ouvrir dans **Safari sur iPhone** un site de prévisualisation HTTPS isolé qui héberge cet artefact. Le site public `retoucheproai.com` ne doit pas servir à ce test avant validation.
2. Importer un **court MOV HEVC SDR BT.709 limité** : 12 secondes, 60 Mio maximum, 90 images HEVC source et 640×360 pixels pour le pilote WebAssembly. Ne pas commencer par HDR/P3/4K. Le navigateur traite le média localement.
3. Déplier « Tester sur iPhone Safari · diagnostic local » et appuyer sur « Tester Safari sur cette vidéo ». Le son est conservé par défaut ; un refus est un résultat de diagnostic légitime.
4. Après succès, si vous le souhaitez, enregistrer et écouter/visionner le MP4. **Enregistrer le rapport JSON** pour examiner les observations : aucun nom de fichier, contenu de vidéo, GPS, userAgent ou upload automatique.
5. Recommencer éventuellement en Safari puis depuis la PWA « Ajouter à l'écran d'accueil », en évitant de mettre le test en arrière-plan (cela demande l'annulation).
6. Comparer le résultat, les codecs disponibles, les durées par phase, le nombre d'images, la capacité du tas WASM et le tas JS facultatif. Ce ne sont **pas** des mesures de RAM totale/RSS, batterie ou température.

## Points encore non validés

Il faut un aperçu HTTPS réellement hébergé séparément **et** une exécution physique iPhone. Le code GitHub et les essais WebKit Linux ne remplacent pas ces étapes. La sortie reste à 15 images/s, HEVC 8 bits BT.709 uniquement.
