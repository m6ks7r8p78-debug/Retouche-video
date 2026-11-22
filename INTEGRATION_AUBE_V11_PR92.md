# RetoucheProAI — intégration expérimentale AUBE v11.0 × PR #92

**Statut : brouillon de préproduction, NE PAS FUSIONNER NI DÉPLOYER avant Safari physique.**

## Source et portée

- Base officielle : `main` v11.0 `4dd8c294ea43a545f049844517e1aa6fb9d72410` (AUBE V2.2 publiée par Claude).
- Protection IA : portage depuis la [PR #92](https://github.com/m6ks7r8p78-debug/Retouche-video/pull/92), branchée historiquement sur v10.2 et donc impossible à fusionner directement sans risque de régression.
- Branche d'essai : `chatgpt-v11-aube-pr92-integration-20261122`, version `v11.1-essai`, cache **`retouche-v111`**.
- Aucune vidéo personnelle, aucun entraînement, aucun nouveau poids IA, aucune mise en ligne.

## Modifications déjà proposées

1. `app.js` : test volontaire du **vrai** modèle SR sur une région d'une seule image native, sans lancer un aperçu lourd au chargement ; diagnostics honnêtes et nombre de frames IA effectivement traitées.
2. `mode-simple.js` : un bouton Auto et possibilité de retoucher après le premier export ; repli sans IA explicitement indiqué si les ressources sont insuffisantes.
3. `budget-ia.js`, `sr.js`, `sr-gpu.js`, `kaggle.js` : estimation de la complexité, plafonds prudents avant export, interruptions coopératives entre les tuiles et vérification des délais distants. Le délai **600 s = limite de sécurité, pas délai d'export certifié**.
4. `index.html` : 169 identifiants historiques préservés + 16 nouveaux contrôles = **185** ; les quatre injections AUBE présentes. Suppression d'une règle PR92 qui cachait `#flow` et `#outils` même quand AUBE en avait besoin.
5. `sw.js` : `retouche-v111`, nouveau `budget-ia.js` précaché, quatre fichiers AUBE présents. L'empreinte SHA-256 doit être recalculée et **vérifiée dans la CI**.
6. Aucun octet modifié dans `aube.css`, `aube.js`, `aube-etapes.css`, `aube-etapes.js`, `sr.bin` et `sr2.bin`.

## Tests et limites

Tests statiques et simulations sans GPU :
```bash
node tests/v11_aube_pr92.test.mjs
node tests/budget_ia.test.mjs
node tests/simple_auto.test.mjs
node tests/sw.test.mjs
```
Les deux workflows `ia-vitesse.yml` et `v11-aube-pr92.yml` contrôlent les fichiers et interdisent une empreinte PWA périmée.

**Pas encore prouvés :** 97 parcours réels AUBE sur cette combinaison, rendu Safari iPhone 15 Pro Max, conversion du clip de 0,7 s, fichier MP4 H.264/AAC complet, fidélité avant/après, export 4K et temps limite 10–15 min sur les vidéos prises en charge. La PR originale #92 a elle-même demandé ces tests matériels avant fusion.

## Règle de publication

1. CI verte et tests AUBE complets sur cette combinaison.
2. Safari **physique**, clips 0,7 s et 480p, sauvegarde Photos, audio et absence de faux 4K.
3. Test d'un fichier 5 min, puis seulement essais 30–60 min, avec reprise OPFS.
4. Revue des résultats par Claude, puis éventuelle fusion **explicite** dans `main`. Ne jamais fusionner automatiquement.

**Un arrêt de calcul à 600 s ne signifie pas qu'une vidéo a été restaurée en 600 s.**

## Diagnostic Chromium du 22 novembre — cause de l'échec vidéo identifiée

La reprise des parcours AUBE dans le Chromium Playwright open source a
donné **88 contrôles réussis, 1 en échec**. Les commandes photo, outils,
interactions AUBE, photo exportée et rechargement hors ligne ont réussi.

Le diagnostic du lecteur vidéo lors de l'import après photo :
```json
{
  "inputCount": 1,
  "videoWidth": 0,
  "networkState": 3,
  "videoErrorCode": 4,
  "videoErrorMessage": "DEMUXER_ERROR_NO_SUPPORTED_STREAMS: FFmpegDemuxer: no supported streams",
  "codecSupport": ""
}
```
Un SECOND scénario indépendant sur la vidéo de **0,7 seconde** échoue
également lors de la lecture des métadonnées du même type de fichier MP4.

**Conclusion diagnostique :** le Chromium installé dans ce banc
n'annonce aucun décodeur pour le codec H.264 et refuse le flux AVANT
le moteur RetoucheProAI. Il ne faut **pas** interpréter cet échec
comme une régression de la restauration. Mais il ne faut pas non plus
déclarer l'export MP4 validé !

**Correction de l'outillage uniquement :** le workflow impose Google
Chrome officiel, et les scripts d'E2E utilisent son exécutable via
`CHROME`. Le codec H.264/AAC est vérifié par un vrai import et un
vrai MP4 de sortie. La CI doit être **relancée et évaluée**.
Aucun changement de l'application n'a été effectué pour contourner
artificiellement ce diagnostic.

**Reste impératif :** Chrome desktop n'est pas Safari physique.
Les vraies performances, fidélité et le délai utilisateur 10–15 min
doivent encore être testés et mesurés séparément sur iPhone.
