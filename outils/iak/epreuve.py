# Auto-épreuve : la vidéo sert elle-même de vérité. Une image est réduite ×2, l'IA la reconstruit, on compare à l'image réelle.
import sys, numpy as np, cv2, torch
sys.path.insert(0, "/home/claude/retouche-video/serveur-ia"); import ia_serveur as IA
from verrou import verrou
m = IA.charger(open("/home/claude/retouche-video/sr.bin", "rb").read(), 0.3, device="cpu", demi=False)
def sr(f): return IA.traiter(m, torch.from_numpy(np.ascontiguousarray(f))[None], 2.0, demi=False)[0].numpy()
def ssim(a, b):
    a = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY).astype(np.float64); b = cv2.cvtColor(b, cv2.COLOR_RGB2GRAY).astype(np.float64)
    k = (11, 11); C1, C2 = 6.5025, 58.5225; ma, mb = cv2.GaussianBlur(a, k, 1.5), cv2.GaussianBlur(b, k, 1.5)
    va = cv2.GaussianBlur(a * a, k, 1.5) - ma * ma; vb = cv2.GaussianBlur(b * b, k, 1.5) - mb * mb; c = cv2.GaussianBlur(a * b, k, 1.5) - ma * mb
    return float((((2 * ma * mb + C1) * (2 * c + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2))).mean())
def psnr(a, b): return 10 * np.log10(255 ** 2 / ((a.astype(np.float32) - b.astype(np.float32)) ** 2).mean())
def epreuve(frames):
    r = []
    for f in frames:
        h, w = f.shape[:2]; h -= h % 2; w -= w % 2; f = f[:h, :w]
        d = cv2.resize(f, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
        b = cv2.resize(d, (w, h), interpolation=cv2.INTER_CUBIC); i = sr(d)[:h, :w]; iv = verrou(i, d)
        r.append((psnr(b, f), psnr(i, f), psnr(iv, f), ssim(b, f), ssim(i, f), ssim(iv, f)))
    r = np.array(r).mean(0)
    print(f"  épreuve : PSNR bic {r[0]:.2f} / IA {r[1]:.2f} / IA+verrou {r[2]:.2f} ; SSIM bic {r[3]:.4f} / IA {r[4]:.4f} / IA+verrou {r[5]:.4f}")
for nom in sys.argv[1:]:
    z = np.load(nom); print(nom); epreuve(z["src"][::10][:4])
