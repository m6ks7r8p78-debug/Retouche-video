# v10.2 : données pour entraîner un petit réseau dédié à la 2e passe de la cascade.
# vidéo libre (jamais celles du banc cascade.py) -> HR ; réduite ×4 (filtre au hasard) -> H.264 (CRF 20–33, bruit parfois) -> LR ;
# MID = 1re passe de l'app sur LR (×2) ; le petit réseau apprend MID -> HR.
import subprocess, numpy as np, cv2, random, sys, torch
random.seed(7); torch.set_grad_enabled(False); torch.set_num_threads(2)
sys.path.insert(0, "/home/claude/retouche-video/serveur-ia"); import ia_serveur as IA
app = IA.charger(open("/home/claude/retouche-video/sr.bin", "rb").read(), 0.3, device="cpu", demi=False)
ia = lambda l: IA.traiter(app, torch.from_numpy(np.ascontiguousarray(l[..., ::-1]))[None], 2.0, demi=False)[0].numpy()[..., ::-1]
S = "/home/claude/medias_src/iv/"
import os, glob
PX = sorted(glob.glob("/home/claude/pexels/*.mp4"))   # vidéos Pexels (licence Pexels : usage commercial libre), HF minh132/pexels-videos
MODE = sys.argv[1] if len(sys.argv) > 1 else "train"
vids = ["fruit-and-vegetable-detection", "people-detection", "person-bicycle-car-detection", "one-by-one-person-detection", "car-detection",
        "head-pose-face-detection-female", "head-pose-face-detection-male", "bottle-detection", "bolt-detection",
        "face-demographics-walking-and-pause", "store-aisle-detection", "head-pose-face-detection-female-and-male", "face-demographics-walking"]
vids = [S + v + ".mp4" for v in vids] + PX[:30]
if MODE == "val": vids = PX[30:]
NB = 10 if MODE == "train" else 2
def run(c): return subprocess.run(c, capture_output=True, text=False).stdout
MID, HR, LRS = [], [], []
for v in vids:
    f = v; dur = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]))
    W, H = map(int, run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", f]).decode().split(","))
    w = min(W, 960) // 16 * 16; h = (w * H // W) // 16 * 16
    for k in range(NB if f.startswith(S) or MODE == 'val' else 6):
        t = random.uniform(0, dur - 1)
        hr = cv2.imdecode(np.frombuffer(run(["ffmpeg", "-loglevel", "error", "-ss", str(t), "-i", f, "-frames:v", "1", "-vf", f"scale={w}:{h}:flags=area", "-f", "image2pipe", "-vcodec", "png", "-"]), np.uint8), 1)
        cv2.imwrite("/tmp/h.png", hr)
        vf = f"scale={w//4}:{h//4}:flags={random.choice(['area','bicubic','bilinear','lanczos'])}" + (f",noise=alls={random.randint(3,10)}:allf=t" if random.random() < .35 else "")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", "/tmp/h.png", "-t", "0.2", "-vf", vf, "-c:v", "libx264", "-crf", str(random.choice([20, 24, 27, 30, 33])), "-pix_fmt", "yuv420p", "/tmp/l.mp4"])
        lr = cv2.imdecode(np.frombuffer(run(["ffmpeg", "-loglevel", "error", "-i", "/tmp/l.mp4", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"]), np.uint8), 1)
        MID.append(ia(lr)); HR.append(hr); LRS.append(lr)
    print(os.path.basename(v), len(HR), flush=True)
np.savez("casc_paires.npz" if MODE == "train" else "casc_val.npz", mid=np.array(MID + [None], dtype=object)[:-1], hr=np.array(HR + [None], dtype=object)[:-1], lr=np.array(LRS + [None], dtype=object)[:-1], allow_pickle=True)
