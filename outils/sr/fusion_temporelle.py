import numpy as np, cv2, torch, spandrel, lpips, warnings
warnings.filterwarnings("ignore"); torch.set_grad_enabled(False); torch.set_num_threads(2)
L = lpips.LPIPS(net="alex", verbose=False); S = np.load("seq.npy", allow_pickle=True)
T = lambda x: torch.from_numpy(np.ascontiguousarray(x[..., ::-1])).permute(2, 0, 1)[None].float() / 127.5 - 1
m = spandrel.ModelLoader().load_from_file("2xNomosUni_compact_multijpg.safetensors").model.eval()
def sr(l):
    x = torch.from_numpy(np.ascontiguousarray(l[..., ::-1])).permute(2, 0, 1)[None].float() / 255
    return (m(x)[0].permute(1, 2, 0).clamp(0, 1).numpy() * 255 + .5).astype(np.uint8)[..., ::-1]
def aligne(ref, src):
    g = lambda x: cv2.cvtColor(x, cv2.COLOR_BGR2GRAY)
    f = cv2.calcOpticalFlowFarneback(g(ref), g(src), None, .5, 3, 15, 3, 5, 1.2, 0); h, w = ref.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    return cv2.remap(src, xx + f[..., 0], yy + f[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
def fusion(lr, i, R, tau):
    ref = lr[i].astype(np.float32); acc = ref.copy(); ws = np.ones(ref.shape[:2] + (1,), np.float32)
    for d in range(-R, R + 1):
        j = i + d
        if d == 0 or j < 0 or j >= len(lr): continue
        a = aligne(lr[i], lr[j]).astype(np.float32); e = cv2.GaussianBlur(np.abs(a - ref).mean(2), (5, 5), 1)[..., None]
        w = np.exp(-(e / tau) ** 2); acc += w * a; ws += w
    return np.clip(acc / ws, 0, 255).astype(np.uint8)
for nom, R, tau in [("une image", 0, 1), ("fusion ±1", 1, 6), ("fusion ±2", 2, 6), ("fusion ±2 τ10", 2, 10)]:
    r = []; pr = []
    for lr, hr, n in S:
        for i in (len(lr) // 3, len(lr) // 2, 2 * len(lr) // 3):
            x = lr[i] if R == 0 else fusion(lr, i, R, tau); o = sr(x)[:hr.shape[1], :hr.shape[2]]
            r.append(L(T(o), T(hr[i])).item()); pr.append(10 * np.log10(255 ** 2 / ((o.astype(float) - hr[i]) ** 2).mean()))
    print(f"{nom:14s} LPIPS {np.mean(r):.4f}  PSNR {np.mean(pr):.2f}", flush=True)
