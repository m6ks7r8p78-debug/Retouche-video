#!/usr/bin/env python3
"""RetoucheProAI — catalogueur PRIVÉ de la bibliothèque de recherche (v1.0, branche expérimentale).

Produit, pour un dossier local de photos/vidéos, un catalogue technique conforme à MEDIA_CATALOG_SCHEMA.md :
identifiant, SHA-256, métadonnées (résolution, durée, cadence, codecs, débits, couleur, audio), mesures
(luminosité, bruit, netteté, blocs de compression, saturation, dominante), empreintes perceptuelles,
doublons exacts, rapprochements similaires (HYPOTHÈSES), groupes de scènes, partition sans fuite par groupe
et autorisations séparées par finalité (toutes « non_renseigne » par défaut).

Garde-fous :
- n'envoie rien sur le réseau, ne modifie ni ne supprime aucun média (lecture seule) ;
- refuse d'écrire un catalogue dans un dépôt Git à un emplacement non ignoré (les noms de fichiers sont privés) ;
- exige --autorisation-analyse : l'analyse technique est une finalité distincte, déclarée explicitement ;
- les rapprochements et les classifications importées restent des hypothèses (« verifie »: false) ;
- aucune correspondance original/retouché n'est décidée : seuls des couples candidats avec indices sont listés ;
- « plan » n'inclut un média dans un banc que si son autorisation « evaluation_benchmark » vaut « oui ».

Dépendances : Python 3.9+, numpy, et ffmpeg/ffprobe (sinon repli OpenCV, sans audio).

  python3 outils/catalogue_medias.py analyser DOSSIER --sortie prive/catalogue.json --autorisation-analyse \
          [--chatgpt catalogue_chatgpt.json|.csv] [--consentements prive/consentements.json] [--echantillons 8]
  python3 outils/catalogue_medias.py valider prive/catalogue.json
  python3 outils/catalogue_medias.py plan prive/catalogue.json --sortie prive/plan_benchmark.json
  python3 outils/catalogue_medias.py exporter-banc prive/catalogue.json --sortie prive/banc_entrees.json
"""
import argparse, csv, hashlib, json, math, os, re, shutil, subprocess, sys
from datetime import datetime, timezone

import numpy as np

SCHEMA = "retoucheproai.catalogue/1"
FINALITES = ("analyse_technique", "evaluation_benchmark", "stockage_durable", "annotation", "creation_dataset",
             "entrainement", "recherche_externe_partage", "publication", "avatars_personnages")
VALEURS_CONSENTEMENT = ("oui", "non", "non_renseigne")
EXT_VIDEO = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".3gp", ".mts", ".m2ts", ".wmv", ".flv", ".mpg", ".mpeg"}
EXT_IMAGE = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff", ".bmp", ".gif", ".avif"}
SEUIL_SIMILAIRE = 10      # distance de Hamming moyenne (sur 64 bits) : rapprochement « similaire »
SEUIL_SCENE = 16          # distance plus tolérante : même scène probable (recadrage, filtre, réencodage)
PARTS = (("entrainement", 0.70), ("validation", 0.15), ("test", 0.15))
LARGEUR_ANALYSE = 320
CROP_NATIF = 512


class ErreurCatalogue(Exception):
    pass


# ---------------------------------------------------------------- lecture des médias
def sha256(chemin, bloc=1 << 20):
    h = hashlib.sha256()
    with open(chemin, "rb") as f:
        for b in iter(lambda: f.read(bloc), b""):
            h.update(b)
    return h.hexdigest()


def _fraction(txt):
    try:
        n, d = str(txt).split("/")
        return round(float(n) / float(d), 4) if float(d) else None
    except Exception:
        try:
            return float(txt)
        except Exception:
            return None


def _num(x, typ=float):
    try:
        return typ(x)
    except Exception:
        return None


def _lire_pnm(data):
    """Décode un flux PGM (P5) ou PPM (P6) 8 bits produit par ffmpeg."""
    m = re.match(rb"(P[56])\s+(\d+)\s+(\d+)\s+(\d+)\s", data)
    if not m:
        raise ErreurCatalogue("image décodée illisible")
    w, h, c = int(m.group(2)), int(m.group(3)), 1 if m.group(1) == b"P5" else 3
    px = np.frombuffer(data[m.end():m.end() + w * h * c], dtype=np.uint8)
    if px.size != w * h * c:
        raise ErreurCatalogue("image décodée tronquée")
    return px.reshape(h, w, c) if c == 3 else px.reshape(h, w)


