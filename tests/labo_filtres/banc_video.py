# F10 — banc d'essai : retirer les éléments d'un filtre AR EN VIDÉO (vérité terrain connue).
#   MIGAN=tests/medias/migan.onnx PYTHONPATH=tests/visage_ia/faux python3 tests/labo_filtres/banc_video.py [nb_images] [personnes] [filtres]
# Séquences (30 images/s) : portraits NASA du domaine public jamais vus par le détecteur (tests/medias/filtres_labo/*_vrai.jpg), animés
# par un mouvement lisse connu ; éléments de filtre SIMULÉS (chien, hasard) attachés au visage comme le fait un filtre AR, puis bruit et
# compression différents à chaque image. Ne vaut ni validation sur de vrais filtres Snapchat/Instagram ni validation sur iPhone.
# Méthodes :
#   A  l'outil photo appliqué à chaque image (détecteur → MI-GAN → GFPGAN dans la zone), sans mémoire d'une image à l'autre
#   VU comme V, mais la zone retirée est la même pour tout le tronçon (union des zones) : bords parfaitement stables
#   V  méthode vidéo : repères lissés ; tout se passe dans le repère de la tête (stable) ; carte du détecteur moyennée sur 5 images ;
#      UNE reconstruction par tronçon (MI-GAN + GFPGAN sur l'union des zones, première image), reportée sur chaque image en suivant
#      la tête, lumière raccordée à chaque image sur le pourtour de la zone
# Mesures : rappel / précision de la zone ; instabilité de la zone (1 − IoU entre deux images, mouvement compensé) ; écart à la vraie
# vidéo dans la zone ; scintillement dans la zone (variation image à image du résultat − celle de la vérité) ; LPIPS de la tête ; appels.
import cv2, numpy as np, onnxruntime as ort, sys, os, json, time
ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import noyau as N, ajouts as AJ
MED = os.path.join(ICI, '../medias/filtres_labo'); YU = os.path.join(ICI, '../../modeles/yunet.onnx')
NF = int(sys.argv[1]) if len(sys.argv) > 1 else 24
PERS = (sys.argv[2] if len(sys.argv) > 2 else 'p06,p08,p10').split(','); FILT = (sys.argv[3] if len(sys.argv) > 3 else 'chien,hasard').split(',')
W, H, HS, SEUIL, CH = int(os.environ.get('LARG', 480)), int(os.environ.get('HAUT', 640)), int(os.environ.get('HS', 384)), .6, 10 ** 6
DILAT = float(os.environ.get('DILAT', .06))   # élargissement de la zone (diamètre, en écarts des yeux) ; l'app : DFV.R.dilat
IO_CIBLE = float(os.environ.get('IO', 75))   # écart des yeux dans la vidéo de test (px) ; HS : côté du repère de la tête (l'app : 384 à 768 selon la taille de la tête)   # CH : longueur maximale d'une section (l'app n'en impose pas)
METH = (os.environ.get('METHODES') or 'A,V,VU').split(',')
det = ort.InferenceSession(os.path.join(ICI, '../../modeles/lourds/detecteur_ajouts_v3.onnx'), providers=['CPUExecutionProvider'])
mig = ort.InferenceSession(os.environ.get('MIGAN', os.path.join(ICI, '../medias/migan.onnx')), providers=['CPUExecutionProvider'])
gfp = ort.InferenceSession(os.path.join(ICI, '../../modeles/lourds/gfpgan14_int8w.onnx'), providers=['CPUExecutionProvider'])
T = np.array([[192.98138,239.94708],[318.90277,240.1936],[256.63416,314.01935],[201.26117,371.41043],[313.08905,371.15118]], np.float32)
CPT = {'migan': 0, 'gfpgan': 0}

def yunet(img):
    h, w = img.shape[:2]; d = cv2.FaceDetectorYN.create(YU, '', (w, h), 0.5, 0.3, 5000); _, f = d.detect(img)
    if f is None: return None
    f = f[np.argmax(f[:, 2] * f[:, 3])]; return f[4:14].reshape(5, 2).astype(np.float64)
