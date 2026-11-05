# Publicités — préparées, éteintes (v4.9)

Tout est dans `pub.js`. Tant que `actif: false`, l'app se comporte exactement comme avant (vérifié par `tests/pub.test.mjs`).

## Ce qui s'affiche une fois allumé (sur le nom de domaine indiqué seulement)
- Une bannière discrète en bas de page, marquée « Publicité », sous le texte de confidentialité.
- Avant « Enregistrer » (vidéo, photo, toutes les vidéos, vidéo regroupée) : une fenêtre propose une courte pub récompensée.
  « Annuler » → rien n'est enregistré, la pub reste prête. Pub vue jusqu'au bout → « Merci ! » → bouton « Enregistrer maintenant »
  (un vrai toucher est nécessaire pour que l'iPhone ouvre « Enregistrer la vidéo »). Pub fermée avant la fin → message, pas d'enregistrement.
- Si aucune pub n'est prête (pas de pub disponible, bloqueur, réseau) : enregistrement direct. L'utilisateur n'est jamais bloqué.
- Lien « Cookies et pubs : modifier mon choix » (message de consentement certifié de Google).
- « Coller un lien » est masqué (`masquerLiens: true`) : les règles Google interdisent les outils de téléchargement de vidéos
  d'autres plateformes sur un site qui affiche leurs pubs.
- Jamais de pub sur github.io ni dans la version Claude (contrôle du nom de domaine).

## Pour allumer (étapes à faire avec le propriétaire, aucune dépense sans son accord)
1. Acheter un nom de domaine (≈ 10 €/an) et le relier à GitHub Pages (fichier `CNAME` + réglages DNS).
2. Créer le compte AdSense (propriétaire majeur), ajouter le domaine, attendre la validation du site.
3. AdSense → « Confidentialité et messages » → activer le message RGPD (Europe).
4. Créer un bloc d'annonces « display » → numéro dans `banniere`.
5. Créer le compte Google Ad Manager relié à AdSense, un bloc « Récompensé » (web) → chemin dans `recompense`.
6. Ajouter `ads.txt` à la racine du site (ligne fournie par AdSense).
7. Dans `pub.js` : `actif: true`, `domaine`, `adsense`, `banniere`, `recompense` ; changer `C` dans `sw.js` ; publier.
