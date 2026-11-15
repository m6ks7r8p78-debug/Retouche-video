"""RetoucheProAI — moteur « Cinéma » (essai) : restauration vidéo SeedVR2 sur les cartes graphiques gratuites de Kaggle.

Pourquoi : les essais maison (RNE 0.1 à 0.20) gagnent au mieux +0,3 dB sur l'agrandissement simple. SeedVR2 (ByteDance Seed,
ICLR 2026, Apache-2.0) est un modèle de restauration vidéo par diffusion en UNE étape, entraîné sur des vidéos réelles :
il reconstruit textures, contours et visages en gardant la cohérence d'une image à l'autre.

Contrat identique à traitement_kaggle.py (l'app ne voit aucune différence) :
  entrée  : jeu de données privé = vidéo + params.json (+ ia_serveur.py, sr.bin, traitement_kaggle.py pour le repli)
  sortie  : /kaggle/working/ia.mp4 (une image par image du fichier, ordre d'affichage, taille ow×oh) + info.json
Sécurité qualité : si SeedVR2 ne peut pas tourner (pas d'Internet, mémoire, temps) ou si son résultat s'écarte de la vidéo
(contrôle de structure image par image), le calcul repart AUTOMATIQUEMENT avec l'IA standard (Real-ESRGAN, traitement_kaggle.py).
info.json indique toujours le moteur réellement utilisé ("moteur") et la raison d'un repli ("repli").

Réglable par variables d'environnement pour les tests hors Kaggle (tests/cinema_kaggle.test.py) :
  RETOUCHE_ENTREE, RETOUCHE_SORTIE, RETOUCHE_TMP, RETOUCHE_SEEDVR2_CMD (remplace l'appel au modèle), RETOUCHE_REPLI_CMD.
"""
import glob, json, os, shutil, subprocess, sys, threading, time

VERSION = 2   # v2 : contrôle qualité par zones, Census et stabilité temporelle (recherches RNE), atténuation 0,70
SEEDVR2_DEPOT = "https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler"
SEEDVR2_COMMIT = "4490bd1"                      # version vérifiée (24 déc. 2025) : interface en ligne de commande stable
DIT = "seedvr2_ema_3b_fp16.safetensors"         # 6,8 Go, empreinte contrôlée par le registre du dépôt (sha256 2fd0e03a…)
DUREE_MAX_S = 10.5 * 3600                       # Kaggle coupe à 12 h : on garde le temps de finir ou de basculer sur le repli
T0 = time.time()

ENTREE = os.environ.get("RETOUCHE_ENTREE") or os.path.dirname(glob.glob("/kaggle/input/**/params.json", recursive=True)[0])
SORTIE = os.environ.get("RETOUCHE_SORTIE", "/kaggle/working")
TMP = os.environ.get("RETOUCHE_TMP", "/kaggle/tmp" if os.path.isdir("/kaggle") else "/tmp/retouche-cinema")
os.makedirs(TMP, exist_ok=True); os.makedirs(SORTIE, exist_ok=True)
P = json.load(open(os.path.join(ENTREE, "params.json")))
VID = [f for f in glob.glob(os.path.join(ENTREE, "*")) if not f.endswith((".json", ".py", ".bin"))][0]
INFO = {"version": VERSION, "moteur": "seedvr2-3b", "params": P}


def journal(*a):
    print(f"[{time.time() - T0:7.0f} s]", *a, flush=True)


def ecrire_info():
    json.dump(INFO, open(os.path.join(SORTIE, "info.json"), "w"), indent=1)


def gpus():
    try:
        import torch
        return [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())]
    except Exception:
        return []


def sonde():
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,color_space,color_range,r_frame_rate", "-of", "json", VID],
                       capture_output=True, text=True).stdout
    return json.loads(r)["streams"][0]


def pair(x):
    return max(2, 2 * int(round(x / 2)))


