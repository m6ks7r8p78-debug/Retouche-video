import numpy as np, cv2, torch, lpips, iak, sys
from verrou import verrou
torch.set_grad_enabled(False)
L = lpips.LPIPS(net="alex", verbose=False)
z = np.load(sys.argv[1] if len(sys.argv)>1 else "portrait.npz"); src, ia, hr = z["src"], z["ia"], z["hr"]; H, W = ia.shape[1:3]; n = len(src)
T = lambda x: torch.from_numpy(np.ascontiguousarray(x)).permute(2, 0, 1)[None].float() / 127.5 - 1
idx = list(range(0, n, 3))
lp = lambda S: float(np.mean([L(T(S[i]), T(hr[i])).item() for i in idx]))
psnr = lambda S: np.mean([10 * np.log10(255 ** 2 / ((S[i].astype(np.float32) - hr[i].astype(np.float32)) ** 2).mean()) for i in idx])
bic = [cv2.resize(f, (W, H), interpolation=cv2.INTER_CUBIC) for f in src]
iak.KMAX = 8; k = {"i": 0}; e = iak.IAK(lambda f: ia[k["i"]]); kk = []
for i in range(n): k["i"] = i; kk.append(e.frame(src[i]))
for nom, S in [("bicubique", bic), ("IA complète", list(ia)), ("IA complète + verrou", [verrou(a, s) for a, s in zip(ia, src)]),
               ("IA clés K8", kk), ("IA clés K8 + verrou", [verrou(a, s) for a, s in zip(kk, src)])]:
    print(f"{nom:22s} LPIPS {lp(S):.4f} (plus bas = plus proche de la vraie image)  PSNR {psnr(S):.2f}")