class LecteurFFmpeg:
    nom = "ffmpeg"

    def __init__(self):
        self.ffmpeg, self.ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")

    def disponible(self):
        return bool(self.ffmpeg and self.ffprobe)

    def sonder(self, chemin):
        r = subprocess.run([self.ffprobe, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", chemin],
                           capture_output=True, timeout=120)
        if r.returncode:
            raise ErreurCatalogue("ffprobe : " + r.stderr.decode("utf-8", "replace").strip()[:200])
        return json.loads(r.stdout or b"{}")

    def image(self, chemin, t, filtre, codec):
        cmd = [self.ffmpeg, "-v", "error", "-nostdin"]
        if t is not None:
            cmd += ["-ss", f"{t:.3f}"]
        cmd += ["-i", chemin, "-frames:v", "1", "-vf", filtre, "-f", "image2pipe", "-c:v", codec, "-"]
        r = subprocess.run(cmd, capture_output=True, timeout=120)
        if r.returncode or not r.stdout:
            return None
        return _lire_pnm(r.stdout)

    def vue(self, chemin, t):
        return self.image(chemin, t, f"scale={LARGEUR_ANALYSE}:-2:flags=area,format=rgb24", "ppm")

    def crop(self, chemin, t):
        c = CROP_NATIF
        f = (f"crop=w='min(iw,{c})':h='min(ih,{c})':x='floor((iw-min(iw,{c}))/32)*16':"
             f"y='floor((ih-min(ih,{c}))/32)*16',format=gray")
        return self.image(chemin, t, f, "pgm")

    def volume(self, chemin):
        r = subprocess.run([self.ffmpeg, "-v", "info", "-nostdin", "-i", chemin, "-vn", "-af", "volumedetect", "-f", "null", "-"],
                           capture_output=True, timeout=600)
        txt = r.stderr.decode("utf-8", "replace")
        moy = re.search(r"mean_volume:\s*(-?[\d.]+|-inf) dB", txt)
        mx = re.search(r"max_volume:\s*(-?[\d.]+|-inf) dB", txt)
        conv = lambda m: None if not m or m.group(1) == "-inf" else float(m.group(1))
        return conv(moy), conv(mx)


class LecteurOpenCV:
    """Repli sans ffmpeg (ex. bac à sable sans binaire) : pas d'audio, métadonnées réduites."""
    nom = "opencv"

    def __init__(self):
        try:
            import cv2
            self.cv2 = cv2
        except Exception:
            self.cv2 = None

    def disponible(self):
        return self.cv2 is not None

    def sonder(self, chemin):
        cv2 = self.cv2
        cap = cv2.VideoCapture(chemin)
        if not cap.isOpened():
            img = cv2.imread(chemin)
            if img is None:
                raise ErreurCatalogue("OpenCV ne lit pas ce fichier")
            return {"streams": [{"codec_type": "video", "width": img.shape[1], "height": img.shape[0]}], "format": {}}
        fps, n = cap.get(cv2.CAP_PROP_FPS), cap.get(cv2.CAP_PROP_FRAME_COUNT)
        w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()
        dur = n / fps if fps and n and n > 1 else None
        st = {"codec_type": "video", "width": w, "height": h, "avg_frame_rate": f"{fps}/1" if fps else None,
              "nb_frames": int(n) if n else None}
        return {"streams": [st], "format": {"duration": dur}}

    def _brut(self, chemin, t):
        cv2 = self.cv2
        cap = cv2.VideoCapture(chemin)
        if cap.isOpened() and t is not None:
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, img = cap.read() if cap.isOpened() else (False, None)
        cap.release()
        if not ok:
            img = cv2.imread(chemin)
        return img

    def vue(self, chemin, t):
        img = self._brut(chemin, t)
        if img is None:
            return None
        h, w = img.shape[:2]
        nh = max(2, int(round(h * LARGEUR_ANALYSE / w / 2)) * 2)
        return self.cv2.cvtColor(self.cv2.resize(img, (LARGEUR_ANALYSE, nh), interpolation=self.cv2.INTER_AREA),
                                 self.cv2.COLOR_BGR2RGB)

    def crop(self, chemin, t):
        img = self._brut(chemin, t)
        if img is None:
            return None
        g = self.cv2.cvtColor(img, self.cv2.COLOR_BGR2GRAY)
        h, w = g.shape
        cw, ch = min(w, CROP_NATIF), min(h, CROP_NATIF)
        x, y = (w - cw) // 32 * 16, (h - ch) // 32 * 16
        return g[y:y + ch, x:x + cw]

    def volume(self, chemin):
        return None, None


def lecteur():
    for L in (LecteurFFmpeg(), LecteurOpenCV()):
        if L.disponible():
            return L
    raise ErreurCatalogue("ni ffmpeg/ffprobe ni OpenCV disponibles")


# ---------------------------------------------------------------- mesures (numpy pur)
def _gris(rgb):
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def bruit_immerkaer(g):
    """Écart-type estimé du bruit (méthode d'Immerkær, 1996), en niveaux 0–255 à la résolution native du crop.
    Une texture fine légitime peut aussi l'augmenter : indice, pas preuve."""
    g = g.astype(np.float64)
    if g.shape[0] < 3 or g.shape[1] < 3:
        return None
    c = (g[:-2, :-2] - 2 * g[:-2, 1:-1] + g[:-2, 2:] - 2 * g[1:-1, :-2] + 4 * g[1:-1, 1:-1]
         - 2 * g[1:-1, 2:] + g[2:, :-2] - 2 * g[2:, 1:-1] + g[2:, 2:])
    h, w = g.shape
    return float(np.sum(np.abs(c)) * math.sqrt(math.pi / 2) / (6 * (w - 2) * (h - 2)))


def nettete_laplacien(g):
    g = g.astype(np.float64)
    if g.shape[0] < 3 or g.shape[1] < 3:
        return None
    lap = g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:] - 4 * g[1:-1, 1:-1]
    return float(lap.var())