# ---------------------------------------------------------------- 1. préparation (identique à l'IA standard)
def preparer():
    st = sonde()
    mat = {"bt470bg": "bt601", "smpte170m": "bt601", "bt601": "bt601", "bt2020nc": "bt2020"}.get(st.get("color_space", ""), "bt709")
    plage = "pc" if st.get("color_range") == "pc" else "tv"
    DW, DH, OW, OH, N = P["dw"], P["dh"], P["ow"], P["oh"], P["images"]
    RW, RH = int(P.get("rw", DW)), int(P.get("rh", DH))
    if RW < 2 or RH < 2 or RW > DW or RH > DH:
        raise SystemExit(f"taille de calcul incohérente {RW}x{RH}")
    png = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", VID, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
                         capture_output=True).stdout
    w, h = int.from_bytes(png[16:20], "big"), int.from_bytes(png[20:24], "big")
    if (w, h) != (DW, DH):
        raise SystemExit(f"taille décodée {w}x{h} différente de celle de l'app {DW}x{DH}")
    # taille de travail de SeedVR2 : côté court visé = celui de la sortie, plafonné à 1080 (mémoire des cartes Kaggle) ;
    # le passage à ow×oh (ex. 4K) se fait ensuite par agrandissement Lanczos, puis l'app mêle le tout à sa version classique
    court_sortie = min(OW, OH)
    cible = min(court_sortie, 1080, max(min(RW, RH), 2 * min(RW, RH)))
    INFO.update({"decodage": {"matrice": mat, "plage": plage}, "calcul": f"{RW}x{RH}", "seedvr2_cote_court": cible})
    return dict(mat=mat, plage=plage, RW=RW, RH=RH, OW=OW, OH=OH, N=N, cible=cible)


def decouper(c, segments):
    """Écrit chaque segment [debut, fin) en vidéo intermédiaire SANS PERTE (RGB, image clé à chaque image) à RW×RH.
    Ordre d'affichage, une image par image du fichier, mêmes conversions de couleurs que l'app."""
    vf = (f"scale=w={c['RW']}:h={c['RH']}:" if (c["RW"], c["RH"]) != (P["dw"], P["dh"]) else "scale=") + \
         f"in_color_matrix={c['mat']}:in_range={c['plage']}:out_range=pc:flags=lanczos+full_chroma_int+accurate_rnd"
    chemins = []
    for i, (a, b) in enumerate(segments):
        out = os.path.join(TMP, f"seg{i}.mkv")
        sel = f",select='between(n\\,{a}\\,{b - 1})'"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", VID, "-vf", vf + sel, "-fps_mode", "passthrough",
                        "-c:v", "ffv1", "-level", "3", "-g", "1", "-pix_fmt", "bgr0", "-an", out], check=True)
        n = compter(out)
        if n != b - a:
            raise RuntimeError(f"segment {i} : {n} images au lieu de {b - a}")
        chemins.append(out)
    return chemins


def compter(f):
    r = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
                        "stream=nb_read_frames", "-of", "csv=p=0", f], capture_output=True, text=True).stdout.strip()
    return int(r or -1)


# ---------------------------------------------------------------- 2. installation de SeedVR2 (Internet de Kaggle)
def installer():
    if os.environ.get("RETOUCHE_SEEDVR2_CMD"):
        return None
    dep = os.path.join(TMP, "seedvr2")
    if not os.path.exists(os.path.join(dep, "inference_cli.py")):
        subprocess.run(["git", "init", "-q", dep], check=True)
        subprocess.run(["git", "-C", dep, "fetch", "-q", "--depth", "1", SEEDVR2_DEPOT, SEEDVR2_COMMIT], check=True, timeout=600)
        subprocess.run(["git", "-C", dep, "checkout", "-q", "FETCH_HEAD"], check=True)
    # dépendances absentes de l'image Kaggle (torch, numpy, opencv y sont déjà)
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "omegaconf>=2.3.0", "diffusers>=0.33.1", "peft>=0.17.0",
                    "rotary_embedding_torch>=0.5.3", "einops", "gguf", "safetensors"], check=True, timeout=900)
    return dep


# ---------------------------------------------------------------- 3. restauration SeedVR2 (un segment par carte graphique)
def commande(dep, entree, sortie_dir, gpu, cible):
    if os.environ.get("RETOUCHE_SEEDVR2_CMD"):
        return os.environ["RETOUCHE_SEEDVR2_CMD"].split() + [entree, sortie_dir, str(cible)]
    return [sys.executable, os.path.join(dep, "inference_cli.py"), entree,
            "--output", sortie_dir, "--output_format", "png",
            "--model_dir", os.path.join(TMP, "modeles"), "--dit_model", DIT,
            "--resolution", str(cible), "--max_resolution", "1920",
            "--batch_size", "21", "--uniform_batch_size", "--chunk_size", "105", "--temporal_overlap", "4", "--prepend_frames", "4",
            "--color_correction", "lab",                  # garde les couleurs d'origine (exigence du propriétaire)
            "--cuda_device", str(gpu), "--blocks_to_swap", "16", "--dit_offload_device", "cpu", "--vae_offload_device", "cpu",
            "--tensor_offload_device", "cpu", "--vae_encode_tiled", "--vae_decode_tiled",
            "--vae_encode_tile_size", "768", "--vae_decode_tile_size", "768", "--seed", "42"]


