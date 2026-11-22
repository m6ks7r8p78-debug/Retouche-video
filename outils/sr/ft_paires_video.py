# Paires d'entraînement réalistes : clip HD -> réduit ×2 -> VRAI codec vidéo H.264 (images P/B, CRF 20–34), parfois bruit avant compression
import subprocess, numpy as np, cv2, random, os
random.seed(1)
SRC = "/home/claude/medias_src/iv/"
vids = ["driver-action-recognition", "worker-zone-detection", "bolt-multi-size-detection", "fruit-and-vegetable-detection", "people-detection",
        "person-bicycle-car-detection", "one-by-one-person-detection", "car-detection", "head-pose-face-detection-female",
        "head-pose-face-detection-male", "bottle-detection", "bolt-detection", "face-demographics-walking-and-pause"]
def lire(cmd, w, h):
    raw = subprocess.run(cmd, capture_output=True).stdout; n = len(raw) // (w * h * 3)
    return np.frombuffer(raw[:n * w * h * 3], np.uint8).reshape(n, h, w, 3)
HR, LR = [], []
for v in vids:
    f = SRC + v + ".mp4"; dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], capture_output=True, text=True).stdout)
    for k in range(6):
        t = random.uniform(0, dur - 3); crf = random.choice([20, 24, 27, 30, 33]); bruit = random.random() < .4
        w = 640 if "1920" in subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=width", "-of", "csv=p=0", f], capture_output=True, text=True).stdout else 576
        w -= w % 8; h = (w * 9 // 16) // 8 * 8
        hr = lire(["ffmpeg", "-loglevel", "error", "-ss", str(t), "-t", "1", "-i", f, "-vf", f"scale={w}:{h}:flags=area", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], w, h)
        filt = random.choice(["area", "bicubic", "bilinear", "lanczos"])
        vf = f"scale={w//2}:{h//2}:flags={filt}" + (f",noise=alls={random.randint(4,12)}:allf=t" if bruit else "")
        p = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", str(t), "-t", "1", "-i", f, "-vf", f"scale={w}:{h}:flags=area,{vf}", "-c:v", "libx264", "-crf", str(crf), "-preset", random.choice(["veryfast", "medium"]), "-f", "mp4", "-movflags", "frag_keyframe+empty_moov", "-"], capture_output=True).stdout
        lr = lire(["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], w // 2, h // 2) if False else None
        open("/tmp/c.mp4", "wb").write(p)
        lr = lire(["ffmpeg", "-loglevel", "error", "-i", "/tmp/c.mp4", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], w // 2, h // 2)
        n = min(len(hr), len(lr))
        for i in range(0, n, 6): HR.append(hr[i]); LR.append(lr[i])
    print(v, len(HR), flush=True)
np.savez_compressed("paires.npz", hr=np.array(HR, dtype=object), lr=np.array(LR, dtype=object))
