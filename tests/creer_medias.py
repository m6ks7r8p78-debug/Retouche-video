"""Crée les médias de test (python3 tests/creer_medias.py [dossier]).
Sources : images de scikit-image, libres de droits (astronaute : NASA, domaine public ; café, chat : CC0 ; fusée : NASA).
Chaque image est dégradée comme une vieille photo de téléphone (petite, bruitée, très compressée), sombre, ou floue.
Les vidéos sont fabriquées avec FFmpeg (panoramique lent + bruit + compression forte + son).
Les originaux non dégradés (ref_*.png) servent de référence pour mesurer la fidélité."""
import io, os, subprocess, sys
import numpy as np
from PIL import Image, ImageFilter
from skimage import data

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "medias")
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(1)
src = {"visage": data.astronaut(), "cafe": data.coffee(), "chat": data.chelsea(), "fusee": data.rocket()}


def jpeg(im, q):
    b = io.BytesIO(); im.save(b, "JPEG", quality=q); return Image.open(b).convert("RGB")


def degrade(a, kind):
    im = Image.fromarray(a); w, h = im.size
    if kind == "vieuxtel":   # petite, bruitée, très compressée
        im = im.resize((w * 2 // 5, h * 2 // 5), Image.BICUBIC)
        x = np.asarray(im).astype(np.float32) + rng.normal(0, 7, (h * 2 // 5, w * 2 // 5, 3))
        return jpeg(Image.fromarray(np.clip(x, 0, 255).astype(np.uint8)), 22)
    if kind == "sombre":     # sous-exposée, bruitée
        x = np.asarray(im.resize((w // 2, h // 2), Image.BICUBIC)).astype(np.float32) * .35 + rng.normal(0, 4, (h // 2, w // 2, 3))
        return jpeg(Image.fromarray(np.clip(x, 0, 255).astype(np.uint8)), 40)
    if kind == "flou":       # floue, compression moyenne
        return jpeg(im.resize((w // 2, h // 2), Image.BICUBIC).filter(ImageFilter.GaussianBlur(1.6)), 60)


for n, a in src.items():
    Image.fromarray(a).save(f"{out}/ref_{n}.png")
    for k in ["vieuxtel", "sombre", "flou"]:
        degrade(a, k).save(f"{out}/{n}_{k}.jpg", quality=95)
# grande photo type iPhone (12 Mpx, 4032×3024), légèrement bruitée
g = Image.fromarray(src["cafe"]).resize((4032, 3024), Image.LANCZOS)
x = np.asarray(g).astype(np.float32) + rng.normal(0, 2.5, (3024, 4032, 3))
Image.fromarray(np.clip(x, 0, 255).astype(np.uint8)).save(f"{out}/grande_12mpx.jpg", quality=90)
ff = ["ffmpeg", "-loglevel", "error", "-y"]
subprocess.run(ff + ["-loop", "1", "-i", f"{out}/ref_visage.png", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
    "-filter_complex", "[0]scale=1280:-2,crop=960:540:x='(in_w-960)*t/6':y=0,scale=480:270,noise=alls=12:allf=t,format=yuv420p[v]",
    "-map", "[v]", "-map", "1:a", "-t", "6", "-r", "30", "-c:v", "libx264", "-b:v", "250k", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", f"{out}/video_vieuxtel.mp4"], check=True)
subprocess.run(ff + ["-loop", "1", "-i", f"{out}/ref_cafe.png", "-f", "lavfi", "-i", "anoisesrc=a=0.05:c=pink:r=48000",
    "-filter_complex", "[0]scale=-2:1920,crop=1080:1920:x='(in_w-1080)*t/4':y=0,noise=alls=6:allf=t,format=yuv420p[v]",
    "-map", "[v]", "-map", "1:a", "-t", "4", "-r", "30", "-c:v", "libx264", "-crf", "30", "-c:a", "aac", "-movflags", "+faststart", f"{out}/video_portrait.mp4"], check=True)
print("médias créés dans", out)
