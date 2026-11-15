# Retouche Cinema AI P20 — Pont temporel P15 ⇄ P19, et garde-fou SmallMotion

**Module expérimental local, sans analyse des 157 vidéos et sans entraînement.** Le but est d'exploiter la nomenclature d'observations P15 pour mesurer précisément **ce que la chorégraphie numérique P19 représente, omet ou place au mauvais moment**. P20 n'est pas un modèle de détection d'émotions, de gestes, de langue ou de visages.

## Ce qui fonctionne

- Lit une chronologie générée par le vrai moteur **P19** (480 commandes à 60 Hz, ou 360 à 45 Hz) et un document d'annotations structurées validé par le vrai **P15**.
- Exige une autorisation d'**évaluation locale** distincte, l'absence de transfert réseau et le maintien du corpus en local. Le rapport ne contient ni nom de fichier, ni notes libres, ni coordonnées anatomiques, ni IDs de réviseurs.
- Retient seulement les événements **visuellement observés, arbitrés par au moins deux réviseurs**; les éléments incertains ou non révisés restent à reprendre.
- Compare uniquement quatre contrôles effectivement présents dans P19 : clignement, regard caméra, contact synthétique filtre/lèvres, présence synthétique de fumée à la bouche. Mesure des recouvrements temporels, jamais un score de réalisme humain.
- **Signale explicitement les absences** : morsure de lèvre supérieure/inférieure, passage de langue, léchage de lèvres, mouvements de langue, etc., en fonction des événements P15 présents. Ils ne sont ni simulés silencieusement ni inférés de SmallMotion.
- Accepte un diagnostic SmallMotion à deux images comme indication **2D non sémantique**. Refuse d'en conclure une main, un regard, un contact, une profondeur 3D ou une intention.

## Exécution

```bash
node --test studio-cinema/p20/tests/test_p20.cjs
node --test studio-cinema/p19/tests/test_p19.cjs studio-cinema/p15/tests/test_behavior_ontology.cjs
```

La fonction `compare(doc, generated, P15, {localEvaluationAllowed:true, alignmentOffsetS:0})` prend des objets en mémoire. Le décalage temporel doit être réglé manuellement et borné à ±2 s ; il n'existe **aucune synchronisation automatique prouvée** entre un clip source et une scène P19 fictive. On ne doit pas interpréter un recouvrement temporel comme fidélité anatomique, style ressenti ou reconnaissance de personne.

## Prochain verrou technique

Avant de progresser sur 157 clips, les événements de lèvres/yeux/mains doivent être détectés/annotés sur des sources consenties, vérifiés indépendamment et validés sur Safari iPhone physique. Il restera à ajouter au générateur les gestes absents, faire vérifier leur rendu **visuel** par comparaison, et réserver les traitements neuraux à un environnement licencié, autorisé et mesuré. La préproduction SmallMotion de la PR #28, AURA et NOVA demeurent **des branches expérimentales distinctes**. Ni `main`, ni le site public, ni les vidéos privées ne sont modifiés par P20.