def restaurer(dep, segs, bornes, c):
    procs, dossiers = [], []
    for i, f in enumerate(segs):
        d = os.path.join(TMP, f"out{i}"); shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
        env = dict(os.environ, PYTHONUNBUFFERED="1")
        procs.append(subprocess.Popen(commande(dep, f, d, i, c["cible"]), env=env, stdout=sys.stdout, stderr=subprocess.STDOUT))
        dossiers.append(d)
    total = sum(b - a for a, b in bornes)
    t_debut = time.time()
    while any(p.poll() is None for p in procs):
        time.sleep(20)
        faits = sum(len(glob.glob(os.path.join(d, "*.png"))) for d in dossiers)
        ecoule = time.time() - t_debut
        if faits >= 21 and ecoule > 120:
            prevu = (time.time() - T0) + ecoule / faits * (total - faits)
            journal(f"SeedVR2 : {faits}/{total} images, fin prévue dans {(prevu - (time.time() - T0)) / 60:.0f} min")
            if prevu > DUREE_MAX_S:
                for p in procs: p.kill()
                raise RuntimeError(f"trop long pour une session Kaggle ({prevu / 3600:.1f} h prévues)")
    codes = [p.returncode for p in procs]
    if any(codes):
        raise RuntimeError(f"SeedVR2 arrêté (codes {codes})")
    return dossiers


def assembler(dossiers, bornes, recouvrement):
    """Liste ordonnée des images restaurées : on retire, pour chaque segment après le premier, les images de contexte."""
    images = []
    for i, d in enumerate(dossiers):
        f = sorted(glob.glob(os.path.join(d, "*.png")))
        attendu = bornes[i][1] - bornes[i][0]
        if len(f) != attendu:
            raise RuntimeError(f"segment {i} : {len(f)} images restaurées au lieu de {attendu}")
        images += f[recouvrement[i]:]
    return images


# ---------------------------------------------------------------- 4. contrôle qualité v2 (méthodes des recherches RNE de ChatGPT)
# Trois avis indépendants, sur ~24 images réparties dans la vidéo, comparées à l'image d'entrée correspondante :
#  - structure globale (SSIM de luminance) et couleurs ;
#  - structure PAR ZONE, grille 4×4 (RNE 0.13 : un accord global peut cacher une erreur locale) ; zones unies ignorées
#    (abstention), et seconde chance par le « Census » (RNE 0.14 : comparaison de rangs, insensible aux changements de lumière
#    et au recalage des couleurs) — le Census peut sauver une zone, jamais en condamner une (RNE 0.15 : un garde-fou
#    redondant qui refuse trop de zones valides coûte plus qu'il ne rapporte) ;
#  - stabilité dans le temps : écart compensé par le mouvement (flux optique) entre images voisines, restauration contre
#    entrée (RNE 0.4 / QA temporelle), coupes de plan et zones sans mouvement fiable écartées (RNE 0.9 / 0.10).
# Décision : accepter (force 1), ATTÉNUER (force 0,70 du détail ajouté, RNE 0.17 : une force fixe vaut un réseau de
# contrôle) ou refuser (repli sur l'IA standard).
SEUILS = dict(ssim_med=0.72, ssim_min=0.57, ssim_med_doux=0.80, couleur=12.0, zone_ssim=0.55, zone_census=0.12, zone_std=6.0,
              zones_refus=0.10, zones_doux=0.03, temps_refus=(1.5, 0.35), temps_doux=(0.6, 0.12), coupe=0.24)
FORCE_DOUCE = 0.70


def ssim_carte(a, b):
    import numpy as np, cv2
    a = a.astype(np.float64); b = b.astype(np.float64)
    k = (11, 11); C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    ma, mb = cv2.GaussianBlur(a, k, 1.5), cv2.GaussianBlur(b, k, 1.5)
    va = cv2.GaussianBlur(a * a, k, 1.5) - ma * ma; vb = cv2.GaussianBlur(b * b, k, 1.5) - mb * mb
    cab = cv2.GaussianBlur(a * b, k, 1.5) - ma * mb
    return ((2 * ma * mb + C1) * (2 * cab + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2))