def blocs_compression(g):
    """Rapport entre les sauts aux frontières de la grille 8×8 et ailleurs (≈1 : pas de blocs visibles)."""
    g = g.astype(np.float64)
    rs = []
    for d in (np.abs(np.diff(g, axis=1)), np.abs(np.diff(g, axis=0)).T):
        if d.shape[1] < 16:
            continue
        idx = np.arange(d.shape[1])
        front = (idx + 1) % 8 == 0
        ailleurs = d[:, ~front].mean()
        if ailleurs < 0.05 and d[:, front].mean() < 0.05:
            continue          # direction uniforme : aucun indice dans ce sens
        rs.append(float(d[:, front].mean() / (ailleurs + 1e-6)))
    return float(np.mean(rs)) if rs else None


def _redim_moyenne(g, w, h):
    lignes = [b.mean(axis=0) for b in np.array_split(g, h, axis=0)]
    m = np.stack(lignes)
    return np.stack([b.mean(axis=1) for b in np.array_split(m, w, axis=1)], axis=1)


def dhash(g):
    p = _redim_moyenne(g.astype(np.float64), 9, 8)
    bits = (p[:, 1:] > p[:, :-1]).flatten()
    return int("".join("1" if b else "0" for b in bits), 2)


def hamming(a, b):
    return bin(a ^ b).count("1")


def mesurer_vue(rgb):
    rgb = rgb.astype(np.float64)
    g = _gris(rgb)
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return {
        "luminance_moyenne": float(g.mean()), "luminance_p5": float(np.percentile(g, 5)),
        "luminance_p95": float(np.percentile(g, 95)), "part_noirs_ecrases": float((g < 16).mean()),
        "part_blancs_brules": float((g > 235).mean()), "nettete_laplacien": nettete_laplacien(g),
        "saturation_moyenne": float(sat.mean()), "dominante_rouge_vert": float((rgb[..., 0] - rgb[..., 1]).mean()),
        "dominante_bleu_vert": float((rgb[..., 2] - rgb[..., 1]).mean()), "_dhash": dhash(g), "_gris": g,
    }


def _r(x, n=3):
    return None if x is None or (isinstance(x, float) and not math.isfinite(x)) else round(float(x), n)


# ---------------------------------------------------------------- analyse d'un média
def metadonnees(sonde):
    v = next((s for s in sonde.get("streams", []) if s.get("codec_type") == "video"), None)
    a = next((s for s in sonde.get("streams", []) if s.get("codec_type") == "audio"), None)
    fmt = sonde.get("format", {}) or {}
    rot = None
    if v:
        for sd in v.get("side_data_list", []) or []:
            if "rotation" in sd:
                rot = _num(sd["rotation"], int)
        rot = rot if rot is not None else _num((v.get("tags") or {}).get("rotate"), int)
    w, h = (v or {}).get("width"), (v or {}).get("height")
    if w and h and rot is not None and abs(rot) % 180 == 90:
        w, h = h, w
    meta = {
        "conteneur": fmt.get("format_name"), "duree_s": _r(_num(fmt.get("duration")), 3),
        "debit_total_bps": _num(fmt.get("bit_rate"), int), "taille_octets": _num(fmt.get("size"), int),
        "date_creation_meta": (fmt.get("tags") or {}).get("creation_time"),
        "video": None if not v else {
            "codec": v.get("codec_name"), "profil": v.get("profile"), "largeur_affichee": w, "hauteur_affichee": h,
            "rotation": rot, "cadence_moyenne": _fraction(v.get("avg_frame_rate")),
            "cadence_nominale": _fraction(v.get("r_frame_rate")), "nb_images": _num(v.get("nb_frames"), int),
            "debit_bps": _num(v.get("bit_rate"), int), "pix_fmt": v.get("pix_fmt"),
            "profondeur_bits": _num(v.get("bits_per_raw_sample"), int), "espace_couleur": v.get("color_space"),
            "transfert": v.get("color_transfer"), "primaires": v.get("color_primaries"), "plage": v.get("color_range"),
        },
        "audio": None if not a else {
            "codec": a.get("codec_name"), "frequence_hz": _num(a.get("sample_rate"), int),
            "canaux": a.get("channels"), "disposition": a.get("channel_layout"), "debit_bps": _num(a.get("bit_rate"), int),
        },
    }
    if meta["video"]:
        cv, cn = meta["video"]["cadence_moyenne"], meta["video"]["cadence_nominale"]
        meta["video"]["cadence_variable_probable"] = bool(cv and cn and abs(cv - cn) > 0.05 * cn)
        if meta["video"]["debit_bps"] and w and h and cv:
            meta["video"]["bits_par_pixel"] = _r(meta["video"]["debit_bps"] / (w * h * cv), 4)
    return meta


