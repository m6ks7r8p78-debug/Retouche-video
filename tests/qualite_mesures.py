"""Mesures de fidélité (PSNR, SSIM, LPIPS si installé) des sorties du banc (tests/qualite.test.mjs) par rapport aux originaux intacts.
PSNR et SSIM (plus haut = plus proche de l'original). Ce sont des indications : elles ne remplacent pas l'œil
(une image lissée peut avoir un bon PSNR et paraître artificielle). Une planche de comparaison est créée pour l'inspection visuelle.
python3 tests/qualite_mesures.py [medias] [sorties/qualite]"""
import os, sys, glob, json
import numpy as np
from PIL import Image
from skimage.metrics import peak_signal_noise_ratio as psnr, structural_similarity as ssim
try:
    import torch, lpips
    _L = lpips.LPIPS(net="alex", verbose=False)
    def lp(a, b):
        t = lambda x: torch.from_numpy(x.astype(np.float32) / 127.5 - 1).permute(2, 0, 1)[None]
        with torch.no_grad(): return float(_L(t(a), t(b)))
except Exception:
    lp = lambda a, b: float("nan")

here = os.path.dirname(os.path.abspath(__file__))
med = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "medias")
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, "sorties", "qualite")
rows, sheets = [], {}
for f in sorted(glob.glob(os.path.join(out, "*__*.png"))):
    base, var = os.path.basename(f)[:-4].split("__")
    ref = Image.open(os.path.join(med, "ref_" + base.split("_")[0] + ".png")).convert("RGB")
    im = Image.open(f).convert("RGB").resize(ref.size, Image.LANCZOS)
    a, b = np.asarray(ref), np.asarray(im)
    rows.append((base, var, psnr(a, b), ssim(a, b, channel_axis=2), lp(a, b)))
    sheets.setdefault(base, []).append((var, im))
for base in sheets:   # agrandissement simple (bicubique) : la référence « sans traitement »
    ref = Image.open(os.path.join(med, "ref_" + base.split("_")[0] + ".png")).convert("RGB")
    im = Image.open(os.path.join(med, base + ".jpg")).convert("RGB").resize(ref.size, Image.BICUBIC)
    a, b = np.asarray(ref), np.asarray(im)
    rows.append((base, "agrandissement_simple", psnr(a, b), ssim(a, b, channel_axis=2), lp(a, b)))
    sheets[base].insert(0, ("agrandissement_simple", im)); sheets[base].insert(0, ("original_intact", ref))
print(f"{'image':18} {'variante':24} {'PSNR dB':>8} {'SSIM':>6} {'LPIPS':>6}")
for r in sorted(rows):
    print(f"{r[0]:18} {r[1]:24} {r[2]:8.2f} {r[3]:6.3f} {r[4]:6.3f}")
json.dump([dict(image=r[0], variante=r[1], psnr=round(r[2], 2), ssim=round(r[3], 4), lpips=round(r[4], 4)) for r in rows], open(os.path.join(out, "mesures.json"), "w"), indent=1, ensure_ascii=False)
# planche : même zone agrandie ×2 pour chaque variante (inspection visuelle)
for base, ims in sheets.items():
    w, h = ims[0][1].size; cw, ch = min(200, w // 2), min(200, h // 2); x0, y0 = (w - cw) // 2, int(h * .25)
    tiles = [im.crop((x0, y0, x0 + cw, y0 + ch)).resize((cw * 2, ch * 2), Image.NEAREST) for _, im in ims]
    sheet = Image.new("RGB", (cw * 2 * len(tiles), ch * 2), "white")
    for i, t in enumerate(tiles): sheet.paste(t, (i * cw * 2, 0))
    sheet.save(os.path.join(out, "planche_" + base + ".png"))
    print("planche", base, "→", " | ".join(v for v, _ in ims))
