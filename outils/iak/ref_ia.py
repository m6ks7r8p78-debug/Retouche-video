# IA complète image par image (référence) : même réseau et mêmes poids que l'app (sr.bin), sur processeur
import sys, numpy as np, cv2, torch, time
sys.path.insert(0, "/home/claude/retouche-video/serveur-ia"); import ia_serveur as IA
vid, out, n = sys.argv[1], sys.argv[2], int(sys.argv[3])
cap = cv2.VideoCapture(vid); fr = []
while len(fr) < n:
    ok, f = cap.read()
    if not ok: break
    fr.append(f[..., ::-1].copy())
m = IA.charger(open("/home/claude/retouche-video/sr.bin", "rb").read(), 0.3, device="cpu", demi=False)
res = []; t0 = time.time()
for f in fr:
    x = torch.from_numpy(f)[None]
    res.append(IA.traiter(m, x, 2.0, demi=False)[0].numpy())
print("s/image", (time.time() - t0) / len(fr))
np.savez_compressed(out, src=np.array(fr), ia=np.array(res))