def lisser(P):   # régression locale d'ordre 2 sur 7 images (même fonction que visages-video.js)
    P = np.array(P); out = P.copy(); n = len(P)
    for t in range(n):
        a, b = max(0, t - 3), min(n, t + 4); x = np.arange(a, b) - t
        if len(x) < 4: continue
        X = np.stack([np.ones_like(x), x, x * x], 1).astype(np.float64); out[t] = np.linalg.lstsq(X, P[a:b].reshape(len(x), -1), rcond=None)[0][0].reshape(P.shape[1:])
    return list(out)
def rep5(p): a, b = p[0], p[1]; io = np.linalg.norm(b - a); ux = (b - a) / io; uy = np.array([-ux[1], ux[0]]); return (a + b) / 2, ux, uy, io
def cadre(p, S):   # image → carré S×S autour de la tête (même cadrage que defiltre-visage.js)
    o, ux, uy, io = rep5(p); c = o + uy * io * .35; k = S / (io * 4.6)
    return np.array([[k * ux[0], k * ux[1], S / 2 - k * (c @ ux)], [k * uy[0], k * uy[1], S / 2 - k * (c @ uy)]])
def logits(img, p):
    x = cv2.warpAffine(img, cadre(p, 192), (192, 192), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_CONSTANT, borderValue=(128, 128, 128)).astype(np.float32).transpose(2, 0, 1)[None]
    return det.run(None, {'image': x})[0][0, 0]
def logits_M(img, M):   # même chose avec un cadrage HS déjà calculé (ramené à 192)
    Mq = M * (192 / HS); x = cv2.warpAffine(img, Mq, (192, 192), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_CONSTANT, borderValue=(128, 128, 128)).astype(np.float32).transpose(2, 0, 1)[None]
    return det.run(None, {'image': x})[0][0, 0]
IOH = HS / 4.6; yy, xx = np.mgrid[:HS, :HS].astype(np.float32); UU = (xx - HS / 2) / IOH; VV = (yy - (HS / 2 - .35 * IOH)) / IOH
PORTE = ((UU / 1.7) ** 2 + ((VV - .2) / 2.4) ** 2 < 1); OVALE = ((UU / 1.15) ** 2 + ((VV - .55) / 1.45) ** 2 < 1)
def masque_tete(lg):   # carte du détecteur (192) → zone à retirer dans le repère de la tête (HS), mêmes règles que l'outil photo
    p = 1 / (1 + np.exp(-cv2.resize(lg, (HS, HS), interpolation=cv2.INTER_LINEAR))); m = ((p > SEUIL) & PORTE).astype(np.uint8)
    n, l, st, _ = cv2.connectedComponentsWithStats(m, 8); m = np.isin(l, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] >= (.04 * IOH) ** 2]).astype(np.uint8)
    return cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(DILAT * IOH) | 1,) * 2)) if m.any() else m
def migan(img, m):
    ys, xs = np.nonzero(m)
    if not len(xs): return img
    CPT['migan'] += 1; h, w = img.shape[:2]; mg = max(96, int(round(max(xs.max() - xs.min() + 1, ys.max() - ys.min() + 1) * .5)))
    x0, y0, x1, y1 = max(0, xs.min() - mg), max(0, ys.min() - mg), min(w, xs.max() + 1 + mg), min(h, ys.max() + 1 + mg); cr = img[y0:y1, x0:x1]; mk = m[y0:y1, x0:x1] > 0
    r = mig.run(None, {'image': cv2.cvtColor(cr, cv2.COLOR_BGR2RGB).transpose(2, 0, 1)[None].copy(), 'mask': ((1 - mk) * 255).astype(np.uint8)[None, None]})[0][0]
    out = img.copy(); a = mk[..., None].astype(np.float32); out[y0:y1, x0:x1] = (cr * (1 - a) + cv2.cvtColor(r.transpose(1, 2, 0).astype(np.uint8), cv2.COLOR_RGB2BGR) * a).astype(np.uint8); return out
