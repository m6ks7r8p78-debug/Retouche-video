"""RetoucheProAI v8.4 — « Zéro perte » : reconstruction COMPLÈTE du décor manquant, sur les cartes graphiques gratuites de Kaggle.

Problème : passer une vidéo verticale (9:16) en horizontale (16:9) sans rien couper ni réduire oblige à ajouter environ 68 % de
l'image, sur les côtés. Sur le téléphone, le modèle local (MI-GAN) ne tient que sur une faible profondeur (≈ 0,2 du petit côté) ;
au-delà, l'app ne pouvait mettre qu'un prolongement flou.

Ici : pour chaque scène, l'app envoie UNIQUEMENT le « décor » de la scène (une image fixe déjà assemblée sur le téléphone : vrais
pixels retrouvés grâce au mouvement de la caméra + trous à remplir), jamais la vidéo. Chaque trou est rempli par un modèle de
diffusion d'inpainting (Stable Diffusion XL Inpainting 0.1, licence CreativeML Open RAIL++-M : usage commercial permis),
fenêtre par fenêtre (1024×1024, chaque fenêtre voit le réel et ce qui vient d'être reconstruit), puis :
  - raccord de couleur : moyenne/écart-type du résultat recalés sur le réel voisin (pas de bande plus claire ou plus foncée) ;
  - agrandissement ×2 à ×4 par le Real-ESRGAN de l'app (sr.bin) pour que les côtés aient la netteté du centre en 1080p / 4K.
L'image filmée n'est jamais renvoyée ni modifiée : seuls les pixels ajoutés reviennent (alpha = 255 là où ils ont été inventés).

Entrée (jeu de données privé) : params.json, plaque_<id>.png (RGBA, alpha 255 = pixel réel), trou_<id>.png (blanc = à inventer),
  ia_serveur.py et sr.bin (agrandissement).
params.json : { "version": 1, "travaux": [ { "id", "w", "h", "fenetres": [{x, y, w, h}], "echelle": s } ], "graine": n, "invite": "" }
Sortie : /kaggle/working/info.json = { ok, version, moteur, travaux: [ { id, w, h, jpeg (base64, RGB), alpha (base64, PNG) } ], ... }
  (le relais de l'app ne laisse passer que info.json et ia.mp4 : les images voyagent donc dans info.json).
Repli : si le modèle ne peut pas tourner (pas d'Internet, mémoire…), info.json dit ok=false et pourquoi ; l'app garde alors sa
  reconstruction locale. Tests sans carte graphique : RETOUCHE_FAUX_GENERATEUR=1 (python3 tests/extension_kaggle_test.py).
"""
import base64, glob, io, json, math, os, sys, threading, time, traceback

import numpy as np
from PIL import Image, ImageFilter

VERSION = 1
MODELE = "diffusers/stable-diffusion-xl-1.0-inpainting-0.1"
VAE = "madebyollin/sdxl-vae-fp16-fix"
INVITE = ("the same photograph extended to a wider view, seamless continuation of the same place, same lighting, same colors, "
          "same camera, natural scenery, realistic, sharp, high detail")
NEGATIF = ("person, people, human, man, woman, child, face, body, hands, animal, text, letters, watermark, logo, signature, "
           "frame, border, black bars, split screen, collage, blurry, painting, illustration, cartoon, duplicate, deformed")
DUREE_MAX_S = 10.5 * 3600
T0 = time.time()

ENTREE = os.environ.get("RETOUCHE_ENTREE") or os.path.dirname(glob.glob("/kaggle/input/**/params.json", recursive=True)[0])
SORTIE = os.environ.get("RETOUCHE_SORTIE", "/kaggle/working")
FAUX = os.environ.get("RETOUCHE_FAUX_GENERATEUR") == "1"
os.makedirs(SORTIE, exist_ok=True)
P = json.load(open(os.path.join(ENTREE, "params.json")))
INFO = {"version": VERSION, "moteur": "faux" if FAUX else "sdxl-inpainting-0.1", "ok": False, "travaux": []}


