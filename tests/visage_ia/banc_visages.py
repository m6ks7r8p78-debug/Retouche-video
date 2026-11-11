# Banc d’essai de la restauration de visage (vérité terrain connue).
#   PYTHONPATH=tests/visage_ia/faux python3 tests/visage_ia/banc_visages.py int8w          → modèle livré, portraits de tests/medias/visages_dp
#   PYTHONPATH=tests/visage_ia/faux python3 tests/visage_ia/banc_visages.py --js           → note les visages produits PAR L’APP (tests/rvis.test.mjs)
#   (fp32 : MODELES=dossier contenant gfpgan14_fp32.onnx ; PORTRAITS=autre dossier de portraits)
# Banc d'essai restauration de visage : vrais portraits du domaine public dégradés de façon contrôlée (vérité terrain connue)
import cv2, numpy as np, onnxruntime as ort, glob, json, lpips, torch, sys
from skimage.metrics import structural_similarity as ssim, peak_signal_noise_ratio as psnr
import os; ICI = os.path.dirname(os.path.abspath(__file__)); YU = os.path.join(ICI, '../../modeles/yunet.onnx'); MOD = os.environ.get('MODELES', os.path.join(ICI, '../../modeles/lourds'))
T = np.array([[192.98138,239.94708],[318.90277,240.1936],[256.63416,314.01935],[201.26117,371.41043],[313.08905,371.15118]],np.float32)
def detecter(img):
    h, w = img.shape[:2]; d = cv2.FaceDetectorYN.create(YU, '', (w, h), 0.6, 0.3, 5000); _, f = d.detect(img)
    if f is None: return None
    f = f[np.argmax(f[:, 2] * f[:, 3])]; return f[4:14].reshape(5, 2)
def aligner(img, pts):
    M, _ = cv2.estimateAffinePartial2D(pts, T, method=cv2.LMEDS); return cv2.warpAffine(img, M, (512, 512), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT), M
rng = np.random.default_rng(7)
def degrader(f, k):
    s, flou, bruit, q = {'petit64': (64, 0, 0, 0), 'petit96_jpeg35': (96, 0, 0, 35), 'moyen128_flou_bruit_jpeg50': (128, 1.5, 5, 50), 'vieuxtel160_jpeg25': (160, 1.0, 3, 25)}[k]
    g = cv2.GaussianBlur(f, (0, 0), flou) if flou else f
    g = cv2.resize(g, (s, s), interpolation=cv2.INTER_AREA).astype(np.float32)
    if bruit: g = g + rng.normal(0, bruit, g.shape)
    g = np.clip(g, 0, 255).astype(np.uint8)
    if q: g = cv2.imdecode(cv2.imencode('.jpg', g, [cv2.IMWRITE_JPEG_QUALITY, q])[1], 1)
    return cv2.resize(g, (512, 512), interpolation=cv2.INTER_CUBIC)
sess = {} if sys.argv[1] == '--js' else {n: ort.InferenceSession(f'{MOD}/gfpgan14_{n}.onnx', providers=['CPUExecutionProvider']) for n in sys.argv[1].split(',')}
def restaurer(n, bgr):
    x = (cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 127.5 - 1).transpose(2, 0, 1)[None]
    y = sess[n].run(None, {'entree': x})[0][0].transpose(1, 2, 0)
    return cv2.cvtColor(((np.clip(y, -1, 1) + 1) * 127.5).round().astype(np.uint8), cv2.COLOR_RGB2BGR)
L = lpips.LPIPS(net='alex', verbose=False)
def lp(a, b):
    t = lambda z: torch.from_numpy(cv2.cvtColor(z, cv2.COLOR_BGR2RGB).transpose(2, 0, 1)[None].astype(np.float32) / 127.5 - 1)
    with torch.no_grad(): return float(L(t(a), t(b)))
def repere(a, ref):
    p = detecter(a)
    if p is None: return None
    return float(np.linalg.norm(p - ref, axis=1).mean() / np.linalg.norm(ref[0] - ref[1]))
def inventee(sortie, entree):
    hp = lambda z: cv2.cvtColor(z, cv2.COLOR_BGR2GRAY).astype(np.float32) - cv2.GaussianBlur(cv2.cvtColor(z, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 2)
    return float((cv2.GaussianBlur(np.abs(hp(sortie) - hp(entree)), (0, 0), 3) > 6).mean())
if sys.argv[1] == '--js':   # visages produits par l'app dans Chromium (tests/rvis.test.mjs), alignés comme la vérité terrain
    D = os.path.join(ICI, '../sorties/rvis'); agg = {}
    for g in sorted(glob.glob(D + '/*_gt.png')):
        gt = cv2.imread(g); pg = detecter(gt)
        for c in ['lq', 'out', 'out8']:
            z = cv2.imread(g.replace('_gt', '_' + c)); m = agg.setdefault(c, {'psnr': [], 'ssim': [], 'lpips': [], 'reperes': []})
            m['psnr'].append(psnr(gt, z)); m['ssim'].append(ssim(gt, z, channel_axis=2)); m['lpips'].append(lp(gt, z)); e = repere(z, pg) if pg is not None else None
            if e is not None: m['reperes'].append(e)
    for c, m in agg.items(): print({'lq': 'entrée dégradée', 'out': 'app, force 100 %', 'out8': 'app, force 80 %'}[c].ljust(18), ' '.join(f"{k}={np.mean(v):.4f}" for k, v in m.items()), 'n=%d' % len(m['psnr']))
    sys.exit()
res = []
for f in sorted(glob.glob(os.environ.get('PORTRAITS', os.path.join(ICI, '../medias/visages_dp')) + '/*.jpg')):
    img = cv2.imread(f); p = detecter(img)
    if p is None: res.append({'f': f, 'erreur': 'aucun visage'}); continue
    gt, _ = aligner(img, p); pg = detecter(gt)
    if pg is None: continue
    for k in ['petit64', 'petit96_jpeg35', 'moyen128_flou_bruit_jpeg50', 'vieuxtel160_jpeg25']:
        lq = degrader(gt, k); r = {'f': f, 'deg': k}
        cands = {'entree_bicubique': lq}
        for n in sess: cands[n] = restaurer(n, lq)
        n0 = list(sess)[0]; cands[n0 + '_melange50'] = cv2.addWeighted(cands[n0], .5, lq, .5, 0)
        for c, z in cands.items():
            r[c] = {'psnr': round(psnr(gt, z), 2), 'ssim': round(ssim(gt, z, channel_axis=2), 4), 'lpips': round(lp(gt, z), 4), 'reperes': repere(z, pg), 'inventee': round(inventee(z, lq), 3)}
        res.append(r)
json.dump(res, open(os.path.join(ICI, '../sorties/banc_visages.json'), 'w'), indent=1)
import collections
agg = collections.defaultdict(lambda: collections.defaultdict(list))
for r in res:
    if 'deg' not in r: continue
    for c, m in r.items():
        if isinstance(m, dict):
            for k, v in m.items():
                if v is not None: agg[(r['deg'], c)][k].append(v)
            agg[(r['deg'], c)]['echec_reperes'].append(1 if m['reperes'] is None else 0)
for (d, c), m in sorted(agg.items()):
    print(f"{d:28s} {c:22s} " + ' '.join(f"{k}={np.mean(v):.4f}" for k, v in m.items()), f"n={len(m['psnr'])}")
print('erreurs', [r for r in res if 'erreur' in r])
