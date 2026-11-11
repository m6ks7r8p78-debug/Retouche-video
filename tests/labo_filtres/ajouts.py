# Générateur d'éléments de filtres AR (laboratoire) : museaux, nez, moustaches, oreilles, lunettes, autocollants, langue, couronnes…
# Chaque élément est rendu comme le ferait une appli (bords lissés, dégradé, ombre légère, opacité variable) ; le masque exact est gardé.
import cv2, numpy as np

def _aa(m, s): return cv2.GaussianBlur(m, (0, 0), s) if s > 0 else m
def _coul(r, sombre=None):
    pal = [(25, 25, 30), (35, 45, 70), (60, 90, 140), (200, 160, 245), (230, 230, 240), (40, 40, 200), (180, 105, 255), (20, 120, 230),
           (90, 60, 30), (120, 200, 255), (60, 180, 60), (240, 200, 120), (150, 150, 150), (0, 215, 255)]
    c = np.array(pal[r.integers(len(pal))], np.float32) + r.normal(0, 12, 3); return np.clip(c, 0, 255)
def _poly(shape, pts):
    m = np.zeros(shape, np.float32); cv2.fillPoly(m, [np.round(pts * 8).astype(np.int32)], 1, cv2.LINE_AA, shift=3); return m
def _ell(shape, c, ax, ang):
    m = np.zeros(shape, np.float32); cv2.ellipse(m, (int(c[0] * 8), int(c[1] * 8)), (max(1, int(ax[0] * 8)), max(1, int(ax[1] * 8))), ang, 0, 360, 1, -1, cv2.LINE_AA, shift=3); return m
def _trait(shape, pts, ep):
    m = np.zeros(shape, np.float32); cv2.polylines(m, [np.round(pts * 8).astype(np.int32)], False, 1, max(1, int(ep)), cv2.LINE_AA, shift=3); return m

def poser(img, P, r, n=None):
    """Pose 1 à 4 éléments au hasard sur le visage (repères P, 478 points). Renvoie image, masque (0..1)."""
    import noyau as N
    o, ux, uy, io = N.repere_visage(P); h, w = img.shape[:2]; sh = (h, w); ang = float(np.degrees(np.arctan2(ux[1], ux[0])))
    out = img.astype(np.float32); masq = np.zeros(sh, np.float32)
    def mettre(m, c, grad=True, ombre=True, op=None):
        nonlocal out, masq
        op = r.uniform(.75, 1) if op is None else op; m = _aa(m, r.uniform(.3, 1.2)) * op
        if ombre and r.random() < .5:
            d = (ux * r.uniform(-.02, .02) + uy * r.uniform(.01, .04)) * io; Mt = np.float32([[1, 0, d[0]], [0, 1, d[1]]])
            s_ = cv2.GaussianBlur(cv2.warpAffine(m, Mt, (w, h)), (0, 0), .02 * io) * r.uniform(.15, .35); out *= (1 - s_[..., None])
        col = np.broadcast_to(c, (h, w, 3)).astype(np.float32)
        if grad:
            yy, xx = np.mgrid[:h, :w].astype(np.float32); t = ((xx - o[0]) * uy[0] + (yy - o[1]) * uy[1]) / io
            col = col * (1 + r.uniform(-.25, .25) * np.clip(t - t[m > .5].mean() if (m > .5).any() else t, -1.5, 1.5))[..., None]
        out = out * (1 - m[..., None]) + np.clip(col, 0, 255) * m[..., None]; masq = np.maximum(masq, m)
    nez = P[4]; types = ['museau', 'moustaches', 'oreilles', 'lunettes', 'autocollant', 'langue', 'nez_clown', 'couronne', 'paillettes', 'masque_yeux']
    for t in r.choice(types, size=n or r.integers(1, 5), replace=False, p=[.18, .16, .14, .1, .1, .06, .06, .08, .05, .07]):
        if t == 'museau':
            c = nez + uy * io * r.uniform(-.05, .08); ax = (io * r.uniform(.2, .45), io * r.uniform(.14, .3)); mettre(_ell(sh, c, ax, ang), _coul(r))
            if r.random() < .6: mettre(_ell(sh, c - uy * ax[1] * .4 - ux * ax[0] * .3, (ax[0] * .2, ax[1] * .18), ang), np.array([230, 235, 240.]), grad=False, ombre=False)
        elif t == 'nez_clown':
            mettre(_ell(sh, nez, (io * r.uniform(.12, .22),) * 2, 0), np.array([30, 30, 220.]) + r.normal(0, 10, 3))
        elif t == 'moustaches':
            c = _coul(r); ep = io * r.uniform(.008, .025); k = r.integers(2, 5)
            for cote in (-1, 1):
                for j in range(k):
                    a = nez + ux * cote * io * r.uniform(.25, .4) + uy * io * (.02 + .07 * j); L = io * r.uniform(.35, .7); b = a + ux * cote * L + uy * io * (j - k / 2) * .1
                    mid = (a + b) / 2 + uy * io * r.uniform(-.05, .05); mettre(_trait(sh, np.array([a, mid, b]), ep * 8), c, grad=False, ombre=False)
        elif t == 'oreilles':
            c = _coul(r); ci = _coul(r) if r.random() < .6 else None; ronde = r.random() < .4
            for cote in (-1, 1):
                b = P[10] - uy * io * r.uniform(.1, .5) + ux * cote * io * r.uniform(.55, .9); H = io * r.uniform(.5, 1.1); L = io * r.uniform(.25, .45)
                if ronde: m = _ell(sh, b - uy * H * .4, (L, H * .5), ang)
                else: m = _poly(sh, np.array([b - ux * L, b + ux * L, b - uy * H + ux * cote * L * r.uniform(0, .8)]))
                mettre(m, c)
                if ci is not None:
                    m2 = cv2.erode((m > .5).astype(np.uint8), np.ones((int(.12 * io) | 1,) * 2)).astype(np.float32); mettre(m2, ci, ombre=False)
        elif t == 'lunettes':
            c = _coul(r); ep = io * r.uniform(.02, .05)
            for k in (468, 473):
                if r.random() < .5: m = _ell(sh, P[k], (io * .28, io * .2), ang)
                else: q = P[k]; m = _poly(sh, np.array([q - ux * io * .28 - uy * io * .18, q + ux * io * .28 - uy * io * .18, q + ux * io * .28 + uy * io * .18, q - ux * io * .28 + uy * io * .18]))
                mm = m - cv2.erode((m > .5).astype(np.uint8), np.ones((int(ep) | 1,) * 2)).astype(np.float32); mettre(np.clip(mm, 0, 1), c, grad=False)
                if r.random() < .3: mettre(m * .35, np.array([40, 40, 40.]), grad=False, ombre=False, op=1)
        elif t == 'autocollant':
            for _ in range(r.integers(1, 4)):
                c = P[r.choice([205, 425, 10, 151, 50, 280])] + (ux * r.normal(0, .2) + uy * r.normal(0, .2)) * io; s = io * r.uniform(.07, .18)
                k = r.integers(3)
                if k == 0:   # cœur
                    tt = np.linspace(0, 2 * np.pi, 40); pts = np.stack([16 * np.sin(tt) ** 3, -(13 * np.cos(tt) - 5 * np.cos(2 * tt) - 2 * np.cos(3 * tt) - np.cos(4 * tt))], 1) / 16 * s + c
                elif k == 1:   # étoile
                    tt = np.linspace(0, 2 * np.pi, 11)[:-1]; rr = np.where(np.arange(10) % 2 == 0, 1, .45) * s; pts = np.stack([np.sin(tt) * rr, -np.cos(tt) * rr], 1) + c
                else: pts = None
                mettre(_poly(sh, pts) if pts is not None else _ell(sh, c, (s, s * .8), 0), _coul(r))
        elif t == 'langue':
            c = P[17] + uy * io * r.uniform(.1, .3); mettre(_ell(sh, c, (io * r.uniform(.14, .22), io * r.uniform(.2, .35)), ang), np.array([140, 110, 235.]) + r.normal(0, 10, 3))
        elif t == 'couronne':
            c = _coul(r)
            for j in range(r.integers(5, 10)):
                a = -np.pi / 2 + (j / 6 - .7) * 1.1; q = P[10] - uy * io * .15 + (ux * np.cos(a) * 1.0 + uy * (np.sin(a) * .4 - .1)) * io
                mettre(_ell(sh, q, (io * .09, io * .09), 0), _coul(r))
        elif t == 'paillettes':
            c = _coul(r)
            for _ in range(r.integers(6, 20)):
                q = P[r.choice([205, 425, 50, 280, 118, 347])] + (ux * r.normal(0, .12) + uy * r.normal(0, .1)) * io
                mettre(_ell(sh, q, (io * .015, io * .015), 0), np.array([250, 250, 255.]) if r.random() < .6 else c, grad=False, ombre=False)
        elif t == 'masque_yeux':
            pts = np.array([P[127], P[70], P[107], P[336], P[300], P[356], P[345], P[6], P[116]]) ; mettre(_poly(sh, pts), _coul(r))
    return np.clip(out, 0, 255).astype(np.uint8), np.clip(masq, 0, 1)


