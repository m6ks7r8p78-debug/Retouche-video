# F14 — banc d'essai : restauration des visages EN VIDÉO, cohérente dans le temps (vérité terrain connue).
#   PYTHONPATH=tests/visage_ia/faux python3 tests/visage_ia/banc_video.py [nb_portraits] [nb_images]
# Séquences (30 images/s) : vrais portraits du domaine public (tests/medias/visages_dp) animés par un mouvement lisse connu (translation, rotation,
# zoom), puis dégradés image par image comme un vieux téléphone (bruit et compression différents à chaque image : c'est ce qui fait
# scintiller une restauration image par image). Limite : pas de changement d'expression ni de vraie scène ; ne vaut ni validation sur
# vraies vidéos de famille ni validation sur iPhone.
# Méthodes comparées (toutes avec GFPGAN v1.4 int8, force 80 %, recollage à bord fondu comme l'app) :
#   A  image par image (repères de chaque image)                       — ce que donnerait l'outil photo appliqué à chaque image
#   B  image par image, repères lissés dans le temps
#   C  images clés + report des détails : GFPGAN 1 image sur K, les détails restaurés (restauré − entrée, dans le repère du visage)
#      sont reportés sur les images intermédiaires en suivant le visage, avec fondu entre deux clés
#   R  comme D mais au fil de l'export (rien de l'avenir) : fondu de la clé précédente vers la clé courante (« R3 » = clé toutes les 3 images)
#   G  comme H, avec recalage fin de chaque image sur la première (tests/labo_filtres/recalage.py) avant la fusion et le report
#   H  comme D (clés + fusion), mais l'image finale = basses fréquences de l'image courante + hautes fréquences des clés (méthode de l'app)
#   E  chaque image restaurée (entrée fusionnée comme D), puis détails lissés sur les voisines alignées
#   D  comme C, mais l'entrée de chaque image est d'abord fusionnée avec ses voisines alignées (débruitage multi-images) ; « D3 » = une clé toutes les 3 images
# Mesures (zone du visage, dans le repère du visage) : LPIPS et PSNR contre la vérité ; scintillement = écart entre la variation
# d'une image à la suivante du résultat et celle de la vérité (0 = aussi stable que la vraie vidéo) ; appels au modèle.
import cv2, numpy as np, onnxruntime as ort, glob, json, lpips, torch, sys, os, time
ICI = os.path.dirname(os.path.abspath(__file__)); YU = os.path.join(ICI, '../../modeles/yunet.onnx')
T = np.array([[192.98138,239.94708],[318.90277,240.1936],[256.63416,314.01935],[201.26117,371.41043],[313.08905,371.15118]],np.float32)
METH = (os.environ.get('METHODES') or 'A,B,C,D,E').split(',')
NP = int(sys.argv[1]) if len(sys.argv) > 1 else 4; NF = int(sys.argv[2]) if len(sys.argv) > 2 else 24; K = 6; FORCE = .8
sess = ort.InferenceSession(os.path.join(ICI, '../../modeles/lourds/gfpgan14_int8w.onnx'), providers=['CPUExecutionProvider'])
L = lpips.LPIPS(net='alex', verbose=False); rng = np.random.default_rng(11); APPELS = [0]
def detecter(img):
    h, w = img.shape[:2]; d = cv2.FaceDetectorYN.create(YU, '', (w, h), 0.5, 0.3, 5000); _, f = d.detect(img)
    if f is None: return None
    f = f[np.argmax(f[:, 2] * f[:, 3])]; return f[4:14].reshape(5, 2).astype(np.float32)
def sim(p):
    if os.environ.get('SIM') == 'mc':   # moindres carrés sur les 5 repères, comme l'app (RVIS.similitude)
        m, n = p.mean(0), T.mean(0); x, u = p - m, T - n; sxx = (x ** 2).sum(); a = (x * u).sum() / sxx; b = (x[:, 0] * u[:, 1] - x[:, 1] * u[:, 0]).sum() / sxx
        return np.array([[a, -b, n[0] - a * m[0] + b * m[1]], [b, a, n[1] - b * m[0] - a * m[1]]], np.float64)
    return cv2.estimateAffinePartial2D(p, T, method=cv2.LMEDS)[0]
