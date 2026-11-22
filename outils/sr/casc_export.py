# v10.2 : petit réseau entraîné (×2, 12 sorties) -> sr2.bin de l'app (FP16, un seul jeu, sortie posée dans la grille ×4 : 48 sorties,
# chaque point ×2 recopié en bloc 2×2) ; vérifie que ia_serveur (= sr.js) donne la même image que PyTorch.
import sys, numpy as np, torch, torch.nn.functional as F, hashlib
sys.path.insert(0, "/home/claude/retouche-video/serveur-ia"); import ia_serveur as IA
pt, out = sys.argv[1], sys.argv[2]; sd = torch.load(pt); NF = sd["b.0.weight"].shape[0]
idx = sorted({int(k.split(".")[1]) for k in sd}); vals = []
for i in idx:
    if f"b.{i}.bias" in sd:                                   # convolution
        w, b = sd[f"b.{i}.weight"], sd[f"b.{i}.bias"]
        if w.shape[0] == 12:                                   # dernière couche : ×2 -> grille ×4
            m = [ch * 4 + (sy // 2) * 2 + (sx // 2) for ch in range(3) for sy in range(4) for sx in range(4)]
            w, b = w[m], b[m]
        vals += [w.flatten(), b.flatten()]
        a = f"b.{i + 1}.weight"
        if a in sd and sd[a].dim() == 1: vals.append(sd[a].flatten())
v = torch.cat(vals).numpy().astype(np.float16); v.tofile(out)
print(out, v.size * 2, "octets, sha256", hashlib.sha256(v.tobytes()).hexdigest())
# contrôle : même image que le réseau PyTorch
sys.argv = [sys.argv[0], "32", "8", "0"]; NFs = NF
import importlib.util
class Net(torch.nn.Module):
    def __init__(s, nc):
        super().__init__(); L = [torch.nn.Conv2d(3, NF, 3, 1, 1), torch.nn.PReLU(NF)]
        for _ in range(nc): L += [torch.nn.Conv2d(NF, NF, 3, 1, 1), torch.nn.PReLU(NF)]
        L += [torch.nn.Conv2d(NF, 12, 3, 1, 1)]; s.b = torch.nn.Sequential(*L)
    def forward(s, x): return F.pixel_shuffle(s.b(x), 2) + F.interpolate(x, scale_factor=2, mode="nearest")
nc = (len(idx) - 3) // 2; net = Net(nc); net.load_state_dict(sd); net.eval()
x = (torch.rand(1, 60, 80, 3) * 255).to(torch.uint8)
with torch.no_grad():
    ref = (net(x.permute(0, 3, 1, 2).float() / 255).clamp(0, 1) * 255 + .5).floor()
    c = IA.charger(open(out, "rb").read(), .3, device="cpu", demi=False, nf=NF, paires=1)
    o = IA.traiter(c, x, 2.0, demi=False).permute(0, 3, 1, 2).float()
print("nf", NF, "couches", nc, "écart max avec PyTorch :", (o - ref).abs().max().item())
