# Rapport de performances

**Aucune mesure n’a été faite sur iPhone dans cette session.** Les chiffres ci-dessous viennent d’un GPU simulé sur processeur (SwiftShader) :
ils comparent des versions entre elles, pas la vitesse réelle sur téléphone.

| Mesure | Résultat |
|---|---|
| IA sur l’iPhone du propriétaire (diagnostic v2.49, WebGPU) | 26 à 42 s par mégapixel |
| Calcul WebGPU « 4 pixels par fil » vs « 1 pixel » | résultat identique (0 écart), 1,9 à 2,4× plus rapide en simulé ; choisi par appareil au premier usage |
| Analyse d’une photo 12 Mpx | 19,6 s → 5 ms (miniature) |
| Aperçu d’une photo 12 Mpx | copie 2048 px : clic possible après 10 s au lieu de 33 s en simulé |
| Mémoire IA (calcul) | ≈ 140 Mo de mémoire graphique pour 1280×720 |

Lire la vitesse réelle : Modèles IA → « Mesurer la vitesse ».
