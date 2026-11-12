# Générateur de NOUVEAUX filtres AR, dans le style des vrais filtres Snapchat étudiés en v7.1 (fiche F30) :
#   - contours néon lumineux (cœur blanc + halo coloré), comme les cornes et le cœur réels ;
#   - fleurs posées sur la tempe / dans les cheveux (pétales en dégradé, cœur, liseré) ;
#   - textes semés sur le visage (« cute ») ou posés près de la bouche (« mood: »), polices variées ;
#   - moustache pleine, mèche de cheveux colorée, taches / points / paillettes, papillons, larmes, maquillage graphique,
#     lunettes FANTAISIE (cœurs, étoiles, néon : jamais de simple monture fine, pour ne pas apprendre à effacer de vraies lunettes) ;
#   - rendu « appli » : bords lissés, halo, ombre, opacité, puis étalonnage global et lissage beauté (qui ne changent pas le masque).
# Le « crâne chauve » n'est PAS généré (il apprend à signaler les vrais crânes chauves). Chaque élément garde son masque exact.
import os, glob, cv2, numpy as np
import ajouts as A
_POSER_V2 = A.poser   # référence figée : l'entraînement peut remplacer A.poser par un mélange
from ajouts import _aa, _coul, _poly, _ell, _trait

MOTS = ['cute', 'love', 'mood:', 'baby', 'xoxo', 'angel', 'sad', 'cool', 'vibes', 'slay', 'queen', 'ok', 'lol', '<3', 'hey', 'sweet',
        'chill', 'bae', 'wow', 'star', 'moon', 'dream', 'hello', 'sun', 'kiss', 'joli', 'coucou', 'bisous', 'amour', 'zen', 'girl', 'boss']
_POLICES = None
def _polices():
    global _POLICES
    if _POLICES is None:
        _POLICES = [f for f in glob.glob('/usr/share/fonts/**/*.ttf', recursive=True) if 'emoji' not in f.lower()][:40]
    return _POLICES
def _texte_masque(shape, txt, pos, taille, ang, r):
    """masque 0..1 d'un texte (police TrueType au hasard si dispo, sinon Hershey d'OpenCV), tourné autour de pos"""
    h, w = shape; m = np.zeros((h, w), np.uint8); fs = _polices()
    try:
        if fs and r.random() < .8:
            from PIL import Image, ImageDraw, ImageFont
            f = ImageFont.truetype(fs[r.integers(len(fs))], max(6, int(taille)))
            im = Image.new('L', (w, h), 0); d = ImageDraw.Draw(im); d.text((float(pos[0]), float(pos[1])), txt, fill=255, font=f, anchor='mm'); m = np.array(im)
        else:
            sc = taille / 30; (tw, th), _ = cv2.getTextSize(txt, int(r.integers(0, 8)), sc, max(1, int(sc * 2)))
            cv2.putText(m, txt, (int(pos[0] - tw / 2), int(pos[1] + th / 2)), int(r.integers(0, 8)) if False else 0, sc, 255, max(1, int(sc * 2)), cv2.LINE_AA)
    except Exception:
        cv2.putText(m, txt, (int(pos[0]), int(pos[1])), 0, taille / 30, 255, 1, cv2.LINE_AA)
    Mr = cv2.getRotationMatrix2D((float(pos[0]), float(pos[1])), -ang + r.normal(0, 12), 1)
    return cv2.warpAffine(m, Mr, (w, h)).astype(np.float32) / 255

