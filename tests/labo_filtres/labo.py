# Laboratoire de simulation et d'évaluation des filtres (F15) — RetoucheProAI.
# Chaque expérience garde : photo d'origine (vérité), photo filtrée, masque exact, paramètres, résultat, carte, mesures.
#   PYTHONPATH=tests/visage_ia/faux python3 tests/labo_filtres/labo.py [dossier_paires]
# Paires : deux photos DIFFÉRENTES de la même personne (portraits officiels NASA, domaine public, sources.json).
# La photo « cible » est filtrée par le labo ; l'autre sert de référence sans filtre, comme dans l'app.
# Limite : ces filtres sont simulés (pas Snapchat/Instagram) ; une réussite ici ne vaut pas réussite sur un vrai filtre.
import os, sys, json, time, cv2, numpy as np, torch, lpips
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import noyau as N
ICI = os.path.dirname(os.path.abspath(__file__)); D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ICI, 'paires')
OUT = os.path.join(ICI, '../sorties/labo_filtres'); os.makedirs(OUT, exist_ok=True)
PAIRES = json.load(open(os.path.join(D, 'paires.json')))
L = lpips.LPIPS(net='alex', verbose=False)
def lp(a, b):
    t = lambda z: torch.from_numpy(cv2.cvtColor(z, cv2.COLOR_BGR2RGB).transpose(2, 0, 1)[None].astype(np.float32) / 127.5 - 1)
    with torch.no_grad(): return float(L(t(a), t(b)))
def lab(z): return cv2.cvtColor(z, cv2.COLOR_BGR2LAB).astype(np.float32)
FILTRES = {
    'aucun': lambda im, P: (im, np.zeros(im.shape[:2], np.float32), {}),
    'chien': lambda im, P: (*N.f_chien(im, P, oreilles=False), {'museau': 1, 'moustaches': 6}),
    'chat': lambda im, P: (*N.f_chat(im, P), {'nez': 'triangle rose', 'moustaches': 6}),
    'lissage': lambda im, P: (*N.f_lissage(im, P, 1, 8), {'bilatéral': 2, 'éclat': 8}),
    'maquillage': lambda im, P: (*N.f_maquillage(im, P), {'rouge_lèvres': .45, 'blush': .22}),
}
def compose(*fs):
    def f(im, P):
        m = np.zeros(im.shape[:2], np.float32); p = {}
        for g in fs: im, mm, pp = FILTRES[g](im, P); m = np.maximum(m, mm); p[g] = pp
        return im, m, p
    return f
FILTRES['beauté'] = compose('lissage', 'maquillage'); FILTRES['beauté+chien'] = compose('lissage', 'maquillage', 'chien')
if os.environ.get('SEULEMENT'): FILTRES = {k: v for k, v in FILTRES.items() if k in os.environ['SEULEMENT'].split(',')}
res = []
for pr in PAIRES:
    T = cv2.imread(os.path.join(D, pr['cible'])); Rf = cv2.imread(os.path.join(D, pr['reference'])); P = N.reperes(T)
    if P is None: continue
    io = N.repere_visage(P)[3]; ov = N.masque_poly(T.shape, P[N.OVALE_ORD]); x0, y0 = np.maximum(0, P.min(0) - .3 * io).astype(int); x1, y1 = (P.max(0) + .3 * io).astype(int)
    crop = lambda z: z[y0:y1, x0:x1]
    for nom, f in FILTRES.items():
        Fi, mexact, params = f(T, P); t = time.time(); J = []
        Out, carte, J = N.reconstruire(Fi, [Rf], journal=J); dt = time.time() - t
        e = os.path.join(OUT, f"{pr['id']}_{nom}"); os.makedirs(e, exist_ok=True)
        for n_, z in [('original.jpg', T), ('filtre.jpg', Fi), ('resultat.jpg', Out)]: cv2.imwrite(os.path.join(e, n_), z, [cv2.IMWRITE_JPEG_QUALITY, 92])
        cv2.imwrite(os.path.join(e, 'masque_exact.png'), (mexact * 255).astype(np.uint8)); cv2.imwrite(os.path.join(e, 'carte_ajouts.png'), (carte.get('ajouts', 0 * mexact) * 255).astype(np.uint8))
        m = {'id': pr['id'], 'filtre': nom, 'secondes': round(dt, 1), 'journal': J,
             'lpips_filtre': lp(crop(T), crop(Fi)), 'lpips_resultat': lp(crop(T), crop(Out))}
        mo = ov > .5; m['dE_visage_filtre'] = float(np.sqrt(((lab(T) - lab(Fi)) ** 2).sum(2))[mo].mean()); m['dE_visage_resultat'] = float(np.sqrt(((lab(T) - lab(Out)) ** 2).sum(2))[mo].mean())
        mx = mexact > .5
        if mx.sum() > 50:
            m['dE_masque_filtre'] = float(np.sqrt(((lab(T) - lab(Fi)) ** 2).sum(2))[mx].mean()); m['dE_masque_resultat'] = float(np.sqrt(((lab(T) - lab(Out)) ** 2).sum(2))[mx].mean())
        if nom in ('chien', 'chat', 'beauté+chien'):   # même chose SANS référence (remplissage classique + GFPGAN) : ce qu'apporte la photo sans filtre
            O2, _, _ = N.reconstruire(Fi, [Rf], sans_ref=True); cv2.imwrite(os.path.join(e, 'resultat_sans_ref.jpg'), O2, [cv2.IMWRITE_JPEG_QUALITY, 92])
            m['lpips_sans_ref'] = lp(crop(T), crop(O2))
            if mx.sum() > 50: m['dE_masque_sans_ref'] = float(np.sqrt(((lab(T) - lab(O2)) ** 2).sum(2))[mx].mean())
            d = carte['ajouts'] > .5; ex = (N.f_chien(T, P, oreilles=False)[1] if 'chien' in nom else N.f_chat(T, P)[1]) > .3
            m['detection_rappel'] = float((d & ex).sum() / max(1, ex.sum())); m['detection_precision'] = float((d & ex).sum() / max(1, d.sum()))
        json.dump({'parametres': params, 'reference': pr['reference'], 'cible': pr['cible'], **m}, open(os.path.join(e, 'mesures.json'), 'w'), ensure_ascii=False, indent=1)
        res.append(m); print(pr['id'], nom, {k: (round(v, 3) if isinstance(v, float) else v) for k, v in m.items() if k not in ('journal', 'id', 'filtre')}, flush=True)
json.dump(res, open(os.path.join(OUT, 'resume.json'), 'w'), ensure_ascii=False, indent=1)
print('\nMOYENNES')
for nom in FILTRES:
    R = [r for r in res if r['filtre'] == nom]
    if not R: continue
    k = [x for x in R[0] if isinstance(R[0][x], float)]
    print(f"{nom:13s}", ' '.join(f"{x}={np.mean([r[x] for r in R if x in r]):.3f}" for x in k), f"n={len(R)}")