def gfpgan_zone(img, p, zone):   # comme RVIS.restaurerZone : visage aligné redessiné, gardé seulement dans la zone
    CPT['gfpgan'] += 1; M = cv2.estimateAffinePartial2D(p.astype(np.float32), T, method=cv2.LMEDS)[0]
    al = cv2.warpAffine(img, M, (512, 512), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    y = gfp.run(None, {'entree': (cv2.cvtColor(al, cv2.COLOR_BGR2RGB).astype(np.float32) / 127.5 - 1).transpose(2, 0, 1)[None]})[0][0].transpose(1, 2, 0)
    y = cv2.cvtColor(((np.clip(y, -1, 1) + 1) * 127.5).astype(np.float32), cv2.COLOR_RGB2BGR); y += al.reshape(-1, 3).mean(0) - y.reshape(-1, 3).mean(0)
    h, w = img.shape[:2]; Mi = cv2.invertAffineTransform(M); back = cv2.warpAffine(y, Mi, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    z = (zone * cv2.erode(cv2.warpAffine(np.ones((512, 512), np.float32), Mi, (w, h)), np.ones((5, 5))))[..., None]
    return np.clip(img * (1 - z) + back * z, 0, 255).astype(np.uint8)
def chaine(img, p, m, ovale):   # MI-GAN puis GFPGAN sur la partie de la zone posée sur le visage (même chaîne que l'outil photo)
    io = rep5(p)[3]; out = migan(img, m); mz = (m > 0) & ovale
    if mz.any(): out = gfpgan_zone(out, p, np.clip(cv2.GaussianBlur(cv2.dilate(mz.astype(np.float32), np.ones((int(.08 * io) | 1,) * 2)), (0, 0), .03 * io), 0, 1))
    return out
def ovale_image(p, shape):
    o, ux, uy, io = rep5(p); y, x = np.mgrid[:shape[0], :shape[1]].astype(np.float32); u = ((x - o[0]) * ux[0] + (y - o[1]) * ux[1]) / io; v = ((x - o[0]) * uy[0] + (y - o[1]) * uy[1]) / io
    return (u / 1.15) ** 2 + ((v - .55) / 1.45) ** 2 < 1

CROIT = float(os.environ.get('CROIT', .10))   # comme l'app depuis la v7.7 (0 = sans); CROIT_K = float(os.environ.get('CROIT_K', 3))
def croitre(m, tete_bgr):
    """La zone avance le long des contours forts qui la touchent (liseré sombre, ombre portée d'un élément), sans s'étendre sur la peau unie :
    à chaque tour, seuls les voisins dont le gradient dépasse le seuil sont ajoutés ; CROIT·écart-des-yeux tours au plus."""
    if not CROIT or not m.any(): return m
    g = cv2.GaussianBlur(cv2.cvtColor(tete_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), max(.6, .012 * IOH))
    gm = np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3) / 8, cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3) / 8); fort = (gm > max(2.5, CROIT_K * np.median(gm[PORTE]))) & PORTE
    m = m.copy(); k = np.ones((3, 3), np.uint8)
    for _ in range(int(round(CROIT * IOH))):
        c = (cv2.dilate(m, k) > 0) & (m == 0) & fort
        if not c.any(): break
        m[c] = 1
    return m
def methode_A(F, P):
    out, ms = [], []
    for f, p in zip(F, P):
        Mc = cadre(p, HS); m = cv2.warpAffine(masque_tete(logits(f, p)), cv2.invertAffineTransform(Mc), (W, H), flags=cv2.INTER_NEAREST)
        ms.append(m); out.append(chaine(f, p, m, ovale_image(p, f.shape)) if m.any() else f)
    return out, ms
def raccord(Ht, Fl, m):   # lumière : écart (image − reconstruction) mesuré hors zone, prolongé dans la zone (convolution normalisée, 3 échelles)
    connu = 1 - cv2.dilate(m, np.ones((7, 7), np.uint8)).astype(np.float32); D = (Ht.astype(np.float32) - Fl) * connu[..., None]; res = np.zeros_like(D); fait = np.zeros(m.shape, bool)
    for s in (.12 * IOH, .4 * IOH, 1.2 * IOH):
        den = cv2.GaussianBlur(connu, (0, 0), s); ok = (den > .05) & ~fait; res[ok] = (cv2.GaussianBlur(D, (0, 0), s) / np.maximum(den, 1e-3)[..., None])[ok]; fait |= ok
    return Fl + res