def analyser_media(L, chemin, type_media, n_ech):
    sonde = L.sonder(chemin)
    meta = metadonnees(sonde)
    dur = meta["duree_s"] if type_media == "video" else None
    temps = [None] if not dur or dur <= 0 else [dur * (i + 0.5) / n_ech for i in range(n_ech)]
    vues, natifs = [], []
    for t in temps:
        v = L.vue(chemin, t)
        if v is not None:
            vues.append(mesurer_vue(v))
        c = L.crop(chemin, t)
        if c is not None:
            natifs.append({"bruit_sigma": bruit_immerkaer(c), "blocs_8x8": blocs_compression(c)})
    if not vues:
        raise ErreurCatalogue("aucune image décodable")
    agg = lambda cle, src: _r(float(np.median([x[cle] for x in src if x.get(cle) is not None]))) \
        if any(x.get(cle) is not None for x in src) else None
    variation = None
    if len(vues) > 1:
        dif = []
        for a, b in zip(vues, vues[1:]):
            if a["_gris"].shape == b["_gris"].shape:
                dif.append(float(np.abs(a["_gris"] - b["_gris"]).mean()))
        variation = _r(float(np.mean(dif))) if dif else None
    mesures = {k: agg(k, vues) for k in ("luminance_moyenne", "luminance_p5", "luminance_p95", "part_noirs_ecrases",
                                         "part_blancs_brules", "nettete_laplacien", "saturation_moyenne",
                                         "dominante_rouge_vert", "dominante_bleu_vert")}
    mesures.update({"bruit_sigma": agg("bruit_sigma", natifs), "blocs_8x8": agg("blocs_8x8", natifs),
                    "variation_inter_echantillons": variation, "echantillons": len(vues),
                    "echelle": f"vue {LARGEUR_ANALYSE} px de large ; bruit et blocs sur crop natif ≤ {CROP_NATIF} px"})
    if meta["audio"]:
        moy, mx = L.volume(chemin)
        meta["audio"].update({"volume_moyen_db": moy, "volume_max_db": mx,
                              "saturation_audio_probable": mx is not None and mx >= -0.1})
    return meta, mesures, [v["_dhash"] for v in vues]


def defauts(meta, m):
    """Défauts exploitables pour les bancs, avec seuils explicites (indices techniques, non vérifiés à l'œil)."""
    d = []
    v = meta.get("video") or {}
    w, h = v.get("largeur_affichee"), v.get("hauteur_affichee")
    if w and h and min(w, h) < 480:
        d.append(("basse_resolution", f"plus petit côté {min(w, h)} px < 480"))
    if m.get("bruit_sigma") is not None and m["bruit_sigma"] > 6:
        d.append(("bruit", f"sigma estimé {m['bruit_sigma']} > 6"))
    if m.get("blocs_8x8") is not None and m["blocs_8x8"] > 1.25:
        d.append(("compression_severe", f"rapport de blocs {m['blocs_8x8']} > 1,25"))
    if v.get("bits_par_pixel") is not None and v["bits_par_pixel"] < 0.04:
        d.append(("debit_faible", f"{v['bits_par_pixel']} bit/pixel/image < 0,04"))
    if m.get("luminance_moyenne") is not None and m["luminance_moyenne"] < 60:
        d.append(("faible_luminosite", f"luminance médiane {m['luminance_moyenne']} < 60"))
    if m.get("part_blancs_brules") is not None and m["part_blancs_brules"] > 0.05:
        d.append(("surexposition", f"{round(m['part_blancs_brules'] * 100, 1)} % de blancs > 235"))
    if m.get("nettete_laplacien") is not None and m["nettete_laplacien"] < 60:
        d.append(("flou_ou_lissage", f"variance du laplacien {m['nettete_laplacien']} < 60"))
    if m.get("saturation_moyenne") is not None and m["saturation_moyenne"] > 0.55:
        d.append(("saturation_forte_filtre_couleur_possible", f"saturation moyenne {m['saturation_moyenne']} > 0,55"))
    if any(abs(m.get(k) or 0) > 18 for k in ("dominante_rouge_vert", "dominante_bleu_vert")):
        d.append(("dominante_couleur_filtre_possible", "écart moyen de canal > 18 niveaux"))
    if v.get("cadence_variable_probable"):
        d.append(("cadence_variable", "cadence moyenne ≠ nominale"))
    if (meta.get("audio") or {}).get("saturation_audio_probable"):
        d.append(("audio_sature_possible", "crête ≥ -0,1 dBFS"))
    return [{"defaut": k, "raison": r, "source": "mesure_automatique", "verifie": False} for k, r in d]


