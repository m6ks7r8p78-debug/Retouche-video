"""Simulateur d'appareils (caméra virtuelle, v6.0) : applique à une image nette les défauts connus d'un objectif
(flou gaussien σ, coins sombres vg, franges colorées : rouge et bleu agrandis de sR / sB) puis l'enregistre en RGBA brut.
Sert aux tests de camera.js : les mesures doivent retrouver les valeurs simulées.
Usage : python3 tests/camera_simuler.py image.png sortie.rgba sigma vg sR sB  → écrit aussi sortie.rgba.json (largeur, hauteur)."""
import sys, json
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

src, out, sigma, vg, sR, sB = sys.argv[1], sys.argv[2], *map(float, sys.argv[3:7])
im = np.asarray(Image.open(src).convert("RGB"), dtype=np.float64)
# agrandie ×2 pour avoir des contours nets avant de simuler l'objectif
im = np.asarray(Image.fromarray(im.astype(np.uint8)).resize((im.shape[1] * 2, im.shape[0] * 2), Image.LANCZOS), dtype=np.float64)
H, W, _ = im.shape
cy, cx = (H - 1) / 2, (W - 1) / 2
jj, ii = np.mgrid[0:H, 0:W].astype(np.float64)
R = 0.5 * np.hypot(W, H)
r = np.hypot(ii - cx, jj - cy) / R
out_img = np.empty_like(im)
for c, s in ((0, sR), (1, 0.0), (2, sB)):
    ch = im[:, :, c]
    if s:  # le canal est agrandi de (1+s) : le point p du vert se trouve en p·(1+s) dans ce canal → on échantillonne en p/(1+s)
        ch = map_coordinates(ch, [cy + (jj - cy) / (1 + s), cx + (ii - cx) / (1 + s)], order=3, mode="nearest")
    if sigma > 0:
        ch = gaussian_filter(ch, sigma)
    out_img[:, :, c] = ch
out_img = out_img / (1 + vg * r * r)[:, :, None]
rgba = np.concatenate([np.clip(out_img, 0, 255).round().astype(np.uint8), np.full((H, W, 1), 255, np.uint8)], axis=2)
open(out, "wb").write(rgba.tobytes())
# version réduite à 480 px de large, comme l'app la prépare pour les coins sombres et les franges
small = Image.fromarray(rgba).resize((480, round(480 * H / W)), Image.BILINEAR)
open(out + ".480", "wb").write(np.asarray(small).tobytes())
json.dump({"W": W, "H": H, "w": small.size[0], "h": small.size[1]}, open(out + ".json", "w"))
