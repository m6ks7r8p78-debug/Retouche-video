# F14 — vidéo de visage de test (vérité connue) et mesure des vidéos exportées par l'app.
#   python3 tests/visage_ia/video_visage.py creer                 → tests/medias/visage_video.mp4 + tests/sorties/f14_gt/*.png
#   PYTHONPATH=tests/visage_ia/faux python3 tests/visage_ia/video_visage.py mesurer a.mp4 b.mp4 …   → LPIPS / PSNR / scintillement du visage
# Même séquence que tests/visage_ia/banc_video.py (portrait NASA du domaine public, mouvement lisse connu, 30 images/s,
# dégradation « vieux téléphone » différente à chaque image). Ne vaut pas validation sur vraies vidéos ni sur iPhone.
import cv2, numpy as np, os, sys, glob, subprocess, json, tempfile
ICI = os.path.dirname(os.path.abspath(__file__)); YU = os.path.join(ICI, '../../modeles/yunet.onnx')
GT = os.path.join(ICI, '../sorties/f14_gt'); VID = os.path.join(ICI, '../medias/visage_video.mp4'); NF = 36
T = np.array([[192.98138,239.94708],[318.90277,240.1936],[256.63416,314.01935],[201.26117,371.41043],[313.08905,371.15118]],np.float32)
yy, xx = np.mgrid[0:512, 0:512]; r = np.sqrt(((xx - 256) / 236.) ** 2 + ((yy - 286) / 250.) ** 2); m = np.minimum.reduce([xx, yy, 511 - xx, 511 - yy])
ALPHA = (np.clip((1.12 - r) / .22, 0, 1) * np.clip(m / 24., 0, 1)).astype(np.float32)
def detecter(img):
    h, w = img.shape[:2]; d = cv2.FaceDetectorYN.create(YU, '', (w, h), 0.5, 0.3, 5000); _, f = d.detect(img)
    if f is None: return None
    f = f[np.argmax(f[:, 2] * f[:, 3])]; return f[4:14].reshape(5, 2).astype(np.float32)
def creer():
    rng = np.random.default_rng(11); img = cv2.imread(sorted(glob.glob(os.path.join(ICI, '../medias/visages_dp/*.jpg')))[1])
    p = detecter(img); c = p.mean(0); W, H = 360, 480; os.makedirs(GT, exist_ok=True); tmp = tempfile.mkdtemp()
    for t in range(NF):
        u = t / 120.; ang = 6 * np.sin(2 * np.pi * u); sc = 0.55 * (1 + .08 * np.sin(np.pi * u)); dx = 30 * np.sin(2 * np.pi * u * .7); dy = 12 * np.cos(2 * np.pi * u)
        M = cv2.getRotationMatrix2D((float(c[0]), float(c[1])), ang, sc); M[:, 2] += [W / 2 - c[0] + dx, H / 2 - c[1] + dy]
        g = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT); cv2.imwrite(os.path.join(GT, f'{t:03d}.png'), g)
        s = cv2.resize(cv2.GaussianBlur(g, (0, 0), 1.0), (W // 3, H // 3), interpolation=cv2.INTER_AREA).astype(np.float32)
        s = np.clip(s + rng.normal(0, 4, s.shape), 0, 255).astype(np.uint8); s = cv2.imdecode(cv2.imencode('.jpg', s, [cv2.IMWRITE_JPEG_QUALITY, 30])[1], 1)
        cv2.imwrite(os.path.join(tmp, f'{t:03d}.png'), cv2.resize(s, (W, H), interpolation=cv2.INTER_CUBIC))
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-framerate', '30', '-i', os.path.join(tmp, '%03d.png'), '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100',
                    '-t', str(NF / 30), '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', VID], check=True)   # avec son, comme les autres médias de test
    print('créé', VID, NF, 'images')
def images(f, w, h):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-vf', f'scale={w}:{h}:flags=bicubic', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.uint8); return a.reshape(-1, h, w, 3)
def mesurer(fichiers):
    import lpips, torch; L = lpips.LPIPS(net='alex', verbose=False)
    G = [cv2.imread(f) for f in sorted(glob.glob(os.path.join(GT, '*.png')))]; h, w = G[0].shape[:2]
    Ms = [cv2.estimateAffinePartial2D(detecter(g), T, method=cv2.LMEDS)[0] for g in G]; zone = (ALPHA > .5)[..., None]
    A = lambda f, M: cv2.warpAffine(f, M, (512, 512), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT).astype(np.float32)
    t2 = lambda z: torch.from_numpy(cv2.cvtColor(np.clip(z, 0, 255).astype(np.uint8), cv2.COLOR_BGR2RGB).transpose(2, 0, 1)[None].astype(np.float32) / 127.5 - 1)
    GA = [A(g, M) for g, M in zip(G, Ms)]; res = {}
    for f in fichiers:
        O = images(f, w, h); n = min(len(O), len(G)); OA = [A(O[i], Ms[i]) for i in range(n)]
        with torch.no_grad(): lp = float(np.mean([float(L(t2(OA[i] * zone), t2(GA[i] * zone))) for i in range(n)]))
        ps = float(np.mean([10 * np.log10(255 ** 2 / ((OA[i] - GA[i]) ** 2)[np.broadcast_to(zone, OA[i].shape)].mean()) for i in range(n)]))
        sc = float(np.mean([np.abs((OA[i] - OA[i - 1]) - (GA[i] - GA[i - 1]))[np.broadcast_to(zone, GA[i].shape)].mean() for i in range(1, n)]))
        res[os.path.basename(f)] = {'images': n, 'lpips': round(lp, 4), 'psnr': round(ps, 2), 'scintillement': round(sc, 3)}
    print(json.dumps(res, ensure_ascii=False)); return res
if __name__ == '__main__':
    creer() if sys.argv[1] == 'creer' else mesurer(sys.argv[2:])
