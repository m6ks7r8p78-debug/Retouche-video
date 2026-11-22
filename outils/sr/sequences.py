import subprocess, numpy as np, cv2
def lire(cmd, w, h):
    raw = subprocess.run(cmd, capture_output=True).stdout; n = len(raw) // (w * h * 3)
    return np.frombuffer(raw[:n * w * h * 3], np.uint8).reshape(n, h, w, 3)
srcs = [("/home/claude/medias_src/iv/head-pose-face-detection-female-and-male.mp4", 10, 768), ("/home/claude/medias_src/iv/classroom.mp4", 5, 960),
        ("/home/claude/medias_src/iv/store-aisle-detection.mp4", 8, 720), ("/home/claude/medias_src/iv/face-demographics-walking.mp4", 10, 768),
        ("/home/claude/retouche-video/tests/medias/video_portrait.mp4", 0.5, 540)]
S = []
for f, t, w in srcs:
    w -= w % 8
    hr0 = lire(["ffmpeg", "-loglevel", "error", "-ss", str(t), "-t", "1", "-i", f, "-vf", f"scale={w}:-8:flags=area", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], w, 0 or 1)
    h = int(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=height,width", "-of", "csv=p=0", f], capture_output=True, text=True).stdout.split(",")[1])
    W0 = int(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=width", "-of", "csv=p=0", f], capture_output=True, text=True).stdout)
    H = (h * w // W0) // 8 * 8
    for crf in (24, 30):
        hr = lire(["ffmpeg", "-loglevel", "error", "-ss", str(t), "-t", "1", "-i", f, "-vf", f"scale={w}:{H}:flags=area", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], w, H)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(t), "-t", "1", "-i", f, "-vf", f"scale={w}:{H}:flags=area,scale={w//2}:{H//2}:flags=area", "-c:v", "libx264", "-crf", str(crf), "/tmp/s.mp4"])
        lr = lire(["ffmpeg", "-loglevel", "error", "-i", "/tmp/s.mp4", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], w // 2, H // 2)
        n = min(len(hr), len(lr)); S.append((lr[:n], hr[:n], f.split("/")[-1][:10] + f"_crf{crf}"))
        print(S[-1][2], n, lr.shape)
np.save("seq.npy", np.array(S, dtype=object), allow_pickle=True)
