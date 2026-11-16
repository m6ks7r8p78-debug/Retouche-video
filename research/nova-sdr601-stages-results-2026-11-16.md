# NOVA — localisation des écarts couleur source 1/1/6, banc synthétique

Date : 16 novembre 2026. Branche expérimentale : `chatgpt-nova-sdr601-stage-color-trace-v1`.

## Question d'origine

La vidéo réelle traitée sur iPhone en NOVA 0.37 reste en 1088×1920 / 195 images avec AAC, mais l'écart visuel entre 0.36 et 0.37 est très faible (environ 0,37 valeur RGB sur 255 en moyenne). L'utilisateur attend une restauration visiblement meilleure et non un changement de métadonnées. Le source de la vidéo porte les codes couleur primaires/transfert/matrice **1/1/6**, tandis que Safari peut annoncer des trames `bt709`.

Les deux précédents exports réels ont été comparés **uniquement dans un environnement privé**. Aucun média, visage, nom, audio, octet de vidéo ou empreinte numérique personnelle n'est envoyé dans ce dépôt.

## Méthode vérifiable

Le banc `tests/nova-sdr601-color-stages-browser.test.mjs` crée uniquement par FFmpeg un MP4 synthétique H.264/AAC 512×256, 15 images, avec :
- Primaires = BT.709 (1), transfert = BT.709 (1), matrice = SMPTE 170M / BT.601 (6), plage limitée, sur le MOV et le flux H264 vérifiés par FFprobe.
- Huit aplats RGB synthétiques : noir, ombre, bleu sombre, peau dans l'ombre, peau claire, rouge, reflet et blanc. Première tuile de 256 px sombre, afin de **forcer une véritable intervention** du module `NOVA_ZONES`.
- Deux vrais exports via `NOVA_NATIVE_HD.exporter` : chemin sans restauration, puis restauration par zones effectivement active.
- Relevés de 15×15 pixels au centre de chaque aplat aux étapes **source décodée par FFmpeg → Canvas WebCodecs Chromium → mosaïque NOVA → MP4 H264 décodé par FFmpeg**.
- Vérification des 15 images, AAC et absence de requêtes réseau/POST. Aucun média personnel dans le CI, aucun export automatique vers le web.

## Résultats observés en Chromium Linux

Moyenne absolue par canal RGB sur les huit aplats, échelle 0–255 :

| Mesure | Sans retouche | Retouche NOVA |
|---|---:|---:|
| Source → Canvas | 0,9583 | 0,9583 |
| Canvas → image après mosaïque | 0 | 0,5000 |
| Image avant encodage → MP4 final | 1,3750 | 1,4167 |
| Source → MP4 final | 1,0833 | 1,1250 |
| Images marquées modifiées | 0/15 | 15/15 |

À titre d'exemple, le noir synthétique Canvas `[17,17,19]` est éclairci localement en `[18,18,20]` ; la peau claire `[210,167,143]`, le reflet `[242,231,217]` et le blanc `[249,250,245]` restent strictement inchangés avant encodage. Les variations après MP4 sont de faible amplitude et attribuables à la conversion/quantification dans ce banc.

**Interprétation permise :** dans **Chromium, sur un source H.264 synthétique correctement étiqueté 1/1/6**, il n'y a pas d'écrasement général des ombres ni de surexposition importante causés par le trajet sans retouche. La mosaïque change effectivement les ombres mais très faiblement. Une nouvelle « protection des hautes lumières » ne peut pas supprimer des hautes lumières qui étaient déjà présentes avant la mosaïque.

**Interprétation interdite :** ce banc ne certifie ni Safari matériel HEVC sur iPhone, ni une source vidéo personnelle 1/1/6 intacte, ni les couleurs absolues des visages, ni la synchronisation AAC. Les trames opaques WebKit peuvent être normalisées avant Canvas de façon distincte du décodeur Chromium.

## Prochains travaux prioritaires

1. Instrumenter un **test HEVC synthétique 1/1/6 sur Safari physique** permettant d'enregistrer uniquement les mesures de patches de couleur et les métadonnées de décodage, sans aucune vidéo personnelle ni téléchargement automatique. Ce sera la seule manière de séparer l'effet de la normalisation WebKit.
2. Ajouter un **critère explicite de gain perceptuel** aux bilans des corrections : une image comptée « retouchée » ne signifie pas qu'un changement visible a eu lieu. Ne pas réclamer une qualité améliorée seulement parce que la résolution du MP4 est conservée.
3. Développer séparément une restauration spatiale/neurale mesurable avec contrôles de fidélité, en conservant un chemin « image d'origine » et en marquant les détails reconstruits hypothétiques.
4. Vérifier le délai audio mesuré par rapport à l'ancienne copie Apple au moyen d'une piste AAC synthétique à impulsions et d'une source intacte ; ne pas déplacer les PTS arbitrairement.

Gouvernance : recherche sur une branche distincte, aucune fusion, aucun déploiement, aucun média privé publié.
