# Guide iPhone

1. Ouvre Safari à l’adresse **https://m6ks7r8p78-debug.github.io/Retouche-video/** (R majuscule).
2. Partager → « Sur l’écran d’accueil ». Ouvre ensuite l’app depuis son icône (elle garde mieux ses modèles et fonctionne hors ligne).
3. « Choisir une vidéo » ou « Choisir une photo ». Attends la carte « Analyse automatique ».
4. Choisis la taille (vidéo) et le rendu (Équilibré conseillé ; Faible lumière pour une scène sombre ; Nuit → jour pour un effet esthétique).
5. Touche « Améliorer ». Garde l’écran allumé et l’app au premier plan pendant l’export.
6. Compare (curseur, zoom), puis « Enregistrer ».
7. Vitesse ou vidéo à l’envers : onglet 🧰 Outils → « Vitesse et sens de lecture ».
8. *(v3.3)* Retirer un objet ou un élément de filtre d’une photo : accueil → « Effacer une zone d’une photo (IA) » (guide : GUIDE_RECONSTRUCTION_IA.md).

## À vérifier une fois sur ton iPhone (non testable sans lui)
- [ ] Modèles IA → « Mesurer la vitesse » : note le chiffre WebGPU.
- [ ] Une photo ancienne avec l’IA : le comparateur s’affiche, l’export s’enregistre.
- [ ] Une vidéo en 4K de 10 s : l’export va au bout, le son est présent.
- [ ] Outils → Vitesse 2× : la voix garde sa hauteur.
- [ ] Modèles IA → « Demander la protection du stockage » : la réponse s’affiche.

### v3.3 — Effacer une zone (rien de tout cela n’a pu être essayé sur un iPhone)
- [ ] Importer une photo **HEIC** depuis Photos, puis une depuis Fichiers : elle s’affiche à l’endroit (pas tournée).
- [ ] Peindre au doigt, zoomer à deux doigts (le trait commencé doit disparaître quand le 2e doigt arrive), gommer.
- [ ] « Reconstruire » : noter le **temps affiché** (premier usage = téléchargement de 28 Mo, puis calcul seul).
- [ ] 👆 Toucher un objet : noter le temps de « lecture de la photo » puis celui d’un 2e toucher.
- [ ] Photo **24 Mpx** (réglage 24 Mpx de l’appareil photo) : le message « photo réduite » s’affiche, rien ne plante.
- [ ] Enregistrer la photo, la carte, la fiche : la feuille de partage s’ouvre, l’image arrive dans Photos.
- [ ] Passer à une autre app pendant une reconstruction puis revenir : l’original est intact, l’outil répond encore.


## Nouveau en v6.8
- **Effacer une zone** (photo) → « 🎭 Proposer les éléments de filtre (visage) » : l’app colore en rose ce qui ressemble à un ajout de filtre. Vérifie, corrige au doigt, puis « Reconstruire la zone ».
- **Préparer pour X** : case dans les options avant d’exporter une vidéo (coche aussi « Compte X Premium » pour garder le 1080p).

## Vérification v6.9 — Restaurer les visages (5 minutes)
1. Ouvre retoucheproai.com, touche « Restaurer les visages d’une photo (IA, essai) » et choisis une vieille photo floue avec un visage.
2. Accepte le téléchargement (86 Mo, une seule fois ; de préférence en Wi-Fi).
3. Note : le temps total, si l’onglet se ferme ou se recharge (= mémoire insuffisante), et si la personne est toujours reconnaissable.
4. Glisse la barre avant/après, touche « Carte » (rose = détails inventés), baisse la force à 50 % et regarde la différence.
5. Recommence avec une photo nette récente : le message doit dire « déjà net, laissé tel quel ».

## Vérification v7.0 — Retirer un filtre du visage (5 minutes)
1. Touche « Retirer un filtre du visage (IA, essai) » et choisis une photo Snapchat/Instagram avec museau, oreilles ou moustaches.
2. Accepte les téléchargements (une seule fois).
3. Note : ce qui a été retiré, ce qui reste, ce qui a été effacé à tort (bouton « Carte »), le temps, et si l’onglet s’est fermé.
4. Si le filtre agrandit les yeux ou affine le visage : « Proportions », ajoute une photo de toi sans filtre, règle les curseurs.
5. Recommence avec une photo sans filtre : le message doit dire que rien n’a été trouvé.
