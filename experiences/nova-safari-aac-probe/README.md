# NOVA — Test AAC natif Safari en conditions locales, sans vidéo privée

## Objet

Dans les branches NOVA HD #57 et #59, un essai HEVC réel sur iPhone a progressé jusqu'au blocage AAC : l'analyse MPEG-4 de l'AudioSpecificConfig ne pouvait pas prouver le profil ou les réglages AAC d'origine. La PR #59 améliore la copie AAC et ajoute un recours au réencodage natif. **Ce recours n'a pas encore réussi sur un iPhone physique**. La présence d'API ne suffit pas à certifier la vidéo.

Ce laboratoire **ne change aucun module existant**. Il ajoute un *test de capacité indépendant* en HTML/CSS/JS statiques à `experiences/nova-safari-aac-probe/`, en aval de #59. Le test peut être ouvert depuis l'iPhone en HTTPS sans sélectionner de fichier :

**URL expérimentale à valider par CI :**
`https://raw.githack.com/m6ks7r8p78-debug/Retouche-video/chatgpt-nova-safari-aac-probe-20261115/experiences/nova-safari-aac-probe/index.html`

## Test effectué

1. Sur action volontaire, interroge `AudioEncoder.isConfigSupported` pour **AAC-LC** `mp4a.40.2`, 48 kHz stéréo, 160 kb/s, `aac.format="aac"`.
2. Si l'API annonce le support, **génère en mémoire 24 blocs de 1 024 échantillons** (0,512 seconde) d'un son sinus fictif 440/660 Hz, par `AudioData`.
3. Essaye réellement d'encoder cette source PCM synthétique en AAC WebCodecs. Ne considère le test réussi que si des paquets AAC bruts non vides ont été émis, horodatages croissants, taille bornée, pas d'en-tête ADTS incongru, premier PTS zéro, suivi d'un `flush`.
4. Test séparé : `VideoDecoder.isConfigSupported` pour une configuration typique `hvc1.1.6.L93.B0`, **sans bitstream**. Même si ce test dit `reported-supported-config-only`, **il ne prouve pas le décodage réel HEVC**.
5. Génère un JSON **sans identité, nom de fichier, codec source privé, durée d'une vidéo, agent utilisateur, réseau, localisation, ni son original**. Statut `native-aac-encoded-synthetic` signifie uniquement qu'un son fictif a été encodé en mémoire, pas qu'une vraie piste Apple sera décodable ni que le muxage MP4 donnera du son.

## Confidentialité

Aucun `input` de média, aucune caméra, aucun microphone, aucun accès aux fichiers, aucune mise en ligne, aucune persistance, aucun traitement de vraie vidéo, aucun enregistrement sonore à partir de l'environnement. CSP : scripts/styles `self`, `connect-src 'none'`, `media-src 'none'`, `img-src 'none'`. La fonction `run()` ne fait aucun appel réseau. **Le fournisseur HTTPS voit techniquement les requêtes nécessaires au chargement des fichiers HTML/JS/CSS**, mais pas les valeurs du rapport qui restent dans la page ; l'utilisateur peut copier ce texte volontairement.

Le domaine tiers `raw.githack.com` est expérimental et hors contrôle de RetoucheProAI. Il pourrait afficher une confirmation anti-abus et sa disponibilité n'est pas garantie ; ne pas lui envoyer de médias personnels. Cette page est séparée de RetoucheProAI.com et du labo Cloudflare, et ne modifie pas leurs déploiements.

## Tests et preuve

- Tests unitaires `tests/nova-safari-aac-probe.test.mjs` avec WebCodecs simulé : vraie génération des données PCM, 24 chunks, validation d'horodatages, refus en l'absence du codec, erreurs de l'encodeur, AAC ADTS non attendu, annulation, confidentialité.
- `tests/nova-safari-aac-browser.py` : teste la façade sur Chromium Linux en 390/320 pixels (API simulée pour un succès contrôlé) et interroge séparément les vraies API Linux sans déclarer Safari physique.
- CI `.github/workflows/nova-safari-aac-probe.yml` relance les tests de PR #59, compare les quatre fichiers servis par `raw.githack.com` à la source du HEAD et vérifie les types MIME. Ne téléverse jamais de média.

**Ce que ce test ne démontre pas :** décodage du MP4 HEVC source par `AudioContext.decodeAudioData`, AAC-LC correct pour une vraie piste audio, sauvegarde MP4, synchronisation image/son, effets naturels, performance 4K/8K ou solution de l'import universel. **Les fichiers personnels ne doivent jamais être déposés dans GitHub pour ces essais.**

## Prochaine étape après retour iPhone

Si le test AAC **réellement exécuté** sur Safari iPhone donne `native-aac-encoded-synthetic`, on sait que l'encodeur AAC-LC WebCodecs local a produit des chunks synthétiques. Il restera à mesurer sur l'iPhone, via un laboratoire HTTPS approprié sans upload, **l'extraction décodable de l'AAC du vrai MP4**, puis une sortie vidéo+audio vérifiée. Si le test indique `webcodecs-unavailable` ou `codec-supported-but-encode-failed`, mieux vaut investiguer cette voie au lieu de contourner les refus et créer une vidéo muette.

**Gouvernance** : PR expérimentale draft, aucun merge, pas de modification de `main`, de la branche de coordination ou du moteur NOVA en production. Relais via commentaire GitHub, consultation asynchrone par les autres conversations.
