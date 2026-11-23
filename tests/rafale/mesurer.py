"""Mesure Rafale contre la vérité : python3 tests/rafale/mesurer.py BANC SORTIE
Compare, sur les images ayant toutes leurs voisines (2..N-3), la fusion Rafale à l'agrandissement bicubique et Lanczos
de l'image seule : PSNR, SSIM, LPIPS (si installé) et scintillement (écart image à image comparé à celui de la vérité)."""
import sys, os, json, glob
import numpy as np
from PIL import Image
import cv2
from skimage.metrics import peak_signal_noise_ratio as psnr, structural_similarity as ssim
try:
    import lpips, torch
    LP = lpips.LPIPS(net="alex", verbose=False)
except Exception:
    LP = None

BANC, OUT = sys.argv[1], sys.argv[2]
B = 8  # bord exclu


def lp(a, b):
    if LP is None: return float("nan")
    t = lambda x: torch.from_numpy(x.astype(np.float32) / 127.5 - 1).permute(2, 0, 1)[None]
    with torch.no_grad(): return float(LP(t(a), t(b)))


def charge(f): return np.array(Image.open(f).convert("RGB"))


tot = {}
for sc in sorted(os.listdir(OUT)):
    d = os.path.join(BANC, sc); info = json.load(open(os.path.join(d, "info.json"))); n = info["n"]
    R = {"bicubique": [], "lanczos": [], "rafale": []}; seq = {k: [] for k in R}; gts = []
    for i in range(n):
        gt = charge(os.path.join(d, "gt_%02d.png" % i)); lr = charge(os.path.join(d, "lr_%02d.png" % i))
        H, W = gt.shape[:2]
        c = {"bicubique": cv2.resize(lr, (W, H), interpolation=cv2.INTER_CUBIC), "lanczos": cv2.resize(lr, (W, H), interpolation=cv2.INTER_LANCZOS4),
             "rafale": charge(os.path.join(OUT, sc, "sr_%02d.png" % i))[:H, :W]}
        gts.append(gt[B:-B, B:-B].astype(np.float32))
        for k, im in c.items():
            seq[k].append(im[B:-B, B:-B].astype(np.float32))
            if 2 <= i <= n - 3:
                g, x = gt[B:-B, B:-B], im[B:-B, B:-B]
                R[k].append((psnr(g, x, data_range=255), ssim(g, x, channel_axis=2, data_range=255), lp(g, x)))
    lig = []
    for k in R:
        a = np.array(R[k]).mean(0)
        # scintillement : erreur sur la différence temporelle (vérité vs méthode), plus bas = plus stable
        fl = np.mean([np.abs((seq[k][i + 1] - seq[k][i]) - (gts[i + 1] - gts[i])).mean() for i in range(2, n - 3)])
        tot.setdefault(k, []).append([*a, fl]); lig.append("%s %.2f dB / %.4f / %.4f / scint %.2f" % (k, a[0], a[1], a[2], fl))
    print("%-18s " % sc + " | ".join(lig))
print("-" * 60)
for k, v in tot.items():
    a = np.array(v).mean(0); print("MOYENNE %-10s PSNR %.2f dB  SSIM %.4f  LPIPS %.4f  scint %.2f" % (k, *a))
