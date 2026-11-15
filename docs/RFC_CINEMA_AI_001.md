# RFC 001 — Retouche Cinema AI
**Statut : vision produit et architecture proposée (non implémentée)**  
**Date : 2026-11-15**  
**Portée : documentation uniquement. Aucune génération vidéo activée par ce document.**

## Vision produit

RetoucheProAI doit proposer un même point d'entrée facile à comprendre :
> « Décris ton film, ou ajoute une photo/vidéo. Nous construirons le scénario, les plans, les personnages, le son et le montage à partir de tes indications. »

L'utilisateur peut être novice ; parcours principal en trois actions : **Décrire / Importer / Créer**.
Le premier lancement présente un seul champ central et des propositions courtes. La fonction de restauration existante reste disponible sans être noyée dans le studio de création. Aucun changement du produit existant en production sans vérification iPhone Safari physique.

## Entrées

- **Texte** : description libre en français ou autre langue, style cinématographique, durée, format, événements, dialogues, lieu et mouvements.
- **Photo autorisée** : référence de personnage, tenue, décor ou plan. Prévisualiser localement ; n'envoyer aucun fichier à un fournisseur distant sans consentement spécifique explicite.
- **Vidéo autorisée** : animation ou continuation, transfert de mouvement, environnement, costume, image de référence ou retouche. Exiger confirmation explicite de la portée de chaque transformation.
- **Voix et son** : dialogues générés ou échantillons de voix avec droit d'utilisation / consentement explicite de la personne concernée.

La création de personnages purement fictifs doit être le parcours par défaut.

## Sorties

1. « Bible » du film : personnages, apparence et garde-robe, décors, objets, gestes, accents, relations, luminosité, identité visuelle, contraintes de continuité.
2. Scénario et **découpage en plans** (shots) avec identifiants stables, durées, objectifs, actions, mouvements, voix, sons et références de cadrage.
3. Rendu de plans audio/vidéo par moteur interchangeable ; chaque rendu conserve version et provenance.
4. Contrôle de qualité par plan ; refus de présenter un résultat incohérent comme fidèle ; variantes si échec.
5. Assemblage multi-plans, retouches locales, export normal / maximum / pour X. Les durées importantes nécessitent découpage, continuité et montage.

## Modules techniques envisagés

| Composant | Responsabilité | Contrat |
|---|---|---|
| Cinema Director | Convertit la demande en bible, screenplay, shotlist JSON | Ne produit pas de pixels |
| Character Memory | Références et contraintes de continuité par personnage | Ne déduit ni ne certifie l'identité réelle |
| Scene & Interaction | Geste, objet tenu, regard, posture, trajectoires, collisions | Rapporte les impossibilités |
| Shot Renderer Adapter | API commune de rendu texte/image/vidéo/audio vers des moteurs autorisés | `render(shot, refs, consent, options)` ; état `pending/running/failed/completed` |
| Audio & Dialogue | Voix, timing, synchronisation labiale, ambiance, sons | Consentement voix distinct |
| Continuity QA | Cohérence personnage/tenue/lieu/objet entre plans, mouvement des mains | Distingue score heuristique et preuve |
| Export Director | Montage, transitions, traitement qualité, export | Conserve qualité et transparence sur images inventées |
| Privacy & Rights Gate | Justificatifs, consentement par usage, journal, expiration/suppression | Blocage par défaut sur partage/entraînement |
| Resource Director | Exécution iPhone possible versus GPU distante opt-in | Jamais prétendre que 22B tourne dans Safari iPhone |

### Modèles candidats à expérimenter (pas de dépendance intégrée)

