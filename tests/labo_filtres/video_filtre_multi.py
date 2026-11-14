# Banc multi-cas du retrait de filtre AR (Directeur IA v1.1) : plusieurs portraits NASA (domaine public) × filtres SIMULÉS,
# vérité connue. Mêmes séquences que banc_video.py / video_filtre.py, mais pour N cas au lieu d'un.
#   python3 tests/labo_filtres/video_filtre_multi.py creer [p06:chien,p07:chat,...]   → tests/medias/filtre_multi/<pid>_<filtre>.mp4
#   PYTHONPATH=tests/visage_ia/faux python3 tests/labo_filtres/video_filtre_multi.py mesurer <pid>_<filtre> sans.mp4 avec.mp4
# Ne vaut ni validation sur de vrais filtres Snapchat/Instagram ni validation sur iPhone.
import sys, os, subprocess, tempfile, json
ARGS = sys.argv[1:]; sys.argv = [sys.argv[0], '36']; ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import cv2, numpy as np, banc_video as B
DOS = os.path.join(ICI, '../medias/filtre_multi')
CAS_DEFAUT = 'p06:chien,p07:chat,p09:hasard,p10:chien,p11:chat,p12:hasard'


def images(f):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-vf', f'scale={B.W}:{B.H}:flags=bicubic', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'],
                         capture_output=True, check=True).stdout
    return list(np.frombuffer(raw, np.uint8).reshape(-1, B.H, B.W, 3))


if ARGS[0] == 'creer':
    os.makedirs(DOS, exist_ok=True)
    for c in (ARGS[1] if len(ARGS) > 1 else CAS_DEFAUT).split(','):
        pid, fl = c.split(':'); G, F, TM, A = B.sequence(pid, fl); tmp = tempfile.mkdtemp(); out = os.path.join(DOS, f'{pid}_{fl}.mp4')
        for i, f in enumerate(F): cv2.imwrite(os.path.join(tmp, f'{i:03d}.png'), f)
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-framerate', '30', '-i', os.path.join(tmp, '%03d.png'), '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100',
                        '-t', str(len(F) / 30), '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out], check=True)
        print('créé', out, len(F), 'images', flush=True)
else:
    pid, fl = ARGS[1].split('_'); G, F, TM, A = B.sequence(pid, fl); res = {}; Z = [np.zeros((B.H, B.W), np.uint8)] * len(G)
    for f in ARGS[2:]:
        O = images(f); n = min(len(O), len(G)); m = B.mesurer(G[:n], F[:n], TM[:n], A[:n], O[:n], Z[:n])
        res[os.path.basename(f)] = {'images': n, 'ecart_zone': m['ecart_apres'], 'ecart_filtre': m['ecart_avant'], 'scintillement': m['scintillement'], 'lpips_tete': m['lpips_tete']}
    print(json.dumps(res, ensure_ascii=False))
