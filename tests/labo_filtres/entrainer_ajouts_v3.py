# Détecteur d'éléments AR v3 : v2 + vrais clips filtrés (données PRIVÉES, jamais versionnées) en validation croisée par vidéo.
#   python3 tests/labo_filtres/entrainer_ajouts_v3.py --prive A.npz --val B.npz --pas 3000 --sortie det_v3_A
# A.npz / B.npz : X (n,192,192,3 BGR, cadrage de entrainer_ajouts.cadrage), Y (n,192,192 masque 0/1), G (type d'élément ou 'aucun').
# Mélange par lot : visages publics + éléments simulés (v2) ; images réelles sans élément (lunettes, fumée, mains, filtres beauté :
# à NE PAS signaler) ; images réelles avec élément ; éléments réels découpés et recollés sur d'autres images (nouvelles combinaisons).
import os, sys, time, argparse, numpy as np, cv2, torch, torch.nn.functional as F
ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
sys.argv_sauf = sys.argv[:]; ap = argparse.ArgumentParser()
ap.add_argument('--prive', action='append', default=[]); ap.add_argument('--val', default=''); ap.add_argument('--pas', type=int, default=3000)
ap.add_argument('--publics', type=int, default=1600); ap.add_argument('--sortie', default='detecteur_ajouts_v3'); ap.add_argument('--sans', default='')
ap.add_argument('--init', default=os.path.join(ICI, 'detecteur_ajouts_v2.pt')); ap.add_argument('--cache', default=''); ap.add_argument('--pos', type=float, default=1.5); ap.add_argument('--nasa', default=''); args = ap.parse_args()
sys.argv = [sys.argv[0], '--donnees', str(args.publics)]
import entrainer_ajouts as E   # réutilise cadrage, générateur v2, architecture
if args.nasa: E.args.extra = args.nasa   # visages NASA (domaine public) ajoutés aux visages du labo
S = 192; torch.set_num_threads(os.cpu_count() or 2); r = np.random.default_rng(11)

def charger(fs):
    X, Y, G = [], [], []
    for f in fs:
        z = np.load(f); X.append(z['X']); Y.append(z['Y']); G.append(z['G'])
    return np.concatenate(X), np.concatenate(Y), np.concatenate(G)

def recoller(fond, x, y):
    """colle l'élément réel (x, y) sur une autre image : léger décalage, échelle, teinte ; bord adouci comme un rendu AR"""
    a = cv2.GaussianBlur(y.astype(np.float32), (0, 0), .7)
    t = cv2.getRotationMatrix2D((S / 2, S / 2), r.normal(0, 8), r.uniform(.85, 1.15)); t[:, 2] += r.normal(0, 7, 2)
    xx = cv2.warpAffine(x, t, (S, S), borderMode=cv2.BORDER_REFLECT).astype(np.float32); aa = cv2.warpAffine(a, t, (S, S))
    if r.random() < .5:   # autre couleur : le détecteur doit apprendre la forme « collée », pas une couleur
        hsv = cv2.cvtColor(xx.clip(0, 255).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.int16); hsv[..., 0] = (hsv[..., 0] + r.integers(0, 180)) % 180
        xx = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32)
    out = fond.astype(np.float32) * (1 - aa[..., None]) + xx * aa[..., None]
    return out.clip(0, 255).astype(np.uint8), (aa > .35).astype(np.uint8)

def bruiter(x):
    x = np.clip(x.astype(np.float32) * r.uniform(.8, 1.15) + r.normal(0, 7, 3), 0, 255)
    return cv2.imdecode(cv2.imencode('.jpg', x.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, int(r.uniform(40, 95))])[1], 1)

