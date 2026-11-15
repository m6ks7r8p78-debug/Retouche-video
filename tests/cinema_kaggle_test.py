"""Tests du moteur « Cinéma » (serveur-ia/cinema_kaggle.py) sans carte graphique ni Internet.

Le modèle SeedVR2 est remplacé par de petits programmes (RETOUCHE_SEEDVR2_CMD) :
  bon     : agrandissement Lanczos fidèle (doit être accepté, ordre des images exact, y compris à la jonction des 2 cartes)
  bruit   : images inventées sans rapport avec la vidéo (doit être refusé -> repli automatique sur l'IA standard)
  manque  : il manque des images (refus -> repli)
  couleur : couleurs déplacées (refus -> repli)
Lancer : python3 tests/cinema_kaggle_test.py
"""
import json, os, subprocess, sys, tempfile, textwrap, unittest
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(ICI, "..", "serveur-ia", "cinema_kaggle.py")

FAUX = textwrap.dedent('''
    import sys, os, cv2, numpy as np
    mode, entree, sortie, cible = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    cap = cv2.VideoCapture(entree); k = 0
    rng = np.random.default_rng(0)
    while True:
        ok, f = cap.read()
        if not ok: break
        h, w = f.shape[:2]; s = cible / min(h, w)
        r = cv2.resize(f, (round(w * s), round(h * s)), interpolation=cv2.INTER_LANCZOS4)
        if mode == "bruit": r = rng.integers(0, 255, r.shape, dtype=np.uint8)
        if mode == "couleur": r = np.clip(r.astype(int) + [0, 0, 40], 0, 255).astype(np.uint8)
        if mode == "manque" and k % 10 == 9: k += 1; continue
        if mode in ("scintille", "leger"):   # bruit différent à chaque image : ajoute du scintillement
            a = 14 if mode == "scintille" else 3.5
            r = np.clip(r.astype(np.float32) + rng.normal(0, a, r.shape), 0, 255).astype(np.uint8)
        if mode == "local":                  # une zone (1/16 de l'image) inventée, fixe (pas de scintillement), le reste fidèle
            r[: r.shape[0] // 4, : r.shape[1] // 4] = np.random.default_rng(1).integers(0, 255, (r.shape[0] // 4, r.shape[1] // 4, 3), dtype=np.uint8)
        cv2.imwrite(os.path.join(sortie, f"x_{k:06d}.png"), r); k += 1
''')

REPLI = textwrap.dedent('''
    import json, os, subprocess
    s = os.environ["RETOUCHE_SORTIE"]; p = json.load(open(os.path.join(os.environ["RETOUCHE_ENTREE"], "params.json")))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"color=gray:s={p['ow']}x{p['oh']}:r=30",
                    "-frames:v", str(p["images"]), "-c:v", "libx264", "-pix_fmt", "yuv420p", os.path.join(s, "ia.mp4")], check=True)
    json.dump({"ok": True, "images_lues": p["images"]}, open(os.path.join(s, "info.json"), "w"))
''')