def census_ecart(a, b):
    """Part des comparaisons de voisinage (8 voisins à 2 px) qui diffèrent : 0 = même structure (RNE 0.14)."""
    import numpy as np
    a = a.astype(np.int16); b = b.astype(np.int16); out = np.zeros(a.shape, np.float32)
    for dy, dx in ((-2, -2), (-2, 0), (-2, 2), (0, -2), (0, 2), (2, -2), (2, 0), (2, 2)):
        out += ((np.roll(a, (-dy, -dx), (0, 1)) > a) != (np.roll(b, (-dy, -dx), (0, 1)) > b)).astype(np.float32) / 8
    return out


def ecart_temporel(prev_in, cur_in, prev_out, cur_out):
    """Écart compensé par le mouvement, entrée et restauration (même taille). None si coupe ou mouvement peu fiable."""
    import numpy as np, cv2
    if float(np.mean(cv2.absdiff(prev_in, cur_in))) / 255 > SEUILS["coupe"]:
        return None
    c, p = cv2.cvtColor(cur_in, cv2.COLOR_BGR2GRAY), cv2.cvtColor(prev_in, cv2.COLOR_BGR2GRAY)
    h, w = c.shape
    flux = cv2.calcOpticalFlowFarneback(c, p, None, .5, 3, 15, 3, 5, 1.2, 0)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32); mx, my = xx + flux[..., 0], yy + flux[..., 1]
    dedans = (mx >= 1) & (mx < w - 2) & (my >= 1) & (my < h - 2)
    def mae(prev, cur, masque=None):
        d = np.abs(cv2.remap(prev, mx, my, cv2.INTER_LINEAR).astype(np.float32) - cur.astype(np.float32)).mean(2)
        return d if masque is None else float(d[masque].mean())
    fiable = dedans & (mae(prev_in, cur_in) <= 25)
    if fiable.sum() < max(48, .2 * h * w):
        return None
    return mae(prev_in, cur_in, fiable), mae(prev_out, cur_out, fiable)


def lire_entrees(segs, recouvrement, voulus):
    """Images d'entrée aux rangs voulus seulement (lecture séquentielle des segments intra, mémoire bornée)."""
    import cv2
    voulus, out, k = set(voulus), {}, 0
    for i, s in enumerate(segs):
        cap, j = cv2.VideoCapture(s), 0
        while True:
            ok, fr = cap.read()
            if not ok: break
            if j >= recouvrement[i]:
                if k in voulus: out[k] = fr
                k += 1
            j += 1
        cap.release()
    return out, k


