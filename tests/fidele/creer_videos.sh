#!/bin/sh
# Vidéos verticales de test pour « Fidèle » (conversion sans génération), découpées dans de VRAIES vidéos libres :
#   intel-iot-devkit/sample-videos (CC BY 4.0) : face-demographics-walking, head-pose-face-detection-female-and-male, classroom, store-aisle-detection
#   opencv/samples/data/vtest.avi (licence BSD d'OpenCV) : piétons
# SRC = dossier contenant ces fichiers (git clone --depth 1 https://github.com/intel-iot-devkit/sample-videos + vtest.avi).
# Sortie : tests/medias/fidele/ (non versionné). Chaque vidéo porte un son (sinus) pour vérifier son maintien et la durée.
set -e
SRC=${1:-/home/claude/medias_src}; OUT=$(dirname "$0")/../medias/fidele; mkdir -p "$OUT"
f() { ffmpeg -v error -y "$@"; }
A="-c:v libx264 -crf 14 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -shortest"
# 1. personnes qui marchent vers la caméra, caméra fixe (244×432, 12 i/s)
f -ss 16 -t 6 -i "$SRC/iv/face-demographics-walking.mp4" -f lavfi -i sine=frequency=440:sample_rate=48000 -filter_complex "[0:v]crop=244:432:380:0,setsar=1[v]" -map "[v]" -map 1:a $A "$OUT/personnes_fixe.mp4"
# 2. visages, caméra qui balaye (panoramique simulé par une fenêtre mobile) (244×432)
f -ss 20 -t 6 -i "$SRC/iv/head-pose-face-detection-female-and-male.mp4" -f lavfi -i sine=frequency=523:sample_rate=48000 -filter_complex "[0:v]crop=244:432:'60+380*t/6':0,setsar=1[v]" -map "[v]" -map 1:a $A "$OUT/visages_pan.mp4"
# 3. salle de classe, beaucoup de personnes, balayage, taille iPhone 1080×1920 (agrandie depuis 608×1080), 30 i/s
f -ss 4 -t 5 -i "$SRC/iv/classroom.mp4" -f lavfi -i sine=frequency=660:sample_rate=48000 -filter_complex "[0:v]crop=608:1080:'300+600*t/5':0,scale=1080:1920:flags=lanczos,setsar=1[v]" -map "[v]" -map 1:a $A "$OUT/classe_1080x1920.mp4"
# 4. rue, piétons qui traversent, caméra fixe, 10 i/s (cadence inhabituelle) (324×576)
f -ss 20 -t 6 -i "$SRC/vtest.avi" -f lavfi -i sine=frequency=330:sample_rate=48000 -filter_complex "[0:v]crop=324:576:222:0,setsar=1[v]" -map "[v]" -map 1:a $A "$OUT/rue_pietons.mp4"
# 5. allée de magasin, caméra qui avance (mouvement complexe : parallaxe) (360×640)
f -ss 10 -t 6 -i "$SRC/iv/store-aisle-detection.mp4" -f lavfi -i sine=frequency=587:sample_rate=48000 -filter_complex "[0:v]crop=228:404:246:0,scale=360:640:flags=lanczos,setsar=1,fps=30[v]" -map "[v]" -map 1:a $A "$OUT/allee_complexe.mp4"
# 6. plusieurs scènes (changements de plan) (360×640, 30 i/s)
f -ss 38 -t 2.5 -i "$SRC/iv/face-demographics-walking.mp4" -ss 40 -t 2.5 -i "$SRC/vtest.avi" -ss 50 -t 2.5 -i "$SRC/iv/head-pose-face-detection-female-and-male.mp4" -f lavfi -i sine=frequency=392:sample_rate=48000 \
  -filter_complex "[0:v]crop=244:432:330:0,scale=360:640:flags=lanczos,fps=30,setsar=1[a];[1:v]crop=324:576:300:0,scale=360:640:flags=lanczos,fps=30,setsar=1[b];[2:v]crop=244:432:300:0,scale=360:640:flags=lanczos,fps=30,setsar=1[c];[a][b][c]concat=n=3:v=1:a=0[v]" -map "[v]" -map 3:a $A "$OUT/scenes_multiples.mp4"
ls -la "$OUT"
