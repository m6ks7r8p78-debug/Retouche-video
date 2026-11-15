# Cinema P30 — paquet de démonstration iPhone et rapport manuel local

**Périmètre :** laboratoire Cinema uniquement. Branche `chatgpt-cinema-p30-iphone-manual-bundle-20261115`, fondée sur la PR Cinema P29 #51. Le code du dépôt public, `main`, retoucheproai.com, les branches NOVA/Directeur/AURA et le registre de coordination **ne sont pas modifiés ni déployés**.

## Ce que P30 livre réellement

P29 est un aperçu mobile de constats de **neuf recompressions H.264 purement synthétiques**. P30 empaquette cette interface pour un **essai iPhone effectué manuellement par l'utilisateur**, sans jamais s'arroger une validation iPhone qui n'a pas eu lieu.

Le script `src/p30_package.py` :

1. Accepte **seulement** les quatre fichiers HTML/JS/CSS **déjà régénérés** par le moteur réel P29 et le JSON `p29_synthetic_preview_report.json`.
2. Vérifie **exactement** la provenance fictive, les indicateurs `9/9` et `3/9`, l'absence de sélection de codec ou analyse de média, les limites Safari et la correspondance **octet à octet** entre les chiffres du JSON de référence et leur encodage dans `preview-data.js`.
3. Refuse les fichiers manquants, disproportionnés, liens symboliques, rapports falsifiés, injectés ou privés, ou toute perte de la politique de sécurité de la page P29.
4. Ajoute le lien « Vérifier sur mon iPhone » à l'aperçu P29 **dans le ZIP seulement** ; ne modifie pas les sources antérieures et ne touche pas à l'application RetoucheProAI.
5. Ajoute `test-iphone.html` et ses scripts/styles **100 % locaux** ainsi que `GUIDE_IPHONE.txt`.
6. Construit un ZIP reproductible `Cinema_P30_iPhone_demo.zip`, ses neuf fichiers statiques étant à la racine pour simplifier un éventuel hébergement HTTPS manuel. Un `MANIFEST_SHA256.txt` liste les empreintes SHA-256 des **huit autres fichiers** ; le rapport externe `p30_package_proof.json` contient également l'empreinte du ZIP. Les fichiers sont encodés uniquement depuis une source fictive vérifiée. Aucun média personnel n'est inclus.

### Contenu du ZIP

- `index.html` : aperçu P29 des risques de seconde compression, deux compteurs visibles (9/9 et 3/9), un bouton pour afficher les détails et un lien vers le test iPhone.
- `preview.js`, `preview.css`, `preview-data.js` : présentation et preuves de dessins fictifs.
- `test-iphone.html`, `iphone-check.js`, `iphone-check.css` : formulaire **facultatif de trois observations déclarées**, contrôle local du débordement de la page, du contexte HTTP(S) et du fonctionnement de JavaScript.
- `GUIDE_IPHONE.txt` et `MANIFEST_SHA256.txt` : instructions, limites et intégrité.

### Rapport utilisateur

Une pression explicite sur « Créer mon rapport local » produit **seulement dans le navigateur** le JSON `retouche-cinema-p30-manual-iphone-report-v1` incluant : catégorie approximative de largeur (compact/mobile/wide), présence de débordement horizontal, contexte de page `https/http/local-file/other`, état du contexte sécurisé, trois réponses volontaires et des réserves de preuve. Aucun nom de fichier, URL/hôte, user agent, identifiant d'appareil, géolocalisation, IP ou horodatage n'y apparaît. Le rapport n'est transmis **à aucun serveur**.

- Bouton « Copier le rapport » : presse-papiers si autorisé par Safari, sinon sélection visible du texte à copier manuellement.
- Bouton « Enregistrer en JSON » : sauvegarde locale `Blob` sollicitée par l'utilisateur avec indication de repli vers la copie du texte.
- Le statut `manual_feedback_unverified` et `physical_iphone_safari_verified_by_laboratory=false` restent vrais **même lorsque l'utilisateur coche toutes les cases**. Un test utilisateur est informatif et ne vaut pas vérification indépendante.
- Si les preuves sont altérées, le JSON signale `evidence_loaded=false` et aucun statut de réussite de labo n'est créé.