from recalage import recaler, composer
def methode_V(F, P, union=False):
    P = lisser(P); n = len(F); Ms = [cadre(p, HS) for p in P]
    if not os.environ.get('SANS_RECALAGE'):   # recalage fin de chaque image sur l'image de référence du tronçon (zone du visage)
        gris = lambda t: cv2.cvtColor(cv2.warpAffine(F[t], Ms[t], (HS, HS), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT), cv2.COLOR_BGR2GRAY).astype(np.float32)
        for c0 in range(0, n, CH):
            ts = list(range(c0, min(n, c0 + CH))); r = ts[0]; Rg = gris(r)
            for t in ts:
                if t == r: continue
                D = recaler(Rg, gris(t), OVALE.astype(np.float32))
                if D is not None: Ms[t] = composer(D, Ms[t])   # (l'app ouvre une nouvelle section quand le recalage est refusé)
    L = [logits_M(f, M) for f, M in zip(F, Ms)]
    Mk = [masque_tete(np.mean(L[max(0, t - 2):t + 3], 0)) for t in range(n)]; out, ms = [], []
    if CROIT: Mk = [croitre(Mk[t], cv2.warpAffine(F[t], Ms[t], (HS, HS), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)) for t in range(n)]
    for c0 in range(0, n, CH):
        ts = list(range(c0, min(n, c0 + CH))); U = np.max([Mk[t] for t in ts], 0); r = ts[0]; Fl = None
        if U.any():
            Hr = cv2.warpAffine(F[r], Ms[r], (HS, HS), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT); ph = P[r] @ Ms[r][:, :2].T + Ms[r][:, 2]
            Fl = chaine(Hr, ph, U, OVALE).astype(np.float32)
        for t in ts:
            Mi = cv2.invertAffineTransform(Ms[t]); m = U if union else Mk[t]; ms.append(cv2.warpAffine(m, Mi, (W, H), flags=cv2.INTER_NEAREST))
            if Fl is None or not m.any(): out.append(F[t]); continue
            Ht = cv2.warpAffine(F[t], Ms[t], (HS, HS), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            a = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.2); Fa = raccord(Ht, Fl, m)
            back = cv2.warpAffine(Fa, Mi, (W, H), flags=cv2.INTER_LINEAR); ab = cv2.warpAffine(a, Mi, (W, H), flags=cv2.INTER_LINEAR)[..., None]
            out.append(np.clip(F[t] * (1 - ab) + back * ab, 0, 255).astype(np.uint8))
    return out, ms

def sequence(pid, filtre):
    img = cv2.imread(os.path.join(MED, pid + '_vrai.jpg')); P0 = N.reperes(img); io0 = N.repere_visage(P0)[3]; c = P0[[468, 473]].mean(0); sc0 = IO_CIBLE / io0
    rng = np.random.default_rng(5); G, F, TM, A = [], [], [], []
    for t in range(NF):
        u = t / 120.; ang = 6 * np.sin(2 * np.pi * u); sc = sc0 * (1 + .08 * np.sin(np.pi * u)); dx = 30 * np.sin(2 * np.pi * u * .7) * W / 480; dy = 12 * np.cos(2 * np.pi * u) * W / 480
        M = cv2.getRotationMatrix2D((float(c[0]), float(c[1])), ang, sc); M[:, 2] += [W / 2 - c[0] + dx, H * .45 - c[1] + dy]; A.append(M)
        net = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REFLECT); Pt = P0 @ M[:, :2].T + M[:, 2]
        fi, mq = N.f_chien(net, Pt) if filtre == 'chien' else N.f_chat(net, Pt) if filtre == 'chat' else AJ.poser(net, Pt, np.random.default_rng(int(pid[1:])))
        br = rng.normal(0, 2.5, net.shape); q = int(rng.integers(50, 65))   # même bruit et même compression pour la vérité : seul le filtre diffère
        deg = lambda z: cv2.imdecode(cv2.imencode('.jpg', np.clip(z.astype(np.float32) + br, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, q])[1], 1)
        G.append(deg(net)); F.append(deg(fi)); TM.append((mq > .5).astype(np.uint8))
    return G, F, TM, A
