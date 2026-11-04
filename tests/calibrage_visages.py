"""Calibrage de la protection des visages : quelle part de version classique mêler à l'IA sur un visage ?
Entrées : sorties du banc avec SANS_VISAGES=1 (…__iabrute_equilibre.png et …__sansia_equilibre.png).
Même masque que l'app (ovale 0,62 × 0,70 de la boîte, plein jusqu'à 60 %, fondu ensuite).
Mesures sur la zone du visage contre l'original intact : LPIPS (plus bas = plus proche) et PSNR.
python3 tests/calibrage_visages.py [medias] [sorties/calib]"""
import os, sys, glob
import numpy as np, onnxruntime as ort, torch, lpips
from PIL import Image
from skimage.metrics import peak_signal_noise_ratio as psnr
here = os.path.dirname(os.path.abspath(__file__))
med = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "medias")
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, "sorties", "calib")
L = lpips.LPIPS(net="alex", verbose=False)
def lp(a, b):
    t = lambda x: torch.from_numpy(x.astype(np.float32) / 127.5 - 1).permute(2, 0, 1)[None]
    with torch.no_grad(): return float(L(t(a), t(b)))
so = ort.SessionOptions(); so.log_severity_level = 3
S = ort.InferenceSession(os.path.join(here, "..", "visages.onnx"), so)
def face(im):
    x = (np.asarray(im.convert("RGB").resize((320, 240), Image.BILINEAR)).astype(np.float32) - 127) / 128
    sc, bx = S.run(None, {S.get_inputs()[0].name: x.transpose(2, 0, 1)[None]})
    k = int(np.argmax(sc[0, :, 1])); return bx[0, k], float(sc[0, k, 1])
def mask(W, H, b):
    x0, y0, x1, y1 = b[0] * W, b[1] * H, b[2] * W, b[3] * H; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) * .62, (y1 - y0) * .70
    yy, xx = np.mgrid[0:H, 0:W]; r = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    return np.clip((1 - r) / .4, 0, 1)[..., None], (int(max(0, cx - rx)), int(max(0, cy - ry)), int(min(W, cx + rx)), int(min(H, cy + ry)))
WS = [0, .15, .3, .45, .6, .75, 1]
res = {w: [] for w in WS}
for f in sorted(glob.glob(os.path.join(out, "*__iabrute_equilibre.png"))):
    base = os.path.basename(f).split("__")[0]
    ref = Image.open(os.path.join(med, "ref_" + base.split("_")[0] + ".png")).convert("RGB")
    ai = Image.open(f).convert("RGB"); cl = Image.open(f.replace("iabrute", "sansia")).convert("RGB")
    W, H = ai.size; b, s = face(Image.open(os.path.join(med, base + ".jpg"))); m, box = mask(W, H, b)
    r = np.asarray(ref.resize((W, H), Image.LANCZOS)).astype(np.float32); A = np.asarray(ai).astype(np.float32); C = np.asarray(cl).astype(np.float32)
    tiles = []
    print(f"\n{base} : visage trouvé (confiance {s:.3f}) ; zone {box}")
    for w in WS:
        o = A * (1 - m * w) + C * (m * w); crop = lambda x: x[box[1]:box[3], box[0]:box[2]].clip(0, 255).astype(np.uint8)
        l, p = lp(crop(r), crop(o)), psnr(crop(r), crop(o)); res[w].append(l)
        print(f"  part classique {w:4.2f} : LPIPS visage {l:.4f}   PSNR visage {p:.2f} dB")
        tiles.append(Image.fromarray(crop(o)))
    tiles.append(Image.fromarray(crop(r)))
    tw, th = tiles[0].size; sh = Image.new("RGB", (tw * len(tiles), th), "white")
    for i, t in enumerate(tiles): sh.paste(t, (i * tw, 0))
    sh.resize((sh.width * 2, sh.height * 2), Image.NEAREST).save(os.path.join(out, "visage_dosages_" + base + ".png"))
print("\nMoyenne LPIPS visage par dosage : " + "  ".join(f"{w:.2f}→{np.mean(v):.4f}" for w, v in res.items()))
