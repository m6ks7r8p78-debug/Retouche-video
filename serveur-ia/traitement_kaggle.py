"""Retouche vidéo — « IA rapide » : traitement d'une vidéo sur les cartes graphiques gratuites de Kaggle.

Entrée (jeu de données privé, attaché par l'app) : la vidéo + params.json
  {"dn": 0.3, "ow": 2160, "oh": 3840, "dw": 720, "dh": 1280, "images": 6713, "version": 1}
Sortie (/kaggle/working) : ia.mp4 (une image calculée par image de la vidéo, dans l'ordre d'affichage du fichier,
  à la taille ow×oh : exactement ce que SR.run(image, ow/dw, dn) donne dans l'app) + info.json (contrôles).
Rien d'autre n'est conservé ; l'app efface le jeu de données et le calcul une fois le résultat récupéré.
"""
import glob, json, os, subprocess, sys, threading, queue, time, hashlib

ICI = os.path.dirname(os.path.abspath(__file__))
ENTREE = os.path.dirname(glob.glob("/kaggle/input/**/params.json", recursive=True)[0])
sys.path.insert(0, ICI); sys.path.insert(0, ENTREE)
import ia_serveur as IA
import torch

T0 = time.time()
P = json.load(open(os.path.join(ENTREE, "params.json")))
VID = [f for f in glob.glob(os.path.join(ENTREE, "*")) if not f.endswith((".json", ".py", ".bin"))][0]
SR = open(os.path.join(ENTREE, "sr.bin"), "rb").read()
INFO = {"version": 1, "gpu": [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())],
        "sr_bin_sha256": hashlib.sha256(SR).hexdigest(), "params": P}

def sonde():
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,color_space,color_range:stream_side_data=rotation", "-of", "json", VID],
                       capture_output=True, text=True).stdout
    return json.loads(r)["streams"][0]

st = sonde()
matrice = {"bt470bg": "bt601", "smpte170m": "bt601", "bt601": "bt601", "bt2020nc": "bt2020"}.get(st.get("color_space", ""), "bt709")
plage = "pc" if st.get("color_range") == "pc" else "tv"
INFO["decodage"] = {"matrice": matrice, "plage": plage, "flux": st}

DW, DH, OW, OH, N = P["dw"], P["dh"], P["ow"], P["oh"], P["images"]
s = OW / DW
# contrôle : la première image décodée doit faire exactement dw×dh (sinon les images seraient décalées : on arrête)
_png = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", VID, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True).stdout
_w, _h = int.from_bytes(_png[16:20], "big"), int.from_bytes(_png[20:24], "big")
INFO["premiere_image"] = f"{_w}x{_h}"
if (_w, _h) != (DW, DH):
    json.dump(INFO, open("/kaggle/working/info.json", "w"), indent=1)
    raise SystemExit(f"taille décodée {_w}x{_h} différente de celle de l'app {DW}x{DH}")
if abs(OH / DH - s) > 0.01:
    raise SystemExit("proportions de sortie incohérentes")
# lecture : ordre d'affichage du fichier, une image par image du fichier (rotation appliquée comme dans l'app)
dec = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", VID, "-vf",
                        f"scale=in_color_matrix={matrice}:in_range={plage}:out_range=pc:flags=lanczos+full_chroma_int+accurate_rnd",
                        "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE, bufsize=1 << 26)
# écriture : H.264 High 8 bits 4:2:0, plage standard (limitée) BT.709 — lu partout, y compris par Safari et WebCodecs —
# quasi sans perte (qp fixe bas ; écart mesuré par tests/serveur_ia_compare.py)
QP = int(P.get("qp", 16))
enc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{OW}x{OH}", "-r", "30", "-i", "-",
                        "-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int",
                        "-c:v", "h264_nvenc", "-profile:v", "high", "-preset", "p6", "-tune", "hq", "-rc", "constqp", "-qp", str(QP),
                        "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
                        "-movflags", "+faststart", "/kaggle/working/ia.mp4"], stdin=subprocess.PIPE)

ng = max(1, torch.cuda.device_count())
modeles = [IA.charger(SR, P["dn"], device=f"cuda:{g}") for g in range(ng)]
B, taille = 2, DW * DH * 3
lots_in, lots_out = queue.Queue(maxsize=8), {}
fini = threading.Event(); verrou = threading.Condition(); erreurs = []

def travail(g):
    torch.cuda.set_device(g)
    while True:
        it = lots_in.get()
        if it is None: return
        k, buf = it
        try:
            n = len(buf) // taille
            x = torch.frombuffer(bytearray(buf), dtype=torch.uint8).view(n, DH, DW, 3).to(f"cuda:{g}")
            y = IA.traiter(modeles[g], x, s).cpu().numpy().tobytes()
        except Exception as e:
            erreurs.append(repr(e)); y = None
        with verrou:
            lots_out[k] = y; verrou.notify_all()

fils = [threading.Thread(target=travail, args=(g,), daemon=True) for g in range(ng)]
for f in fils: f.start()

def ecrivain():
    k = 0
    while True:
        with verrou:
            while k not in lots_out and not (fini.is_set() and k >= nb_lots[0]):
                verrou.wait(1)
            if fini.is_set() and k >= nb_lots[0]: return
            y = lots_out.pop(k)
        if y is None: raise SystemExit("échec du calcul")
        enc.stdin.write(y); k += 1

nb_lots = [10 ** 12]
w = threading.Thread(target=ecrivain, daemon=True); w.start()
k, lus = 0, 0
while True:
    buf = dec.stdout.read(taille * B)
    if not buf: break
    if len(buf) % taille: raise SystemExit("image incomplète à la lecture")
    lots_in.put((k, buf)); k += 1; lus += len(buf) // taille
    if k % 50 == 0: print(f"{lus} images lues, {time.time() - T0:.0f} s", flush=True)
nb_lots[0] = k
for _ in fils: lots_in.put(None)
for f in fils: f.join()
fini.set()
with verrou: verrou.notify_all()
w.join(); enc.stdin.close(); enc.wait(); dec.wait()
if erreurs: raise SystemExit("erreurs : " + "; ".join(erreurs[:3]))

sortie = json.loads(subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
                                    "stream=width,height,codec_name,nb_read_frames", "-of", "json", "/kaggle/working/ia.mp4"],
                                   capture_output=True, text=True).stdout)["streams"][0]
INFO.update({"images_lues": lus, "images_attendues": N, "sortie": sortie, "taille_octets": os.path.getsize("/kaggle/working/ia.mp4"),
             "duree_s": round(time.time() - T0, 1), "s_par_image": round((time.time() - T0) / max(1, lus), 4),
             "ok": lus == N and int(sortie.get("nb_read_frames", -1)) == lus and sortie["width"] == OW and sortie["height"] == OH})
json.dump(INFO, open("/kaggle/working/info.json", "w"), indent=1)
print(json.dumps(INFO, indent=1))
if not INFO["ok"]: raise SystemExit("contrôle final échoué")
