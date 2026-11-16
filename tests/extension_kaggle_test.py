"""Tests de serveur-ia/extension_kaggle.py (« Zéro perte », reconstruction complète du décor) sans carte graphique :
le modèle est remplacé par une ébauche (RETOUCHE_FAUX_GENERATEUR=1). On vérifie tout le reste du circuit :
lecture des décors, fenêtres, raccord de couleur, seuls les trous sont rendus, aucun pixel réel n'est renvoyé, info.json lisible.
Lancer : python3 tests/extension_kaggle_test.py
"""
import base64, io, json, os, subprocess, sys, tempfile, unittest
import numpy as np
from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(ICI, "..", "serveur-ia", "extension_kaggle.py")


def decor(w=1820, h=1024, cx0=622, cx1=1198):
    """décor d'une vidéo verticale posée dans du 16:9 : réel au centre (dégradé + motif), trous à gauche et à droite"""
    yy, xx = np.mgrid[0:h, 0:w]
    rgb = np.stack([(xx * 0.1 + 60) % 256, (yy * 0.15 + 40) % 256, ((xx + yy) * 0.05 + 90) % 256], -1).astype(np.uint8)
    a = np.zeros((h, w), np.uint8); a[:, cx0:cx1] = 255
    rgba = np.dstack([rgb * (a[..., None] > 0), a])
    trou = np.zeros((h, w), np.uint8); trou[:, :cx0] = 255; trou[:, cx1:] = 255
    return rgba.astype(np.uint8), trou


def lancer(travaux, images):
    d = tempfile.mkdtemp(prefix="ext-"); ent, sor = os.path.join(d, "e"), os.path.join(d, "s"); os.makedirs(ent); os.makedirs(sor)
    for i, (rgba, trou) in images.items():
        Image.fromarray(rgba, "RGBA").save(os.path.join(ent, f"plaque_{i}.png")); Image.fromarray(trou, "L").save(os.path.join(ent, f"trou_{i}.png"))
    json.dump({"version": 1, "graine": 3, "travaux": travaux}, open(os.path.join(ent, "params.json"), "w"))
    env = dict(os.environ, RETOUCHE_ENTREE=ent, RETOUCHE_SORTIE=sor, RETOUCHE_FAUX_GENERATEUR="1")
    r = subprocess.run([sys.executable, SCRIPT], env=env, capture_output=True, text=True, timeout=300)
    return json.load(open(os.path.join(sor, "info.json"))), r


def lire(t):
    rgb = np.asarray(Image.open(io.BytesIO(base64.b64decode(t["jpeg"]))).convert("RGB"))
    a = np.asarray(Image.open(io.BytesIO(base64.b64decode(t["alpha"]))).convert("L"))
    return rgb, a


class T(unittest.TestCase):
    def test_deux_cotes_remplis_sans_toucher_au_reel(self):
        rgba, trou = decor()
        fen = [{"x": 0, "y": 0, "w": 1024, "h": 1024}, {"x": 796, "y": 0, "w": 1024, "h": 1024}]
        info, r = lancer([{"id": 0, "w": 1820, "h": 1024, "fenetres": fen, "echelle": 1}], {0: (rgba, trou)})
        self.assertTrue(info["ok"], r.stdout + r.stderr)
        t = info["travaux"][0]; rgb, a = lire(t)
        self.assertEqual((t["x"], t["y"], t["w"], t["h"]), (0, 0, 1820, 1024))
        self.assertEqual((a.shape[1], a.shape[0]), (t["w"], t["h"]))
        # tous les trous et seulement eux sont marqués inventés : rien du réel ne revient
        self.assertTrue((a[:, :622] > 127).all() and (a[:, 1198:] > 127).all())
        self.assertFalse((a[:, 622:1198] > 127).any())
        self.assertEqual(t["pixels"], int((trou > 0).sum()))
        # raccord : la colonne inventée collée au réel a la couleur du réel voisin (écart moyen faible)
        e = np.abs(rgb[:, 621].astype(int) - rgba[:, 622, :3].astype(int)).mean()
        self.assertLess(e, 12, e)

    def test_plusieurs_scenes_et_scene_sans_trou(self):
        rgba, trou = decor(910, 512, 311, 599)
        vide = np.zeros_like(trou)
        fen = [{"x": 0, "y": 0, "w": 512, "h": 512}, {"x": 398, "y": 0, "w": 512, "h": 512}]
        info, r = lancer([{"id": 0, "w": 910, "h": 512, "fenetres": fen}, {"id": 1, "w": 910, "h": 512, "fenetres": fen}],
                         {0: (rgba, trou), 1: (rgba, vide)})
        self.assertTrue(info["ok"], r.stdout + r.stderr)
        self.assertEqual([t["id"] for t in info["travaux"]], [0, 1])
        self.assertEqual(info["travaux"][1]["pixels"], 0)

    def test_tailles_incoherentes_refusees(self):
        rgba, trou = decor(400, 300, 100, 300)
        info, r = lancer([{"id": 0, "w": 401, "h": 300, "fenetres": []}], {0: (rgba, trou)})
        self.assertFalse(info["ok"]); self.assertTrue(info["erreurs"])


if __name__ == "__main__":
    unittest.main()