# ---------------------------------------------------------------- rapprochements
def distance_signatures(a, b):
    """Distance moyenne symétrique « plus proche voisin » entre deux suites d'empreintes (0 = identiques, 64 = opposées)."""
    if not a or not b:
        return None
    ab = np.mean([min(hamming(x, y) for y in b) for x in a])
    ba = np.mean([min(hamming(y, x) for x in a) for y in b])
    return float((ab + ba) / 2)


class _UF:
    def __init__(self, n):
        self.p = list(range(n))

    def f(self, i):
        while self.p[i] != i:
            self.p[i] = self.p[self.p[i]]
            i = self.p[i]
        return i

    def u(self, a, b):
        a, b = self.f(a), self.f(b)
        if a != b:
            self.p[max(a, b)] = min(a, b)


def partition_groupe(cle, graine):
    x = int(hashlib.sha256(f"{graine}:{cle}".encode()).hexdigest()[:12], 16) / float(16 ** 12)
    cumul = 0.0
    for nom, part in PARTS:
        cumul += part
        if x < cumul:
            return nom
    return PARTS[-1][0]


def indices_couple(a, b):
    """Différences mesurées entre deux médias rapprochés ; ne désigne PAS l'original."""
    ind = []
    ma, mb = a["mesures"], b["mesures"]
    va, vb = a["metadonnees"].get("video") or {}, b["metadonnees"].get("video") or {}
    pa = (va.get("largeur_affichee") or 0) * (va.get("hauteur_affichee") or 0)
    pb = (vb.get("largeur_affichee") or 0) * (vb.get("hauteur_affichee") or 0)
    if pa and pb and pa != pb:
        ind.append(f"résolutions différentes ({pa} vs {pb} pixels)")
    ba, bb = va.get("bits_par_pixel"), vb.get("bits_par_pixel")
    if ba and bb and max(ba, bb) > 2 * min(ba, bb):
        ind.append(f"débits très différents ({ba} vs {bb} bit/pixel/image) : réencodage probable")
    for cle, seuil, lib in (("saturation_moyenne", 0.06, "saturation"), ("nettete_laplacien", None, "netteté"),
                            ("bruit_sigma", 1.5, "bruit"), ("luminance_moyenne", 12, "luminosité")):
        x, y = ma.get(cle), mb.get(cle)
        if x is None or y is None:
            continue
        if (seuil is None and max(x, y) > 1.5 * max(min(x, y), 1e-6)) or (seuil is not None and abs(x - y) > seuil):
            ind.append(f"{lib} différente ({x} vs {y})")
    if (a["metadonnees"].get("duree_s") or 0) and (b["metadonnees"].get("duree_s") or 0):
        if abs(a["metadonnees"]["duree_s"] - b["metadonnees"]["duree_s"]) > 0.5:
            ind.append("durées différentes : extrait ou montage possible")
    return ind


def rapprocher(medias, graine):
    n = len(medias)
    uf = _UF(n)
    exacts, similaires, couples = {}, [], []
    for i, m in enumerate(medias):
        exacts.setdefault(m["sha256"], []).append(i)
    for idx in exacts.values():
        for j in idx[1:]:
            uf.u(idx[0], j)
    for i in range(n):
        for j in range(i + 1, n):
            if medias[i]["sha256"] == medias[j]["sha256"]:
                continue
            d = distance_signatures(medias[i]["_sig"], medias[j]["_sig"])
            if d is None or d > SEUIL_SCENE:
                continue
            uf.u(i, j)
            conf = round(max(0.0, 1 - d / (SEUIL_SCENE + 1)), 3)
            nature = "similaire" if d <= SEUIL_SIMILAIRE else "meme_scene_probable"
            similaires.append({"ids": [medias[i]["id"], medias[j]["id"]], "distance_dhash": round(d, 2),
                               "nature": nature, "confiance": conf, "statut": "hypothese_non_verifiee"})
            ind = indices_couple(medias[i], medias[j])
            if ind:
                couples.append({"ids": [medias[i]["id"], medias[j]["id"]], "indices": ind,
                                "original_designe": None, "statut": "hypothese_non_verifiee",
                                "avertissement": "Couple original/retouché PLAUSIBLE seulement ; aucune correspondance n'est affirmée."})
    racines = {}
    for i in range(n):
        racines.setdefault(uf.f(i), []).append(i)
    groupes = []
    for k, (r, idx) in enumerate(sorted(racines.items(), key=lambda kv: min(medias[i]["id"] for i in kv[1]))):
        gid = f"G{k + 1:03d}"
        cle = min(medias[i]["sha256"] for i in idx)
        part = partition_groupe(cle, graine)
        for i in idx:
            medias[i]["groupe_scene"], medias[i]["partition"] = gid, part
        groupes.append({"id": gid, "medias": sorted(medias[i]["id"] for i in idx), "partition": part})
    dups = [{"sha256": s, "ids": sorted(medias[i]["id"] for i in idx), "statut": "verifie_par_sha256"}
            for s, idx in exacts.items() if len(idx) > 1]
    return dups, similaires, couples, groupes