def video(dossier, n=90, w=320, h=180):
    f = os.path.join(dossier, "video.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"testsrc2=s={w}x{h}:r=30",
                    "-frames:v", str(n), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-bf", "2", f], check=True)
    json.dump({"dw": w, "dh": h, "ow": 2 * w, "oh": 2 * h, "images": n, "dn": 0.3, "version": 1, "qp": 16},
              open(os.path.join(dossier, "params.json"), "w"))
    return f


def lancer(mode, nb_gpu="2"):
    d = tempfile.mkdtemp(prefix="cinema-")
    ent, sor, tmp = (os.path.join(d, x) for x in ("entree", "sortie", "tmp"))
    for x in (ent, sor): os.makedirs(x)
    video(ent)
    faux = os.path.join(d, "faux.py"); open(faux, "w").write(FAUX)
    repli = os.path.join(d, "repli.py"); open(repli, "w").write(REPLI)
    env = dict(os.environ, RETOUCHE_ENTREE=ent, RETOUCHE_SORTIE=sor, RETOUCHE_TMP=tmp, RETOUCHE_NB_GPU=nb_gpu,
               RETOUCHE_SEEDVR2_CMD=f"{sys.executable} {faux} {mode}", RETOUCHE_REPLI_CMD=f"{sys.executable} {repli}")
    r = subprocess.run([sys.executable, SCRIPT], env=env, capture_output=True, text=True, timeout=600)
    info = json.load(open(os.path.join(sor, "info.json"))) if os.path.exists(os.path.join(sor, "info.json")) else {}
    return r, info, ent, sor


def images(f):
    cap, out = cv2.VideoCapture(f), []
    while True:
        ok, x = cap.read()
        if not ok: return out
        out.append(x)


class Cinema(unittest.TestCase):
    def test_bon_accepte_ordre_exact(self):
        r, info, ent, sor = lancer("bon")
        self.assertEqual(r.returncode, 0, r.stdout[-3000:] + r.stderr[-3000:])
        self.assertEqual(info.get("moteur"), "seedvr2-3b")
        self.assertTrue(info.get("ok"))
        self.assertEqual(info["sortie"]["width"], 640); self.assertEqual(info["sortie"]["height"], 360)
        self.assertEqual(int(info["sortie"]["nb_read_frames"]), 90)
        self.assertGreater(info["controle"]["ssim_median"], 0.9)
        self.assertEqual(info["controle"]["force"], 1.0, info["controle"])
        src, out = images(os.path.join(ent, "video.mp4")), images(os.path.join(sor, "ia.mp4"))
        self.assertEqual(len(src), len(out))
        # chaque image de sortie doit ressembler le plus à l'image de même rang (pas de décalage, jonction comprise)
        for k in range(len(out)):
            o = cv2.resize(out[k], (320, 180), interpolation=cv2.INTER_AREA).astype(float)
            d = {j: np.abs(o - src[j]).mean() for j in range(max(0, k - 2), min(len(src), k + 3))}
            self.assertEqual(min(d, key=d.get), k, f"image {k} décalée : {d}")

    def test_une_carte(self):
        r, info, *_ = lancer("bon", nb_gpu="1")
        self.assertEqual(r.returncode, 0, r.stdout[-2000:]); self.assertEqual(info.get("moteur"), "seedvr2-3b")

    def test_bruit_refuse(self):
        r, info, *_ = lancer("bruit")
        self.assertEqual(r.returncode, 0, r.stdout[-2000:]); self.assertEqual(info.get("moteur"), "realesrgan-repli")
        self.assertIn("structure", info.get("repli", ""))

    def test_manque_refuse(self):
        r, info, *_ = lancer("manque")
        self.assertEqual(info.get("moteur"), "realesrgan-repli"); self.assertIn("images", info.get("repli", ""))

    def test_couleur_refusee(self):
        r, info, *_ = lancer("couleur")
        self.assertEqual(info.get("moteur"), "realesrgan-repli"); self.assertIn("couleur", info.get("repli", ""))

    def test_scintillement_refuse(self):
        r, info, *_ = lancer("scintille")
        self.assertEqual(info.get("moteur"), "realesrgan-repli", info.get("cinema"))
        self.assertIn("scintillement", info.get("repli", ""))

    def test_zone_inventee_refusee(self):
        r, info, *_ = lancer("local")
        self.assertEqual(info.get("moteur"), "realesrgan-repli", info.get("cinema"))
        self.assertIn("zones", info.get("repli", ""))

    def test_leger_attenue(self):
        r, info, ent, sor = lancer("leger")
        self.assertEqual(r.returncode, 0, r.stdout[-2000:])
        self.assertEqual(info.get("moteur"), "seedvr2-3b", info.get("repli"))
        self.assertEqual(info["controle"]["force"], 0.7, info["controle"])
        self.assertEqual(int(info["sortie"]["nb_read_frames"]), 90)


if __name__ == "__main__":
    unittest.main(verbosity=2)
