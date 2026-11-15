import sys, numpy as np, cv2, iak
z = np.load(sys.argv[1]); src, ia, hr = z["src"], z["ia"], z["hr"]; n = len(src); H, W = ia.shape[1:3]
psnr = lambda S: np.mean([10 * np.log10(255 ** 2 / ((a.astype(np.float32) - b.astype(np.float32)) ** 2).mean()) for a, b in zip(S, hr)])
def tflick(S):  # scintillement ajouté : écart image à image de la sortie moins celui de la vérité
    d = lambda X: np.mean([np.abs(X[i].astype(np.float32) - X[i - 1].astype(np.float32)).mean() for i in range(1, n)])
    return d(S) - d(hr)
bic = [cv2.resize(f, (W, H), interpolation=cv2.INTER_CUBIC) for f in src]
print(f"bicubique   PSNR {psnr(bic):.2f}  scint. ajouté {tflick(bic):+.2f}")
print(f"IA complète PSNR {psnr(ia):.2f}  scint. ajouté {tflick(ia):+.2f}  (60/60 images calculées)")
for kmax in [4, 8, 12]:
    iak.KMAX = kmax; k = {"i": 0}; e = iak.IAK(lambda f: ia[k["i"]]); out = []
    for i in range(n): k["i"] = i; out.append(e.frame(src[i]))
    print(f"clés K{kmax:<2d}   PSNR {psnr(out):.2f}  scint. ajouté {tflick(out):+.2f}  ({e.nk}/{n} images calculées, ×{n/e.nk:.1f})")
