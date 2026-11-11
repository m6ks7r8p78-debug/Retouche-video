# Rapport de tests final — v6.8 (11/11/2026)

## Réalisé et testé (Chromium, sans carte graphique)
- `tests/visage.test.mjs` 12/12 : visage trouvé avec ses 5 repères ; rien sur une image sans visage ; aucune proposition sur la photo sans filtre ni sur ses versions floue et sombre ; truffe, deux oreilles, langue et lunettes **dessinées par le test** proposées ; masque couvrant la truffe ; tête penchée ; suivi sur 24 images (trou comblé, tremblement divisé par 4) ; coupe de plan ; report de masque (98 % de recouvrement) ; bouton dans « Effacer une zone » et annulation.
- `tests/consentement.test.mjs` 7/7 sur une vraie base SQLite avec le schéma livré : parcours à deux personnes, usage unique et expiration des invitations, refus des mineurs, révocation, suppression, purge, registre chaîné, aucun jeton en clair, téléversement toujours refusé.
- `tests/v67.test.mjs` 18/18. Non-régression : voir le message de commit.

## Réalisé, non testé en conditions réelles
- Export « Préparer pour X » : relié à l’export, mais l’encodage H.264 ne fonctionne pas dans le navigateur de test ; à essayer sur iPhone.
- Rien n’a été essayé sur un vrai iPhone / Safari. La reconstruction (MI-GAN) après proposition n’a pas été relancée ici (modèle absent des tests).
- Les seuils des zones sont réglés sur **un seul visage** et des accessoires dessinés : sur de vrais filtres, attendre des oublis et des fausses propositions (barbe, vraies lunettes, bonnet).

## Préparé mais désactivé
Serveur de consentement (non déployé, aucune base créée). Collecte de médias : double verrou, aucun stockage.

## Non réalisé
Effacement d’accessoires **en vidéo** (le suivi existe, pas la reconstruction image par image) ; détection des déformations du visage et du maquillage (pas de mesure fiable sans image d’origine) ; restauration de visage (voir `REGISTRE_MODELES_LICENCES.md`) ; validation juridique/RGPD (ne peut être faite que par un juriste).
