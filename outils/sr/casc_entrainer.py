# v10.2 : petit réseau ×2 (SRVGG compact, nf=32, 8 couches : ~8 fois moins de calcul par pixel que celui de l'app)
# pour la 2e passe de la cascade. Apprend MID (1re passe de l'app) -> HR. Évalué sur le banc cascade.py (vidéos jamais vues).
import sys, numpy as np, cv2, torch, torch.nn as nn, torch.nn.functional as F, lpips, random, time, warnings
warnings.filterwarnings("ignore"); torch.set_num_threads(2); random.seed(0); torch.manual_seed(0)
NF, NC, IT = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]); NOM = f"casc2_nf{NF}_nc{NC}" + (sys.argv[5] if len(sys.argv) > 5 else "")
class Net(nn.Module):
    def __init__(s):
        super().__init__(); L = [nn.Conv2d(3, NF, 3, 1, 1), nn.PReLU(NF)]
        for _ in range(NC): L += [nn.Conv2d(NF, NF, 3, 1, 1), nn.PReLU(NF)]
        L += [nn.Conv2d(NF, 12, 3, 1, 1)]; s.b = nn.Sequential(*L); nn.init.zeros_(s.b[-1].weight); nn.init.zeros_(s.b[-1].bias)
    def forward(s, x): return F.pixel_shuffle(s.b(x), 2) + F.interpolate(x, scale_factor=2, mode="nearest")
net = Net(); Lp = lpips.LPIPS(net="alex", verbose=False)
for p in Lp.parameters(): p.requires_grad_(False)
D = np.load("casc_paires.npz", allow_pickle=True); MID, HR = [np.asarray(x, np.uint8) for x in D["mid"]], [np.asarray(x, np.uint8) for x in D["hr"]]
tt = lambda a: torch.from_numpy(np.ascontiguousarray(np.asarray(a, dtype=np.uint8)[..., ::-1])).permute(2, 0, 1).float() / 255
# banc (vidéos jamais vues) : MID calculé par l'app une fois pour toutes
B = np.load("casc_banc.npz", allow_pickle=True); V = np.load("casc_val.npz", allow_pickle=True)
JEUX = [(B["mid"], B["hr"], .2578), (V["mid"], V["hr"], .2975)]   # référence : cascade v10.1 (grand réseau deux fois)
def evalue():
    net.eval(); res = []
    with torch.no_grad():
        for MM, HH, ref in JEUX:
            r = []
            for m, h in zip(MM, HH):
                o = net(tt(m)[None]).clamp(0, 1); o = (o * 255 + .5).floor() / 255
                r.append(Lp(o * 2 - 1, tt(h)[None] * 2 - 1).item())
            res.append(float(np.mean(r)))
    net.train(); return res
opt = torch.optim.Adam(net.parameters(), float(sys.argv[4]) if len(sys.argv) > 4 else 5e-4); sch = torch.optim.lr_scheduler.CosineAnnealingLR(opt, IT, 1e-6)
P, BS = 48, 12; t0 = time.time(); best = 9
print(NOM, "départ", [round(x, 4) for x in evalue()], flush=True)
for it in range(1, IT + 1):
    xs, ys = [], []
    for _ in range(BS):
        k = random.randrange(len(MID)); m, h = MID[k], HR[k]; H_, W_ = m.shape[:2]
        y0, x0 = random.randrange(H_ - P), random.randrange(W_ - P)
        a, b = tt(m[y0:y0 + P, x0:x0 + P]), tt(h[2 * y0:2 * y0 + 2 * P, 2 * x0:2 * x0 + 2 * P])
        if random.random() < .5: a, b = a.flip(2), b.flip(2)
        if random.random() < .5: a, b = a.flip(1), b.flip(1)
        if random.random() < .5: a, b = a.transpose(1, 2), b.transpose(1, 2)
        xs.append(a); ys.append(b)
    x, y = torch.stack(xs), torch.stack(ys); o = net(x)
    loss = F.l1_loss(o, y) + .3 * Lp(o.clamp(0, 1) * 2 - 1, y * 2 - 1).mean()
    opt.zero_grad(); loss.backward(); opt.step(); sch.step()
    if it % 250 == 0:
        e = evalue(); sc = np.mean([x / j[2] for x, j in zip(e, JEUX)])
        print(it, round(loss.item(), 4), "banc/val", [round(x, 4) for x in e], "rapport", round(sc, 4), f"{time.time() - t0:.0f}s", flush=True)
        if sc < best: best = sc; torch.save(net.state_dict(), NOM + ".pt")
print("meilleur", round(best, 4))