def controler(images, segs, bornes, recouvrement, c):
    import numpy as np, cv2
    n = len(images)
    pos = sorted(set(int(round(k)) for k in np.linspace(1 if n > 1 else 0, n - 1, min(24, n))))
    entrees, total = lire_entrees(segs, recouvrement, set(pos) | {k - 1 for k in pos if k > 0})
    if total != n:
        raise RuntimeError(f"contrôle : {total} images d'entrée pour {n} restaurées")
    reduits, ssims, couleurs, zones, zones_mauvaises, temps = {}, [], [], 0, 0, []
    par_zone = np.zeros((4, 4))   # nombre d'images où chaque zone est mauvaise : un défaut local persistant compte même seul
    def reduit(k):
        if k not in reduits:
            r = cv2.imread(images[k], cv2.IMREAD_COLOR)
            if r is None or r.std() < 1.0:
                raise RuntimeError(f"image restaurée {k} vide ou invalide")
            e = entrees[k]; reduits[k] = cv2.resize(r, (e.shape[1], e.shape[0]), interpolation=cv2.INTER_AREA)
        return reduits[k]
    for k in pos:
        e, r = entrees[k], reduit(k)
        ye, yr = cv2.cvtColor(e, cv2.COLOR_BGR2GRAY), cv2.cvtColor(r, cv2.COLOR_BGR2GRAY)
        carte, cens = ssim_carte(ye, yr), census_ecart(ye, yr)
        ssims.append(float(carte.mean()))
        couleurs.append(float(np.abs(e.reshape(-1, 3).mean(0) - r.reshape(-1, 3).mean(0)).max()))
        h, w = ye.shape
        for i in range(4):
            for j in range(4):
                sl = (slice(round(i * h / 4), round((i + 1) * h / 4)), slice(round(j * w / 4), round((j + 1) * w / 4)))
                if ye[sl].std() < SEUILS["zone_std"]: continue          # zone unie : pas d'avis
                zones += 1
                if carte[sl].mean() < SEUILS["zone_ssim"] and cens[sl].mean() > SEUILS["zone_census"]:
                    zones_mauvaises += 1; par_zone[i, j] += 1
        if k > 0:
            t = ecart_temporel(entrees[k - 1], e, reduit(k - 1), r)
            if t: temps.append(t)
    ti = float(np.median([t[0] for t in temps])) if temps else None
    to = float(np.median([t[1] for t in temps])) if temps else None
    q = {"images_controlees": len(pos), "ssim_median": round(float(np.median(ssims)), 4), "ssim_min": round(min(ssims), 4),
         "ecart_couleur_max": round(max(couleurs), 2), "zones_jugees": zones,
         "zones_mauvaises_part": round(zones_mauvaises / max(1, zones), 4),
         "pire_zone_part": round(float(par_zone.max()) / len(pos), 4), "transitions_fiables": len(temps),
         "temps_entree": None if ti is None else round(ti, 3), "temps_restauration": None if to is None else round(to, 3)}
    S = SEUILS; raisons_refus, raisons_doux = [], []
    if q["ssim_median"] < S["ssim_med"] or q["ssim_min"] < S["ssim_min"]:
        raisons_refus.append(f"structure trop éloignée de la vidéo (SSIM médian {q['ssim_median']}, min {q['ssim_min']})")
    if q["ecart_couleur_max"] > S["couleur"]:
        raisons_refus.append(f"couleurs déplacées ({q['ecart_couleur_max']} niveaux)")
    if q["zones_mauvaises_part"] > S["zones_refus"] or q["pire_zone_part"] >= 0.25:
        raisons_refus.append(f"zones abîmées ({q['zones_mauvaises_part'] * 100:.0f} % des zones ; pire zone : "
                             f"{q['pire_zone_part'] * 100:.0f} % des images)")
    if ti is not None:
        d = to - ti
        if d > max(S["temps_refus"][0], S["temps_refus"][1] * ti):
            raisons_refus.append(f"scintillement ajouté ({ti:.2f} → {to:.2f})")
        elif d > max(S["temps_doux"][0], S["temps_doux"][1] * ti):
            raisons_doux.append("léger scintillement")
    if q["zones_mauvaises_part"] > S["zones_doux"]: raisons_doux.append("quelques zones douteuses")
    if q["ssim_median"] < S["ssim_med_doux"]: raisons_doux.append("structure un peu éloignée")
    q["force"] = 1.0 if not raisons_doux else FORCE_DOUCE
    q["avis"] = raisons_refus or raisons_doux or ["conforme"]
    INFO["controle"] = q
    journal("contrôle qualité :", q)
    if raisons_refus:
        raise RuntimeError("; ".join(raisons_refus))
    return q["force"]


# ---------------------------------------------------------------- 5. encodage final (mêmes réglages que l'IA standard)
def flux_attenue(images, segs, recouvrement, force):
    """Images restaurées avec seulement `force` du détail ajouté : base Lanczos de l'entrée + force × (SeedVR2 − base)."""
    import numpy as np, cv2
    k = 0
    for i, s in enumerate(segs):
        cap, j = cv2.VideoCapture(s), 0
        while True:
            ok, e = cap.read()
            if not ok: break
            if j >= recouvrement[i]:
                r = cv2.imread(images[k], cv2.IMREAD_COLOR).astype(np.float32)
                base = cv2.resize(e, (r.shape[1], r.shape[0]), interpolation=cv2.INTER_LANCZOS4).astype(np.float32)
                yield np.clip(base + force * (r - base), 0, 255).astype(np.uint8); k += 1
            j += 1
        cap.release()


