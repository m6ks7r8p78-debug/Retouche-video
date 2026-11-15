# Banc réel de triage (sans médias dans Git)

Ce module indépendant de `catalogue_medias.py` traite uniquement des métadonnées anonymisées, jamais les fichiers médias. `banc(entrees,{autorisationEvaluation:true})` propose des regroupements de copies SHA-256, variantes de nom et ressemblances pHash à **confirmer** ; les groupes entiers restent dans un seul lot d'exploration/confirmation. Aucun couple n'est déclaré « original » et aucune amélioration perceptuelle n'est revendiquée.

Entrée : tableau d'objets `{id,type,sha256,duree,phash,famille,indices,nom?}` (durée en secondes, `phash` de 0 à 8 empreintes hex 64 bits), sans nom de personne, pixels, chemins ou URL. L'autorisation de tests locaux est distincte du consentement d'entraînement : le module ne peut ni entraîner, ni écrire, ni publier, ni pousser automatiquement. La valeur de `famille` fournie par l'index doit représenter une scène, pas uniquement une catégorie large. Les faux rapprochements perceptuels sont possibles.

Les observations réelles, empreintes, catalogues et résultats individuels restent dans la bibliothèque privée et **ne doivent jamais être ajoutés au dépôt**, aux logs CI ou à la PR. `bilanPublic(resultat)` ne fournit que des nombres agrégés. `comparerAB` refuse toute promotion esthétique automatique à partir de PSNR/SSIM.

Exécution CI : `node --test tests/directeur-banc-reel.test.mjs` avec données exclusivement artificielles. Ce contrôle complète le catalogueur et le Directeur IA existants, sans modifier les moteurs vidéo ni l'application iPhone.
