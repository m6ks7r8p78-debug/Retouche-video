# NOVA — vérification locale de l'audio d'une vidéo réelle, sans export

## Pourquoi ce test maintenant

Un utilisateur a exécuté le laboratoire AAC synthétique NOVA #62 **depuis Safari iPhone** et a volontairement fourni le résultat : `native-aac-encoded-synthetic`, **27 chunks AAC-LC, 2 238 octets**, 48 kHz stéréo. Cette observation **ne prouve pas** encore que Safari peut décoder la **vraie piste sonore** d'un MP4 HEVC Apple, et encore moins que l'export final vidéo+audio fonctionne.

La [PR NOVA #59](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/59) contient déjà la stratégie `NOVA_AAC_NATIVE.decode/planifier` pour sauver l'audio et refuser une sortie silencieuse si la piste n'est pas validée.

**Cette nouvelle expérience n'invente pas un autre moteur** : elle appelle le même `NOVA_AAC_NATIVE.planifier` existant, en laboratoire isolé, sur une source **choisie volontairement depuis Safari**. Cela permet de savoir exactement quelle étape de cette stratégie échoue sur l'appareil.

## Ce qui est réellement développé

- `experiences/nova-local-audio-check/index.html` : une interface iPhone simple, fichier vidéo local choisi volontairement, **un bouton de test** et un rapport local facultatif.
- `core.js` : rejette les fichiers vides, trop lourds ou de durée inconnue ; réutilise `NOVA_AAC_NATIVE.planifier` pour lire/décoder la piste audio et tenter l'encodage AAC-LC local. Vérifie les paquets, PTS et tailles. Le résultat contient seulement un **statut pré-défini** et, si le test réussit, le nombre/la taille des paquets et les paramètres AAC de sortie. **Jamais de nom de fichier, son, vidéo, échantillons, données AAC, adresse, codec source, métadonnées sensibles ou stacktrace**.
- `ui.js` : lit la durée du MP4 via un élément vidéo local `blob:` en mémoire (sans lecture automatique et sans envoyer les octets). Rejette les vidéos hors du pilote (16 Mio, 12,2 secondes). Source privée non copiée ailleurs ; état réinitialisé après essai. Rapport uniquement après un clic et copie volontaire.
- `style.css` : mobile adaptatif, texte français et avertissements visibles. Aucun remplacement du lecteur, de NOVA ou de l'original.
- CSP stricte : `connect-src 'none'`, `media-src blob:`, `script-src 'self'`, `form-action 'none'`, pas de télémétrie, pas de `fetch`, pas de lien upload. Les requêtes nécessaires **au chargement initial du site** depuis l'hébergeur HTTPS tiers restent visibles par cet hébergeur, mais **le code interdit les requêtes sortantes déclenchées par le diagnostic**.
- `tests/nova-local-audio-check.test.mjs` : cas négatifs, protection de l'original, rejet de paquets incohérents et filtrage des messages pouvant contenir des données privées.
- `tests/nova-local-audio-browser.py` : sélection d'un **MP4 H.264/AAC entièrement généré par FFmpeg** dans Chromium Linux. L'interface est testée avec un module AAC simulé **explicitement identifié comme simulé**, puis le vrai module est testé séparément (réponse positive ou refus honnête). Aucun usage de vraie vidéo personnelle en CI.
- Workflow `.github/workflows/nova-local-audio-check.yml` : tests historiques NOVA/AAC, tests unitaires, vrai test d'interface et vérification octet pour octet des 5 ressources HTTPS.

## Guide iPhone simple

**Lien expérimental, à confirmer par CI :**

`https://raw.githack.com/m6ks7r8p78-debug/Retouche-video/chatgpt-nova-local-audio-validation-20261115/experiences/nova-local-audio-check/index.html`

Sur Safari physique :
1. Ouvrir le lien HTTPS et lire la note de confidentialité.
2. **Choisir une vidéo locale très courte** (12,2 s maximum, 16 Mio maximum), de préférence celle de 6,5 s à l'origine du refus AAC. **Ne jamais l'envoyer dans GitHub ou par le chat pour ce test**.
3. Toucher **Tester le son localement**. Le moteur WebAudio / AAC est exécuté uniquement en mémoire Safari. Le fichier n'est pas modifié, aucun MP4 n'est créé ni envoyé.
4. Toucher **Copier le rapport** et transmettre **uniquement le JSON** à l'assistant si désiré.

## Ce qui est mesuré — et ce qui ne l'est pas

La sortie `local_source_aac_reencode_chunks_verified` signifie uniquement : le moteur existant NOVA a décodé localement la piste de cette source, puis a produit des paquets AAC bruts dans Safari qui ont passé ses contrôles conservateurs. Cela ne certifie pas les notes audio perçues ni le multiplexage final, les edits/priming Apple, les PTS de la vidéo HEVC, les couleurs SDR/HDR, ni la qualité visuelle.

Une erreur `source_audio_decode_unavailable` signifie que **la voie WebAudio de la PR #59** ne parvient pas à décoder cette source avec ces API, **pas que la vidéo est dépourvue de son**. Une erreur `audio_video_duration_incompatible` déclenche un contrôle de chronologie plutôt qu'une suppression forcée du son. Aucune erreur n'autorise de fabriquer du silence, contourner le contrat AAC, exporter sans piste validée ou supprimer des contrôles colorimétriques.

**Limites** : test automatique Linux ≠ Safari sur iPhone physique ; succès sur une vraie source ≠ export final réussi. L'app de production et le laboratoire Cloudflare demeurent inchangés. Le service `raw.githack.com` est un proxy tiers qui voit les requêtes d'ouverture de la page ; il n'est ni de production ni garanti disponible. L'utilisateur conserve sa vidéo dans Safari et ne doit charger dans ce pilote que des sources qu'il est autorisé à examiner.

**Gouvernance :** PR expérimentale brouillon basée sur NOVA #62, elle-même fille de #59 ; aucun merge ni déploiement vers `main`, `retoucheproai.com`, Cloudflare ou le registre de coordination. Relais entre conversations via les commentaires GitHub, et jamais de dépôt d'un média personnel.
