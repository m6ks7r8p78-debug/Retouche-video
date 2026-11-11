# Entraîne le petit détecteur d'éléments de filtre AR (segmentation) sur le laboratoire, et l'exporte en ONNX pour l'app.
#   python3 tests/labo_filtres/entrainer_ajouts.py --donnees N --pas K
# Données : vrais visages du domaine public + éléments AR simulés (ajouts.py) avec masque exact ; 30 % d'exemples SANS ajout
# (dont des visages lissés / maquillés) pour apprendre à ne rien signaler. Validation sur des PERSONNES jamais vues à l'entraînement.
import os, sys, json, glob, time, argparse, cv2, numpy as np, torch, torch.nn as nn, torch.nn.functional as F
ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI); import noyau as N, ajouts as A
ap = argparse.ArgumentParser(); ap.add_argument('--donnees', type=int, default=2400); ap.add_argument('--pas', type=int, default=3000)
ap.add_argument('--taille', type=int, default=192); ap.add_argument('--init', default=''); ap.add_argument('--extra', default=''); args = ap.parse_args()
S = args.taille; torch.set_num_threads(os.cpu_count() or 2)
VAL_NOMS = ['Maurer', 'Glover', 'Meir', 'Moghbeli', 'Chari', 'McClain', 'Rubio']

def cadrage(P, r=None):
    """carré autour du visage, assez large pour les oreilles d'animal au-dessus de la tête"""
    o, ux, uy, io = N.repere_visage(P); c = o + uy * io * (.35 + (r.normal(0, .08) if r is not None else 0)); s = io * (4.6 * (r.uniform(.85, 1.15) if r is not None else 1))
    a = np.degrees(np.arctan2(ux[1], ux[0])) + (r.normal(0, 6) if r is not None else 0)
    M = cv2.getRotationMatrix2D((float(c[0]), float(c[1])), a, S / s); M[:, 2] += np.array([S / 2, S / 2]) - c
    return M

def lister():
    imgs = []
    for d in [os.path.join(ICI, '../medias/visages_dp'), os.path.join(ICI, 'paires')] + ([args.extra] if args.extra else []):
        srcs = {}
        for f in glob.glob(d + '/sources.json'):
            for s in json.load(open(f)): srcs[os.path.basename(s['fichier'])] = s.get('titre', '') + ' ' + s.get('personne', '')
        for f in sorted(glob.glob(d + '/*.jpg')):
            t = srcs.get(os.path.basename(f), ''); imgs.append((f, any(n in t for n in VAL_NOMS)))
    return imgs

def generer(liste, n, graine, val):
    r = np.random.default_rng(graine); X = np.zeros((n, S, S, 3), np.uint8); Y = np.zeros((n, S, S), np.uint8); cache = {}
    for i in range(n):
        f = liste[r.integers(len(liste))]
        if f not in cache:
            im = cv2.imread(f); h, w = im.shape[:2]; e = min(1, 750 / max(h, w)); im = cv2.resize(im, (int(w * e), int(h * e)), interpolation=cv2.INTER_AREA); cache[f] = (im, N.reperes(im))
        im, P = cache[f]
        if P is None: continue
        x = im.copy()
        if r.random() < .25: x, _ = N.f_lissage(x, P, r.uniform(.4, 1), r.uniform(0, 10))
        if r.random() < .3: x, _ = N.f_maquillage(x, P, rouge=tuple(r.uniform(20, 220, 3)), alpha=r.uniform(.2, .7), joues=r.uniform(0, .35))
        if r.random() < .5: x = A.decor(x, P, r)   # graphismes du décor : à NE PAS signaler
        m = np.zeros(im.shape[:2], np.float32)
        if r.random() > .3: x, m = A.poser(x, P, r)
        M = cadrage(P, r); xc = cv2.warpAffine(x, M, (S, S), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REFLECT); mc = cv2.warpAffine(m, M, (S, S), flags=cv2.INTER_LINEAR)
        xc = np.clip(xc.astype(np.float32) * r.uniform(.75, 1.2) + r.normal(0, 8, 3), 0, 255)
        if r.random() < .5: xc = np.clip(xc + r.normal(0, r.uniform(0, 5), xc.shape), 0, 255)
        xc = cv2.imdecode(cv2.imencode('.jpg', xc.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, int(r.uniform(35, 95))])[1], 1)
        if r.random() < .5: xc = xc[:, ::-1]; mc = mc[:, ::-1]
        X[i] = xc; Y[i] = (mc > .35).astype(np.uint8)
    return X, Y

