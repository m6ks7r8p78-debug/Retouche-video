# Allumer Premium (le jour J)

Tout est prêt et éteint. Prix et contenu des offres : OFFRES.md. Tests : `node tests/abo.test.mjs` (14 vérifications).

## 1. Préalables (propriétaire)
- Statut micro-entrepreneur (SIRET), compte Polar (polar.sh) relié à son compte bancaire.

## 2. Chez Polar (propriétaire, guidé par Claude)
- Créer 3 produits : « Pass 7 jours » 2,99 € (paiement unique), « Mensuel » 5,99 €/mois, « Annuel » 34,99 €/an.
- Sur chaque produit, ajouter l'avantage **License Keys** (pass : expiration 7 jours ; abonnements : sans expiration).
- Récupérer : l'identifiant d'organisation, les 3 liens de paiement, le lien du portail client.

## 3. Côté Claude
- Serveur des liens (`serveur/worker.js`, v6, **pas encore déployé**) : déployer, puis variable `POLAR_ORG` = identifiant d'organisation.
- `abo.js` : `actif: true`, coller les 3 liens dans `paiement`, le portail dans `portail`.
- `sw.js` : changer `C`. Publier, puis acheter un pass test et vérifier l'activation de bout en bout.

## Ce que voit l'utilisateur gratuit une fois allumé
- Bouton « Premium » en haut ; cadenas 🔒 sur 4K, IA, filtre, effacer, Time Repair, regrouper, lot.
- Toucher un cadenas ouvre l'offre (3 formules) ; après paiement, le code s'affiche chez Polar et arrive par e-mail ;
  il le colle dans « J'ai déjà un code Premium ». Premium reste actif hors ligne 7 jours entre deux vérifications.
- App des stores : mêmes offres, payées avec le compte Apple / Google (voir app-stores/README.md).

## Partie légale le jour J (voir aussi LEGAL.md)
- mentions-legales.html : passer du régime « non professionnel » (anonymat, art. 1-1 II LCEN) aux mentions complètes :
  nom, prénom, adresse, téléphone, « EI », SIRET. Obligatoire dès qu'il y a des revenus (pubs ou Premium).
- cgv.html : remplacer [NOM PRÉNOM], [ADRESSE], [NUMÉRO], [NOM ET SITE DU MÉDIATEUR] ; retirer l'encadré « Pas encore en vigueur »
  et la balise noindex ; ajouter cgv.html au sitemap.
- Adhérer à un médiateur de la consommation (obligatoire pour vendre aux particuliers).
- Vérifier que Polar envoie un rappel avant chaque renouvellement annuel (promis dans les CGV) ; sinon le programmer.
- confidentialite.html : passer les parties « Publicité » et « Premium » du futur au présent.