# ---------------------------------------------------------------- import ChatGPT / consentements
def charger_chatgpt(chemin):
    if not chemin:
        return []
    if chemin.lower().endswith(".csv"):
        with open(chemin, newline="", encoding="utf-8-sig") as f:
            lignes = list(csv.DictReader(f))
    else:
        with open(chemin, encoding="utf-8") as f:
            d = json.load(f)
        lignes = d.get("medias", d) if isinstance(d, dict) else d
    sortie = []
    for l in lignes:
        low = {str(k).strip().lower(): v for k, v in l.items()}
        ident = low.get("id") or low.get("identifiant")
        fichier = low.get("fichier") or low.get("nom") or low.get("filename") or low.get("nom_fichier")
        sha = (low.get("sha256") or "").strip().lower() or None
        reste = {k: v for k, v in low.items() if k not in ("id", "identifiant", "fichier", "nom", "filename", "nom_fichier", "sha256")
                 and v not in (None, "")}
        if ident:
            sortie.append({"id": str(ident).strip(), "fichier": fichier, "sha256": sha, "champs": reste})
    return sortie


def charger_consentements(chemin):
    if not chemin:
        return {}
    with open(chemin, encoding="utf-8") as f:
        d = json.load(f)
    out = {}
    for cle, val in d.items():
        if cle.startswith("_"):
            continue          # métadonnées (provenance, portée, limites)
        if not isinstance(val, dict):
            raise ErreurCatalogue(f"consentements : entrée invalide pour {cle}")
        for fin, v in val.items():
            if fin not in FINALITES or v not in VALEURS_CONSENTEMENT:
                raise ErreurCatalogue(f"consentements : finalité ou valeur inconnue ({cle}.{fin}={v})")
        out[cle] = val
    return out


# ---------------------------------------------------------------- sortie protégée
def _racine_git(chemin):
    d = os.path.abspath(os.path.dirname(chemin) or ".")
    while True:
        if os.path.exists(os.path.join(d, ".git")):
            return d
        p = os.path.dirname(d)
        if p == d:
            return None
        d = p


def verifier_sortie_privee(chemin):
    racine = _racine_git(chemin)
    if not racine:
        return
    r = subprocess.run(["git", "-C", racine, "check-ignore", "-q", os.path.abspath(chemin)], capture_output=True)
    if r.returncode != 0:
        raise ErreurCatalogue(f"refus : {chemin} est dans un dépôt Git sans être ignoré. Utiliser par exemple prive/ "
                              "(ignoré) ou un dossier hors du dépôt : le catalogue contient des noms de fichiers privés.")


def ecrire_json(chemin, donnees):
    verifier_sortie_privee(chemin)
    os.makedirs(os.path.dirname(os.path.abspath(chemin)), exist_ok=True)
    tmp = chemin + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(donnees, f, ensure_ascii=False, indent=1)
    os.replace(tmp, chemin)


# ---------------------------------------------------------------- commandes
def lister(dossier):
    out = []
    for base, dirs, fichiers in os.walk(dossier):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        for f in sorted(fichiers):
            ext = os.path.splitext(f)[1].lower()
            if f.startswith(".") or ext not in EXT_VIDEO | EXT_IMAGE:
                continue
            p = os.path.join(base, f)
            if os.path.islink(p):
                continue
            out.append((os.path.relpath(p, dossier), p, "video" if ext in EXT_VIDEO else "image"))
    return out


