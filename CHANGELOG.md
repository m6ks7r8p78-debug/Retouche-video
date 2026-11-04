# Journal des versions

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
