# Banc LaMa — prolonger les côtés (21 nov. 2026)

Vérité terrain : 8 images de vraies vidéos 16:9 libres (intel-iot-devkit/sample-videos, CC BY 4.0), ramenées à 768×432 ; on garde
le centre 9:16 (243 px) et on reconstruit les côtés ; LPIPS (AlexNet) côtés reconstruits contre côtés réels (plus bas = mieux).
Modèle : big-lama ONNX de l'app (Carve, révision c3c0c9e), entrée 512×512, à l'échelle « côté court = 512 ».

| variante | LPIPS côtés |
|---|---|
| une fenêtre par côté (comme l'app) | 0,64 |
| bandes successives de 128 px | 0,61 |
| bandes de 192 / 256 px | 0,64 / 0,63 |
| fenêtre retournée (trou toujours à gauche) | 0,69 |
| bandes + contexte reflété (un seul trou par fenêtre) | 0,64 |

Constat : toutes les variantes donnent des murs flous, des bandes verticales et des objets étirés ; l'écart entre elles est dans le
bruit de mesure et les bandes multiplient le temps de calcul (×3 à ×5). Rien n'est retenu pour l'app. Piège à éviter dans un banc :
réduire une image dont les trous sont noirs mélange le noir au bord du réel et fait sortir à LaMa de grandes plaques sombres
(l'app n'a pas ce défaut : `reduire()` ne garde que les pixels entièrement couverts).
