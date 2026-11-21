import sys, numpy as np, cv2, torch, spandrel, lpips, warnings
warnings.filterwarnings("ignore"); torch.set_grad_enabled(False)
exec(open("banc_sr.py").read().split("meth = {")[0])
mods = {"app": f_app, "compact": charge("2xNomosUni_compact_multijpg.safetensors")}
def ssim(a, b):
    a = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float64); b = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float64)
    k = (11, 11); C1, C2 = 6.5025, 58.5225; ma, mb = cv2.GaussianBlur(a, k, 1.5), cv2.GaussianBlur(b, k, 1.5)
    va = cv2.GaussianBlur(a * a, k, 1.5) - ma * ma; vb = cv2.GaussianBlur(b * b, k, 1.5) - mb * mb; c = cv2.GaussianBlur(a * b, k, 1.5) - ma * mb
    return float((((2 * ma * mb + C1) * (2 * c + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2))).mean())
for nom, f in mods.items():
    ok = 0; rows = []
    for l, h, n in D:
        o = f(l)[:h.shape[0], :h.shape[1]]; vrai = L(T(f_bic(l)[:h.shape[0], :h.shape[1]]), T(h)).item() - L(T(o), T(h)).item()  # >0 : l'IA aide vraiment
        H, W = l.shape[:2]; H -= H % 2; W -= W % 2; ll = l[:H, :W]; d = cv2.resize(ll, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
        e_ssim = ssim(f(d)[:H, :W], ll) - ssim(f_bic(d), ll)
        e_lp = L(T(f_bic(d)), T(ll)).item() - L(T(f(d)[:H, :W]), T(ll)).item()
        rows.append((n, vrai, e_ssim, e_lp))
    print(nom)
    for n, v, es, el in rows: print(f"  {n:28s} vrai gain LPIPS {v:+.4f}  épreuve SSIM {es:+.4f}  épreuve LPIPS {el:+.4f}")

def gmsd(a, b):
    a = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float64); b = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float64)
    g = lambda x: np.hypot(cv2.Sobel(x, cv2.CV_64F, 1, 0, ksize=3), cv2.Sobel(x, cv2.CV_64F, 0, 1, ksize=3)) / 4
    ga, gb = g(a), g(b); c = 170 * .0025 * 255 ** 2 / 255 ** 2 * 1.0; c = 170.0 / 255 * 255 / 255 * 0 + 30
    q = (2 * ga * gb + c) / (ga * ga + gb * gb + c); return float(q.std())
print("--- GMSD (plus bas = mieux)")
for nom, f in mods.items():
    acc = 0
    for l, h, n in D:
        o = f(l)[:h.shape[0], :h.shape[1]]; vrai = L(T(f_bic(l)[:h.shape[0], :h.shape[1]]), T(h)).item() - L(T(o), T(h)).item()
        H, W = l.shape[:2]; H -= H % 2; W -= W % 2; ll = l[:H, :W]; d = cv2.resize(ll, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
        eg = gmsd(f_bic(d), ll) - gmsd(f(d)[:H, :W], ll); acc += (eg > 0) == (vrai > 0)
        print(f"  {nom} {n:26s} vrai {vrai:+.4f} épreuve GMSD {eg:+.4f}")
    print(nom, "accord", acc, "/", len(D))