class Bloc(nn.Module):
    def __init__(s, a, b): super().__init__(); s.c = nn.Sequential(nn.Conv2d(a, b, 3, padding=1), nn.BatchNorm2d(b), nn.ReLU(True), nn.Conv2d(b, b, 3, padding=1), nn.BatchNorm2d(b), nn.ReLU(True))
    def forward(s, x): return s.c(x)
class Detecteur(nn.Module):
    """U-Net léger (≈ 0,5 M paramètres) : image 192×192 → probabilité « élément ajouté par un filtre » par pixel"""
    def __init__(s, c=(16, 32, 64, 96)):
        super().__init__(); s.e = nn.ModuleList([Bloc(3, c[0]), Bloc(c[0], c[1]), Bloc(c[1], c[2]), Bloc(c[2], c[3])])
        s.d = nn.ModuleList([Bloc(c[3] + c[2], c[2]), Bloc(c[2] + c[1], c[1]), Bloc(c[1] + c[0], c[0])]); s.o = nn.Conv2d(c[0], 1, 1)
    def forward(s, x):
        x = x / 127.5 - 1; f = []
        for i, b in enumerate(s.e):
            x = b(x if i == 0 else F.max_pool2d(x, 2)); f.append(x)
        for i, b in enumerate(s.d):
            x = F.interpolate(x, scale_factor=2, mode='bilinear', align_corners=False); x = b(torch.cat([x, f[-2 - i]], 1))
        return s.o(x)

if __name__ == '__main__':
    L = lister(); tr = [f for f, v in L if not v]; va = [f for f, v in L if v]
    print(len(tr), 'images d’entraînement,', len(va), 'de validation (autres personnes)', flush=True)
    t = time.time(); Xt, Yt = generer(tr, args.donnees, 1, False); Xv, Yv = generer(va, 300, 2, True); print('données', round(time.time() - t), 's', flush=True)
    net = Detecteur()
    if args.init: net.load_state_dict(torch.load(args.init)); print('repart de', args.init)
    print(sum(p.numel() for p in net.parameters()) / 1e6, 'M paramètres', flush=True)
    opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4); sch = torch.optim.lr_scheduler.OneCycleLR(opt, 1e-3 if args.init else 3e-3, total_steps=args.pas)
    xt = torch.from_numpy(Xt).permute(0, 3, 1, 2).float(); yt = torch.from_numpy(Yt).float()[:, None]
    xv = torch.from_numpy(Xv).permute(0, 3, 1, 2).float(); yv = torch.from_numpy(Yv).float()[:, None]
    def evaluer():
        net.eval(); I = U = TP = FP = FN = 0; faux_vides = []
        with torch.no_grad():
            for i in range(0, len(xv), 50):
                p = torch.sigmoid(net(xv[i:i + 50])) > .5; y = yv[i:i + 50] > .5
                TP += (p & y).sum().item(); FP += (p & ~y).sum().item(); FN += (~p & y).sum().item()
                for k in range(len(p)):
                    if y[k].sum() == 0: faux_vides.append(p[k].float().mean().item())
        net.train(); return {'precision': TP / max(1, TP + FP), 'rappel': TP / max(1, TP + FN), 'iou': TP / max(1, TP + FP + FN), 'faux_sur_photos_sans_ajout_%': 100 * float(np.mean(faux_vides)) if faux_vides else 0}
    t = time.time()
    for k in range(args.pas):
        idx = torch.randint(0, len(xt), (12,)); x = xt[idx]; y = yt[idx]
        z = net(x); bce = F.binary_cross_entropy_with_logits(z, y, pos_weight=torch.tensor(3.)); p = torch.sigmoid(z)
        dice = 1 - (2 * (p * y).sum() + 1) / (p.sum() + y.sum() + 1); loss = bce + dice
        opt.zero_grad(); loss.backward(); opt.step(); sch.step()
        if k % 250 == 0 or k == args.pas - 1: print(k, round(loss.item(), 3), evaluer(), round(time.time() - t), 's', flush=True)
    net.eval(); torch.save(net.state_dict(), os.path.join(ICI, 'detecteur_ajouts.pt'))
    torch.onnx.export(net, torch.zeros(1, 3, S, S), os.path.join(ICI, 'detecteur_ajouts.onnx'), input_names=['image'], output_names=['logit'], opset_version=17, dynamo=False)
    print('final', evaluer())
