import sys, numpy as np, cv2, torch, spandrel, lpips, warnings, time
warnings.filterwarnings("ignore"); torch.set_grad_enabled(False); torch.set_num_threads(2)
sys.path.insert(0, "/home/claude/retouche-video/serveur-ia"); import ia_serveur as IA
sys.path.insert(0, "/home/claude/iak"); from verrou import verrou
L = lpips.LPIPS(net="alex", verbose=False)
D = np.load("donnees.npy", allow_pickle=True)
T = lambda x: torch.from_numpy(np.ascontiguousarray(x[..., ::-1])).permute(2, 0, 1)[None].float() / 127.5 - 1
app = IA.charger(open("/home/claude/retouche-video/sr.bin", "rb").read(), 0.3, device="cpu", demi=False)
def f_app(l): return IA.traiter(app, torch.from_numpy(np.ascontiguousarray(l[..., ::-1]))[None], 2.0, demi=False)[0].numpy()[..., ::-1]
def f_bic(l): return cv2.resize(l, (l.shape[1] * 2, l.shape[0] * 2), interpolation=cv2.INTER_CUBIC)
def charge(f):
    m = spandrel.ModelLoader().load_from_file(f).model.eval()
    def run(l):
        x = torch.from_numpy(np.ascontiguousarray(l[..., ::-1])).permute(2, 0, 1)[None].float() / 255
        return (m(x)[0].permute(1, 2, 0).clamp(0, 1).numpy() * 255 + .5).astype(np.uint8)[..., ::-1]
    return run
meth = {"bicubique": f_bic, "app (Real-ESRGAN v3)": f_app}
for n in sys.argv[1:]: meth[n.split(".")[0]] = charge(n)
for nom, f in meth.items():
    lp, ps, lv, t = [], [], [], 0
    for l, h, _ in D:
        t0 = time.time(); o = f(l)[:h.shape[0], :h.shape[1]]; t += time.time() - t0
        lp.append(L(T(o), T(h)).item()); ps.append(10 * np.log10(255 ** 2 / ((o.astype(float) - h) ** 2).mean()))
        lv.append(L(T(verrou(o[..., ::-1], l[..., ::-1])[..., ::-1]), T(h)).item())
    print(f"{nom:34s} LPIPS {np.mean(lp):.4f}  +verrou {np.mean(lv):.4f}  PSNR {np.mean(ps):.2f}  {t / len(D):.2f} s/image (CPU)")