BORD = cv2.BORDER_CONSTANT if os.environ.get('BORD') == 'noir' else cv2.BORDER_REFLECT
def gfpgan(bgr):
    APPELS[0] += 1; x = (cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 127.5 - 1).transpose(2, 0, 1)[None]
    y = sess.run(None, {'entree': x})[0][0].transpose(1, 2, 0); g = cv2.cvtColor(((np.clip(y, -1, 1) + 1) * 127.5).astype(np.float32), cv2.COLOR_RGB2BGR)
    return g
# même bord fondu et même recalage des couleurs que restauration-visage.js
yy, xx = np.mgrid[0:512, 0:512]; r = np.sqrt(((xx - 256) / 236.) ** 2 + ((yy - 286) / 250.) ** 2); m = np.minimum.reduce([xx, yy, 511 - xx, 511 - yy])
ALPHA = (np.clip((1.12 - r) / .22, 0, 1) * np.clip(m / 24., 0, 1)).astype(np.float32)
def recaler(g, d):
    c = ALPHA > .9; return g + (d[c].mean(0) - g[c].mean(0))
def coller(frame, face512, M):
    Mi = cv2.invertAffineTransform(M); h, w = frame.shape[:2]
    if os.environ.get('COLLE') == 'filtre':   # réduction filtrée (comme le canvas du navigateur) au lieu d'un bilinéaire qui replie les détails
        k = np.hypot(M[0, 0], M[1, 0]); face512 = cv2.GaussianBlur(face512, (0, 0), max(.01, .5 * k)) if k > 1.2 else face512
    f = cv2.warpAffine(face512, Mi, (w, h), flags=cv2.INTER_LINEAR); a = cv2.warpAffine(ALPHA, Mi, (w, h), flags=cv2.INTER_LINEAR)[..., None]
    return np.clip(frame.astype(np.float32) * (1 - a) + f * a, 0, 255).astype(np.uint8)
def lisser(P):   # repères lissés dans le temps : régression locale d'ordre 2 sur 7 images (suit le mouvement, retire la tremblote)
    P = np.array(P); out = P.copy(); n = len(P)
    for t in range(n):
        a, b = max(0, t - 3), min(n, t + 4); x = np.arange(a, b) - t
        if len(x) < 4: continue
        X = np.stack([np.ones_like(x), x, x * x], 1).astype(np.float64); c = np.linalg.lstsq(X, P[a:b].reshape(len(x), -1), rcond=None)[0]
        out[t] = c[0].reshape(P.shape[1:])
    return list(out)

