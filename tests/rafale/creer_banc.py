"""Banc Rafale — crée des vidéos « vieux téléphone » dont on connaît la vérité.
Pour chaque image nette (vérité, définition H) : trajectoire de main tremblante (translation sous-pixel + légère rotation),
optionnellement un objet qui bouge seul (test de robustesse), puis optique molle, réduction ×2, bruit de capteur et
compression H.264 forte (débit de vieux téléphone). On garde la vérité de chaque image et les images décodées.
python3 tests/rafale/creer_banc.py SORTIE   → SORTIE/<scène>/{gt_XX.png, lr_XX.png, info.json}"""
import sys, os, json, subprocess, glob
import numpy as np
from PIL import Image
import cv2
from skimage import data

ICI = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/rafale_banc"
N = 11
rng = np.random.default_rng(7)


def sources():
    s = {}
    for f in sorted(glob.glob(os.path.join(ICI, "..", "medias", "ref_*.png"))):
        s[os.path.basename(f)[4:-4]] = np.array(Image.open(f).convert("RGB"))
    s["astronaute"] = data.astronaut()
    s["cafe2"] = data.coffee()
    return s


def trajectoire(n, amp):
    """marche aléatoire lissée (main qui tremble) : dx, dy en pixels de la vérité, angle en degrés"""
    v = rng.normal(0, 1, (n + 6, 3)).cumsum(0)
    k = np.ones(5) / 5
    v = np.stack([np.convolve(v[:, i], k, "valid") for i in range(3)], 1)[:n]
    v -= v[n // 2]
    v[:, :2] *= amp / max(1e-6, np.abs(v[:, :2]).max())
    v[:, 2] *= .35 / max(1e-6, np.abs(v[:, 2]).max())
    return v


def creer(nom, img, mobile, crf, bruit):
    h, w = img.shape[:2]
    m = 24  # marge retirée (bords inventés par la déformation)
    H2, W2 = (h - 2 * m) // 4 * 4, (w - 2 * m) // 4 * 4
    d = os.path.join(OUT, nom + ("_mobile" if mobile else ""))
    os.makedirs(d, exist_ok=True)
    tr = trajectoire(N, 3.2)
    lr_frames = []; mats = []
    for i in range(N):
        dx, dy, a = tr[i]
        M = cv2.getRotationMatrix2D((w / 2, h / 2), a, 1.0)
        M[:, 2] += (dx, dy)
        mats.append(M.tolist())
        g = cv2.warpAffine(img.astype(np.float32), M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
        if mobile:  # carré texturé qui traverse l'image indépendamment de la caméra
            sz = h // 4
            x0 = int(w * .15 + (w * .6) * i / (N - 1)); y0 = int(h * .55)
            patch = cv2.resize(img[:sz, :sz].astype(np.float32)[:, ::-1], (sz, sz))
            g[y0:y0 + sz, x0:x0 + sz] = patch
        g = g[m:m + H2, m:m + W2]
        gt = np.clip(g, 0, 255)
        Image.fromarray(gt.round().astype(np.uint8)).save(os.path.join(d, "gt_%02d.png" % i))
        lo = cv2.GaussianBlur(gt, (0, 0), .55)  # optique molle du vieux téléphone
        lo = cv2.resize(lo, (W2 // 2, H2 // 2), interpolation=cv2.INTER_AREA)
        lo = lo + rng.normal(0, bruit, lo.shape)
        lr_frames.append(np.clip(lo, 0, 255).round().astype(np.uint8))
    raw = os.path.join(d, "raw.yuv")
    np.concatenate([f[None] for f in lr_frames]).tofile(raw)
    mp4 = os.path.join(d, "lr.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (W2 // 2, H2 // 2), "-r", "30", "-i", raw,
                    "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p", "-g", "30", mp4], check=True)
    os.remove(raw)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp4, os.path.join(d, "lr_%02d.png")], check=True)
    # ffmpeg numérote à partir de 1
    for i in range(N):
        os.replace(os.path.join(d, "lr_%02d.png" % (i + 1)), os.path.join(d, "tmp_%02d.png" % i))
    for i in range(N):
        os.replace(os.path.join(d, "tmp_%02d.png" % i), os.path.join(d, "lr_%02d.png" % i))
    json.dump({"n": N, "w": W2 // 2, "h": H2 // 2, "crf": crf, "bruit": bruit, "mobile": mobile, "marge": m, "M": mats}, open(os.path.join(d, "info.json"), "w"))
    return d


if __name__ == "__main__":
    S = sources()
    for nom, img in S.items():
        creer(nom, img, False, 28, 2.5)
    creer("cafe", S["cafe"], True, 28, 2.5)
    creer("astronaute", S["astronaute"], True, 28, 2.5)
    print("banc créé dans", OUT)