def journal(*a):
    print(f"[{time.time() - T0:7.0f} s]", *a, flush=True)


def ecrire_info():
    json.dump(INFO, open(os.path.join(SORTIE, "info.json"), "w"))


# ---------------------------------------------------------------- outils image (numpy)
def pre_remplir(rgb, trou):
    """Chaque trou reçoit la couleur adoucie du pixel réel le plus proche (même idée que FMM.preRemplir de l'app) :
    le modèle part d'une ébauche aux bonnes couleurs au lieu de noir (sinon liseré sombre au raccord)."""
    from scipy import ndimage
    if not trou.any():
        return rgb.copy()
    _, (iy, ix) = ndimage.distance_transform_edt(trou, return_indices=True)
    out = rgb[iy, ix].astype(np.float32)
    for _ in range(2):
        out = ndimage.uniform_filter(out, size=(13, 13, 1), mode="nearest")
    res = rgb.astype(np.float32).copy()
    res[trou] = out[trou]
    return res.clip(0, 255).astype(np.uint8)


def raccord_couleur(gen, ref, trou, connu, bande=48):
    """Recale moyenne et écart-type de chaque couleur du résultat sur le réel, mesurés dans une bande le long du raccord."""
    from scipy import ndimage
    d = ndimage.distance_transform_edt(trou)
    zone_gen = trou & (d <= bande)
    d2 = ndimage.distance_transform_edt(~trou)
    zone_ref = connu & ~trou & (d2 <= bande)
    if zone_gen.sum() < 64 or zone_ref.sum() < 64:
        return gen
    out = gen.astype(np.float32)
    for c in range(3):
        mg, sg = out[..., c][zone_gen].mean(), out[..., c][zone_gen].std() + 1e-3
        mr, sr = ref[..., c][zone_ref].astype(np.float32).mean(), ref[..., c][zone_ref].astype(np.float32).std() + 1e-3
        k = float(np.clip(sr / sg, .8, 1.25))
        out[..., c] = np.where(trou, (out[..., c] - mg) * k + mr, out[..., c])
    return out.clip(0, 255).astype(np.uint8)


def b64_jpeg(rgb, q=93):
    b = io.BytesIO(); Image.fromarray(rgb).save(b, "JPEG", quality=q, subsampling=0, optimize=True)
    return base64.b64encode(b.getvalue()).decode()


def b64_png(a):
    b = io.BytesIO(); Image.fromarray(a).save(b, "PNG", optimize=True)
    return base64.b64encode(b.getvalue()).decode()


