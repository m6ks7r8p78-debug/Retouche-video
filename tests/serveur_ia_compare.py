"""Compare l'IA serveur (Kaggle) à l'IA de l'app (références calculées dans Chrome) — pixel par pixel.
python3 tests/serveur_ia_compare.py <dossier références> <dossier sorties Kaggle>
Pour chaque cas : taille identique ?, écart max (sur 255), écart moyen, part de pixels différents, PSNR (dB)."""
import sys, os, glob, json
import numpy as np
from PIL import Image

ref, srv = sys.argv[1], sys.argv[2]
out = []
for r in sorted(glob.glob(os.path.join(ref, "*.png"))):
    b = os.path.basename(r)[:-4]
    A = np.asarray(Image.open(r).convert("RGB")).astype(np.int16)
    for mode in ("f16", "f32"):
        p = os.path.join(srv, b + "_" + mode + ".png")
        if not os.path.exists(p):
            out.append({"cas": b, "mode": mode, "erreur": "absent"}); continue
        B = np.asarray(Image.open(p).convert("RGB")).astype(np.int16)
        if A.shape != B.shape:
            out.append({"cas": b, "mode": mode, "erreur": "taille %s contre %s" % (A.shape, B.shape)}); continue
        d = np.abs(A - B); mse = (d.astype(np.float64) ** 2).mean()
        out.append({"cas": b, "mode": mode, "taille": "%dx%d" % (A.shape[1], A.shape[0]), "ecart_max": int(d.max()),
                    "ecart_moyen": round(float(d.mean()), 4), "pixels_differents_pct": round(100 * float((d.max(-1) > 0).mean()), 2),
                    "ecart_sup_2_pct": round(100 * float((d.max(-1) > 2).mean()), 3),
                    "psnr_db": round(10 * np.log10(255 ** 2 / mse), 2) if mse > 0 else "identique"})
for o in out: print(json.dumps(o, ensure_ascii=False))