## Étapes pour iPhone, sans Mac/PC

L'artefact GitHub contient le ZIP de démonstration. Depuis l'iPhone, on peut le télécharger dans **Fichiers**, extraire l'archive d'artefact GitHub puis `Cinema_P30_iPhone_demo.zip` si GitHub l'a enveloppé dans sa propre archive.

**Pour tester réellement Safari**, il faut ensuite héberger **manuellement les fichiers extraits du ZIP** sur une adresse de démonstration HTTPS que l'utilisateur contrôle, distincte du domaine public et de `main`. La consultation directe de fichiers `file://` depuis l'application Fichiers peut empêcher les scripts de fonctionner correctement : **ne pas interpréter cet échec comme une incompatibilité vidéo/iPhone**. P30 ne propose ni ne réalise de publication automatiquement. Aucun compte ni hébergement payant n'est exigé par le code, mais la disponibilité et l'installation d'un hébergement HTTPS relèvent du déploiement manuel.

Sur Safari physique : ouvrir `index.html`, contrôler 9/9 et 3/9, ouvrir et refermer les explications, utiliser le lien local « Vérifier sur mon iPhone », cocher **uniquement les observations vraies**, puis produire et conserver localement le JSON. Aucun vrai fichier vidéo ne doit être importé ni publié.

## Validation CI

La CI `.github/workflows/ci-cinema-p30.yml` :

1. Reconstruit **les vrais fichiers P25/P26** depuis P19/P23 fictifs, réexécute P27/P28 et les vrais contrats NOVA/Directeur sur des snapshots épinglés (branches non modifiées), puis reconstruit les fichiers P29.
2. Exécute les tests `tests/test_p30_package.py` contre l'altération des preuves, les secrets, les fichiers arbitraires et la reproductibilité. L'archive est décompressée et ses empreintes SHA-256 vérifiées.
3. Ouvre **la vraie archive ZIP construite** sur un serveur local de CI dans **Chromium et WebKit Linux**, en viewports **430×932, 390×844, 320×700**, vérifie les deux compteurs, le lien, les trois cases à cocher, la génération et le **téléchargement local du JSON**, zéro débordement et zéro requête externe.
4. Injecte une preuve factice dans une copie isolée et constate `evidence_loaded=false` avec refus de tout statut de validation.

**Attention** : même si tous ces tests sont réussis, cela reste `synthetic-tested` + `Linux-browser-tested`, **pas `physical-iphone-tested`**.

## Clauses de sécurité et limites

- Aucun import de vidéo, aucune retouche, conversion, sortie vidéo, publication sur X, stockage permanent, télémétrie ou partage automatique.
- Aucune donnée privée ou poids neuronal. Les chiffres 9/9 et 3/9 sont issus de **dessins fictifs**, pas d'une vidéo réelle.
- La qualité humaine, les performances iPhone (RAM, chaleur, batterie), HEVC/4K/HDR/8K, l'export X et la restauration IA ne sont pas mesurés.
- Le navigateur iPhone devra être testé **physiquement par l'utilisateur** ; les résultats autodéclarés nécessiteront une analyse distincte.
- La page d'exemple sert uniquement à un test d'interface **non productif**. Aucun merge, aucune publication sur le domaine public, aucun accès à un corpus personnel.

## Coordination / intégration

Un relais de preuves sera inscrit dans la PR P30. Les autres conversations pourront le consulter **de façon asynchrone**, pas en temps réel. Le coordinateur, et lui seul, peut mettre à jour `coordination/REGISTRE.json` après examen.

**AURA :** examiner la simplicité et l'accessibilité du questionnaire ; ce n'est pas une nouvelle interface de production. **NOVA :** ne pas transférer les métriques fictives dans un statut d'export vrai ; aucune limite de capacité du pilote n'est changée. **Directeur IA :** même avec un compte-rendu manuel réussi, les avis restent consultatifs ; aucune sélection de codec ou restauration automatique.

Étape suivante après preuve et usage iPhone physique indépendant : décider d'une éventuelle PR d'intégration séparée, sous contraintes de consentement et de fidélité.
