# RNE 0.10 — aveuglement de l'invariant photométrique et isolation des sessions

**14 novembre 2026 — Recherche uniquement ; PR en brouillon.**
Aucun nouveau modèle entraîné, poids RNE0.4 figés, aucun déploiement. Les **41 vidéos ajoutées récemment restent totalement hors de cet essai** et hors entraînement. Aucun fichier personnel, image, empreinte individuelle ou checkpoint privé ne figure sur GitHub.

## Pourquoi le résultat RNE0.9 ne prouve pas une protection générale

RNE0.9 refuse une carte de confiance qui excède la borne photométrique calculée sur l'image précédente supposée alignée. Les anomalies de RNE0.9 étaient volontairement injectées **en conservant les anciennes cartes de confiance**, ce qui favorise ce test d'invariant. Une erreur de flux qui produit une nouvelle carte apparemment cohérente peut toujours passer.

Nouvelle vérification, **sur 41 groupes historiques distincts mais déjà vus à l'entraînement**, avec le checkpoint RNE0.4 gelé. La séquence préalable alignée a été décalée de 1 ou 2 pixels, avec bords répliqués. Une carte de confiance a été *réduite* selon le plafond photométrique des nouvelles images, **sans recalculer tout le flux optique aller-retour**. Une variante conserve au contraire la carte périmée. Deux conditions d'entrée : réduction LR propre et simulation H.264 CRF34. **41 × 2 × 4 = 328 reconstructions.**

| Condition | Gain PSNR vs bicubique, LR propre | Refus RNE0.9 /41 | Fortes pertes de plus de 0,5 dB |
|---|---:|---:|---:|
| Aucune perturbation | +0,37483 dB | 0 | 0 |
| 1 pixel de déplacement, confiance recalculée | **−0,52406 dB** | **0** | **20** |
| 2 pixels, confiance recalculée | **−0,53531 dB** | **0** | **19** |
| 2 pixels, confiance périmée | −0,71332 dB | 41 | 29 sans garde |

Sur le mode H.264 : baseline **+0,09870 dB** ; décalage 1 pixel avec confiance recalculée **−0,00347 dB**, 2 pixels **−0,04682 dB**, tous deux **sans aucun refus** ; 2 pixels à confiance périmée **−0,11363 dB** et 41/41 refusés.

Les erreurs de décalage 1 pixel avec confiance recalculée réduisent le PSNR par rapport à la référence non perturbée de **−0,89889 dB** en moyenne pour les 41 groupes LR propres, intervalle bootstrap exploratoire *par groupe* 95 % **[−1,11500 ; −0,73562] dB**. Les 82 contextes avec confiance périmée sur les deux modes ont été refusés, mais **0/164 des contextes avec confiance recomputée**.

**Limites :** les données d'image sont réelles mais les décalages sont artificiels, la confiance recalculée se limite au plafond photométrique, les groupes sont issus du vieux corpus déjà appris, et les seuils RNE0.9 ont été examinés dans la recherche précédente. Ce banc est un test d'angle mort de l'invariant, **pas** une prédiction de régressions sur les vraies vidéos des utilisateurs ni un audit indépendant de défiltrage AR.

## Correctif structurel de recherche : RNE0.10

`outils/rne/rne10/causal_session_guard.py` est une couche de **provenance**, pas un nouveau filtre de restauration :

- Accepte seulement les **images brutes BGR uint8** et un index croissant, avec un token aléatoire éphémère par vidéo (32 caractères hexadécimaux).
- Garde au plus deux images précédentes en mémoire ; réinitialise au changement de vidéo, à une image manquante/inversée, au changement de dimensions ou à une rupture visuelle marquée selon le seuil déjà présent dans RNE.
- **Recalcule dans une fonction indivisible** l'alignement et sa carte de confiance via le `triad.make_arrays` RNE existant. Il n'accepte jamais une image déjà alignée accompagnée d'une carte extérieure.
- Renvoie le bicubique pendant l'initialisation, en cas d'erreur, d'absence de modèle ou si l'option de recherche explicite n'est pas donnée. Sans autorisation de recherche sur l'appel, ne conserve aucun pixel en historique.
- Rapports anonymes sans stockage ou export des images, des poids, des noms de fichier ni des paramètres personnels.

**27 tests synthétiques locaux réussis** : ordre des frames, absence de contamination entre vidéos, coupes, tailles, formats, défaut de modèle, repli bicubique, refus sans autorisation, absence de déploiement/export. Ils sont ajoutés à la CI CPU ; **le succès des Actions distantes reste à confirmer**.

### Ce que RNE0.10 ne corrige pas encore

Le recalcul complet du flux peut **lui-même être faux** malgré des cartes cohérentes. Il manque un banc réellement nouveau avec erreur de suivi naturelle et références de vérité, des scènes obscures/rapides, des mesures indépendantes sur visages et filtres AR, et un test Safari iPhone. Ce garde-fou protège la chaîne de provenance, **sans garantir l'absence de fantômes ou une identité restaurée fidèle**.

**Décision :** RNE0.4 reste le modèle de référence expérimental. RNE0.9 reste une protection incomplète. RNE0.10 est conservé comme correctif de laboratoire, mais **non branché sur RetoucheProAI**, non promu et non fusionné dans `main`. Le bicubique demeure le repli.
