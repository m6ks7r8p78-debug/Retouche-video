"""Banc comparatif des méthodes NON génératives de conversion 9:16 → 16:9 (v8.5 « Fidèle »).

Méthodes (aucune n'invente de pixel) :
  naturel        image entière à ses proportions, bandes noires
  fidele         déformation alignée sur l'axe, sujets protégés, fond ≤ 10 %          (moteur de l'app : format-fidele.js)
  accru          même méthode, fond ≤ 35 %                                              (moteur de l'app)
  total          même méthode, fond étiré autant qu'il faut                             (moteur de l'app)
  uniforme       étirement horizontal uniforme de toute l'image
  recadrage      agrandissement + coupe du haut et du bas
  seam_image     seam carving (insertion de coutures), recalculé à chaque image, sujets protégés
  seam_scene     seam carving, coutures calculées une fois par scène (énergie moyenne), sujets protégés

Mesures (sur chaque image traitée) :
  conservation   part des pixels filmés présents dans la sortie
  remplissage    part de la largeur de sortie couverte par l'image
  etir_sujets    étirement horizontal local max sous les visages / personnes détectés (1 = intact)
  ident_sujets   part des pixels des visages / personnes identiques à l'original (copie exacte)
  etir_max       étirement local max (fenêtres de 8 px)
  gigue_px       déplacement moyen de la géométrie d'une image à l'autre (0 = géométrie stable)
  scintil        variations image-à-image de la sortie ÷ celles de l'original (zone image, 1 = rien d'ajouté)
  nettete        variance du laplacien de la zone image ÷ celle de l'original (1 = aucun flou ajouté)
  ms_image       temps de calcul par image (Python, indicatif)

python3 tests/fidele/banc_fidele.py [dossier_videos] [dossier_sortie]
Détecteurs : YuNet (modeles/yunet.onnx, celui de l'app) pour les visages, HOG d'OpenCV pour les personnes.
"""
import cv2, numpy as np, json, os, sys, subprocess, time, glob

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VID = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "tests", "medias", "fidele")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "tests", "sorties", "banc_fidele")
os.makedirs(OUT, exist_ok=True)
HMAX = 480          # banc calculé à 480 px de haut au plus (le seam carving image par image est très lent au-delà)
NSEAM = 16          # images consécutives traitées par seam_image (lent) ; les autres méthodes : toutes les images
AT = 16 / 9

def lire(chemin):
    c = cv2.VideoCapture(chemin); F = []
    while True:
        ok, f = c.read()
        if not ok: break
        h, w = f.shape[:2]
        if h > HMAX: f = cv2.resize(f, (round(w * HMAX / h / 2) * 2, HMAX), interpolation=cv2.INTER_AREA)
        F.append(f)
    return F

YU = cv2.FaceDetectorYN.create(os.path.join(ROOT, "modeles", "yunet.onnx"), "", (320, 320), .6, .3, 50)
HOG = cv2.HOGDescriptor(); HOG.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
def sujets(f):
    h, w = f.shape[:2]; B = []
    YU.setInputSize((w, h)); _, r = YU.detect(f)
    for d in (r if r is not None else []): B.append(("visage", *[int(v) for v in d[:4]]))
    up = cv2.resize(f, (w * 2, h * 2)) if h < 400 else f; k = up.shape[0] / h
    rs, ws = HOG.detectMultiScale(up, winStride=(8, 8), padding=(8, 8), scale=1.05)
    for (x, y, bw, bh), s in zip(rs, np.ravel(ws) if len(ws) else []):
        if s > .5: B.append(("personne", int(x / k), int(y / k), int(bw / k), int(bh / k)))
    return B

def coupures(F):
    S = [0]; prev = None
    for i, f in enumerate(F):
        g = cv2.resize(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), (32, 56)).astype(np.float32)
        if prev is not None and np.mean(np.abs(g - prev)) > 28: S.append(i)
        prev = g
    return S + [len(F)]

