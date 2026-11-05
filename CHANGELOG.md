# Journal des versions

## v5.0 — 5 novembre 2026 (nouveau nom : RetoucheProAI)
- L'app s'appelle désormais RetoucheProAI : titre, en-tête, nom sur l'écran d'accueil, nom dans les sauvegardes.
- Rien d'autre ne change : même adresse pour l'instant, anciennes sauvegardes toujours lisibles, réglages et modèles gardés.
- Noms de domaine libres au 5 nov. 2026 : retoucheproai.com, retoucheproai.fr, retoucheproai.app (pas encore achetés).

## v4.9 — 5 novembre 2026 (publicités préparées, éteintes)
- Nouveau `pub.js` : bannière discrète en bas de page, pub récompensée avant l'enregistrement, lien de consentement Google,
  « Coller un lien » masqué quand les pubs sont allumées. Tout est éteint : l'app ne change pas tant que ce n'est pas activé.
- Jamais bloquant : sans pub prête, l'enregistrement se fait directement. Jamais de pub hors du domaine choisi.
- Mode d'emploi pour allumer : PUBLICITE.md. Tests : tests/pub.test.mjs (8 réussis).

## v4.8 — 5 novembre 2026 (conversion accélérée des vidéos ralenties / accélérées)
- Même résultat qu'en v4.7, mêmes réglages : seule la façon de calculer change.
- Lecture de la vidéo en continu (décodeur de l'iPhone) aussi quand la vitesse est changée. Avant, chaque image
  était cherchée une par une dans 3 lecteurs vidéo, très lent sur iPhone. Idem pour la prolongation (repart de l'image
  clé voisine à chaque saut). Seule la lecture à l'envers garde l'ancienne méthode.
- Images intermédiaires du ralenti calculées par la carte graphique en une seule passe (WebGL), au lieu d'environ
  1 200 petits dessins par image ; résultat identique à l'œil (PSNR > 50 dB contre l'ancienne méthode), bords plus propres.
  Ancienne méthode gardée en secours automatique.
- Recherche du mouvement : mêmes calculs sans tests de bord dans la boucle (résultat identique au bit près, vérifié).
- « Voix plus claire » est désormais gardée quand la vitesse change (elle était ignorée).
- Tests : tests/vitesse.test.mjs complété (lecture continue vérifiée, image intermédiaire GPU = ancienne méthode).

## v4.7 — 5 novembre 2026 (barre de vitesse, comparatif à curseur)
- Barre « Vitesse » sous la barre de lecture : 0,75× à 1,30× par pas de 0,05 ; le bouton 1,00× la remet à zéro.
  Aperçu : la lecture suit la vitesse. Conversion : la vidéo est refaite à cette vitesse (ralenti avec images intermédiaires,
  son à hauteur de voix conservée), via le moteur Time Repair.
- Résultat vidéo : les deux vidéos côte à côte sont remplacées par une seule vidéo avec curseur avant / après
  (glisser le doigt sur la vidéo ou le curseur du dessous), original synchronisé même si la vitesse a changé.
- Tests : tests/vitesse.test.mjs (12/12) ; Time Repair (tests/v3) inchangé.

## v3.4 — 5 novembre 2026 (IA rapide sur serveur gratuit Kaggle)
- Option « IA rapide sur serveur gratuit (Kaggle) » : la même IA (même fichier sr.bin, résultat identique à l'œil : PSNR 57–59 dB
  contre l'app), calculée sur les 2 cartes graphiques gratuites du compte Kaggle. Vidéo de test : 1,1 min de calcul (180 images).
- Jeton Kaggle dans ⚙️ Paramètres (gardé sur le téléphone, jamais sauvegardé) ; accord demandé avant chaque envoi ;
  tout est supprimé chez Kaggle après récupération. Relais Cloudflare dédié : retouche-kaggle.retouche-ia.workers.dev.
- Test d'intégration avec le vrai Kaggle (tests/ia_serveur.test.mjs) : refus sans jeton / envoi refusé = rien envoyé ;
  export Full HD complet (180/180 images, son) ; ordre des images conforme (0 écart sur 56 contrôles) ; ménage vérifié.
- Non encore fait : mesure sur une vraie vidéo 720×1280 de plusieurs minutes, essai sur iPhone, suite complète app --ia.

## v3.3 — 4 novembre 2026 (effacer une zone, sélection au toucher)
- **Effacer une zone d’une photo** (accueil, ou depuis une photo améliorée) : tu peins la zone, l’IA la remplit (MI-GAN, licence MIT,
  28 Mo téléchargés une fois après accord, calcul sur le téléphone). Proposition à **garder ou refuser** ; annuler, recommencer,
  revenir à l’original ; zoom à deux doigts. Hors de la zone, la photo n’est **pas modifiée, au pixel près** (testé).
- **Carte des zones inventées** : affichage dédié (rayures roses, opacité réglable), badge permanent « contient des zones inventées par l’IA »,
  export de la carte en pleine taille et d’une **fiche de provenance** (modèle, empreinte, licence, zones, pixels inventés, date).
- **👆 Sélection au toucher** (EdgeTAM, Meta, Apache-2.0, 40 Mo facultatifs) : un toucher propose le contour d’un objet, d’un accessoire
  ou d’un élément de filtre AR ; on le corrige au pinceau ou à la gomme avant de reconstruire.
- Gestionnaire de modèles : 3 entrées (`migan`, `edgetam`, `edgetam_dec`), adresses figées, empreintes vérifiées, mêmes règles que les autres.
- Historique : chaque effacement gardé est noté (date, taille, pixels inventés) ; jamais l’image.
- Correction pendant le développement : un téléchargement refusé affichait « la partie reçue est gardée » alors que rien n’avait été reçu.
- Nouveau test `tests/effacer.test.mjs` (19 cas, vrais modèles) ; il échoue bien quand on introduit un défaut (2 défauts essayés : 5 échecs chacun).
- Études : licences de ProPainter, CodeFormer (S-Lab, non commerciales) et CompleteMe (CC BY-NC-SA 4.0) relues à la source → écartés ;
  quotas ZeroGPU relus sur la documentation officielle (GUIDE_CLOUD_GRATUIT.md). Documents : GUIDE_RECONSTRUCTION_IA.md, MODELES_IA.md, RAPPORT_v3.3.md.

## v3.2 — 4 novembre 2026 (audit, sécurité, vie privée)
- **Modèles IA conservés lors des mises à jour** : le service worker effaçait tous les caches du site à chaque nouvelle version,
  dont le modèle de relief téléchargé (27 Mo, re-téléchargé ensuite) et les caches de l'app /radar/. Il ne retire plus que
  ses propres anciennes versions. Nouveau test `tests/sw.test.mjs` (échoue sur la v3.1, réussit sur la v3.2).
- **Faille corrigée** : une sauvegarde non chiffrée piégée pouvait exécuter du code à l'ouverture de ⚙️ Paramètres (historique
  affiché sans échappement). Tout est maintenant affiché comme du texte. Test ajouté (code exécuté sur la v3.1, plus sur la v3.2).
