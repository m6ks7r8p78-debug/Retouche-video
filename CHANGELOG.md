# Journal des versions

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
  **À redéployer sur Cloudflare** (la version en ligne reste la v4 tant que ce n’est pas fait).

## v2.50 — 4 novembre 2026
Gestionnaire de modèles, profils Naturel / Équilibré / Détails, analyse photo, comparateur avec zoom, export PNG, taille personnalisée,
vérification des exports, calcul WebGPU 4 pixels/fil, modèle de profondeur figé, suite de tests. Voir NOTES.md.