if __name__ == '__main__':
    L = E.lister(); pub = [f for f, v in L if not v]
    if args.cache and os.path.exists(args.cache): z = np.load(args.cache); Xp, Yp = z['X'], z['Y']
    else:
        t = time.time(); Xp, Yp = E.generer(pub, args.publics, 1, False); print('publics simulés', len(Xp), round(time.time() - t), 's', flush=True)
        if args.cache: np.savez(args.cache, X=Xp, Y=Yp)
    Xr, Yr, Gr = charger(args.prive)
    if args.sans:   # élément tenu à l'écart (test « type jamais vu »)
        k = np.array([args.sans not in g for g in Gr]); Xr, Yr, Gr = Xr[k], Yr[k], Gr[k]
    neg = np.where(Gr == 'aucun')[0]; pos = np.where(Gr != 'aucun')[0]; vides_p = np.where(Yp.reshape(len(Yp), -1).max(1) == 0)[0]
    print('réels :', len(neg), 'sans élément,', len(pos), 'avec élément', sorted(set(Gr[pos].tolist())), flush=True)
    Xv, Yv, Gv = charger([args.val]) if args.val else (None, None, None)
    net = E.Detecteur(); net.load_state_dict(torch.load(args.init)); net.train()
    opt = torch.optim.AdamW(net.parameters(), 1e-3, weight_decay=1e-4); sch = torch.optim.lr_scheduler.OneCycleLR(opt, 1.5e-3, total_steps=args.pas)
    pt = args.sortie + '_reprise.pt'; k0 = 0
    if os.path.exists(pt):   # reprise après coupure
        st = torch.load(pt, weights_only=False); net.load_state_dict(st['net']); opt.load_state_dict(st['opt']); sch.load_state_dict(st['sch']); k0 = st['k'] + 1
        r.bit_generator.state = st['rng']; print('reprise au pas', k0, flush=True)

    def lot(n=12):
        X = np.zeros((n, S, S, 3), np.uint8); Y = np.zeros((n, S, S), np.uint8)
        for i in range(n):
            u = r.random()
            if u < .3: j = r.integers(len(Xp)); X[i], Y[i] = Xp[j], Yp[j]
            elif u < .7: j = neg[r.integers(len(neg))]; X[i], Y[i] = bruiter(Xr[j]), 0
            elif u < .83 and len(pos): j = pos[r.integers(len(pos))]; X[i], Y[i] = bruiter(Xr[j]), Yr[j]
            elif len(pos):
                j = pos[r.integers(len(pos))]; fond = Xr[neg[r.integers(len(neg))]] if r.random() < .4 else Xp[vides_p[r.integers(len(vides_p))]]
                x, y = recoller(fond, Xr[j], Yr[j]); X[i], Y[i] = bruiter(x), y
            if r.random() < .5: X[i] = X[i][:, ::-1]; Y[i] = Y[i][:, ::-1]
        return torch.from_numpy(X).permute(0, 3, 1, 2).float(), torch.from_numpy(Y).float()[:, None]

    def evaluer(seuil=.6):
        if Xv is None: return {}
        net.eval(); tp = {}; fp = {}; fn = {}; vides = []
        with torch.no_grad():
            for i in range(0, len(Xv), 64):
                p = (torch.sigmoid(net(torch.from_numpy(Xv[i:i + 64]).permute(0, 3, 1, 2).float())) > seuil)[:, 0].numpy(); y = Yv[i:i + 64] > 0
                for k in range(len(p)):
                    g = Gv[i + k]
                    if g == 'aucun': vides.append(p[k].mean()); continue
                    tp[g] = tp.get(g, 0) + (p[k] & y[k]).sum(); fp[g] = fp.get(g, 0) + (p[k] & ~y[k]).sum(); fn[g] = fn.get(g, 0) + (~p[k] & y[k]).sum()
        net.train(); T, P_, N_ = sum(tp.values()), sum(fp.values()), sum(fn.values())
        return {'precision': round(T / max(1, T + P_), 3), 'rappel': round(T / max(1, T + N_), 3), 'iou': round(T / max(1, T + P_ + N_), 3),
                'faux_sans_element_%': round(100 * float(np.mean(vides)), 3), 'images_sans_element_touchees_%': round(100 * float(np.mean(np.array(vides) > .002)), 1),
                'rappel_par_type': {g: round(tp[g] / max(1, tp[g] + fn[g]), 2) for g in sorted(tp)}}
    if k0 == 0: print('départ (v2)', evaluer(), flush=True)
    t = time.time()
    for k in range(k0, args.pas):
        x, y = lot(); z = net(x); p = torch.sigmoid(z)
        loss = F.binary_cross_entropy_with_logits(z, y, pos_weight=torch.tensor(args.pos)) + 1 - (2 * (p * y).sum() + 1) / (p.sum() + y.sum() + 1)
        opt.zero_grad(); loss.backward(); opt.step(); sch.step()
        if k % 250 == 249: torch.save({'net': net.state_dict(), 'opt': opt.state_dict(), 'sch': sch.state_dict(), 'k': k, 'rng': r.bit_generator.state}, pt)
        if k % 500 == 0 or k == args.pas - 1: print(k, round(loss.item(), 3), evaluer(), round(time.time() - t), 's', flush=True)
    net.eval(); torch.save(net.state_dict(), os.path.join(ICI, args.sortie + '.pt'))
    torch.onnx.export(net, torch.zeros(1, 3, S, S), os.path.join(ICI, args.sortie + '.onnx'), input_names=['image'], output_names=['logit'], opset_version=17, dynamo=False)
    for s in (.5, .6, .7): print('final seuil', s, evaluer(s), flush=True)