- **Plus aucune requête vers Google à l'ouverture** : polices hébergées avec l'app (`polices/`, licence OFL).
- **Secours mp4-muxer verrouillé** : le fichier de secours (jsDelivr) est refusé s'il ne correspond pas à son empreinte (SRI).
- **Autorisation « diagnostic »** (version Claude) : les mesures ne sont plus envoyées automatiquement sans accord ;
  bouton « Autoriser » ajouté dans ⚙️ Paramètres pour chaque autorisation.
- Vérifications d'audit : `sr.bin` identique bit à bit aux poids officiels Real-ESRGAN v0.2.5.0 (FP16) ; ONNX Runtime Web et mp4-muxer
  identiques aux paquets npm ; serveur **v5 bien en ligne** (la mention « à redéployer » de la v3.0 était périmée).
- Points de restauration : branches `sauvegarde-v2.49`, `sauvegarde-v2.50`, `sauvegarde-v3.0`, `sauvegarde-v3.1`
  (les tags cités dans les notes n'avaient jamais été créés).
- Documents : AUTORISATIONS.md (nouveau), RESTAURATION_IA.md (étude des modèles de suppression AR, visage, corps, cloud), mises à jour.

## v3.1 — 4 novembre 2026
- **Remise en ordre automatique des morceaux** (Outils → Regrouper des vidéos → « 🧩 Remettre dans l’ordre automatiquement ») :
  choisis les morceaux dans n’importe quel ordre ; l’app compare la dernière image de chaque morceau à la première des autres
  (continuité de l’image), lit la date d’enregistrement écrite dans le fichier quand elle existe, et repère les **doublons**
  (retirés de l’assemblage), les **raccords douteux** (morceau manquant ou changement de scène) et indique sa **confiance** ;
  si elle est faible, elle demande de vérifier avec les flèches au lieu d’affirmer un ordre. Rien n’est envoyé sur Internet.
- Nouveau test `tests/reassemblage.test.mjs` (5 cas).

## v3.0 — 4 novembre 2026
- **studio.js** (premier module séparé) : ⚙️ Paramètres avec **autorisations** révocables avant tout envoi réseau (lien, modèle, analyse IA), **sauvegarde chiffrée** des réglages (AES-256-GCM) et restauration, **historique** des traitements ; **assistant** « Dis ce que tu veux » (mots-clés en français : règle l’app et explique ce qu’il ne peut pas faire).
- **Time Repair** (Outils → Vitesse et sens de lecture) : vitesse 0,25× à 4×, lecture à l’envers, ralenti fluide facultatif
  (images intermédiaires estimées), son adapté avec hauteur conservée (WSOLA), façon cassette, inversé ou retiré.
- **Profils Faible luminosité et Nuit → jour (esthétique)** : relèvement des ombres sur la luminance, gain plafonné, vrais noirs gardés.
  Faible luminosité conseillée automatiquement pour une image très sombre.
- Rapport de fichier : cadence variable (VFR) et ralentis iPhone (≥ 100 i/s) détectés.
- Son : secours Opus quand l’encodeur AAC manque (fichier relu ; sinon export sans son, expliqué).
- Serveur v5 : origine CORS fixée par requête (plus de variable globale partagée), comptes Bluesky did:web limités aux vrais domaines.
  ~~À redéployer sur Cloudflare~~ — constaté en ligne le 4 novembre 2026 (audit v3.2 : `/etat` répond version 5).

## v2.50 — 4 novembre 2026
Gestionnaire de modèles, profils Naturel / Équilibré / Détails, analyse photo, comparateur avec zoom, export PNG, taille personnalisée,
vérification des exports, calcul WebGPU 4 pixels/fil, modèle de profondeur figé, suite de tests. Voir NOTES.md.