def decor(img, P, r):
    """Graphismes du DÉCOR (drapeau, logos, étoiles, rayures, texte) loin du visage : ce n'est PAS un filtre → étiquette 0."""
    import noyau as N
    o, ux, uy, io = N.repere_visage(P); h, w = img.shape[:2]; out = img.astype(np.float32)
    yy, xx = np.mgrid[:h, :w].astype(np.float32); dx, dy = xx - o[0], yy - o[1]
    u = (dx * ux[0] + dy * ux[1]) / io; v = (dx * uy[0] + dy * uy[1]) / io; tete = (u / 1.25) ** 2 + ((v - .1) / 2.0) ** 2 < 1
    for _ in range(r.integers(3, 12)):
        c = np.array([r.uniform(0, w), r.uniform(0, h)]); s = io * r.uniform(.08, .5); k = r.integers(4)
        if k == 0:
            tt = np.linspace(0, 2 * np.pi, 11)[:-1]; rr = np.where(np.arange(10) % 2 == 0, 1, .45) * s; m = _poly((h, w), np.stack([np.sin(tt) * rr, -np.cos(tt) * rr], 1) + c)
        elif k == 1: m = _poly((h, w), np.array([c - [s * 3, s * .3], c + [s * 3, -s * .3], c + [s * 3, s * .3], c - [s * 3, -s * .3]]))
        elif k == 2: m = _ell((h, w), c, (s, s * r.uniform(.3, 1)), r.uniform(0, 180))
        else:
            m8 = np.zeros((h, w), np.uint8); cv2.putText(m8, ''.join(r.choice(list('ABCDEFNASA0123')) for _ in range(r.integers(2, 6))), tuple(int(x) for x in c), 0, s / 20, 255, max(1, int(s / 12)), cv2.LINE_AA); m = m8.astype(np.float32) / 255
        m = _aa(m, .6) * (~tete); out = out * (1 - m[..., None]) + _coul(r) * m[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)