def profil(F, i0, i1, D):
    """mêmes profils que l'app (format.js, FFP) : 90 colonnes environ (petit côté de l'analyse), détails et mouvement"""
    h, w = F[0].shape[:2]; aw = max(2, round(160 * w / h / 2) * 2); ah = 160
    e = np.zeros(aw); m = np.zeros(aw); pg = None; n = 0
    for f in F[i0:i1]:
        g = cv2.resize(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), (aw, ah), interpolation=cv2.INTER_AREA).astype(np.float32)
        gx = np.abs(g[1:-1, 2:] - g[1:-1, :-2]); gy = np.abs(g[2:, 1:-1] - g[:-2, 1:-1]); c = np.zeros(aw); c[1:-1] = (gx + gy).mean(0); c[0], c[-1] = c[1], c[-2]; e += c
        if pg is not None: mm = np.zeros(aw); mm[1:-1] = np.abs(g - pg)[1:-1, 1:-1].mean(0); mm[0], mm[-1] = mm[1], mm[-2]; m += mm
        pg = g; n += 1
    boites = {}
    for i in range(i0, i1):
        for (cl, x, y, bw, bh) in D[i]:
            b = boites.setdefault(cl, [1, 0])
            b[0] = min(b[0], x / w); b[1] = max(b[1], (x + bw) / w)
    # union par classe sur la scène (comme l'app : un sujet est protégé partout où il passe)
    return {"n": aw, "energie": (e / max(1, n)).tolist(), "mouvement": (m / max(1, n)).tolist(),
            "boites": [{"a": max(0, a), "b": min(1, b), "classe": cl} for cl, (a, b) in boites.items() if b > a]}

def moteur(req):
    p = subprocess.run(["node", os.path.join(ROOT, "tests", "fidele", "ffi_cli.mjs")], input=json.dumps(req).encode(), capture_output=True, check=True)
    return json.loads(p.stdout)

# ---------- rendus ----------
def rendu_colonnes(f, B, s, W):
    """pose chaque groupe de colonnes à sa place (bornes entières, comme l'app) ; renvoie l'image et la carte x_source → x_sortie"""
    h, w = f.shape[:2]; o = np.zeros((h, W, 3), np.uint8); n = len(s)
    L = sum((B[i + 1] - B[i]) * s[i] for i in range(n)); x = (W - L) / 2; D = [round(x)]
    for i in range(n): x += (B[i + 1] - B[i]) * s[i]; D.append(round(x))
    i = 0
    while i < n:
        j = i + 1
        while j < n and abs(s[j] - s[i]) < 1e-6: j += 1
        sa, sl, da, dl = B[i], B[j] - B[i], D[i], D[j] - D[i]
        if dl > 0: o[:, da:da + dl] = f[:, sa:sa + sl] if dl == sl else cv2.resize(f[:, sa:sa + sl], (dl, h), interpolation=cv2.INTER_CUBIC)
        i = j
    xs = np.interp(np.arange(w + 1), B, D)       # position de sortie de chaque bord de pixel source
    return o, np.tile(xs, (h, 1)), (D[0], D[-1])

def energie(f):
    g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32)
    return np.abs(cv2.Sobel(g, cv2.CV_32F, 1, 0)) + np.abs(cv2.Sobel(g, cv2.CV_32F, 0, 1))

def coutures(E, k):
    """k coutures verticales de plus faible énergie (retrait successif) ; renvoie pour chaque ligne les colonnes d'origine des coutures"""
    h, w = E.shape; idx = np.tile(np.arange(w), (h, 1)); E = E.copy(); S = np.zeros((h, k), np.int32)
    for t in range(k):
        M = E.copy(); bt = np.zeros((h, E.shape[1]), np.int8)
        for y in range(1, h):
            p = M[y - 1]; l = np.r_[np.inf, p[:-1]]; r = np.r_[p[1:], np.inf]; st = np.stack([l, p, r]); a = st.argmin(0); bt[y] = a - 1; M[y] += st[a, np.arange(len(p))]
        x = int(M[-1].argmin()); keep = np.ones(E.shape, bool)
        for y in range(h - 1, -1, -1):
            S[y, t] = idx[y, x]; keep[y, x] = False; x = min(E.shape[1] - 1, max(0, x + int(bt[y, x]))) if y else x
        E = E[keep].reshape(h, -1); idx = idx[keep].reshape(h, -1)
    return S

