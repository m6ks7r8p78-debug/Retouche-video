# v10.1 : pour les sources très petites (×4 et plus vers la 4K), l'IA appliquée deux fois (×2 puis ×2) bat-elle
# « IA ×2 puis agrandissement » ? Vérité : image HD 1280 px ; entrée : réduite ×4 puis H.264 (CRF 24 / 30).
import sys, subprocess, numpy as np, cv2, torch, lpips, warnings, time
warnings.filterwarnings("ignore"); torch.set_grad_enabled(False); torch.set_num_threads(2)
sys.path.insert(0, "/home/claude/retouche-video/serveur-ia"); import ia_serveur as IA
L = lpips.LPIPS(net="alex", verbose=False)
T = lambda x: torch.from_numpy(np.ascontiguousarray(x[..., ::-1])).permute(2, 0, 1)[None].float() / 127.5 - 1
S = "/home/claude/medias_src/iv/"
srcs = [(S + "classroom.mp4", [5, 30]), (S + "driver-action-recognition.mp4", [3, 20]), (S + "worker-zone-detection.mp4", [4, 25]),
        (S + "bolt-multi-size-detection.mp4", [2, 15])]
def png(cmd): return cv2.imdecode(np.frombuffer(subprocess.run(cmd, capture_output=True).stdout, np.uint8), 1)
D = []
for f, ts in srcs:
    for t in ts:
        H = png(["ffmpeg", "-loglevel", "error", "-ss", str(t), "-i", f, "-frames:v", "1", "-vf", "scale=1280:720:flags=area", "-f", "image2pipe", "-vcodec", "png", "-"])
        cv2.imwrite("/tmp/h.png", H)
        for crf in (24, 30):
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", "/tmp/h.png", "-t", "0.2", "-vf", "scale=320:180:flags=area", "-c:v", "libx264", "-crf", str(crf), "-pix_fmt", "yuv420p", "/tmp/l.mp4"])
            D.append((png(["ffmpeg", "-loglevel", "error", "-i", "/tmp/l.mp4", "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"]), H))
app = IA.charger(open("/home/claude/retouche-video/sr.bin", "rb").read(), 0.3, device="cpu", demi=False)
def ia(l): return IA.traiter(app, torch.from_numpy(np.ascontiguousarray(l[..., ::-1]))[None], 2.0, demi=False)[0].numpy()[..., ::-1]
up = lambda x, k, m=cv2.INTER_CUBIC: cv2.resize(x, (x.shape[1] * k, x.shape[0] * k), interpolation=m)
def usm(x, a=.5, s=1.0):
    b = cv2.GaussianBlur(x.astype(np.float32), (0, 0), s); return np.clip(x + a * (x - b), 0, 255).astype(np.uint8)
meth = {"bicubique ×4": lambda l: up(l, 4), "IA ×2 + bicubique ×2 (app)": lambda l: up(ia(l), 2),
        "IA ×2 + lanczos ×2": lambda l: up(ia(l), 2, cv2.INTER_LANCZOS4),
        "IA ×2 + bicubique ×2 + netteté": lambda l: usm(up(ia(l), 2), .6, 1.2),
        "IA ×2 puis IA ×2 (cascade)": lambda l: ia(ia(l)),
        "IA sur bicubique ×2 (pré-agrandi)": lambda l: ia(up(l, 2))}
for nom, f in meth.items():
    lp, ps, t = [], [], 0
    for l, h in D:
        t0 = time.time(); o = f(l)[:h.shape[0], :h.shape[1]]; t += time.time() - t0
        lp.append(L(T(o), T(h)).item()); ps.append(10 * np.log10(255 ** 2 / ((o.astype(float) - h) ** 2).mean()))
    print(f"{nom:36s} LPIPS {np.mean(lp):.4f}  PSNR {np.mean(ps):.2f}  {t / len(D):.2f} s", flush=True)