# ---------------------------------------------------------------- générateur
class Generateur:
    def __init__(self, gpu):
        self.gpu = gpu
        if FAUX:
            return
        import torch
        try:
            from diffusers import AutoPipelineForInpainting
        except ImportError:   # image Kaggle sans diffusers : installation (Internet activé pour ce calcul)
            import subprocess
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "diffusers>=0.27", "accelerate"], check=True)
            from diffusers import AutoPipelineForInpainting
        self.torch = torch
        extra = {}
        try:   # décodeur d'images de SDXL corrigé pour la demi-précision (MIT) : sans lui, images noires possibles sur T4
            from diffusers import AutoencoderKL
            extra["vae"] = AutoencoderKL.from_pretrained(VAE, torch_dtype=torch.float16)
        except Exception as e:
            journal("décodeur fp16-fix indisponible :", e)
        self.pipe = AutoPipelineForInpainting.from_pretrained(MODELE, torch_dtype=torch.float16, variant="fp16", **extra).to(f"cuda:{gpu}")
        self.pipe.set_progress_bar_config(disable=True)
        try:
            self.pipe.enable_vae_slicing()
        except Exception:
            pass

    def remplir(self, rgb, trou, graine):
        """rgb uint8 [h,w,3] (trous pré-remplis), trou bool [h,w] -> rgb uint8 [h,w,3] (seuls les trous comptent)."""
        h, w = trou.shape
        if FAUX:   # essai sans carte graphique : ébauche pré-remplie + léger motif, pour vérifier tout le reste du circuit
            yy, xx = np.mgrid[0:h, 0:w]
            return np.clip(rgb.astype(np.int16) + ((xx // 8 + yy // 8) % 2 * 6 - 3)[..., None], 0, 255).astype(np.uint8)
        # taille multiple de 8, au plus 1024 sur le grand côté (taille d'entraînement de SDXL)
        s = min(1.0, 1024 / max(w, h)); W8, H8 = max(64, int(w * s) // 8 * 8), max(64, int(h * s) // 8 * 8)
        img = Image.fromarray(rgb).resize((W8, H8), Image.LANCZOS)
        m = Image.fromarray((trou * 255).astype(np.uint8)).resize((W8, H8), Image.NEAREST)
        m = m.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(3))   # le modèle reprend aussi 4 px du raccord
        g = self.torch.Generator(device=f"cuda:{self.gpu}").manual_seed(int(graine))
        out = self.pipe(prompt=P.get("invite") or INVITE, negative_prompt=NEGATIF, image=img, mask_image=m, width=W8, height=H8,
                        strength=0.99, guidance_scale=6.0, num_inference_steps=32, generator=g).images[0]
        r = np.asarray(out.convert("RGB").resize((w, h), Image.LANCZOS))
        if r.max() < 4 or r[trou].std() < .5:   # image noire / vide : calcul raté (dépassement en demi-précision)
            raise RuntimeError("résultat vide du modèle")
        return r


def agrandisseur(gpu):
    """Real-ESRGAN de l'app (sr.bin) : même réseau que sur le téléphone ; None si indisponible (l'app agrandit alors elle-même)."""
    if FAUX:
        return None
    try:
        sys.path.insert(0, ENTREE)
        import ia_serveur, torch
        couches = ia_serveur.charger(open(os.path.join(ENTREE, "sr.bin"), "rb").read(), 0.5, device=f"cuda:{gpu}")
        def f(rgb, s):
            t = torch.from_numpy(np.ascontiguousarray(rgb)).to(f"cuda:{gpu}")[None]
            return ia_serveur.traiter(couches, t, s)[0].cpu().numpy()
        return f
    except Exception as e:
        journal("agrandissement indisponible :", e)
        return None


# ---------------------------------------------------------------- un décor de scène
def traiter_travail(t, gen, agr):
    i = t["id"]
    rgba = np.asarray(Image.open(os.path.join(ENTREE, f"plaque_{i}.png")).convert("RGBA"))
    a_faire = np.asarray(Image.open(os.path.join(ENTREE, f"trou_{i}.png")).convert("L")) > 127
    h, w = a_faire.shape
    if rgba.shape[:2] != (h, w) or (w, h) != (t["w"], t["h"]):
        raise ValueError(f"décor {i} : tailles incohérentes")
    rgb = rgba[..., :3].copy()
    connu = rgba[..., 3] > 250
    reste = a_faire & ~connu
    invente = np.zeros((h, w), bool)
    for k, f in enumerate(t["fenetres"]):
        x, y, fw, fh = int(f["x"]), int(f["y"]), int(f["w"]), int(f["h"])
        tr = reste[y:y + fh, x:x + fw]
        if tr.sum() < 16:
            continue
        cr = rgb[y:y + fh, x:x + fw]
        ebauche = pre_remplir(cr, ~(connu[y:y + fh, x:x + fw] | invente[y:y + fh, x:x + fw]))
        sortie = gen.remplir(ebauche, tr, P.get("graine", 7) * 1000 + k)
        sortie = raccord_couleur(sortie, cr, tr, connu[y:y + fh, x:x + fw] | invente[y:y + fh, x:x + fw])
        cr[tr] = sortie[tr]
        invente[y:y + fh, x:x + fw] |= tr
        reste[y:y + fh, x:x + fw] &= ~tr
        journal(f"décor {i} : fenêtre {k + 1}/{len(t['fenetres'])} ({int(tr.sum())} px)")
        if time.time() - T0 > DUREE_MAX_S:
            raise TimeoutError("temps Kaggle presque écoulé")
    # pixels à inventer qu'aucune fenêtre ne couvrait : prolongement doux du voisin (rare : coins éloignés)
    if reste.any():
        rgb = pre_remplir(rgb, reste); invente |= reste
    s = float(t.get("echelle", 1))
    if s > 1.05 and agr is not None:
        # on agrandit la zone utile (inventée + 24 px de contexte), pas toute la plaque
        ys, xs = np.nonzero(invente)
        y0, y1, x0, x1 = max(0, ys.min() - 24), min(h, ys.max() + 25), max(0, xs.min() - 24), min(w, xs.max() + 25)
        s = min(4.0, s)
        big = agr(rgb[y0:y1, x0:x1], s)
        Wb, Hb = round(w * s), round(h * s)
        full = np.asarray(Image.fromarray(rgb).resize((Wb, Hb), Image.LANCZOS)).copy()
        X0, Y0 = round(x0 * s), round(y0 * s)
        full[Y0:Y0 + big.shape[0], X0:X0 + big.shape[1]] = big[:Hb - Y0, :Wb - X0]
        masque = np.asarray(Image.fromarray(invente.astype(np.uint8) * 255).resize((Wb, Hb), Image.BILINEAR)) > 127
        rgb, invente, echelle = full, masque, s
    else:
        echelle = 1.0
    ys, xs = np.nonzero(invente)
    if not len(ys):
        return {"id": i, "w": 0, "h": 0, "pixels": 0}
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return {"id": i, "echelle": echelle, "x": int(x0), "y": int(y0), "w": int(x1 - x0), "h": int(y1 - y0),
            "W": int(rgb.shape[1]), "H": int(rgb.shape[0]), "pixels": int(invente.sum()),
            "jpeg": b64_jpeg(rgb[y0:y1, x0:x1]), "alpha": b64_png((invente[y0:y1, x0:x1] * 255).astype(np.uint8))}


def main():
    travaux = list(P.get("travaux", []))
    INFO["demandes"] = len(travaux)
    try:
        import torch
        ng = torch.cuda.device_count() if not FAUX else 1
    except Exception:
        ng = 1 if FAUX else 0
    if ng == 0:
        raise RuntimeError("aucune carte graphique")
    ng = max(1, min(ng, 2, len(travaux) or 1))
    resultats, erreurs, verrou = {}, [], threading.Lock()

    def ouvrier(g):
        try:
            gen = Generateur(g); agr = agrandisseur(g)
        except Exception as e:
            with verrou: erreurs.append(f"carte {g} : {e}")
            return
        while True:
            with verrou:
                if not travaux: return
                t = travaux.pop(0)
            try:
                r = traiter_travail(t, gen, agr)
                with verrou: resultats[t["id"]] = r
            except Exception as e:
                traceback.print_exc()
                with verrou: erreurs.append(f"décor {t['id']} : {e}")

    fils = [threading.Thread(target=ouvrier, args=(g,)) for g in range(ng)]
    [f.start() for f in fils]; [f.join() for f in fils]
    INFO["travaux"] = [resultats[t["id"]] for t in P.get("travaux", []) if t["id"] in resultats]
    INFO["erreurs"] = erreurs
    INFO["ok"] = len(INFO["travaux"]) == len(P.get("travaux", []))
    INFO["cartes"] = ng


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        traceback.print_exc()
        INFO["ok"] = False; INFO["repli"] = str(e)
    INFO["duree_s"] = round(time.time() - T0, 1)
    ecrire_info()
    journal("terminé", "ok" if INFO["ok"] else "échec", INFO.get("erreurs") or INFO.get("repli") or "")