def analyser(args):
    if not args.autorisation_analyse:
        raise ErreurCatalogue("l'analyse technique est une finalité distincte : relancer avec --autorisation-analyse "
                              "si le propriétaire l'a autorisée.")
    L = lecteur()
    chatgpt = charger_chatgpt(args.chatgpt)
    consent = charger_consentements(args.consentements)
    par_sha = {}
    for c in chatgpt:
        if c["sha256"]:
            par_sha.setdefault(c["sha256"], []).append(c)
    par_nom = {}
    for c in chatgpt:
        if c["fichier"]:
            par_nom.setdefault(os.path.basename(str(c["fichier"])).lower(), []).append(c)
    utilises, medias, erreurs = set(), [], []
    ids_pris = {c["id"] for c in chatgpt}
    compteur = 0
    for rel, chemin, typ in lister(args.dossier):
        empreinte = sha256(chemin)
        src = next((c for c in par_sha.get(empreinte, []) if c["id"] not in utilises), None)
        if not src:
            cands = [c for c in par_nom.get(os.path.basename(rel).lower(), []) if c["id"] not in utilises]
            src = cands[0] if len(cands) == 1 else None
        if src and src["id"] in utilises:
            src = None    # doublon exact déjà associé à cet identifiant : nouvel identifiant
        if src:
            ident, origine = src["id"], ("chatgpt_sha256" if src.get("sha256") == empreinte else "chatgpt_nom_fichier")
            utilises.add(ident)
        else:
            while True:
                compteur += 1
                ident = f"M{compteur:03d}"
                if ident not in ids_pris:
                    break
            origine = "nouvel_identifiant"
        ids_pris.add(ident)
        entree = {"id": ident, "origine_identifiant": origine, "fichier_relatif": None if args.anonymiser else rel,
                  "type": typ, "sha256": empreinte, "taille_octets": os.path.getsize(chemin)}
        try:
            meta, mes, sig = analyser_media(L, chemin, typ, args.echantillons)
        except (ErreurCatalogue, subprocess.TimeoutExpired, json.JSONDecodeError) as e:
            erreurs.append({"id": ident, "erreur": str(e)[:300]})
            meta, mes, sig = None, {}, []
        entree.update({"metadonnees": meta, "mesures": mes, "empreintes_dhash": [f"{h:016x}" for h in sig], "_sig": sig})
        entree["defauts"] = defauts(meta, mes) if meta else []
        cons = {f: "non_renseigne" for f in FINALITES}
        cons["analyse_technique"] = "oui"
        for cle in ("*", ident, empreinte):   # « * » : déclaration globale du propriétaire, précisée média par média
            cons.update(consent.get(cle, {}))
        entree["autorisations"] = cons
        entree["droits"] = {"proprietaire_declare": None, "consentement_personnes_representees": "non_renseigne",
                            "restrictions": []}
        entree["classifications"] = []
        if src:
            for k, v in src["champs"].items():
                entree["classifications"].append({"champ": k, "valeur": v, "source": "chatgpt", "verifie": False,
                                                  "confiance": None})
        medias.append(entree)
    dups, sim, couples, groupes = rapprocher(medias, args.graine)
    for m in medias:
        m.pop("_sig", None)
    manquants = sorted(c["id"] for c in chatgpt if c["id"] not in utilises)
    cat = {
        "schema": SCHEMA, "genere_le": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "outil": {"nom": "outils/catalogue_medias.py", "lecteur": L.nom, "echantillons_par_video": args.echantillons,
                  "seuils": {"similaire_dhash": SEUIL_SIMILAIRE, "meme_scene_dhash": SEUIL_SCENE}, "graine_partition": args.graine},
        "confidentialite": "PRIVÉ — ne jamais publier ni versionner ; contient des noms et empreintes de médias personnels.",
        "resume": {"medias": len(medias), "videos": sum(m["type"] == "video" for m in medias),
                   "images": sum(m["type"] == "image" for m in medias), "erreurs": len(erreurs),
                   "groupes_scene": len(groupes), "doublons_exacts": len(dups), "rapprochements_hypothetiques": len(sim),
                   "couples_candidats": len(couples), "entrees_chatgpt_sans_fichier": len(manquants)},
        "medias": medias, "doublons_exacts": dups, "rapprochements": sim, "couples_candidats": couples,
        "groupes": groupes, "entrees_chatgpt_sans_fichier": manquants, "erreurs": erreurs,
    }
    probs = valider_catalogue(cat)
    if probs:
        raise ErreurCatalogue("catalogue incohérent : " + "; ".join(probs[:5]))
    ecrire_json(args.sortie, cat)
    print(json.dumps(cat["resume"], ensure_ascii=False))
    return cat


def valider_catalogue(cat):
    p = []
    if cat.get("schema") != SCHEMA:
        p.append("schema inattendu")
    ids, part_groupe = set(), {}
    for m in cat.get("medias", []):
        i = m.get("id")
        if not i or i in ids:
            p.append(f"identifiant absent ou dupliqué : {i}")
        ids.add(i)
        if not re.fullmatch(r"[0-9a-f]{64}", m.get("sha256") or ""):
            p.append(f"{i} : sha256 invalide")
        a = m.get("autorisations") or {}
        if set(a) != set(FINALITES) or any(v not in VALEURS_CONSENTEMENT for v in a.values()):
            p.append(f"{i} : autorisations incomplètes ou invalides")
        g = m.get("groupe_scene")
        if g:
            if part_groupe.setdefault(g, m.get("partition")) != m.get("partition"):
                p.append(f"fuite : le groupe {g} est réparti dans plusieurs partitions")
        for c in m.get("classifications", []) + m.get("defauts", []):
            if c.get("verifie") and not c.get("verifie_par"):
                p.append(f"{i} : classification déclarée vérifiée sans « verifie_par »")
    for r in cat.get("rapprochements", []) + cat.get("couples_candidats", []):
        if r.get("statut") != "hypothese_non_verifiee" and not r.get("verifie_par"):
            p.append(f"rapprochement {r.get('ids')} présenté comme vérifié sans « verifie_par »")
    for c in cat.get("couples_candidats", []):
        if c.get("original_designe") and not c.get("verifie_par"):
            p.append(f"couple {c.get('ids')} : original désigné sans vérification")
    return p


CATEGORIES_BANC = {
    "basse_resolution": ["basse_resolution"], "compression_severe": ["compression_severe", "debit_faible"],
    "bruit": ["bruit"], "faible_luminosite": ["faible_luminosite"], "flou_texture": ["flou_ou_lissage"],
    "colorimetrie_filtres": ["saturation_forte_filtre_couleur_possible", "dominante_couleur_filtre_possible"],
    "exposition": ["surexposition"], "temporel": ["cadence_variable"], "audio": ["audio_sature_possible"],
}


