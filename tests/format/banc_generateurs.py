"""Banc des générateurs d'extension (F32) : jusqu'à quelle profondeur un modèle peut-il prolonger une image de façon crédible ?
Vérité connue : une image large est recadrée, puis ré-étendue ; on compare la zone inventée à la vraie (LPIPS ↓, écart moyen ↓).
  python3 tests/format/banc_generateurs.py DOSSIER_Y4M MIGAN.onnx LAMA.onnx [sortie.json]
Profondeur = largeur inventée d'UN côté, en part de la hauteur de l'image. Référence basse : « ambiance » (prolongement flou)."""
import sys, json, time, glob, os, cv2, numpy as np, onnxruntime as ort, torch, lpips
SRC, MIG, LAM = sys.argv[1], sys.argv[2], sys.argv[3]; OUT = sys.argv[4] if len(sys.argv) > 4 else None
so = ort.SessionOptions(); so.intra_op_num_threads = 2
S = ort.InferenceSession(MIG, so, providers=['CPUExecutionProvider']); L = ort.InferenceSession(LAM, so, providers=['CPUExecutionProvider'])
LP = lpips.LPIPS(net='alex', verbose=False)
def y4m(path, k):
    f = open(path, 'rb'); hdr = f.readline().decode().split(); W = int([t for t in hdr if t[0] == 'W'][0][1:]); H = int([t for t in hdr if t[0] == 'H'][0][1:]); n = W * H * 3 // 2
    f.seek(k * (n + 6), 1); f.readline(); return cv2.cvtColor(np.frombuffer(f.read(n), np.uint8).reshape(H * 3 // 2, W), cv2.COLOR_YUV2BGR_I420)
def migan(img, hole):
    r = S.run(None, {'image': img[:, :, ::-1].transpose(2, 0, 1)[None].copy(), 'mask': np.where(hole, 0, 255).astype(np.uint8)[None, None]})[0][0]; return r.transpose(1, 2, 0)[:, :, ::-1].copy()
def proche(img, hole):   # chaque trou reçoit la couleur du pixel réel le plus proche (ce que fait le moteur avant d'appeler le modèle)
    d, lab = cv2.distanceTransformWithLabels(hole.astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL); ys, xs = np.where(~hole); tab = np.zeros((lab.max() + 1, 3), np.uint8); tab[lab[ys, xs]] = img[ys, xs]; o = img.copy(); o[hole] = tab[lab[hole]]; return o
def migan_pre(img, hole): return migan(cv2.GaussianBlur(proche(img, hole), (0, 0), 6) * hole[:, :, None] + img * (~hole[:, :, None]), hole)
def lama(img, hole):
    h, w = img.shape[:2]; x = cv2.resize(img, (512, 512), interpolation=cv2.INTER_AREA)[:, :, ::-1].transpose(2, 0, 1)[None].astype(np.float32) / 255
    m = cv2.resize(hole.astype(np.uint8), (512, 512), interpolation=cv2.INTER_NEAREST)[None, None].astype(np.float32); r = L.run(None, {'image': x, 'mask': m})[0][0].transpose(1, 2, 0)
    if r.max() <= 1.5: r = r * 255
    return cv2.resize(np.clip(r, 0, 255).astype(np.uint8)[:, :, ::-1], (w, h), interpolation=cv2.INTER_CUBIC)
def ambiance(img, hole):
    cols = np.where(~hole.all(0))[0]; src = img[:, cols[0]:cols[-1] + 1]; h, w = img.shape[:2]; k = w / src.shape[1]
    big = cv2.resize(src, (w, int(h * k))); y = (big.shape[0] - h) // 2; return cv2.GaussianBlur(big[y:y + h], (0, 0), h * .05)
def etendre(fn, src, Wc):   # chaque côté dans une fenêtre carrée collée au bord de la toile
    h, w = src.shape[:2]; x0 = (Wc - w) // 2; can = np.zeros((h, Wc, 3), np.uint8); can[:, x0:x0 + w] = src; hole = np.ones((h, Wc), bool); hole[:, x0:x0 + w] = False
    if fn is ambiance: o = fn(can, hole); can[hole] = o[hole]; return can
    for a, b in ((0, min(Wc, h)), (max(0, Wc - h), Wc)):
        o = fn(can[:, a:b].copy(), hole[:, a:b]); sub = can[:, a:b]; sub[hole[:, a:b]] = o[hole[:, a:b]]; hole[:, a:b] = False
    return can
def lp(a, b):
    t = lambda x: torch.from_numpy(x[:, :, ::-1].copy()).permute(2, 0, 1)[None].float() / 127.5 - 1
    with torch.no_grad(): return float(LP(t(a), t(b)))
H = 512; res = {}; noms = sorted(glob.glob(os.path.join(SRC, '*1080p*.y4m')))
for prof in (.1, .2, .3, .45):
    d = int(prof * H)
    for nom, fn in ((('migan_pre', migan_pre),) if os.environ.get('SEUL') else (('migan', migan), ('migan_pre', migan_pre), ('lama', lama), ('ambiance', ambiance))):
        v = []; e = []; t0 = time.time()
        for p in noms:
            nf = os.path.getsize(p) // (1920 * 1080 * 3 // 2 + 6)
            for k in (min(10, nf - 1), nf - 2):
                fr = cv2.resize(y4m(p, k), (910, H), interpolation=cv2.INTER_AREA); Wc = 2 * (910 // 2); w = Wc - 2 * d; x0 = d
                o = etendre(fn, fr[:, x0:x0 + w], Wc)
                for a, b in ((0, d), (Wc - d, Wc)):   # LPIPS sur une bande qui contient la zone inventée + autant d'image vraie (le raccord compte)
                    A, B = (a, min(Wc, 2 * d)) if a == 0 else (max(0, Wc - 2 * d), b); A, B = (A, max(B, A + 96)) if a == 0 else (min(A, B - 96), B)
                    v.append(lp(o[:, A:B], fr[:, A:B])); e.append(float(np.abs(o[:, a:b].astype(int) - fr[:, a:b]).mean()))
        res[f'{nom}@{prof}'] = dict(lpips=round(float(np.mean(v)), 4), ecart=round(float(np.mean(e)), 2), n=len(v), s_par_cote=round((time.time() - t0) / len(v), 2)); print(f'{nom}@{prof}', res[f'{nom}@{prof}'], flush=True)
if OUT: json.dump(res, open(OUT, 'w'), indent=1)
