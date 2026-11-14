"""Tests du catalogueur privé (outils/catalogue_medias.py) sur des médias SYNTHÉTIQUES générés par ffmpeg.
Aucun média personnel. Lancer : python3 -m unittest tests/catalogue_medias_test.py -v"""
import json, os, shutil, subprocess, sys, tempfile, unittest

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, "..", "outils"))
import catalogue_medias as C  # noqa: E402


def lire(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def ecrire(p, d):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(d, f)


def ff(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "ffmpeg requis")
class TestCatalogue(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="cat_")
        cls.lib = os.path.join(cls.tmp, "bibliotheque")
        os.makedirs(os.path.join(cls.lib, "sous"))
        L = cls.lib
        ff("-f", "lavfi", "-i", "testsrc2=s=320x240:r=25:d=3", "-f", "lavfi", "-i", "sine=f=440:d=3",
           "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", f"{L}/a.mp4")
        shutil.copy(f"{L}/a.mp4", f"{L}/sous/a_copie.mp4")
        ff("-i", f"{L}/a.mp4", "-vf", "scale=160:120", "-c:v", "libx264", "-crf", "40", "-an", f"{L}/a_reencode.mp4")
        ff("-f", "lavfi", "-i", "mandelbrot=s=320x240:r=25", "-t", "3", "-c:v", "libx264", "-crf", "18",
           "-pix_fmt", "yuv420p", f"{L}/b.mp4")
        ff("-i", f"{L}/b.mp4", "-vf", "noise=alls=45:allf=t", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p",
           f"{L}/b_bruit.mp4")
        ff("-f", "lavfi", "-i", "smptehdbars=s=640x360", "-frames:v", "1", f"{L}/image.png")
        with open(f"{L}/notes.txt", "w") as f:
            f.write("ignoré")
        cls.chatgpt = os.path.join(cls.tmp, "chatgpt.csv")
        with open(cls.chatgpt, "w") as f:
            f.write("id,fichier,filtre_suppose\nV001,a.mp4,aucun\nV002,b_bruit.mp4,bruit\nV099,absent.mp4,beaute\n")
        cls.sortie = os.path.join(cls.tmp, "prive", "catalogue.json")
        args = C.main(["analyser", cls.lib, "--sortie", cls.sortie, "--autorisation-analyse", "--echantillons", "4",
                       "--chatgpt", cls.chatgpt])
        assert args == 0
        with open(cls.sortie) as f:
            cls.cat = json.load(f)
        cls.par_fichier = {m["fichier_relatif"]: m for m in cls.cat["medias"]}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_inventaire_et_metadonnees(self):
        self.assertEqual(self.cat["resume"]["medias"], 6)
        self.assertEqual(self.cat["resume"]["images"], 1)
        a = self.par_fichier["a.mp4"]
        self.assertEqual(a["metadonnees"]["video"]["largeur_affichee"], 320)
        self.assertAlmostEqual(a["metadonnees"]["video"]["cadence_moyenne"], 25, delta=0.1)
        self.assertAlmostEqual(a["metadonnees"]["duree_s"], 3, delta=0.2)
        self.assertEqual(a["metadonnees"]["audio"]["codec"], "aac")
        self.assertIsNotNone(a["metadonnees"]["audio"]["volume_max_db"])
        img = self.par_fichier["image.png"]
        self.assertEqual(img["type"], "image")
        self.assertEqual(img["mesures"]["echantillons"], 1)
        self.assertEqual(len(a["empreintes_dhash"]), 4)

    def test_sha256_et_doublon_exact(self):
        a, c = self.par_fichier["a.mp4"], self.par_fichier[os.path.join("sous", "a_copie.mp4")]
        self.assertEqual(a["sha256"], C.sha256(os.path.join(self.lib, "a.mp4")))
        self.assertEqual(a["sha256"], c["sha256"])
        self.assertNotEqual(a["id"], c["id"])
        dups = self.cat["doublons_exacts"]
        self.assertEqual(len(dups), 1)
        self.assertEqual(sorted(dups[0]["ids"]), sorted([a["id"], c["id"]]))

    def test_rapprochements_restent_des_hypotheses(self):
        a, r = self.par_fichier["a.mp4"], self.par_fichier["a_reencode.mp4"]
        b = self.par_fichier["b.mp4"]
        self.assertEqual(a["groupe_scene"], r["groupe_scene"])
        self.assertNotEqual(a["groupe_scene"], b["groupe_scene"])
        paires = {tuple(sorted(x["ids"])): x for x in self.cat["rapprochements"]}
        x = paires[tuple(sorted([a["id"], r["id"]]))]
        self.assertEqual(x["statut"], "hypothese_non_verifiee")
        for c in self.cat["couples_candidats"]:
            self.assertIsNone(c["original_designe"])
            self.assertEqual(c["statut"], "hypothese_non_verifiee")

    def test_mesures_coherentes(self):
        b, bb = self.par_fichier["b.mp4"], self.par_fichier["b_bruit.mp4"]
        self.assertEqual(b["groupe_scene"], bb["groupe_scene"])
        self.assertGreater(bb["mesures"]["bruit_sigma"], b["mesures"]["bruit_sigma"] + 3)
        self.assertIn("bruit", [d["defaut"] for d in bb["defauts"]])
        self.assertIn("basse_resolution", [d["defaut"] for d in self.par_fichier["a_reencode.mp4"]["defauts"]])
        self.assertTrue(all(d["verifie"] is False for m in self.cat["medias"] for d in m["defauts"]))

    def test_partition_sans_fuite(self):
        self.assertEqual(C.valider_catalogue(self.cat), [])
        part = {}
        for m in self.cat["medias"]:
            self.assertEqual(part.setdefault(m["groupe_scene"], m["partition"]), m["partition"])

    def test_import_chatgpt_et_manquants(self):
        self.assertEqual(self.par_fichier["a.mp4"]["id"], "V001")
        self.assertEqual(self.par_fichier["b_bruit.mp4"]["id"], "V002")
        self.assertEqual(self.cat["entrees_chatgpt_sans_fichier"], ["V099"])
        cl = self.par_fichier["b_bruit.mp4"]["classifications"]
        self.assertEqual(cl[0], {"champ": "filtre_suppose", "valeur": "bruit", "source": "chatgpt",
                                 "verifie": False, "confiance": None})

    def test_autorisations_par_defaut(self):
        for m in self.cat["medias"]:
            self.assertEqual(m["autorisations"]["analyse_technique"], "oui")
            for f in C.FINALITES[1:]:
                self.assertEqual(m["autorisations"][f], "non_renseigne")

    def test_plan_exige_autorisation_evaluation(self):
        p = os.path.join(self.tmp, "prive", "plan.json")
        self.assertEqual(C.main(["plan", self.sortie, "--sortie", p]), 0)
        plan = lire(p)
        self.assertEqual(plan["medias_eligibles"], 0)
        self.assertEqual(plan["entrainement_autorise"], [])
        # le propriétaire autorise l'évaluation de V002 seulement
        cons = os.path.join(self.tmp, "consentements.json")
        ecrire(cons, {"V002": {"evaluation_benchmark": "oui"}})
        s2 = os.path.join(self.tmp, "prive", "catalogue2.json")
        self.assertEqual(C.main(["analyser", self.lib, "--sortie", s2, "--autorisation-analyse", "--echantillons", "2",
                                 "--chatgpt", self.chatgpt, "--consentements", cons]), 0)
        self.assertEqual(C.main(["plan", s2, "--sortie", p]), 0)
        plan = lire(p)
        self.assertEqual(plan["medias_eligibles"], 1)
        tous = {i for b in plan["bancs"].values() for l in b.values() for i in l}
        self.assertLessEqual(tous, {"V002"})
        self.assertEqual(plan["entrainement_autorise"], [])

    def test_refus_sans_autorisation_ou_consentement_invalide(self):
        s = os.path.join(self.tmp, "x.json")
        self.assertEqual(C.main(["analyser", self.lib, "--sortie", s]), 2)
        self.assertFalse(os.path.exists(s))
        bad = os.path.join(self.tmp, "bad.json")
        ecrire(bad, {"V001": {"entrainement": "peut-etre"}})
        self.assertEqual(C.main(["analyser", self.lib, "--sortie", s, "--autorisation-analyse", "--consentements", bad]), 2)

    def test_refus_ecriture_dans_depot_non_ignore(self):
        depot = os.path.join(self.tmp, "depot")
        os.makedirs(depot)
        subprocess.run(["git", "init", "-q", depot], check=True)
        with open(os.path.join(depot, ".gitignore"), "w") as f:
            f.write("prive/\n")
        self.assertEqual(C.main(["analyser", self.lib, "--sortie", os.path.join(depot, "catalogue.json"),
                                 "--autorisation-analyse", "--echantillons", "1"]), 2)
        self.assertFalse(os.path.exists(os.path.join(depot, "catalogue.json")))
        self.assertEqual(C.main(["analyser", self.lib, "--sortie", os.path.join(depot, "prive", "c.json"),
                                 "--autorisation-analyse", "--echantillons", "1", "--anonymiser"]), 0)
        c = lire(os.path.join(depot, "prive", "c.json"))
        self.assertTrue(all(m["fichier_relatif"] is None for m in c["medias"]))

    def test_validation_detecte_les_falsifications(self):
        import copy
        c = copy.deepcopy(self.cat)
        c["couples_candidats"].append({"ids": ["V001", "V002"], "statut": "verifie", "original_designe": "V001"})
        c["medias"][0]["partition"] = "test" if c["medias"][0]["partition"] != "test" else "validation"
        c["medias"][1]["autorisations"]["entrainement"] = "oui-implicite"
        probs = " | ".join(C.valider_catalogue(c))
        self.assertIn("présenté comme vérifié", probs)
        self.assertIn("original désigné", probs)
        self.assertIn("autorisations", probs)
        self.assertIn("fuite", probs)

    def test_medias_jamais_modifies(self):
        avant = {f: C.sha256(os.path.join(self.lib, f)) for f in ("a.mp4", "b.mp4", "image.png")}
        C.main(["analyser", self.lib, "--sortie", os.path.join(self.tmp, "prive", "c3.json"), "--autorisation-analyse",
                "--echantillons", "1"])
        self.assertEqual(avant, {f: C.sha256(os.path.join(self.lib, f)) for f in avant})


class TestMesuresPures(unittest.TestCase):
    def test_bruit_et_nettete(self):
        import numpy as np
        rng = np.random.default_rng(1)
        plat = np.full((128, 128), 120.0)
        bruite = plat + rng.normal(0, 10, plat.shape)
        self.assertLess(C.bruit_immerkaer(plat), 0.01)
        self.assertAlmostEqual(C.bruit_immerkaer(bruite), 10, delta=1.0)
        self.assertGreater(C.nettete_laplacien(bruite), C.nettete_laplacien(plat))

    def test_blocs(self):
        import numpy as np
        blocs = np.kron(np.random.default_rng(2).uniform(0, 255, (16, 16)), np.ones((8, 8)))
        self.assertGreater(C.blocs_compression(blocs), 5)
        lisse = np.tile(np.linspace(0, 255, 128), (128, 1))
        self.assertAlmostEqual(C.blocs_compression(lisse), 1, delta=0.05)

    def test_dhash_distance(self):
        import numpy as np
        g = np.tile(np.linspace(0, 255, 64), (64, 1))
        self.assertEqual(C.distance_signatures([C.dhash(g)], [C.dhash(g)]), 0)
        self.assertEqual(C.distance_signatures([C.dhash(g)], [C.dhash(g[:, ::-1])]), 64)


if __name__ == "__main__":
    unittest.main()
