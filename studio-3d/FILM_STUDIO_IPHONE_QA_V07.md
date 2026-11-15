# Film Studio v0.7 — enregistrement iPhone et confidentialité

## But de cette expérience
Le laboratoire produit un GLB d'un personnage stylisé original et un rapport JSON optionnel. Il ne produit pas un film MP4. L'utilisateur peut télécharger le fichier ou ouvrir le panneau de partage natif en appuyant sur un bouton, lorsqu'iOS autorise le partage de ce format. Aucune destination n'est sélectionnée automatiquement.

## Essai Safari sur appareil réel — après hébergement HTTPS de laboratoire
1. Récupérer l'artefact « film-studio-v07-iphone-https-package » dans les Actions de la PR #69 et en déployer seulement les fichiers statiques sur un hôte HTTPS isolé. Ne pas publier retoucheproai.com, main ou les médias de recherche. La page GitHub « blob » n'est pas une application exécutable.
2. Sur l'iPhone, ouvrir cette URL HTTPS dans Safari ; générer le scénario synthétique proposé. Vérifier l'animation, les actions au doigt, la lecture et la rotation.
3. Appuyer sur « Télécharger le GLB animé ». Vérifier si un fichier GLB existe dans Téléchargements ou Fichiers. Il peut nécessiter un visualiseur 3D compatible.
4. Si « Partager vers Fichiers… » apparaît, l'utiliser et choisir manuellement « Enregistrer dans Fichiers » dans la feuille système, puis vérifier la présence du fichier. La fermeture de la feuille ne garantit pas la sauvegarde. Si le bouton n'apparaît pas ou si le partage échoue, le téléchargement classique reste disponible.
5. Exécuter le diagnostic de fluidité facultatif (90 images), puis choisir soit « Télécharger le diagnostic JSON », soit, s'il apparaît, « Partager le diagnostic… ». Vérifier que le rapport n'inclut pas la description, des médias, un nom, un identifiant d'appareil, une adresse ou des identifiants de navigateur.
6. Annuler volontairement le panneau de partage. Confirmer que la scène, les liens classiques et la session demeurent accessibles et qu'aucun faux message de fichier enregistré n'apparaît.
7. Soumettre une description non prise en charge, par exemple « Une femme boit puis parle » sans tasse ni café. Vérifier l'effacement des anciens liens GLB et JSON ainsi que des boutons de partage.
8. Essayer orientation portrait/paysage, passage en arrière-plan, lecture prolongée et mode « Ajouter à l'écran d'accueil » séparément. Noter chauffe, mémoire perçue, erreurs d'export ou perte GPU sans inventer de mesures instrumentées.

## Ce que couvre la CI v0.7
Les tests Node contrôlent l'en-tête GLB et le schéma privé du diagnostic, le refus des formats arbitraires, l'absence de partage natif disponible, l'annulation et les erreurs. Le navigateur WebKit Linux reçoit une simulation de l'API native de partage et vérifie qu'un fichier unique conforme est transmis en réponse à un clic utilisateur, sans transfert automatique au réseau. **Une simulation n'est pas une preuve que la feuille iOS fonctionne sur iPhone physique.**

## Conditions avant tout déploiement
Rester en PR brouillon. Ne pas fusionner, modifier le site public, ni inclure les 157 vidéos personnelles, voix ou visages. Ne jamais présenter le GLB procédural comme film photoréaliste ou voix clonée. L'utilisation de l'apparence ou voix d'une vraie personne requiert des consentements distincts.
