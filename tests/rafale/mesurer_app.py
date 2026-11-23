"""Mesure des exports de l'app contre la vérité (images ramenées à la taille de la vérité) : PSNR, LPIPS, scintillement.
python3 tests/rafale/mesurer_app.py SCENE SORTIE"""
import sys, os, json, subprocess
import numpy as np, cv2
from PIL import Image
from skimage.metrics import peak_signal_noise_ratio as psnr
import lpips, torch
LP = lpips.LPIPS(net="alex", verbose=False)
SC, OUT = sys.argv[1], sys.argv[2]; n = json.load(open(os.path.join(SC, "info.json")))["n"]; B = 8
t = lambda x: torch.from_numpy(x.astype(np.float32) / 127.5 - 1).permute(2, 0, 1)[None]
gts = [np.array(Image.open(os.path.join(SC, "gt_%02d.png" % i)).convert("RGB")).astype(np.float32) for i in range(n)]
H, W = gts[0].shape[:2]
for nom in ("sans", "rafale"):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(OUT, nom + ".mp4"), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    w, h = map(int, subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", os.path.join(OUT, nom + ".mp4")], capture_output=True, text=True).stdout.strip().split(","))
    fr = np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)
    ims = [cv2.resize(f.astype(np.float32), (W, H), interpolation=cv2.INTER_AREA) for f in fr[:n]]
    m = []
    for i in range(2, n - 2):
        g, x = gts[i][B:-B, B:-B], ims[i][B:-B, B:-B]
        with torch.no_grad(): m.append((psnr(g, x, data_range=255), float(LP(t(g), t(x)))))
    fl = np.mean([np.abs((ims[i + 1] - ims[i]) - (gts[i + 1] - gts[i]))[B:-B, B:-B].mean() for i in range(2, n - 3)])
    a = np.mean(m, 0); print("%-7s PSNR %.2f dB  LPIPS %.4f  scintillement %.2f" % (nom, a[0], a[1], fl))
