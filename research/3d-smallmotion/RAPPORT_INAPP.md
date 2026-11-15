# Rapport — SmallMotion intégré expérimentalement au parcours d'import vidéo

**Statut : recherche hors production, 15 novembre 2026.**

## Besoin et contrôle de non-régression

L'application possède déjà `#f` (sélection multi-vidéos) et `#pick`, et gère le chargement via `app.js`. Le fichier `directeur-ia.js` n'est pas disponible dans cette branche : il se trouve dans la PR distincte du Directeur IA. Risque : l'intégrer sans fusion/revue créerait une branche artificiellement mélangée. Solution : **pont d'observation local non invasif**, sans activation de la restauration ni modification de l'export. `app.js` reste identique.

## Décision technique

Le code de détection de petits mouvements est directement le module JS SmallMotion, conservé sans modification. Un nouveau pont écoute l'import vidéo en mode capture, et ne travaille que sur sélection unique, consentement du clic et taille plafonnée. Il décode localement une vidéo muette en taille native via l'élément vidéo, puis n'extrait que deux ImageData au format maximum 160 × 120. La fenêtre de temps minimale de 105 ms utilise les `mediaTime` réels de `requestVideoFrameCallback`. Pas de simulation de décodage, pas de boucle d'analyse complète ni de génération d'images.

Les sorties restent des hypothèses 2D : `local_motion_candidate`, `no_supported_local_motion`, `abstain_*`. Le pont renvoie `action: no_automatic_change`, et empêche les données de passer dans le chemin d'export ou les télémétries. Les cadres visibles ne sont ni objets identifiés ni preuves de contact.

## Tests et mesures vérifiables

- Tests unitaires Node du pont : 27 assertions à la première validation (augmentation après audit), couvrant taille, type MIME, compatibilité verticale, refus d'images manquantes, des temps identiques et des boîtes invalides.
- Tests JS du moteur SmallMotion antérieur relancés : 3 scènes de mouvement, 3 scènes statiques, manque de texture, saut de lumière et dimensions incohérentes.
- Chromium système, 390×844 et 1280×800 : vrai MP4 H.264 entièrement synthétique généré via OpenCV+FFmpeg ; import, `video.play`, échantillonnage, calcul, annulation par remplacement de fichier : **2/2 réussis**. Observation: 1 région possible sur ces deux résolutions d'interface ; 0 erreur JavaScript, 0 requête HTTP. La résolution **de calcul** était 160 × 120 dans les deux cas.
- Horodatages vidéo présentés 0,0333 et 0,1667 s (différence ~133 ms) ; temps mesuré **pour le détecteur JS seulement** : 40,7 ms et 31,9 ms dans le banc de référence sur CPU Chromium de l'environnement, décodage exclus. Les chiffres ne sont ni du 60 FPS ni une mesure Safari/iPhone.
- Le premier essai MP4 `mp4v` OpenCV n'était pas pris en charge par Chromium ; corrigé avec encodage FFmpeg H.264 `yuv420p`. Incident conservé.
- L'essai e2e utilise un harnais HTML reproduisant le parcours d'import, pas tous les modules du site. La nouvelle intégration dans `index.html` fait l'objet d'un contrôle d'ordre et de sélecteurs.

## Recherche ciblée

WebKit Safari 26 supporte WebGPU, mais aucune accélération GPU n'est nécessaire pour cette expérience. `requestVideoFrameCallback` est disponible depuis iOS Safari 15.4 et émet des métadonnées `mediaTime` des images présentées, sans garantie de callback pour chaque image source.
Sources : https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback ; https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ .
Un ticket WebKit récent (2026-11-11, `331130`, classé doublon) signale une croissance mémoire possible du processus GPU sur iOS ; il justifie le choix **CPU local** avant d'imposer WebGPU : https://bugs.webkit.org/show_bug.cgi?id=331130 . Ce ticket n'est pas une mesure sur l'appareil du propriétaire.

## Contre-exemple CI distant et correction

Le premier workflow GitHub du pont a échoué sur `media_decode_error` : les assertions JS et le contrôle du raccordement HTML étaient **verts**, mais le Chromium Playwright du runner ne fournissait pas de décodeur H.264 compatible avec la vidéo générée par FFmpeg. Une validation locale dans Chromium système ne garantissait donc pas le même codec sur GitHub. Le banc a été corrigé pour fabriquer deux sorties entièrement synthétiques (H.264 et WebM VP8), puis **sélectionner le codec pris en charge par le navigateur de test** et inscrire ce choix dans le résultat JSON. Ce repli ne prouve pas que H.264 fonctionne sur le runner distant. Il ne change pas le code de SmallMotion ni de l’application.

## Limites ouvertes

1. **Pas d'essai physique Safari/iPhone**, température/autonomie et gestion mémoire du décodeur inconnues.
2. 2 images uniquement ; certaines scènes et petits gestes plus rapides seront manqués. `requestVideoFrameCallback` peut ne pas présenter chaque image source.
3. Les scènes réelles annotées et le corpus privé de 157 vidéos ne sont pas utilisés.
4. Aucune reconnaissance humaine, identification d'objet, profondeur fiable, contact ou reconstruction 3D.
5. L'abstention en cas de format vidéo non pris en charge est voulue.
6. `app.js` et la branche du Directeur IA ne sont pas fusionnés ; la nouvelle observation est consultative et locale.
7. Le cache hors ligne de l'app PWA n'est pas mis à jour ni certifié dans cette branche.

**Suite prioritaire** : vrai test iPhone depuis un environnement de revue contrôlé ; comparer coûts et échecs sur 10 vidéos *publiques autorisées* et des annotations indépendantes, puis concevoir un branchement explicite à `DIRECTEUR_IA` avec signal d'incertitude et aucune décision automatique risquée.