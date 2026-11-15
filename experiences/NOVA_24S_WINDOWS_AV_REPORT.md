# NOVA — export H.264/AAC jusqu'à 24 s par fenêtres (laboratoire isolé)

**Branche** : `chatgpt-nova-h264-windowed-24s-v1-20261115` issue du HEAD `3233648a24398293fd0e30fed0675300a2855c01` de [NOVA HD/couleur #54](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/54).

**Règle de publication** : PR expérimentale, pas de merge, pas de déploiement de `main` ou du site public. Aucune vidéo personnelle, aucun poids IA, aucune donnée identifiable.

## Résultat réellement obtenu

Le pilote H.264 passait déjà une vraie source HD courte avec contrôle BT.709 et AAC (#54) ; cette étape **augmente uniquement la durée d'entrée/export H.264 admissible, jusqu'à 24 secondes** dans un sous-profil strict :

- Le fichier doit avoir du H.264 `avc1/avc3`, un SPS/VUI vérifié BT.709 limité 8 bits et des métadonnées de présentation cohérentes.
- La sortie reste **640 px maximum, 15 images/s**, H.264, dans la limite d'un fichier source de **60 Mio**, selon budget mémoire estimatif **160 Mio**. Ce n'est ni un export HD, ni une prise en charge de la 4K/8K ou de la vidéo d'une heure.
- Le trajet HEVC/WASM demeure **limité à 12 secondes / 90 trames source / 640×360 pixels codés** ; aucune augmentation implicite.
- Le parcours vidéo travaille par fenêtres temporelles de **90 images / 6 secondes**, à l'intérieur **d'une seule session** `VideoDecoder` → `VideoEncoder` → `Mp4Muxer`.
- Les timestamps de sortie ne sont jamais remis à zéro, la fenêtre démarre avec une demande d'image clé et un `VideoEncoder.flush()` à sa frontière. Une piste AAC bitstream **unique** est copiée à la fin, une fois, depuis la source, sans assemblage de sous-MP4.
- En mode long, la copie AAC complète (avec `elst`/`roll` si requis) doit être vérifiable avant traitement, faute de quoi l'export sonore est refusé ; **aucun silence inventé**. L'ancien bouton d'autorisation explicite « sans son » reste distinct.
- Le multiplexeur MP4 conserve sa borne 12 secondes par défaut et accepte `elst` jusqu'à 24 s seulement avec le drapeau interne `windowed24Seconds:true`, pour l'AAC progressif déjà validé. Les trims sans `roll` explicite restent interdits.
- Le rapport de précontrôle et les textes UI annoncent la limite H.264 24 s, tandis que HEVC garde 12 s. L'export n'est jamais déclenché automatiquement à l'import.

**Fichiers concernés** : `experiences/nova-windows.js`, `experiences/nova-export.js`, `experiences/nova-h264-path.js`, `experiences/nova-real-preflight.js`, `experiences/nova-real-preflight-ui.js`, `experiences/nova-export-ui.js`, `experiences/nova.html`, `mp4-muxer.js`, tests dédiés et workflow isolé.

## Preuve et limites exactes

**GitHub Actions #43726770824 — SUCCESS**, commit fonctionnel `049375a2e2fa13141f090658b14655d573cf6948` :

- **48/48 tests Node** couvrant limites 12/24 s, fenêtres contiguës, précontrôle, refus de profils incompatibles, contrôle SPS/VUI, héritage HEVC, validation des `elst` AAC 24 s opt-in, refus de priming non confirmé.
- **4/4 tests Chromium**, incluant deux véritables MP4 H.264/AAC de **20 et 24 secondes** à partir de mires synthétiques **320×180 à 15 images/s**, générés après un clic ; leurs sorties gardent 320×180/15 i/s.
- Pour **20 s** : 4 fenêtres [0–6], [6–12], [12–18], [18–20] secondes. Pour **24 s** : 4 fenêtres [0–6], [6–12], [12–18], [18–24] secondes ; toutes confirmées par les événements locaux de progression.
- **300 images** dans le MP4 de 20 s et **360 images** dans celui de 24 s, chacune espacée d'environ 66,7 ms, sans PTS dupliqué ni discontinuité aux frontières ; images clés identifiées aux index 0, 90, 180 et 270.
- **939 paquets AAC** pour 20 s et **1 126 paquets AAC** pour 24 s, bit-identiques aux paquets source selon SHA-256 ; dans chaque MP4 une seule piste audio et une seule piste vidéo, durées audio et vidéo égales à 20/24 secondes, métadonnées `colr` BT.709 limitées présentes.
- Aucune requête externe ni upload détecté pendant le test Chromium, aucune vidéo utilisateur utilisée.
- Le banc HD court de #54 reste exécuté en non-régression dans ce même workflow : source 1280×720/30 i/s → sortie 640×360/15 i/s, seulement sur 2 secondes.

**La borne 24 secondes est maintenant validée par un vrai export Chromium synthétique de 24 secondes**, en complément de celui de 20 secondes. Il ne s'agit toujours PAS d'une mesure Safari iPhone physique ou d'une certification perceptuelle.

## Limites encore ouvertes

Les « fenêtres » sont des fenêtres **de traitement**, pas des fichiers temporaires assemblés. Elles réduisent la pression liée à la file vidéo mais le MP4 complet est **toujours construit en mémoire** ; la mémoire réelle de Safari iOS n'est pas mesurée ici. Le plafond de **24 Mio d'octets encodés** dans le `NOVA_EXPORT_METER` limite les payloads, pas le RSS CPU/GPU total. Les surfaces de décodage, le calcul pixel et les buffers navigateur peuvent dépasser l'estimation.

Le checksum des paquets AAC, les horodatages et les métadonnées couleur **ne suffisent pas** à certifier la synchronisation perçue à l'oreille, la restauration des détails, ni la qualité visuelle « comme l'œil ».

Les sources HDR/P3, les fichiers sans VUI fiable, les listes de montage complexes, les durées >24 secondes et les fichiers démesurés restent refusés plutôt que convertis arbitrairement. Aucune validation sur **Safari iPhone physique** ou sur une vidéo privée : un test Chromium sous CSP ne vaut pas un résultat matériel.

## Relais aux autres laboratoires

- **NOVA export #3** : conserver le muxer et les audits AAC dans le même pipeline, ne pas concaténer des MP4 indépendants sans preuve temporelle.
- **NOVA H.264 #53 / HD #54** : ce laboratoire prolonge les chemins éprouvés sans modifier leurs branches ; vérifier l'impact si la base évolue.
- **SmallMotion #44** : continuer les audits post-export des images et A/V, distincts des SHA-256 AAC.
- **AURA #31** : l'interface doit exprimer « H.264 vérifié jusqu'à 24 s en expérimentation », et afficher « HEVC 12 s ».
- **Coordinateur #34/#46** : indexer la PR et le SHA réellement testé avec le niveau `unit-tested + synthetic-chromium-export`, jamais `physical-iphone-verified` ou `production`.

**Prochaine étape** : faire évoluer le muxage et la stratégie de mémoire (écriture progressive, segments indépendants avec continuité AAC prouvée ou sauvegarde de fichiers fractionnés clairement annoncée) pour aller au-delà des 24 secondes, et exécuter des tests réels sur Safari iPhone avec accord explicite.
