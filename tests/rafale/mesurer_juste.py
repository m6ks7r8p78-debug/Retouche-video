"""Comparaison équitable (v12.0) : chaque méthode reçoit SON meilleur réglage de débruitage (NL-means, force 0 à 9) et de netteté
(masque flou 0 à 1,2), choisi sur la moyenne des scènes ; on compare donc « une image + meilleur traitement » à
« Rafale + meilleur traitement », comme le fait l'app (réglages automatiques calculés pour chaque vidéo).
python3 tests/rafale/mesurer_juste.py BANC SORTIE"""
import sys, os, json
import numpy as np, cv2
from PIL import Image
from skimage.metrics import peak_signal_noise_ratio as psnr
import lpips, torch
LP = lpips.LPIPS(net="alex", verbose=False)
BANC, OUT = sys.argv[1], sys.argv[2]; B = 8
t = lambda x: torch.from_numpy(np.clip(x, 0, 255).astype(np.float32) / 127.5 - 1).permute(2, 0, 1)[None]
L = lambda f: np.array(Image.open(f).convert("RGB")).astype(np.float32)
def nlm(x, h): return x if h == 0 else cv2.fastNlMeansDenoisingColored(np.clip(x, 0, 255).round().astype(np.uint8), None, h, h, 5, 15).astype(np.float32)
RES = {}; FL = {}
for sc in sorted(os.listdir(OUT)):
    d = os.path.join(BANC, sc); n = json.load(open(os.path.join(d, "info.json")))["n"]
    for i in range(2, n - 2):
        gt = L(os.path.join(d, "gt_%02d.png" % i)); H, W = gt.shape[:2]; lr = L(os.path.join(d, "lr_%02d.png" % i)); sr = L(os.path.join(OUT, sc, "sr_%02d.png" % i))[:H, :W]
        g = gt[B:-B, B:-B]
        for h in (0, 3, 5, 7, 9):
            for nm, im in (("une image", cv2.resize(nlm(lr, h), (W, H), interpolation=cv2.INTER_CUBIC)), ("rafale", nlm(sr, h))):
                for a in (0, .6, 1.2):
                    U = np.clip(im + a * (im - cv2.GaussianBlur(im, (0, 0), 1.2)), 0, 255)
                    with torch.no_grad(): RES.setdefault((nm, h, a), {}).setdefault(sc, []).append((psnr(g, U[B:-B, B:-B], data_range=255), float(LP(t(g), t(U[B:-B, B:-B])))))
for nm in ("une image", "rafale"):
    cand = [(np.mean([np.mean(v, 0)[1] for v in RES[k].values()]), k) for k in RES if k[0] == nm]
    best = min(cand)[1]
    par = {sc: np.mean(v, 0) for sc, v in RES[best].items()}
    m = np.mean(list(par.values()), 0)
    print("%-10s meilleur réglage %s : PSNR %.2f dB  LPIPS %.4f   " % (nm, best[1:], m[0], m[1]) + "  ".join("%s %.3f" % (k, v[1]) for k, v in par.items()))