def sequence(img):
    """vérité (vidéo nette en mouvement) et entrée dégradée ; mouvement lisse connu"""
    p = detecter(img); h, w = img.shape[:2]; c = p.mean(0); W, H = 360, 480
    gt, lq = [], []
    for t in range(NF):
        u = t / 120.; ang = 6 * np.sin(2 * np.pi * u); sc = 0.55 * (1 + .08 * np.sin(np.pi * u)); dx = 30 * np.sin(2 * np.pi * u * .7); dy = 12 * np.cos(2 * np.pi * u)
        M = cv2.getRotationMatrix2D((float(c[0]), float(c[1])), ang, sc); M[:, 2] += [W / 2 - c[0] + dx, H / 2 - c[1] + dy]
        g = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT); gt.append(g)
        # vieux téléphone : 1/3 de la définition, flou optique, bruit de capteur et JPEG différents à chaque image
        s = cv2.resize(cv2.GaussianBlur(g, (0, 0), 1.0), (W // 3, H // 3), interpolation=cv2.INTER_AREA).astype(np.float32)
        s = np.clip(s + rng.normal(0, 4, s.shape), 0, 255).astype(np.uint8)
        s = cv2.imdecode(cv2.imencode('.jpg', s, [cv2.IMWRITE_JPEG_QUALITY, 30])[1], 1)
        lq.append(cv2.resize(s, (W, H), interpolation=cv2.INTER_CUBIC))
    return gt, lq

def poids(al, t, s):
    e = np.abs(cv2.GaussianBlur(al[s], (0, 0), 3) - cv2.GaussianBlur(al[t], (0, 0), 3)).mean(); return np.exp(-(e / 6.) ** 2) * (1. if s == t else .8)
def methode(lq, nom, K=K):
    P = [detecter(f) for f in lq]
    if os.environ.get('PTS'): P = [np.array(q, np.float32).reshape(5, 2) for q in json.load(open(os.environ['PTS']))]   # repères fournis (ceux de l'app)
    for t in range(len(P)):   # image sans repérage : on garde la position précédente
        if P[t] is None: P[t] = P[t - 1] if t else next(x for x in P if x is not None)
    if nom != 'A': P = lisser(P)
    Ms = [sim(p) for p in P]; al = [cv2.warpAffine(f, M, (512, 512), flags=cv2.INTER_LINEAR, borderMode=BORD).astype(np.float32) for f, M in zip(lq, Ms)]; brut = al
    if nom == 'G':
        sys.path.insert(0, os.path.join(ICI, '../labo_filtres')); from recalage import recaler as recaler_fin, composer
        g = lambda z: cv2.cvtColor(z.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32); Rg = g(al[0]); poids_v = (ALPHA > .5).astype(np.float32)
        for t in range(1, len(al)):
            D = recaler_fin(Rg, g(al[t]), poids_v)
            if D is not None: Ms[t] = composer(D, Ms[t]); al[t] = cv2.warpAffine(lq[t], Ms[t], (512, 512), flags=cv2.INTER_LINEAR, borderMode=BORD).astype(np.float32)
        brut = al; nom = 'H'
    if nom in ('D', 'E', 'R', 'H'):   # fusion (G est devenu H après le recalage) multi-images dans le repère du visage : moyenne pondérée des voisines bien alignées
        fu = []
        for t in range(len(al)):
            acc, ws = np.zeros_like(al[t]), 0.
            for s in range(max(0, t - 2), min(len(al), t + 1 if nom == 'R' else t + 3)):   # R : seulement le passé (calcul au fil de l'export)
                w = poids(al, t, s)
                acc += w * al[s]; ws += w
            fu.append(acc / ws)
        al = fu
    out = []
    if nom == 'E':   # chaque image restaurée, puis détails lissés dans le temps (voisines alignées, mêmes poids que la fusion)
        det = [recaler(gfpgan(a.astype(np.uint8)), a) - a for a in al]
        for t, (f, a, M) in enumerate(zip(lq, al, Ms)):
            acc, ws = np.zeros_like(a), 0.
            for s in range(max(0, t - 2), min(len(al), t + 3)): w = poids(al, t, s); acc += w * det[s]; ws += w
            out.append(coller(f, np.clip(a + FORCE * acc / ws, 0, 255), M))
        return out
    if nom in ('A', 'B'):
        for f, a, M in zip(lq, al, Ms):
            g = recaler(gfpgan(a.astype(np.uint8)), a); out.append(coller(f, FORCE * g + (1 - FORCE) * a, M))
        return out
    if nom == 'R':   # au fil de l'export, sans attendre l'avenir : une clé toutes les K images, fondu de la clé précédente vers la nouvelle
        det, prev, out = {}, None, []
        for t, (f, a, M) in enumerate(zip(lq, al, Ms)):
            if t % K == 0: prev = det.get(t - K); det[t] = recaler(gfpgan(a.astype(np.uint8)), a) - a
            k = t - t % K; u = (t - k + 1) / K; d = det[k] if prev is None else (1 - u) * prev + u * det[k]
            out.append(coller(f, np.clip(a + FORCE * d, 0, 255), M))
        return out
    cles = list(range(0, len(lq), K));
    if cles[-1] != len(lq) - 1: cles.append(len(lq) - 1)
    det = {k: recaler(gfpgan(al[k].astype(np.uint8)), al[k]) - al[k] for k in cles}   # détails restaurés, dans le repère du visage
    if nom == 'H':   # ce que fait l'app : basses fréquences de l'image courante (couleurs, lumière de l'export) + hautes fréquences des clés restaurées
        LP = lambda z: cv2.GaussianBlur(z, (0, 0), float(os.environ.get("SIGMA", 12))); hp = {k: (al[k] + FORCE * det[k]) - LP(al[k] + FORCE * det[k]) for k in cles}
        for t, (f, a, M) in enumerate(zip(lq, al, Ms)):
            k0 = max(k for k in cles if k <= t); k1 = min(k for k in cles if k >= t); u = 0 if k1 == k0 else (t - k0) / (k1 - k0)
            out.append(coller(f, np.clip(LP(brut[t] if os.environ.get('LPSRC') == 'brut' else a) + (1 - u) * hp[k0] + u * hp[k1], 0, 255), M))
        return out
    for t, (f, a, M) in enumerate(zip(lq, al, Ms)):
        k0 = max(k for k in cles if k <= t); k1 = min(k for k in cles if k >= t); u = 0 if k1 == k0 else (t - k0) / (k1 - k0)
        d = (1 - u) * det[k0] + u * det[k1]
        out.append(coller(f, np.clip(a + FORCE * d, 0, 255), M))
    return out

def mesurer(gt, out):
    P = [detecter(g) for g in gt]; Ms = [sim(p) for p in P]
    A = lambda f, M: cv2.warpAffine(f, M, (512, 512), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT).astype(np.float32)
    G = [A(g, M) for g, M in zip(gt, Ms)]; O = [A(o, M) for o, M in zip(out, Ms)]; zone = (ALPHA > .5)[..., None]
    t2 = lambda z: torch.from_numpy(cv2.cvtColor(np.clip(z, 0, 255).astype(np.uint8), cv2.COLOR_BGR2RGB).transpose(2, 0, 1)[None].astype(np.float32) / 127.5 - 1)
    with torch.no_grad(): lp = float(np.mean([float(L(t2(o * zone), t2(g * zone))) for o, g in zip(O, G)]))
    ps = float(np.mean([10 * np.log10(255 ** 2 / max(1e-6, ((o - g) ** 2)[np.broadcast_to(zone, o.shape)].mean())) for o, g in zip(O, G)]))
    sc = float(np.mean([np.abs((O[t] - O[t - 1]) - (G[t] - G[t - 1]))[np.broadcast_to(zone, G[t].shape)].mean() for t in range(1, len(G))]))
    return {'lpips': round(lp, 4), 'psnr': round(ps, 2), 'scintillement': round(sc, 3)}

res = []; t0 = time.time()
for f in sorted(glob.glob(os.path.join(ICI, '../medias/visages_dp/*.jpg')))[:NP]:
    img = cv2.imread(f); gt, lq = sequence(img); r = {'portrait': os.path.basename(f), 'entree': mesurer(gt, lq)}
    for nom in METH:
        a0 = APPELS[0]; t = time.time(); out = methode(lq, nom[0], int(nom[1:]) if len(nom) > 1 else K); r[nom] = mesurer(gt, out); r[nom]['appels'] = APPELS[0] - a0; r[nom]['s'] = round(time.time() - t, 1)
        if f.endswith(sorted(glob.glob(os.path.join(ICI, '../medias/visages_dp/*.jpg')))[0][-6:]):
            os.makedirs(os.path.join(ICI, '../sorties/f14'), exist_ok=True)
            for i in (0, NF // 2): cv2.imwrite(os.path.join(ICI, f'../sorties/f14/{nom}_{i:02d}.jpg'), np.hstack([lq[i], out[i], gt[i]]))
    res.append(r); print(json.dumps(r, ensure_ascii=False), flush=True)
moy = {k: {m: round(float(np.mean([r[k][m] for r in res])), 4) for m in res[0][k]} for k in ['entree'] + METH}
print('MOYENNE', json.dumps(moy, ensure_ascii=False), f'({len(res)} portraits × {NF} images, {round(time.time() - t0)} s)')
os.makedirs(os.path.join(ICI, '../sorties'), exist_ok=True); json.dump({'resultats': res, 'moyenne': moy, 'images': NF, 'K': K, 'force': FORCE}, open(os.path.join(ICI, '../sorties/banc_video.json'), 'w'), indent=1, ensure_ascii=False)