def plan(args):
    with open(args.catalogue, encoding="utf-8") as f:
        cat = json.load(f)
    probs = valider_catalogue(cat)
    if probs:
        raise ErreurCatalogue("catalogue invalide : " + "; ".join(probs[:5]))
    eligibles, exclus = [], []
    for m in cat["medias"]:
        if m["autorisations"].get("evaluation_benchmark") == "oui" and m.get("metadonnees"):
            eligibles.append(m)
        else:
            exclus.append({"id": m["id"], "raison": "autorisation evaluation_benchmark ≠ oui" if m.get("metadonnees") else "illisible"})
    bancs = {}
    for nom, defs in CATEGORIES_BANC.items():
        sel = [m for m in eligibles if any(d["defaut"] in defs for d in m["defauts"])]
        bancs[nom] = {p: sorted(m["id"] for m in sel if m["partition"] == p) for p, _ in PARTS}
    sortie = {
        "schema": "retoucheproai.plan_benchmark/1", "catalogue_schema": cat["schema"],
        "regles": ["Seules les partitions validation et test servent à l'évaluation ; « entrainement » reste inutilisé "
                   "tant que l'autorisation « entrainement » n'est pas « oui » ET qu'un protocole d'entraînement n'est pas validé.",
                   "Les variantes d'une même scène partagent toujours la même partition (pas de fuite).",
                   "Les défauts proviennent de mesures automatiques non vérifiées à l'œil."],
        "bancs": bancs, "medias_eligibles": len(eligibles), "exclus": exclus,
        "entrainement_autorise": sorted(m["id"] for m in eligibles if m["autorisations"].get("entrainement") == "oui"),
    }
    ecrire_json(args.sortie, sortie)
    print(json.dumps({"eligibles": len(eligibles), "exclus": len(exclus)}, ensure_ascii=False))
    return sortie


INDICES_BANC_REEL = {"bruit": "bruit", "faible_luminosite": "faible_lumiere", "compression_severe": "compression",
                     "debit_faible": "compression", "saturation_forte_filtre_couleur_possible": "tonal",
                     "dominante_couleur_filtre_possible": "tonal", "audio_sature_possible": "audio"}


def exporter_banc(args):
    """Entrées anonymisées pour outils/directeur-banc-reel.cjs (banc de triage de ChatGPT) : aucun nom ni chemin."""
    with open(args.catalogue, encoding="utf-8") as f:
        cat = json.load(f)
    probs = valider_catalogue(cat)
    if probs:
        raise ErreurCatalogue("catalogue invalide : " + "; ".join(probs[:5]))
    entrees = []
    for m in cat["medias"]:
        if not m.get("metadonnees"):
            continue
        indices = sorted({INDICES_BANC_REEL[d["defaut"]] for d in m["defauts"] if d["defaut"] in INDICES_BANC_REEL})
        entrees.append({"id": m["id"], "type": m["type"], "sha256": m["sha256"],
                        "duree": float(m["metadonnees"].get("duree_s") or 0) if m["type"] == "video" else 0.0,
                        "phash": m["empreintes_dhash"][:8], "famille": m["groupe_scene"], "indices": indices})
    ecrire_json(args.sortie, entrees)
    print(json.dumps({"entrees": len(entrees)}, ensure_ascii=False))
    return entrees


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sp = ap.add_subparsers(dest="cmd", required=True)
    a = sp.add_parser("analyser")
    a.add_argument("dossier")
    a.add_argument("--sortie", required=True)
    a.add_argument("--autorisation-analyse", action="store_true")
    a.add_argument("--chatgpt")
    a.add_argument("--consentements")
    a.add_argument("--echantillons", type=int, default=8)
    a.add_argument("--graine", default="retoucheproai-1")
    a.add_argument("--anonymiser", action="store_true", help="ne pas conserver les noms de fichiers")
    v = sp.add_parser("valider")
    v.add_argument("catalogue")
    p = sp.add_parser("plan")
    p.add_argument("catalogue")
    p.add_argument("--sortie", required=True)
    e = sp.add_parser("exporter-banc")
    e.add_argument("catalogue")
    e.add_argument("--sortie", required=True)
    args = ap.parse_args(argv)
    try:
        if args.cmd == "analyser":
            if not 1 <= args.echantillons <= 64:
                raise ErreurCatalogue("--echantillons doit être entre 1 et 64")
            analyser(args)
        elif args.cmd == "valider":
            with open(args.catalogue, encoding="utf-8") as f:
                probs = valider_catalogue(json.load(f))
            print("valide" if not probs else "\n".join(probs))
            return 0 if not probs else 1
        elif args.cmd == "exporter-banc":
            exporter_banc(args)
        else:
            plan(args)
    except ErreurCatalogue as e:
        print("Erreur : " + str(e), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
