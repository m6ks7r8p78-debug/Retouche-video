# Retouche Cinema AI — P5 « Main • Objet • Bouche • Fumée »

**Statut : prototype expérimental ; première vidéo FICTIONNELLE générée, **aucun modèle de génération vidéo entraîné sur les 157 médias**.**

## Pourquoi ce cas de test ?

La fumée et la cigarette mettent au défi la cohérence de personnages dans les vidéos :

1. Un personnage adulte fictif garde le même visage, les mêmes mains et la même tenue.
2. Les doigts tiennent une cigarette de longueur stable entre les prises.
3. La main monte, la cigarette atteint les lèvres, puis la main s'éloigne.
4. L'expiration de fumée commence près de la bouche et se dissipe. Les mouvements peuvent être perturbés par les courants d'air ; les règles sont des **indices à revoir**, pas des lois physiques obligatoires.
5. La scène reste continue malgré les changements de plan.

Référence méthodologique : [HOIGen-1M, CVPR 2025](https://openaccess.thecvf.com/content/CVPR2025/papers/Liu_HOIGen-1M_A_Large-scale_Dataset_for_Human-Object_Interaction_Video_Generation_CVPR_2025_paper.pdf). Une apparence globalement constante ne prouve pas la qualité des contacts main–objet. Le générateur [Wan2.2](https://github.com/Wan-Video/Wan2.2) propose plusieurs voies vidéo, dont Animation, mais n'est **pas installé ou exécuté dans P5**, et exige une infrastructure GPU appropriée.

## Architecture réelle

- `smoke_action_gate.py` : vérification structurée de la séquence d'événements annotée par une personne ; test des contacts approximatifs en **coordonnées 2D normalisées**, des identifiants d'objets et des contraintes d'éligibilité ; retour `candidate_only`, `review_required` ou `rejected`. N'affirme jamais une identité ou une physique 3D prouvée.
- `smoke_scene_adapter.js` : instructions textuelles de mouvement pour chaque clip du manifeste P2, **sans changement de schéma P2**, sans aucune activation de moteur IA ou d'envoi réseau. Réservé dans P5 à des personnages adultes fictifs et scènes 100 % texte.
- `examples/synthetic_annotations.json` : protocole fictif ; aucune annotation d'une personne réelle.
- `tests/` : 18 tests Python + 15 tests Node.js P5.
- `index.html` : interface mobile hors ligne avec un MP4 fictif inclus localement et une lecture par étapes ; aucun média personnel.

## Premières images générées

Création d'une séquence animée de **12 images originales** à 356 × 358 pixels, 180 ms par image (2,16 s). Le MP4 échantillon répète cette séquence deux fois, est redimensionné à 712 × 716 et encodé en H.264 à 24 i/s (4,33 s). Cette cadence d'encodage **ne représente pas** 24 images originales distinctes par seconde ; le mouvement sera encore saccadé. Pas d'audio, pas de modèle vidéo GPU, pas d'identité provenant du corpus privé.

## Audits privés

Huit sources du laboratoire v3.6 ont été réauthentifiées par SHA-256 et évaluées sur des signaux de mouvement globaux, sans extraction d'images exportées. Le registre privé correspondant ne figure **ni dans ce code, ni dans le ZIP public, ni sur GitHub**.

Ces sources ne sont **pas** automatiquement étiquetées « fumeuse » ; elles demandent une qualification adulte/non-sexuelle, une annotation temporelle des phases et une vérification des droits spécifiques. L'autorisation générale d'entraînement accordée par l'utilisateur est enregistrée, mais elle ne remplace pas la vérification de l'âge des personnes filmées ni une annotation correcte de l'action.

## Tests

À partir du dossier P5 dans le dépôt (`studio-cinema/p5`) :

```bash
python -m pytest -q tests/test_smoke_action_gate.py
node --test tests/test_smoke_scene_adapter.cjs
```

Les tests JS importent le module P2 depuis `../p2/cinema-render-plan.js` ; ce fichier existe dans le dépôt complet. Dans le ZIP autonome, il est inclus dans l'arborescence `p2/`.

## Protections

- Ne jamais publier de photos, de clips, d'identifiants biométriques, de modèles dérivés ni de données d'entraînement personnelles sur le dépôt public.
- Le pilote fonctionne uniquement avec des personnages **adultes fictifs**. Les scènes réelles du corpus restent dans un environnement privé, sans copie de visage pour créer des personnages.
- Exclure les scènes dont l'âge du sujet ou le contexte sexuel ne sont pas vérifiés. Le script bloque l'utilisation supervisée de ces séquences.
- Le code n'envoie aucun fichier à des serveurs et ne télécharge aucun modèle ; les futures générations GPU devront être autorisées explicitement.
- Les résultats `candidate_only` ne sont pas une preuve d'authenticité, d'identité, de stabilité 3D ni d'une génération photoréaliste convaincante.

## Prochaine expérience

Sélectionner 10–20 **séquences admissibles et indépendantes**, annoter les phases (`raise`,`lip_contact`,`inhale`,`lower`,`exhale`,`smoke_drift`), marquer les incertitudes, puis construire un petit banc de référence manuel. Seulement ensuite : entraîner un modèle d'événements temporels et comparer sa qualité à une règle déterministe et à un modèle de suivi de points, avec familles de scènes séparées en entraînement/validation/test. En parallèle, brancher un véritable modèle vidéo sur GPU après revue de sa licence et de sa capacité à préserver les contacts main–objet.
