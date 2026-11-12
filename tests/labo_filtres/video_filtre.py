# F10 — vidéo de test « filtre AR simulé » (vérité connue) et mesure des vidéos exportées par l'app.
#   python3 tests/labo_filtres/video_filtre.py creer                       → tests/medias/filtre_video.mp4 (36 images, 480×640, avec son)
#   PYTHONPATH=tests/visage_ia/faux python3 tests/labo_filtres/video_filtre.py mesurer a.mp4 b.mp4 …
# Même séquence que tests/labo_filtres/banc_video.py (portrait NASA p08 jamais vu par le détecteur, filtre « chien » SIMULÉ).
# Ne vaut ni validation sur de vrais filtres ni validation sur iPhone.
import sys, os, subprocess, tempfile, json
ARGS = sys.argv[1:]; sys.argv = [sys.argv[0], '36']; ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import cv2, numpy as np, banc_video as B
VID = os.path.join(ICI, '../medias/filtre_video.mp4'); PID, FL = 'p08', 'chien'
def images(f):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-vf', f'scale={B.W}:{B.H}:flags=bicubic', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], capture_output=True, check=True).stdout
    return list(np.frombuffer(raw, np.uint8).reshape(-1, B.H, B.W, 3))
if ARGS[0] == 'creer':
    G, F, TM, A = B.sequence(PID, FL); tmp = tempfile.mkdtemp()
    for i, f in enumerate(F): cv2.imwrite(os.path.join(tmp, f'{i:03d}.png'), f)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-framerate', '30', '-i', os.path.join(tmp, '%03d.png'), '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100', '-t', str(len(F) / 30),
                    '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', VID], check=True)
    print('créé', VID, len(F), 'images')
else:
    G, F, TM, A = B.sequence(PID, FL); res = {}; Z = [np.zeros((B.H, B.W), np.uint8)] * len(G)
    for f in ARGS[1:]:
        O = images(f); n = min(len(O), len(G)); m = B.mesurer(G[:n], F[:n], TM[:n], A[:n], O[:n], Z[:n])
        res[os.path.basename(f)] = {'images': n, 'ecart_zone': m['ecart_apres'], 'scintillement': m['scintillement'], 'lpips_tete': m['lpips_tete']}
    print(json.dumps(res, ensure_ascii=False))
