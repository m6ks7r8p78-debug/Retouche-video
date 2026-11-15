# NOVA 0.24 — confirmation utilisateur de lecture MP4 sur iPhone (15 novembre 2026)

## Fait nouveau et provenance

Après la vérification technique du MP4 synthétique reçu dans la conversation, l'utilisateur a confirmé explicitement **« Oui, je te confirme. »** à la question : **« lorsque tu ouvres ce MP4 sur ton iPhone, est-ce que tu vois l'écran gris et entends un petit bip sonore ? »**

Cela constitue **une observation utilisateur déclarée sur iPhone physique**, distincte des tests Chromium/WebKit et de l'analyse indépendante des octets de la vidéo. Ni appareil, ni version précise de Safari, ni conditions de lecture n'ont fait l'objet d'une attestation ou d'une télémétrie supplémentaire.

## Résultat et niveau de preuve

- **Lecture native déclarée réussie :** image grise visible et bip audible dans le MP4 de validation.
- **Vérification technique indépendante antérieure :** export MP4 synthétique de 1 seconde, vidéo AVC/H.264 160×90 à 15 i/s et audio AAC-LC mono 48 kHz décodés sans erreur ; signal audio dominant ~660 Hz. Référence : `research/relais/nova-safari-iphone-export-observation-2026-11-15.md`.
- **Portée :** validation fonctionnelle déclarée par l'utilisateur pour **ce seul clip synthétique** issu du laboratoire Cloudflare, pas une certification de toutes les fonctions NOVA.
- **Statut :** `physical-iphone-tested (user-reported, synthetic MP4 playback)` ; ne pas confondre avec `production-verified` ou avec une validation de restauration réelle.

## Ce qui reste à vérifier

- Import volontaire de vidéos réelles autorisées, HEVC/MOV potentiellement variables (colorimétrie HDR, cadence variable, audio et durées longues).
- Fidélité de l'image et de l'audio, cadence/synchronisation complexes, consommation mémoire/énergie, performances iPhone et défauts visuels.
- Intégration à l'application principale RetoucheProAI : **non réalisée**. Le laboratoire Cloudflare demeure distinct.

## Confidentialité et gouvernance

Aucune copie du MP4 utilisateur, aucune image extraite, aucun identifiant personnel ou média privé publié dans GitHub ; seules des observations techniques minimales figurent dans cette note. Aucun déploiement, fusion ni modification de `main`. La PR #38 reste brouillon.

**Prochaine étape :** un essai volontaire d'import puis d'analyse d'un clip réel autorisé, tout en conservant une méthode d'évaluation séparée des preuves synthétiques et sans publication du média.