def mesurer(G, F, TM, A, out, ms):
    import lpips, torch
    global _L; _L = globals().get('_L') or lpips.LPIPS(net='alex', verbose=False)
    n = len(G); st = lambda z, t, fl=cv2.INTER_LINEAR: cv2.warpAffine(z, (np.vstack([A[0], [0, 0, 1]]) @ np.linalg.inv(np.vstack([A[t], [0, 0, 1]])))[:2], (W, H), flags=fl)   # image t → repère de l'image 0
    Z = [cv2.dilate(m, np.ones((9, 9), np.uint8)) > 0 for m in TM]; rap, pre, ins, av, ap, sc, lp = [], [], [], [], [], [], []
    t2 = lambda z: torch.from_numpy(cv2.cvtColor(z, cv2.COLOR_BGR2RGB).transpose(2, 0, 1)[None].astype(np.float32) / 127.5 - 1)
    for t in range(n):
        m, v = ms[t] > 0, TM[t] > 0; rap.append((m & v).sum() / max(1, v.sum())); pre.append((m & v).sum() / max(1, m.sum()) if m.any() else 1.)
        av.append(np.abs(F[t].astype(np.float32) - G[t])[Z[t]].mean()); ap.append(np.abs(out[t].astype(np.float32) - G[t])[Z[t]].mean())
        Pt = yunet(G[t]); Mc = cadre(Pt, 256); cr = lambda z: cv2.warpAffine(z, Mc, (256, 256), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        with torch.no_grad(): lp.append(float(_L(t2(cr(out[t])), t2(cr(G[t])))))
        if t:
            a, b = st(ms[t].astype(np.uint8), t, cv2.INTER_NEAREST) > 0, st(ms[t - 1].astype(np.uint8), t - 1, cv2.INTER_NEAREST) > 0; ins.append(1 - (a & b).sum() / max(1, (a | b).sum()))
            z = st(Z[t].astype(np.uint8), t, cv2.INTER_NEAREST) > 0; d = (st(out[t], t).astype(np.float32) - st(out[t - 1], t - 1)) - (st(G[t], t).astype(np.float32) - st(G[t - 1], t - 1)); sc.append(np.abs(d)[z].mean())
    r = lambda v: round(float(np.mean(v)), 4)
    return {'rappel': r(rap), 'precision': r(pre), 'instabilite_zone': r(ins), 'ecart_avant': r(av), 'ecart_apres': r(ap), 'scintillement': r(sc), 'lpips_tete': r(lp)}

if __name__ == '__main__':
    res = []; SORT = os.path.join(ICI, '../sorties/f10'); os.makedirs(SORT, exist_ok=True)
    for pid in PERS:
        for fl in FILT:
            G, F, TM, A = sequence(pid, fl); P = [yunet(f) for f in F]
            for t in range(len(P)):
                if P[t] is None: P[t] = P[t - 1] if t else next(x for x in P if x is not None)
            if os.environ.get('ORACLE'):   # repères parfaits (borne : ce que donnerait un suivi sans erreur)
                P0 = N.reperes(cv2.imread(os.path.join(MED, pid + '_vrai.jpg')))[[468, 473, 1, 61, 291]]; P = [P0 @ M[:, :2].T + M[:, 2] for M in A]
            r = {'cas': pid + ' ' + fl, 'sans_rien': mesurer(G, F, TM, A, F, [np.zeros((H, W), np.uint8)] * NF)}
            for nom, fn in [(k, v) for k, v in (('A', methode_A), ('V', methode_V), ('VU', lambda F, P: methode_V(F, P, True))) if k in METH]:
                c0 = dict(CPT); t0 = time.time(); out, ms = fn(F, P); r[nom] = mesurer(G, F, TM, A, out, ms); r[nom].update(migan=CPT['migan'] - c0['migan'], gfpgan=CPT['gfpgan'] - c0['gfpgan'], s=round(time.time() - t0, 1))
                for i in (0, NF // 2, NF - 1): cv2.imwrite(os.path.join(SORT, f'{pid}_{fl}_{nom}_{i:02d}.jpg'), np.hstack([F[i], out[i], G[i]]))
            res.append(r); print(json.dumps(r, ensure_ascii=False), flush=True)
    moy = {k: {m: round(float(np.mean([r[k][m] for r in res])), 4) for m in res[0][k]} for k in ['sans_rien'] + METH}
    print('MOYENNE', json.dumps(moy, ensure_ascii=False)); json.dump({'resultats': res, 'moyenne': moy, 'images': NF}, open(os.path.join(SORT, 'banc_video.json'), 'w'), indent=1, ensure_ascii=False)
