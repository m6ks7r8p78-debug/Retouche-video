# Cinema P29 — aperçu mobile consultatif de fidélité

## Objectif

Créer un aperçu mobile clair et accessible, fondé **uniquement sur les mesures fictives validées** par P25→P28. L'interface n'analyse aucune vidéo, ne se connecte pas à NOVA, au Directeur IA ni au site public. Elle ne peut ni choisir de réglage, ni importer/exporter, ni modifier l'original.

**Branche** : `chatgpt-cinema-p29-mobile-advisory-20261115` (basée sur P28 #48). Le dépôt `main`, le site retoucheproai.com, AURA, NOVA, le Directeur IA, la PWA et le registre commun sont préservés. Aucune mise en ligne automatique.

## Composants réels

- `src/p29_build.cjs` reçoit **uniquement** la sortie de `p28_readonly_bridge.cjs`. Il vérifie le schéma, la preuve `synthetic-tested`, les neuf cas, les données audio, l'absence totale d'autorisation d'action et l'absence de diagnostics NOVA/Directeur rattachés à une vidéo réelle. Il projette seulement quatre nombres bornés 0–9 et des textes entièrement rédigés dans le code, sans reprise libre de métadonnées privées.
- `preview/index.html` : interface HTML sémantique, français, avertissement visible « démonstration synthétique / aucune vidéo personnelle », un encadré de diagnostic, **deux chiffres faciles à lire** et un seul bouton optionnel d'explication.
- `preview/preview.css` : mise en page mobile minimaliste claire, typographie adaptable, disposition jusqu'à 320 pixels et respect de `prefers-reduced-motion`.
- `preview/preview.js` : valide encore le petit objet de preuve avant de remplir l'écran via `textContent` (**jamais `innerHTML`**). Si la preuve est absente ou modifiée : statut « diagnostic indisponible », chiffres masqués, bouton désactivé. Une interaction locale ouvre ou referme les explications avec `aria-expanded` et `aria-controls`.
- `preview-data.js` est généré à l'exécution par le constructeur à partir du JSON P28 validé ; les données sont **des chiffres de dessins vectoriels fictifs**, pas un fichier utilisateur.
- CSP stricte : `default-src 'none'`, scripts et styles du même hôte uniquement, `connect-src 'none'`, pas d'images, de sons, d'objets externes, de service worker, de formulaire, de sélecteur vidéo, de stockage, de réseau ou de bouton d'export.

Le message essentiel est : **une deuxième compression peut détériorer l'image, et la taille plus élevée n'implique pas la récupération de pixels perdus.** C'est un **exemple de laboratoire**, jamais une prédiction de l'export d'un utilisateur.

## Test reproductible

En générant d'abord les rapports P25/P26 puis la passerelle P28 (voir leurs README) :

```sh
node --test studio-cinema/p29/tests/test_p29_contracts.cjs
node studio-cinema/p29/src/p29_build.cjs \
  studio-cinema/p28/results/proof/p28_readonly_handoff.json \
  studio-cinema/p29/results/preview
```

Pour l'UX en navigateur sous Linux, avec Python Playwright et moteurs Chromium/WebKit installés :

```sh
python studio-cinema/p29/tests/p29_browser_smoke.py \
  --preview studio-cinema/p29/results/preview \
  --out studio-cinema/p29/results/browser
```

La CI `.github/workflows/ci-cinema-p29.yml` **reconstruit** P25 et P26 par les vrais encodeurs H.264 sur 480 images synthétiques ; revalide P27 et P28, y compris leurs API de NOVA et Directeur IA sur des copies de commits épinglés ; génère P29 ; puis exécute ses tests sur **Chromium et WebKit Linux** en viewport **390×844 et 320×700**. Les tests vérifient le bouton d'explication, les comptes 9/9 et 3/9, l'absence de débordement horizontal et de requêtes externes, et le refus de données altérées. Captures d'écran du rendu **fictif** et page statique générée sont conservées en artefact GitHub temporaire.

## Limites non négociables

- **Preuve `synthetic-tested` et tests d'affichage navigateur Linux seulement**. WebKit Linux n'est pas Safari sur iPhone physique. Une taille de viewport simulée n'est pas un test de batterie, RAM ou capacités d'encodage.
- **Pas de validation esthétique ou perceptuelle sur vraies vidéos**. Les chiffres viennent de dessins 720×720 H.264, 8 s, 60 i/s, 9 recompressions contrôlées, non de l'utilisateur.
- Aucune prédiction sur HEVC, HDR, 4K, 8K, export réel sur X, ni garantie d'éliminer la compression des plateformes.
- L'aperçu ne peut pas affirmer « votre vidéo est mauvaise » : pas d'inspection de fichier utilisateur, pas de note de qualité humaine.
- Le prototype n'est **pas intégré** à l'application principale ni accessible sur le domaine public. L'artefact est un aperçu statique pour tests et revue. Aucune fusion, aucune diffusion de médias privés.
- Aucune utilisation de modèles IA, aucun entraînement et aucun partage communautaire.

## Relais et prochaine étape

**AURA :** examiner la clarté et l'accessibilité de ce module autonome. Pas de réécriture de l'interface AURA, pas de neuf curseurs techniques visibles par défaut.

**NOVA :** P29 illustre une explication possible avant export **sans être branché** sur le précontrôle NOVA. Aucun changement de décision, d'export ou de plafond de ressources.

**Directeur IA :** les constats P27/P28 restent consultatifs. Aucun score de fidélité perceptuelle inventé et aucune sélection automatique de CRF.

**Coordinateur :** consulter les preuves de la PR P29 ; seul le coordinateur peut indexer les résultats sur `coordination-retoucheproai-v1`. La coordination reste asynchrone par GitHub.

Pour une future intégration réelle : PR d'intégration distincte, examen de licence/confidentialité, démonstration HTTPS isolée après accord, vrais tests Safari iPhone physique sur clip fictif, puis vidéos réelles **autorisées et gardées privées**, tests de qualité perceptuelle et respect des choix manuels.