- **LTX-2.5** : création audio-vidéo et séquences multi-plans ; code Apache-2.0, *poids soumis à une licence communautaire différente* (source : https://github.com/Lightricks/LTX-2).
- **Wan2.2** : texte-vers-vidéo, image-vers-vidéo, animation de personnage et parole-vers-vidéo (source : https://github.com/Wan-Video/Wan2.2).

Toute intégration doit vérifier licence, conditions commerciales, performance et coût réel. Modèles RetoucheProAI existants : modules de restauration, de suivi et de contrôle ; ils **ne constituent pas aujourd'hui** un générateur de film photoréaliste complet.

## Parcours iPhone — contrat UX

**Écran 1** : « Que veux-tu créer ? » Texte libre + Ajouter une photo/vidéo + exemple de création ; bouton « Préparer mon film ».  
**Écran 2** : résumé naturel modifiable : personnage, décor, événement, paroles, durée, format, style ; « Continuer ».  
**Écran 3** : séquences organisées en cartes de plans avec aperçu storyboard, sans afficher de faux rendus comme vidéos générées.  
**Écran 4** : génération réelle uniquement si un moteur est activé et le financement GPU disponible ; progression d'un job réel, échecs gérés, jamais de succès simulé.  
**Écran 5** : visionnage, corrections en langage naturel, export.

Un panneau « Réglages avancés » contient contrôle des masques, référence visuelle, cohérence des visages, mouvement, qualité et cadence. Les actions fréquentes restent accessibles en 1 geste. Contraste WCAG AA, grandes zones tactiles, réduction des animations et assistance texte/Voix.

## Exemple de schéma JSON minimal (fictif, sans média)

```json
{
  "schema_version": "cinema-rfc-001",
  "project_id": "demo-cafe",
  "input_mode": "text",
  "status": "storyboard_only",
  "characters": [
    {"id": "c1", "fictional": true, "description": "femme adulte aux cheveux bruns", "consent_scope": "fictional"}
  ],
  "shots": [
    {"id": "s1", "duration_seconds": 5, "location": "salon", "action": "regarde par la fenêtre", "character_ids": ["c1"], "dialogue": ""},
    {"id": "s2", "duration_seconds": 5, "location": "salon", "action": "prend une tasse de café et décroche son téléphone", "character_ids": ["c1"], "dialogue": "Allô ?"}
  ],
  "rendered_video": null,
  "reference_media_exported": false
}
```

## Sécurité, droits et données

- Choisir des personnages fictifs ou disposer de droits et autorisations spécifiques sur l'image, la voix et les vidéos des personnes réelles.
- Aucune publication ni partage des médias personnels ; aucune utilisation pour entraînement sans autorisation *explicite et traçable*. Ne pas inférer une permission de publication d'une autorisation d'analyse ou d'entraînement.
- Restreindre les usages trompeurs non consentis, en particulier lorsque la scène présente une personne identifiable faisant ou disant quelque chose qu'elle n'a pas fait.
- Séparer ressources de démonstration publiques et coffre privé : **aucun média privé, aucun modèle dérivé de personnes réelles et aucun manifeste de corpus ne doivent être ajoutés au dépôt GitHub public**.
- Conserver un registre de provenance des scènes synthétiques et signaler les portions générées.
- La génération distante GPU exige un consentement distinct et une politique de rétention/suppression contrôlable.

## Plan de livraison vérifiable

| Phase | Livrable | Critère d'acceptation |
|---|---|---|
| P0 (maintenant) | RFC + prototype storyboard hors ligne | Décrire et visualiser un découpage JSON, aucune promesse de rendu |
| P1 | Director + schéma validé + tests | Plans et personnages stables, durées cohérentes, cas ambigus gérés |
| P2 | Premier moteur de rendu branché expérimentalement | Vidéo réelle courte, reproductibilité et journal, évaluation humaine |
| P3 | Photo/vidéo -> scène avec droits vérifiés | Identité visuelle cohérente et consentements enregistrés |
| P4 | Dialogue, mouvements avec objets, continuité temporelle | Tests sur lèvres, mains, accessoires et transitions |
| P5 | Films multi-plans + export sur iPhone | Tests Safari iPhone physique, coût documenté, aucune vidéo privée publiée |

**Important :** la création automatique de films longs, photoréalistes et cohérents n'est pas acquise par la simple addition de ces modules. Elle dépend de la qualité des moteurs, de tests sur des scènes difficiles et de ressources de calcul.

## Isolation

RFC expérimentale sur branche dédiée. Ne pas modifier `main`, ne pas fusionner la PR studio-3d, ne pas déployer `retoucheproai.com` automatiquement.