def encoder(images, c, segs=None, recouvrement=None, force=1.0):
    QP = int(P.get("qp", 16))
    import cv2
    h0, w0 = cv2.imread(images[0]).shape[:2]
    if force >= 1.0:
        liste = os.path.join(TMP, "images.txt")
        with open(liste, "w") as f:
            for p in images:
                f.write(f"file '{p}'\nduration 0.0333333\n")
        entree = ["-f", "concat", "-safe", "0", "-i", liste]
    else:
        entree = ["-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w0}x{h0}", "-r", "30", "-i", "-"]
    def cmd(nv):
        enc = (["-c:v", "h264_nvenc", "-profile:v", "high", "-preset", "p6", "-tune", "hq", "-rc", "constqp", "-qp", str(QP)] if nv else
               ["-c:v", "libx264", "-profile:v", "high", "-preset", "medium", "-qp", str(QP)])
        return ["ffmpeg", "-y", "-loglevel", "error", *entree, "-fps_mode", "passthrough",
                "-vf", f"scale={c['OW']}:{c['OH']}:flags=lanczos+accurate_rnd+full_chroma_int,"
                       "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int",
                *enc, "-bf", "0", *(["-g", str(max(1, int(P["gop"])))] if P.get("gop") else []),
                "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709",
                "-color_trc", "bt709", "-movflags", "+faststart", os.path.join(SORTIE, "ia.mp4")]
    def lancer(nv):
        if force >= 1.0:
            return subprocess.run(cmd(nv)).returncode
        pr = subprocess.Popen(cmd(nv), stdin=subprocess.PIPE)
        try:
            for fr in flux_attenue(images, segs, recouvrement, force):
                pr.stdin.write(fr.tobytes())
        except BrokenPipeError:
            pass
        pr.stdin.close(); return pr.wait()
    if lancer(True) != 0 and lancer(False) != 0:
        raise RuntimeError("encodage final impossible")
    s = json.loads(subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
                                   "stream=width,height,codec_name,nb_read_frames", "-of", "json", os.path.join(SORTIE, "ia.mp4")],
                                  capture_output=True, text=True).stdout)["streams"][0]
    return s


# ---------------------------------------------------------------- 6. repli automatique : IA standard
def repli(raison):
    journal("REPLI sur l'IA standard (Real-ESRGAN) :", raison)
    for f in ("ia.mp4", "info.json"):
        try: os.remove(os.path.join(SORTIE, f))
        except FileNotFoundError: pass
    cmd = os.environ.get("RETOUCHE_REPLI_CMD")
    cmd = cmd.split() if cmd else [sys.executable, os.path.join(ENTREE, "traitement_kaggle.py")]
    code = subprocess.run(cmd).returncode
    try:
        info = json.load(open(os.path.join(SORTIE, "info.json")))
    except Exception:
        info = {"ok": False}
    info.update({"moteur": "realesrgan-repli", "repli": str(raison)[:400], "cinema": {k: INFO[k] for k in ("controle", "seedvr2_cote_court") if k in INFO}})
    json.dump(info, open(os.path.join(SORTIE, "info.json"), "w"), indent=1)
    if code != 0 or not info.get("ok"):
        raise SystemExit("repli échoué")


def principal():
    INFO["gpu"] = gpus()
    c = preparer()
    N = c["N"]; ng = max(1, min(2, len(INFO["gpu"]) or 1))
    if os.environ.get("RETOUCHE_SEEDVR2_CMD"): ng = int(os.environ.get("RETOUCHE_NB_GPU", ng))
    ov = 8 if ng > 1 and N > 64 else 0
    m = N // 2 if ov else N
    bornes = [(0, N)] if not ov else [(0, m), (m - ov, N)]
    recouvrement = [0] if not ov else [0, ov]
    journal(f"{N} images, {ng} carte(s), segments {bornes}, SeedVR2 côté court {c['cible']} px")
    try:
        dep = installer()
        segs = decouper(c, bornes)
        dossiers = restaurer(dep, segs, bornes, c)
        images = assembler(dossiers, bornes, recouvrement)
        if len(images) != N:
            raise RuntimeError(f"{len(images)} images restaurées au lieu de {N}")
        force = controler(images, segs, bornes, recouvrement, c)
    except Exception as e:
        return repli(e)
    try:
        s = encoder(images, c, segs, recouvrement, force)
    except Exception as e:
        return repli(e)
    INFO.update({"images_lues": N, "images_attendues": N, "sortie": s, "taille_octets": os.path.getsize(os.path.join(SORTIE, "ia.mp4")),
                 "duree_s": round(time.time() - T0, 1), "s_par_image": round((time.time() - T0) / max(1, N), 3),
                 "ok": int(s.get("nb_read_frames", -1)) == N and s["width"] == c["OW"] and s["height"] == c["OH"]})
    ecrire_info()
    journal(json.dumps(INFO, indent=1, ensure_ascii=False))
    if not INFO["ok"]:
        return repli("contrôle final de la vidéo encodée échoué")
    shutil.rmtree(TMP, ignore_errors=True)


if __name__ == "__main__":
    principal()