def poser_nouveaux(img, P, r, n=None):
    """Pose 1 à 4 éléments de nouveaux filtres. Renvoie image, masque (0..1)."""
    import noyau as N
    o, ux, uy, io = N.repere_visage(P); h, w = img.shape[:2]; sh = (h, w); ang = float(np.degrees(np.arctan2(ux[1], ux[0])))
    out = img.astype(np.float32); masq = np.zeros(sh, np.float32)
    def mettre(m, c, op=None, halo=0., coeur_blanc=False, ombre=False, grad=0.):
        nonlocal out, masq
        op = r.uniform(.8, 1) if op is None else op; m = np.clip(_aa(m, r.uniform(.3, 1.0)), 0, 1)
        if halo > 0:   # néon : halo coloré qui éclaire autour (fait partie du filtre : il est dessiné par l'appli)
            g = cv2.GaussianBlur(m, (0, 0), halo * io); g = np.clip(g / (g.max() + 1e-6) * r.uniform(.5, .9), 0, 1)
            out = out * (1 - g[..., None]) + np.clip(c * 1.1 + 30, 0, 255) * g[..., None]; masq = np.maximum(masq, (g > .35) * g)
        if ombre:
            d = (uy * .03) * io; Mt = np.float32([[1, 0, d[0]], [0, 1, d[1]]]); s_ = cv2.GaussianBlur(cv2.warpAffine(m, Mt, (w, h)), (0, 0), .02 * io) * .3; out *= (1 - s_[..., None])
        col = np.broadcast_to(np.array(c, np.float32), (h, w, 3)).copy()
        if grad:
            yy, xx = np.mgrid[:h, :w].astype(np.float32); ys, xs = np.nonzero(m > .5)
            if len(xs): t = np.clip(((xx - xs.mean()) ** 2 + (yy - ys.mean()) ** 2) ** .5 / (np.ptp(xs) + np.ptp(ys) + 1) * 2, 0, 1); col = col * (1 - grad * t[..., None]) + 255 * grad * .3 * t[..., None]
        if coeur_blanc:   # trait central presque blanc, comme un tube néon
            k = cv2.erode((m > .5).astype(np.uint8), np.ones((3, 3))).astype(np.float32); col = col * (1 - .7 * k[..., None]) + 250 * .7 * k[..., None]
        m = m * op; out = out * (1 - m[..., None]) + np.clip(col, 0, 255) * m[..., None]; masq = np.maximum(masq, m)
    def neon(): return np.array([[60, 40, 255], [255, 60, 200], [255, 230, 80], [80, 255, 120], [255, 120, 60], [200, 80, 255], [250, 250, 255]][r.integers(7)], np.float32)
    def fleur(c, s):
        k = r.integers(4, 9); a0 = r.uniform(0, np.pi); pet = _coul(r) if r.random() < .5 else np.array([[180, 120, 255], [240, 240, 255], [120, 200, 255], [200, 160, 255], [80, 80, 240]][r.integers(5)], np.float32)
        for j in range(k):
            a = a0 + j * 2 * np.pi / k; q = c + (ux * np.cos(a) + uy * np.sin(a)) * s * .55
            mettre(_ell(sh, q, (s * .42, s * .22), np.degrees(a) + ang), pet, grad=r.uniform(.2, .6), ombre=r.random() < .4)
        mettre(_ell(sh, c, (s * .18, s * .18), 0), np.array([60, 200, 255.]) + r.normal(0, 20, 3))
    familles = ['fleur', 'cornes_neon', 'coeur_neon', 'texte_seme', 'texte_seul', 'moustache_pleine', 'meche', 'taches', 'papillon',
                'larme', 'maquillage_graphique', 'lunettes_fantaisie', 'aureole', 'bandeau', 'anciens']
    poids = np.array([.12, .1, .07, .09, .07, .07, .05, .06, .05, .04, .05, .05, .05, .04, .09]); poids /= poids.sum()
    for t in r.choice(familles, size=n or r.integers(1, 4), replace=False, p=poids):
        if t == 'fleur':
            cote = r.choice([-1, 1]); c = o + ux * cote * io * r.uniform(.9, 1.3) - uy * io * r.uniform(.2, .9); fleur(c, io * r.uniform(.25, .5))
            if r.random() < .3: fleur(c + ux * cote * io * .35 + uy * io * .3, io * r.uniform(.15, .3))
        elif t == 'cornes_neon':
            c = neon(); haut = P[10] - uy * io * r.uniform(.2, .5); ep = io * r.uniform(.03, .07); H = io * r.uniform(.4, .8)
            for cote in (-1, 1):
                b = haut + ux * cote * io * r.uniform(.5, .8); pts = np.array([b - ux * cote * H * .15, b + ux * cote * H * .25 - uy * H * .5, b + ux * cote * H * .05 - uy * H])
                tt = np.linspace(0, 1, 12)[:, None]; courbe = (1 - tt) ** 2 * pts[0] + 2 * (1 - tt) * tt * pts[1] + tt ** 2 * pts[2]
                mettre(_trait(sh, courbe, ep), c, halo=r.uniform(.04, .1), coeur_blanc=True)
        elif t == 'coeur_neon':
            c = neon(); q = P[r.choice([205, 425, 10, 152, 151])] + (ux * r.normal(0, .5) + uy * r.normal(.2, .5)) * io; s = io * r.uniform(.12, .3)
            tt = np.linspace(0, 2 * np.pi, 60); pts = np.stack([16 * np.sin(tt) ** 3, -(13 * np.cos(tt) - 5 * np.cos(2 * tt) - 2 * np.cos(3 * tt) - np.cos(4 * tt))], 1) / 16 * s + q
            if r.random() < .5: mettre(_trait(sh, np.vstack([pts, pts[:1]]), io * .03), c, halo=.05, coeur_blanc=True)
            else: mettre(_poly(sh, pts), c, grad=.3)
        elif t == 'texte_seme':
            mot = MOTS[r.integers(len(MOTS))]; c = np.array([20, 20, 25.]) if r.random() < .6 else _coul(r); taille = io * r.uniform(.16, .28)
            for _ in range(r.integers(5, 14)):
                q = P[r.choice([10, 151, 205, 425, 50, 280, 4, 152, 117, 346, 108, 337])] + (ux * r.normal(0, .25) + uy * r.normal(0, .2)) * io
                mettre(_texte_masque(sh, mot, q, taille, ang, r), c, op=r.uniform(.7, .95))
        elif t == 'texte_seul':
            mot = MOTS[r.integers(len(MOTS))]; c = np.array([250, 250, 250.]) if r.random() < .6 else _coul(r)
            q = P[r.choice([61, 291, 205, 425, 152])] + (ux * r.normal(0, .3) + uy * r.normal(.1, .2)) * io
            mettre(_texte_masque(sh, mot, q, io * r.uniform(.15, .35), ang, r), c, ombre=r.random() < .5)
        elif t == 'moustache_pleine':
            c = np.array([[20, 25, 35], [30, 50, 80], [10, 10, 10], [60, 90, 130]][r.integers(4)], np.float32); m0 = (P[0] + P[164]) / 2; L = io * r.uniform(.35, .6); H = io * r.uniform(.08, .16)
            pts = np.array([m0 - ux * L, m0 - ux * L * .5 - uy * H, m0 - uy * H * .6, m0 + ux * L * .5 - uy * H, m0 + ux * L, m0 + ux * L * .4 + uy * H * .4, m0 + uy * H * .3, m0 - ux * L * .4 + uy * H * .4])
            if r.random() < .5: pts[[0, 4]] -= uy * H * r.uniform(.5, 2)   # pointes relevées
            mettre(_poly(sh, pts), c, grad=.2)
        elif t == 'meche':   # mèche colorée dans les cheveux (comme la mèche rose réelle) : seulement là où il y a des cheveux supposés
            cote = r.choice([-1, 1]); b = P[10] + ux * cote * io * r.uniform(.3, .8); c = _coul(r) if r.random() < .5 else neon()
            pts = np.array([b, b + ux * cote * io * .25, b + ux * cote * io * r.uniform(.6, 1) + uy * io * r.uniform(1.5, 3), b + ux * cote * io * r.uniform(.3, .6) + uy * io * r.uniform(1.5, 3)])
            mettre(_poly(sh, pts), c, op=r.uniform(.45, .7))
        elif t == 'taches':
            c = np.array([30, 60, 120.]) if r.random() < .5 else _coul(r); k = r.integers(10, 40); s = io * r.uniform(.012, .03)
            for _ in range(k):
                q = P[r.choice([205, 425, 4, 197, 50, 280, 118, 347])] + (ux * r.normal(0, .18) + uy * r.normal(0, .1)) * io
                mettre(_ell(sh, q, (s, s * r.uniform(.7, 1)), 0), c, op=r.uniform(.5, .9))
        elif t == 'papillon':
            q = P[r.choice([10, 70, 300, 117, 346])] + (ux * r.normal(0, .4) + uy * r.normal(-.3, .3)) * io; s = io * r.uniform(.12, .25); c = _coul(r)
            for cote in (-1, 1):
                mettre(_ell(sh, q + ux * cote * s * .5 - uy * s * .2, (s * .5, s * .35), ang + cote * 30), c, grad=.4)
                mettre(_ell(sh, q + ux * cote * s * .35 + uy * s * .3, (s * .3, s * .22), ang - cote * 30), c * .8, grad=.4)
            mettre(_ell(sh, q, (s * .06, s * .4), ang + 90), np.array([20, 20, 20.]))
        elif t == 'larme':
            for k in r.choice([145, 374], size=r.integers(1, 3), replace=False):
                q = P[k] + uy * io * r.uniform(.15, .35); s = io * r.uniform(.04, .08)
                pts = np.array([q - uy * s * 2, q + ux * s, q + uy * s * .8, q - ux * s]); mettre(_poly(sh, pts), np.array([250, 200, 120.]) if r.random() < .5 else neon(), halo=.02 if r.random() < .4 else 0)
        elif t == 'maquillage_graphique':
            c = neon()
            for cote, (a, b) in ((-1, (33, 130)), (1, (263, 359))):
                q = P[b] + ux * cote * io * .02; e = q + (ux * cote * .35 - uy * .18) * io; mettre(_trait(sh, np.array([P[a], q, e]), io * r.uniform(.02, .04)), c, halo=.03 if r.random() < .5 else 0)
        elif t == 'lunettes_fantaisie':
            c = neon() if r.random() < .6 else _coul(r); forme = r.integers(3)
            for k in (468, 473):
                q = P[k]; s = io * r.uniform(.28, .4)
                if forme == 0: tt = np.linspace(0, 2 * np.pi, 50); pts = np.stack([16 * np.sin(tt) ** 3, -(13 * np.cos(tt) - 5 * np.cos(2 * tt) - 2 * np.cos(3 * tt) - np.cos(4 * tt))], 1) / 16 * s + q
                elif forme == 1: tt = np.linspace(0, 2 * np.pi, 11)[:-1]; rr = np.where(np.arange(10) % 2 == 0, 1, .5) * s; pts = np.stack([np.sin(tt) * rr, -np.cos(tt) * rr], 1) + q
                else: tt = np.linspace(0, 2 * np.pi, 40); pts = np.stack([np.cos(tt), np.sin(tt) * .8], 1) * s + q
                m = _poly(sh, pts)   # v7.2b : plus de verre teinté (il apprenait à effacer les verres de vraies lunettes) : monture opaque seule
                mettre(np.clip(m - cv2.erode((m > .5).astype(np.uint8), np.ones((int(.09 * io) | 1,) * 2)).astype(np.float32), 0, 1), c, halo=.04 if r.random() < .5 else 0, coeur_blanc=r.random() < .5)
        elif t == 'aureole':
            c = np.array([80, 220, 255.]) if r.random() < .6 else neon(); q = P[10] - uy * io * r.uniform(.6, 1.0)
            m = _ell(sh, q, (io * r.uniform(.6, .9), io * r.uniform(.12, .2)), ang); mettre(np.clip(m - _ell(sh, q, (io * .5, io * .08), ang), 0, 1), c, halo=.05, coeur_blanc=True)
        elif t == 'bandeau':
            c = _coul(r); a = P[10] + uy * io * r.uniform(-.1, .2); pts = np.array([a - ux * io * 1.3, a + ux * io * 1.3, a + ux * io * 1.3 + uy * io * .18, a - ux * io * 1.3 + uy * io * .18])
            mettre(_poly(sh, pts), c, grad=.3, ombre=True)
            if r.random() < .5: fleur(a + ux * io * r.choice([-1, 1]) * .8, io * .25)
        elif t == 'anciens':   # un élément du générateur v2, sauf les lunettes à monture fine
            o2, m2 = _POSER_V2(out.clip(0, 255).astype(np.uint8), P, r, n=1, exclus=('lunettes',))
            out = o2.astype(np.float32); masq = np.maximum(masq, m2)
    return np.clip(out, 0, 255).astype(np.uint8), np.clip(masq, 0, 1)

def etalonner(img, P, r):
    """étalonnage global et lissage « beauté » d'une appli (ne fait pas partie du masque : le détecteur doit l'ignorer)"""
    import noyau as N
    x = img.astype(np.float32)
    if r.random() < .6: x = x * r.uniform(.85, 1.15, 3) + r.normal(0, 10, 3)
    if r.random() < .3: g = x.mean(2, keepdims=True); x = x * (1 - r.uniform(.2, 1)) + g * r.uniform(.2, 1) if r.random() < .3 else x
    x = np.clip(x, 0, 255).astype(np.uint8)
    if r.random() < .4: x, _ = N.f_lissage(x, P, r.uniform(.4, 1), r.uniform(0, 8))
    return x
