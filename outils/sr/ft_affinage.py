import numpy as np, cv2, torch, spandrel, lpips, random, time, warnings, sys
warnings.filterwarnings("ignore"); torch.set_num_threads(2); random.seed(0); torch.manual_seed(0)
z = np.load("paires.npz", allow_pickle=True); P = []
for i in range(len(z["hr"])):
    h, l = z["hr"][i], z["lr"][i]; d = cv2.resize(h, (l.shape[1], l.shape[0]), interpolation=cv2.INTER_AREA).astype(float)
    p = lambda a: 10 * np.log10(255 ** 2 / ((a.astype(float) - d) ** 2).mean() + 1e-9)
    if p(l) >= 26: P.append((h[..., ::-1].copy(), l[..., ::-1].copy()))
print("paires gardées", len(P), "/", len(z["hr"]))
m = spandrel.ModelLoader().load_from_file("/home/claude/sr/2xNomosUni_compact_multijpg.safetensors").model.float().train()
L = lpips.LPIPS(net="alex", verbose=False).eval()
for q in L.parameters(): q.requires_grad = False
opt = torch.optim.Adam(m.parameters(), lr=float(sys.argv[2]) if len(sys.argv) > 2 else 2e-5)
D = np.load("/home/claude/sr/donnees.npy", allow_pickle=True)
T = lambda x: torch.from_numpy(np.ascontiguousarray(x[..., ::-1])).permute(2, 0, 1)[None].float() / 127.5 - 1
def banc():
    m.eval(); r = []
    with torch.no_grad():
        for l, h, _ in D:
            x = torch.from_numpy(np.ascontiguousarray(l[..., ::-1])).permute(2, 0, 1)[None].float() / 255
            o = (m(x)[0].permute(1, 2, 0).clamp(0, 1).numpy() * 255 + .5).astype(np.uint8)[..., ::-1][:h.shape[0], :h.shape[1]]
            r.append(L(T(o), T(h)).item())
    m.train(); return float(np.mean(r))
print("départ", round(banc(), 4), flush=True)
S, B = 64, 8; pas = int(sys.argv[1]); t0 = time.time(); best = 9
for it in range(1, pas + 1):
    xb, yb = [], []
    for _ in range(B):
        h, l = random.choice(P); y = random.randint(0, l.shape[0] - S); x = random.randint(0, l.shape[1] - S)
        a, b = l[y:y + S, x:x + S], h[2 * y:2 * y + 2 * S, 2 * x:2 * x + 2 * S]
        if random.random() < .5: a, b = a[:, ::-1], b[:, ::-1]
        xb.append(torch.from_numpy(a.copy()).permute(2, 0, 1)); yb.append(torch.from_numpy(b.copy()).permute(2, 0, 1))
    xb = torch.stack(xb).float() / 255; yb = torch.stack(yb).float() / 255
    o = m(xb); loss = .1 * (o - yb).abs().mean() + L(o * 2 - 1, yb * 2 - 1).mean()
    opt.zero_grad(); loss.backward(); opt.step()
    if it % 250 == 0:
        s = banc(); print(f"pas {it} perte {loss.item():.4f} banc LPIPS {s:.4f} ({time.time() - t0:.0f} s)", flush=True)
        if s < best: best = s; torch.save(m.state_dict(), "meilleur.pt")
print("meilleur", best)
