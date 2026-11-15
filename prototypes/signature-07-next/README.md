# RetoucheProAI — Signature 07 / étude d'évolution non publiée

## Références sûres
- Source concrète : `design-signature-07-editorial` (PR #8, original conservé).
- Le nom de cette branche **ne prouve pas** que ce prototype est la « V7 » préférée par l'utilisateur. Cette ambiguïté doit être levée en comparant les captures d'origine.
- V8 vient de V5 et écarte Signature 07 (texte de PR #9). Ne pas utiliser V8 comme référence.

## Modifications expérimentales
- La grammaire éditoriale de Signature 07 est préservée : papier clair, encre foncée, contraste serif/sans, découpes géométriques, couleurs franches mais contrôlées.
- CTA à découpe angulaire et état tactile retravaillé ; pas de halo ni de grand objectif artificiel.
- Parcours repéré en quatre étapes (importer / aperçu / comparer / enregistrer).
- Inspection **réelle mais seulement technique et locale** du média : dimensions, taille et nom du fichier.
- Rayon discret de quatre familles d'outils, explicitement étiquetées comme non connectées (à part les aperçus colorimétriques).
- Galerie temporaire du média de la session.
- Export photo JPEG/PNG/Preset X via Canvas de la maquette originale ; les médias vidéo ne sont pas exportés.

## Validation effectuée (environnement local Chromium)
- Test via `page.set_content()` de la version autonome (le navigateur géré refuse `file://` et `http://127.0.0.1` avec `ERR_BLOCKED_BY_ADMINISTRATOR`).
- 320 × 700, 375 × 812, 390 × 844, 430 × 932, 768 × 1024 : aucun débordement horizontal, aucune exception JavaScript.
- Navigation, outils déclaratifs, curseur clavier 50→55, export PNG réel ~498599 octets, import d'un PNG synthétique testé.
- Les captures PNG proviennent du DOM rendu par Chromium en local, pas d'une génération d'image.
- Safari sur iPhone physique, chaîne PWA, mémoire thermique, connecteurs IA et pipeline vidéo : **non testés ici**.

## Restrictions
Pas de déploiement, aucune modification de `main`, aucun média privé vers GitHub, pas de promesse de restauration IA ou de sortie vidéo. Ne pas fusionner avant identification de la V7 réellement préférée puis revue esthétique, branchement métier et tests de non-régression.