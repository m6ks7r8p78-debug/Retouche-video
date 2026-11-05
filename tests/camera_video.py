"""Vidéo de test « vieil objectif » (caméra virtuelle, v6.0) : un travelling sur une image nette, chaque image passant par un objectif
simulé (flou σ, coins sombres vg, franges : rouge agrandi de sR, bleu de sB), puis compressée en H.264.
Usage : python3 tests/camera_video.py ref.png sortie.mp4 sigma vg sR sB"""
import sys, subprocess
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

src, out, sigma, vg, sR, sB = sys.argv[1], sys.argv[2], *map(float, sys.argv[3:7])
if src == "mire":
    # scène synthétique nette, sans franges ni flou propres : formes et traits de couleurs variées sur fond clair (graine fixe)
    from PIL import ImageDraw
    rng = np.random.default_rng(7)
    m = Image.new("RGB", (2880, 1620), (200, 196, 188)); dr = ImageDraw.Draw(m)
    for _ in range(260):
        x, y, w, h = rng.integers(0, 2880), rng.integers(0, 1620), rng.integers(20, 220), rng.integers(20, 220)
        col = tuple(int(c) for c in rng.integers(20, 235, 3))
        (dr.rectangle if rng.random() < .6 else dr.ellipse)([x, y, x + w, y + h], fill=col)
    for _ in range(80):
        x, y = rng.integers(0, 2880), rng.integers(0, 1620)
        dr.line([x, y, x + rng.integers(-300, 300), y + rng.integers(-300, 300)], fill=tuple(int(c) for c in rng.integers(0, 80, 3)), width=int(rng.integers(3, 9)))
    im = np.asarray(m, dtype=np.float64)
else:
    im = Image.open(src).convert("RGB")
    im = np.asarray(im.resize((im.width * 3, im.height * 3), Image.LANCZOS), dtype=np.float64)
W, H, N = 960, 540, 45
jj, ii = np.mgrid[0:H, 0:W].astype(np.float64)
cy, cx = (H - 1) / 2, (W - 1) / 2
r2 = (np.hypot(ii - cx, jj - cy) / (0.5 * np.hypot(W, H))) ** 2
ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", "30", "-i", "-",
                       "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
for k in range(N):
    x0 = int((im.shape[1] - W) * k / (N - 1)); y0 = (im.shape[0] - H) // 2
    fr = im[y0:y0 + H, x0:x0 + W]
    o = np.empty_like(fr)
    for c, s in ((0, sR), (1, 0.0), (2, sB)):
        ch = fr[:, :, c]
        if s:
            ch = map_coordinates(ch, [cy + (jj - cy) / (1 + s), cx + (ii - cx) / (1 + s)], order=3, mode="nearest")
        if sigma > 0:
            ch = gaussian_filter(ch, sigma)
        o[:, :, c] = ch
    o = o / (1 + vg * r2)[:, :, None]
    ff.stdin.write(np.clip(o, 0, 255).round().astype(np.uint8).tobytes())
ff.stdin.close(); ff.wait()
