# Modèles IA — fiches de validation

Tous les modèles sont déclarés dans `models.js` (registre unique). Version exacte, source, licence et empreinte SHA-256
y sont figées ; l’app refuse tout fichier dont l’empreinte ne correspond pas. Aucun coût : ni abonnement, ni API, ni serveur payant.
Mesures faites dans Chrome sans écran avec un GPU **simulé sur le processeur** : la qualité est la même que sur iPhone
(même calcul, même résultat à 0/255 près), mais les **durées ne sont pas représentatives** d’un iPhone.

## 1. Restauration IA « Qualité maximale » — Real-ESRGAN general v3

| | |
|---|---|
| Fichier | `sr.bin` (intégré, 4 853 184 octets, SHA-256 `96811c8c…2b8e46`) |
| Version | realesr-general-x4v3 + realesr-general-wdn-x4v3, release v0.2.5.0, poids FP16, 2 jeux mélangés selon le débruitage |
| Source / licence | github.com/xinntao/Real-ESRGAN — BSD-3-Clause (usage commercial permis avec la mention) |
| Moteur | WebGPU (2 versions de calcul, choisie par appareil), repli WebGL2, repli final : amélioration classique |
| Mémoire | ≈ 140 Mo de mémoire graphique pour une image 1280×720 (calcul d’après les tampons, non mesuré sur iPhone) |
| Utilisé pour | photos et vidéos jusqu’à 1,1 Mpx ; au-delà, la source contient déjà ses détails |

Validation (tests/sorties/qualite, sources : portrait et chat dégradés « vieux téléphone », mesures contre l’original intact) :

| Variante | Portrait PSNR / SSIM / LPIPS | Chat PSNR / SSIM / LPIPS |
|---|---|---|
| Agrandissement simple | 24,36 / 0,710 / 0,374 | 27,81 / 0,725 / 0,498 |
| App sans IA | 24,40 / 0,709 / 0,348 | 26,83 / 0,720 / 0,479 |
| IA Naturel | **24,70 / 0,746** / 0,195 | 27,73 / **0,724** / 0,341 |
| IA Équilibré (par défaut) | 23,83 / 0,738 / **0,186** | 26,91 / 0,709 / **0,321** |
| IA Détails | 23,67 / 0,740 / 0,190 | 26,87 / 0,710 / 0,326 |

À l’œil : blocs de compression et bruit retirés, contours nets ; **limite** : sur un visage de quelques dizaines de pixels,
la peau est lissée et les yeux redessinés (l’information a disparu à la compression, elle ne peut pas être récupérée).
Banc historique du propriétaire (8 images Kodak abîmées, LPIPS) : 0,341–0,371 avec l’IA contre 0,393–0,420 sans.

Version de calcul WebGPU « 4 pixels par fil » (v2.50) : résultat identique à l’ancienne (0 valeur différente sur 1 056 000,
tests/noyau.test.mjs), 1,9 à 2,4 fois plus rapide sur le GPU simulé. Sur iPhone, l’app compare elle-même les deux versions
au premier usage et garde la plus rapide ; le gain réel est à lire dans « Modèles IA → Mesurer la vitesse ».

## 2. Effet de relief — Depth Anything V2 Small

| | |
|---|---|
| Fichier | téléchargé à la première utilisation (27 258 801 octets, SHA-256 `fcf51f1b…f20d`, vérifié contre la valeur publiée) |
| Version | onnx-community/depth-anything-v2-small, révision `4472b73`, `onnx/model_quantized.onnx` (adresse figée : plus de changement silencieux) |
| Licence | Apache-2.0 (Small seulement ; Base/Large sont non commerciales et ne sont pas utilisées) |
| Moteur | ONNX Runtime Web 1.22.0, WebAssembly |
| Validation | test de bout en bout : modèle installé, vérifié, chargé, photo animée 1620×1080, 8 s |
| Secours | zoom lent sans relief |

## 3. Voix plus claire — RNNoise

Intégré (`rnnoise.mjs`, SHA-256 `05a553f5…f95f`). RNNoise : BSD-3-Clause (Xiph) ; enveloppe WebAssembly : Apache-2.0.
Secours : son d’origine conservé.

## 4. Bibliothèque de filtres

Intégrée (`filtres.png`, SHA-256 `804891ac…3ed4`). Données apprises (pas un réseau de neurones), propres à l’app.

## 5. Faible luminosité (sans réseau de neurones)
Relèvement des ombres par gamma sur la luminance (gain ≤ ×3, noirs < 6 % préservés), choisi pour amener la médiane vers 0,42.
Portrait sombre de test, contre l’original bien exposé : Équilibré PSNR 8,84 / LPIPS 0,421 → Faible luminosité 15,36 / 0,347.
Zero-DCE, Retinexformer, MIRNet, LLFormer étudiés : non intégrés en v3.0 (pas de poids ONNX vérifiés et testés dans cette session ;
le gain devrait être mesuré contre cette méthode simple avant tout ajout).

## Modèles étudiés et écartés

| Piste | Décision | Raison |
|---|---|---|
| Real-ESRGAN « rapide » (compact plus petit) | refusé (oct. 2026) | perdait une grande partie du gain (LPIPS 0,368–0,401 contre 0,341–0,371) |
| Protection des visages (détecteur UltraFace RFB-320, MIT, 1,3 Mo) | essayé puis retiré (v2.50) | détection parfaite sur les portraits abîmés (confiance 0,997–1), mais mêler la version classique sur le visage éloigne de l’original : LPIPS visage 0,370 → 0,459 ; elle y remet les blocs de compression (tests/calibrage_visages.py) |
| CodeFormer | écarté | licence S-Lab non commerciale (incompatible avec un futur abonnement) ; tendance à inventer un visage |
| GFPGAN | écarté | poids d’environ 350 Mo, trop lourds pour Safari sur iPhone ; peut changer l’identité |
| Restauration vidéo temporelle (BasicVSR++, RVRT…), SwinIR, Real-ESRGAN x4plus, RIFE (interpolation) | écartés en v3.0 | calcul des dizaines de fois plus lourd que le modèle actuel, déjà de 26 à 42 s par mégapixel sur iPhone |
