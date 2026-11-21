# Vérité terrain : vidéo HD -> réduite ×2 -> compressée (comme un vieux téléphone) ; la HD réduite à la taille ×2 est la vérité
import subprocess, numpy as np, cv2, os, glob
srcs = [("/home/claude/medias_src/iv/head-pose-face-detection-female-and-male.mp4", [10, 60]),
        ("/home/claude/medias_src/iv/classroom.mp4", [5, 30]), ("/home/claude/medias_src/iv/store-aisle-detection.mp4", [8, 40]),
        ("/home/claude/medias_src/iv/face-demographics-walking.mp4", [10, 50]),
        ("/home/claude/retouche-video/tests/medias/video_portrait.mp4", [0.5, 2.5])]
out = []
for f, ts in srcs:
    for crf in (24, 30):
        for t in ts:
            hr = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", str(t), "-i", f, "-frames:v", "1", "-vf", "scale='trunc(min(iw\\,960)/4)*4':-4:flags=area", "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True).stdout
            H = cv2.imdecode(np.frombuffer(hr, np.uint8), 1); h, w = H.shape[:2]
            cv2.imwrite("/tmp/h.png", H)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", "/tmp/h.png", "-t", "0.2", "-vf", f"scale={w//2}:{h//2}:flags=area", "-c:v", "libx264", "-crf", str(crf), "-pix_fmt", "yuv420p", "/tmp/l.mp4"])
            l = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", "/tmp/l.mp4", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True).stdout
            out.append((cv2.imdecode(np.frombuffer(l, np.uint8), 1), H, f"{os.path.basename(f)[:10]}_{t}_crf{crf}"))
np.save("donnees.npy", np.array(out, dtype=object), allow_pickle=True); print(len(out), [o[0].shape for o in out[:3]])
