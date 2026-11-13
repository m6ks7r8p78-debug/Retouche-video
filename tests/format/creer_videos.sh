#!/bin/sh
# Vidéos d'essai de « Changer de format » (F32), fabriquées à partir de séquences libres :
#   Xiph.org « derf » (https://media.xiph.org/video/derf/ : pedestrian_area, ducks_take_off, in_to_tree, rush_hour en 1080p ;
#   stefan, coastguard, foreman, akiyo, hall_monitor, paris, bus, flower, highway en CIF), Tears of Steel et Big Buck Bunny (Blender, CC-BY).
#   sh tests/format/creer_videos.sh DOSSIER_DES_SOURCES     → tests/medias/format/*.mp4 (non versionnées)
set -e
S="$1"; O="$(dirname "$0")/../medias/format"; mkdir -p "$O"
A="-f lavfi -i sine=frequency=440:sample_rate=48000"
E="-c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest -movflags +faststart -v error -y"
mk() { out="$O/$1"; shift; [ -f "$out" ] && return 0; echo "→ $(basename "$out")"; ffmpeg "$@" $E "$out"; }
# vertical → horizontal : personnes en mouvement (plusieurs), filmé « au téléphone » (recadrage 9:16 d'un plan large)
mk vertical_personnes.mp4 -i "$S/pedestrian_area_1080p25.y4m" $A -vf "crop=608:1080"
# horizontal → vertical : même scène en 16:9
mk horizontal_personnes.mp4 -i "$S/pedestrian_area_1080p25.y4m" $A -vf "scale=1280:720"
# animaux + eau qui bouge (texture animée au bord)
mk horizontal_animaux.mp4 -i "$S/ducks_take_off_1080p50.y4m" $A -vf "scale=1280:720" -r 50
mk vertical_animaux.mp4 -i "$S/ducks_take_off_1080p50.y4m" $A -vf "crop=608:1080" -r 50
# paysage, caméra en mouvement (zoom avant lent)
mk paysage_43.mp4 -i "$S/in_to_tree_1080p50.y4m" $A -vf "crop=1440:1080" -r 50
# objets mobiles (voitures), téléobjectif
mk objets_43.mp4 -i "$S/rush_hour_1080p25.y4m" $A -vf "crop=1440:1080"
# haute résolution (1080p plein cadre) vers carré
mk haute_resolution.mp4 -i "$S/rush_hour_1080p25.y4m" $A
# caméra en mouvement (panoramique qui suit un joueur) : vidéo « ancienne » basse définition, 4:3 → 16:9
mk panoramique_ancien.mp4 -i "$S/stefan_cif.y4m" $A -vf "scale=384:288,setsar=1"
mk panoramique_bateau.mp4 -i "$S/coastguard_cif.y4m" $A -vf "scale=384:288,setsar=1"
# gros plan (visage), caméra tenue à la main
mk gros_plan.mp4 -i "$S/foreman_cif.y4m" $A -vf "scale=384:288,setsar=1"
# plan fixe sur pied, une personne
mk plan_fixe.mp4 -i "$S/akiyo_cif.y4m" $A -vf "scale=384:288,setsar=1"
# deux personnes, plan fixe
mk deux_personnes.mp4 -i "$S/paris_cif.y4m" $A -vf "scale=384:288,setsar=1" -t 8
# vidéo très compressée (vieux téléphone) : 240p, débit très bas
[ -f "$O/compressee.mp4" ] || { echo "→ compressee.mp4"; ffmpeg -i "$S/bus_cif.y4m" $A -vf "scale=320:240,setsar=1" -c:v libx264 -preset veryfast -b:v 90k -pix_fmt yuv420p -c:a aac -b:a 32k -shortest -movflags +faststart -v error -y "$O/compressee.mp4"; }
# scène nocturne (extrait sombre de Tears of Steel) et changements de plans (extrait monté) ; son d'origine gardé
[ -f "$O/nuit.mp4" ] || { echo "→ nuit.mp4"; ffmpeg -ss 22 -t 5 -i "$S/tos.webm" -vf "scale=1280:-2,eq=brightness=-0.22:contrast=0.9" -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart -v error -y "$O/nuit.mp4"; }
[ -f "$O/plusieurs_plans.mp4" ] || { echo "→ plusieurs_plans.mp4"; ffmpeg -ss 95 -t 14 -i "$S/tos.webm" -vf "scale=1280:-2" -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart -v error -y "$O/plusieurs_plans.mp4"; }
# vidéo mixte : animation (Big Buck Bunny), plusieurs plans, animaux dessinés
[ -f "$O/mixte.mp4" ] || { echo "→ mixte.mp4"; ffmpeg -ss 200 -t 12 -i "$S/Big_Buck_Bunny_4K.webm.480p.vp9.webm" -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart -v error -y "$O/mixte.mp4"; }
# vieille vidéo 4:3 incrustée dans un cadre 16:9 avec bandes noires (fichier « téléchargé »)
mk bandes_noires.mp4 -i "$S/hall_monitor_cif.y4m" $A -vf "scale=384:288,setsar=1,pad=512:288:64:0:black" -t 6
# format non MP4 (lecture de secours par la balise vidéo)
[ -f "$O/secours.webm" ] || { echo "→ secours.webm"; ffmpeg -i "$S/akiyo_cif.y4m" -t 3 -c:v libvpx -b:v 600k -v error -y "$O/secours.webm"; }
ls -la "$O"