def inserer(f, E, Wcible):
    """insertion de coutures jusqu'à la largeur voulue (par tours de ≤ la moitié de la largeur courante, sinon on duplique les mêmes coutures)"""
    h = f.shape[0]; cur = f; Ecur = E; carte = np.tile(np.arange(f.shape[1] + 1, dtype=np.float64), (h, 1))
    while cur.shape[1] < Wcible:
        k = min(Wcible - cur.shape[1], cur.shape[1] // 2); S = np.sort(coutures(Ecur, k), 1); w = cur.shape[1]
        out = np.zeros((h, w + k, 3), np.uint8); Eo = np.zeros((h, w + k), np.float32); nc = np.zeros((h, w + 1))
        for y in range(h):
            row = cur[y].astype(np.int16); ins = np.zeros(w, np.int32); np.add.at(ins, S[y], 1)
            rep = 1 + ins; out[y] = np.repeat(cur[y], rep, 0)
            # la couture dupliquée prend la moyenne avec sa voisine de droite (comme Avidan & Shamir)
            pos = np.cumsum(rep) - 1; dup = np.where(ins > 0)[0]
            for x in dup: out[y, pos[x]] = ((row[x] + row[min(w - 1, x + 1)]) // 2).astype(np.uint8)
            Eo[y] = np.repeat(Ecur[y], rep) + np.repeat(ins > 0, rep) * 1e3   # une couture déjà dupliquée devient chère (évite d'étirer toujours la même)
            nc[y] = np.r_[0, np.cumsum(rep)]
        carte = np.stack([np.interp(carte[y], np.arange(w + 1), nc[y]) for y in range(h)])
        cur, Ecur = out, Eo
    return cur, carte

def proteger(E, D, w):
    E = E.copy()
    for (cl, x, y, bw, bh) in D: E[max(0, y):y + bh, max(0, x):x + bw] += 1e5
    return E

# ---------- mesures ----------
def etirement_local(carte, x0, x1, y0, y1):
    """étirement max sur des fenêtres de 8 px entre x0 et x1 (lignes y0…y1)"""
    c = carte[max(0, y0):max(y0 + 1, y1)]; a = max(0, x0); b = min(c.shape[1] - 1, max(a + 1, x1))
    if b - a < 1: return 1.0
    pas = min(8, b - a); d = (c[:, a + pas:b + 1] - c[:, a:b + 1 - pas]) / pas
    return float(d.max()) if d.size else 1.0

def mesurer(src, out, carte, D, region, nom):
    h, w = src.shape[:2]; R = {}
    R["etir_max"] = etirement_local(carte, 0, w, 0, h)
    es, idn, tot = [1.0], 0, 0
    for (cl, x, y, bw, bh) in D:
        x0, x1, y0, y1 = max(0, x), min(w, x + bw), max(0, y), min(h, y + bh)
        if x1 - x0 < 4 or y1 - y0 < 4: continue
        es.append(etirement_local(carte, x0, x1, y0, y1))
        dx = np.round(carte[y0:y1, x0]).astype(int)
        for yy, d in zip(range(y0, y1), dx):
            if 0 <= d and d + (x1 - x0) <= out.shape[1]: idn += int((np.abs(out[yy, d:d + x1 - x0].astype(int) - src[yy, x0:x1].astype(int)).max(1) == 0).sum())
            tot += x1 - x0
    R["etir_sujets"] = max(es); R["ident_sujets"] = idn / tot if tot else None
    a, b = region; z = out[:, a:b]
    if z.shape[1] > 4:
        R["nettete"] = float(cv2.Laplacian(cv2.cvtColor(z, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var() / max(1e-6, cv2.Laplacian(cv2.cvtColor(src, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var()))
    return R

def banc_video(chemin):
    nom = os.path.basename(chemin)[:-4]; F = lire(chemin); h, w = F[0].shape[:2]; W = int(round(h * AT / 2) * 2); T = h * AT
    D = [sujets(f) for f in F]; S = coupures(F); scenes = list(zip(S[:-1], S[1:]))
    V = moteur([{"profil": profil(F, a, b, D), "L": w, "Lp": h, "T": T} for a, b in scenes])
    res = {}; vignettes = {}; mid = len(F) // 2
    def meth(id_, fn, indices):
        acc = []; prev_o = prev_s = prev_c = None; t0 = time.time(); geo = []; sc_o = sc_s = 0
        for i in indices:
            k = next(j for j, (a, b) in enumerate(scenes) if a <= i < b)
            o, carte, reg, cons = fn(i, k)
            m = mesurer(F[i], o, carte, D[i], reg, id_); m["remplissage"] = (reg[1] - reg[0]) / W; m["conservation"] = cons; acc.append(m)
            if prev_c is not None and prev_c.shape == carte.shape: geo.append(float(np.abs(carte - prev_c).mean()))
            go = cv2.resize(cv2.cvtColor(o[:, reg[0]:reg[1]], cv2.COLOR_BGR2GRAY), (64, 64)).astype(np.float32); gs = cv2.resize(cv2.cvtColor(F[i], cv2.COLOR_BGR2GRAY), (64, 64)).astype(np.float32)
            if prev_o is not None: sc_o += np.abs(go - prev_o).mean(); sc_s += np.abs(gs - prev_s).mean()
            prev_o, prev_s, prev_c = go, gs, carte
            if i == indices[len(indices) // 2]: vignettes[id_] = o
        ms = (time.time() - t0) * 1000 / len(indices)
        agg = lambda k, f=max: (f([a[k] for a in acc if a.get(k) is not None]) if any(a.get(k) is not None for a in acc) else None)
        res[id_] = {"images": len(indices), "conservation": agg("conservation", min), "remplissage": agg("remplissage", min), "etir_sujets": agg("etir_sujets"), "ident_sujets": agg("ident_sujets", min),
                    "etir_max": agg("etir_max"), "gigue_px": float(np.mean(geo)) if geo else 0.0, "scintil": float(sc_o / sc_s) if sc_s else 1.0, "nettete": agg("nettete", np.median), "ms_image": ms}
    tous = list(range(len(F)))
    for vid in ["fidele", "accru", "total", "uniforme"]:
        meth(vid, lambda i, k, vid=vid: (lambda r: (r[0], r[1], r[2], 1.0))(rendu_colonnes(F[i], V[k][vid]["B"], V[k][vid]["s"], W)), tous)
    meth("naturel", lambda i, k: (lambda r: (r[0], r[1], r[2], 1.0))(rendu_colonnes(F[i], V[k]["exact"]["B"], [1.0] * len(V[k]["exact"]["s"]), W)), tous)
    def recad(i, k):
        f = W / w; Hs = h * f; keep = h / f; y0 = int(round((h - keep) / 2)); o = cv2.resize(F[i][y0:y0 + int(round(keep))], (W, h), interpolation=cv2.INTER_CUBIC)
        carte = np.tile(np.arange(w + 1) * f, (h, 1)); return o, carte, (0, W), keep / h
    meth("recadrage", recad, tous)
    # seam carving : coutures par scène (énergie moyenne) puis image par image (sur NSEAM images au milieu)
    cache = {}
    def seam_scene(i, k):
        if k not in cache:
            a, b = scenes[k]; Em = np.mean([energie(F[j]) for j in range(a, b, max(1, (b - a) // 12))], 0)
            for j in range(a, b): Em = proteger(Em, D[j], w)
            cache[k] = Em
        o, carte = inserer(F[i], cache[k], W); return o, carte, (0, W), 1.0
    sub = list(range(max(0, mid - NSEAM // 2), min(len(F), mid + NSEAM // 2)))
    # coutures fixes : le calcul est refait à chaque image dans ce banc (lent) mais donne la même géométrie ; on le fait sur les mêmes images
    meth("seam_scene", seam_scene, sub)
    meth("seam_image", lambda i, k: (lambda r: (r[0], r[1], (0, W), 1.0))(inserer(F[i], proteger(energie(F[i]), D[i], w), W)), sub)
    # planche : une image, toutes les méthodes
    ordre = ["naturel", "fidele", "accru", "total", "uniforme", "recadrage", "seam_scene", "seam_image"]
    pl = []
    for m in ordre:
        v = vignettes[m].copy(); cv2.putText(v, m, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, .6, (0, 0, 0), 3); cv2.putText(v, m, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, .6, (255, 255, 255), 1); pl.append(cv2.resize(v, (640, round(640 * h / W))))
    cv2.imwrite(os.path.join(OUT, nom + "_planche.jpg"), np.vstack([np.hstack(pl[i:i + 2]) for i in range(0, 8, 2)]), [cv2.IMWRITE_JPEG_QUALITY, 88])
    return {"video": nom, "taille": [w, h], "images": len(F), "scenes": len(scenes), "sujets_detectes": sum(len(d) for d in D), "methodes": res}

if __name__ == "__main__":
    R = []
    for c in sorted(glob.glob(os.path.join(VID, "*.mp4"))):
        t = time.time(); r = banc_video(c); R.append(r); print(r["video"], "%.0f s" % (time.time() - t), flush=True)
    json.dump(R, open(os.path.join(OUT, "banc_fidele.json"), "w"), indent=1)
    f = lambda v, p=2: "—" if v is None else ("%." + str(p) + "f") % v
    L = ["| vidéo | méthode | conservation | remplissage | étir. sujets | ident. sujets | étir. max | gigue px | scintil. | netteté | ms/image |", "|" + "---|" * 11]
    for r in R:
        for m, v in r["methodes"].items():
            L.append(f"| {r['video']} | {m} | {f(v['conservation'],3)} | {f(v['remplissage'],3)} | {f(v['etir_sujets'])} | {f(v['ident_sujets'],3)} | {f(v['etir_max'])} | {f(v['gigue_px'])} | {f(v['scintil'])} | {f(v['nettete'])} | {f(v['ms_image'],0)} |")
    open(os.path.join(OUT, "banc_fidele.md"), "w").write("\n".join(L) + "\n"); print("\n".join(L))
