# RetoucheProAI — noyau de référence (Python) du « retrait de filtre guidé par des photos sans filtre ».
# Sert au laboratoire (mesures) et de spécification exacte pour la version de l'app (defiltre-visage.js) : même géométrie,
# mêmes seuils, mêmes étapes. Repères du visage : MediaPipe Face Landmarker (478 points, Apache-2.0).
import os, cv2, numpy as np, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
from mediapipe.tasks.python.vision import FaceLandmarksConnections as C

ICI = os.path.dirname(os.path.abspath(__file__))
_ens = lambda n: sorted({i for k in getattr(C, n) for i in (k.start, k.end)})
OEIL_D, OEIL_G = _ens('FACE_LANDMARKS_RIGHT_EYE'), _ens('FACE_LANDMARKS_LEFT_EYE')
NEZ, LEVRES, OVALE = _ens('FACE_LANDMARKS_NOSE'), _ens('FACE_LANDMARKS_LIPS'), _ens('FACE_LANDMARKS_FACE_OVAL')
SOURC = _ens('FACE_LANDMARKS_RIGHT_EYEBROW') + _ens('FACE_LANDMARKS_LEFT_EYEBROW')
IRIS_D, IRIS_G = [468] + _ens('FACE_LANDMARKS_RIGHT_IRIS'), [473] + _ens('FACE_LANDMARKS_LEFT_IRIS')
TRI = None
# contour ordonné du visage (pour les masques)
OVALE_ORD = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
LEVRES_EXT = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
OEIL_D_ORD = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
OEIL_G_ORD = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
SOURC_D_ORD = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
SOURC_G_ORD = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]
NARINES = [98, 97, 2, 326, 327, 294, 278, 344, 440, 275, 4, 45, 220, 115, 48, 64]

_det = None
def reperes(img_bgr):
    """478 repères (x, y en pixels) du plus grand visage, ou None."""
    global _det
    if _det is None:
        _det = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=os.environ.get('FACE_TASK', os.path.join(ICI, 'face_landmarker.task'))), num_faces=4))
    h, w = img_bgr.shape[:2]
    r = _det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))))
    if not r.face_landmarks: return None
    P = [np.array([[q.x * w, q.y * h] for q in f], np.float64) for f in r.face_landmarks]
    return max(P, key=lambda p: np.ptp(p[:, 0]) * np.ptp(p[:, 1]))

# ---------- repère du visage : origine entre les yeux, axe u = œil droit image → œil gauche image, unité = écart des iris ----------
def repere_visage(P):
    a, b = P[468], P[473]; io = np.linalg.norm(b - a); ux = (b - a) / io; uy = np.array([-ux[1], ux[0]]); o = (a + b) / 2
    return o, ux, uy, io
def vers_uv(P, R): o, ux, uy, io = R; d = P - o; return np.stack([d @ ux, d @ uy], 1) / io
def depuis_uv(Q, R): o, ux, uy, io = R; return o + (Q[:, :1] * ux + Q[:, 1:] * uy) * io

# ---------- déformation douce par plaque mince (TPS) : le contenu en src est amené en dst ----------
def _U(r2): return np.where(r2 > 0, r2 * np.log(r2 + 1e-12) * .5, 0)
def tps_resoudre(X, Y, lam=1e-3):
    n = len(X); K = _U(((X[:, None] - X[None]) ** 2).sum(-1)) + lam * np.eye(n); Pm = np.hstack([np.ones((n, 1)), X])
    A = np.zeros((n + 3, n + 3)); A[:n, :n] = K; A[:n, n:] = Pm; A[n:, :n] = Pm.T
    b = np.zeros((n + 3, 2)); b[:n] = Y; return np.linalg.solve(A, b), X
def tps_eval(S, Z):
    W, X = S; n = len(X); out = np.zeros((len(Z), 2))
    for i in range(0, len(Z), 20000):
        z = Z[i:i + 20000]; out[i:i + 20000] = _U(((z[:, None] - X[None]) ** 2).sum(-1)) @ W[:n] + W[n] + z @ W[n + 1:]
    return out
def ancres(w, h, k=6):
    t = np.linspace(0, 1, k); e = [(x * (w - 1), 0) for x in t] + [(x * (w - 1), h - 1) for x in t] + [(0, y * (h - 1)) for y in t[1:-1]] + [(w - 1, y * (h - 1)) for y in t[1:-1]]
    return np.array(e, np.float64)
def deformer(img, src, dst, pas=6, zone=None):
    """Remap : chaque point src du contenu va en dst ; bords de l'image fixes. Renvoie image et déplacement (px) par pixel."""
    h, w = img.shape[:2]; A = ancres(w, h); X = np.vstack([dst, A]); Y = np.vstack([src, A])
    c = np.mean(X[:len(dst)], 0); s = max(w, h)
    S = tps_resoudre((X - c) / s, (Y - c) / s)
    gx, gy = np.meshgrid(np.arange(0, w + pas, pas), np.arange(0, h + pas, pas)); G = np.stack([gx.ravel(), gy.ravel()], 1).astype(np.float64)
    M = tps_eval(S, (G - c) / s) * s + c
    xx, yy = np.meshgrid(np.arange(w, dtype=np.float32) / pas, np.arange(h, dtype=np.float32) / pas)
    mx = cv2.remap(M[:, 0].reshape(gx.shape).astype(np.float32), xx, yy, cv2.INTER_LINEAR)
    my = cv2.remap(M[:, 1].reshape(gx.shape).astype(np.float32), xx, yy, cv2.INTER_LINEAR)
    out = cv2.remap(img, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    X0, Y0 = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    return out, np.hypot(mx - X0, my - Y0)

def masque_poly(shape, pts, flou=0):
    m = np.zeros(shape[:2], np.float32); cv2.fillPoly(m, [np.round(pts).astype(np.int32)], 1, cv2.LINE_AA)
    return cv2.GaussianBlur(m, (0, 0), flou) if flou else m
def masque_peau(shape, P, io):
    """peau du visage : ovale moins yeux, sourcils, lèvres, narines ; bord fondu"""
    m = masque_poly(shape, P[OVALE_ORD])
    for z, g in [(OEIL_D_ORD, .12), (OEIL_G_ORD, .12), (SOURC_D_ORD, .08), (SOURC_G_ORD, .08), (LEVRES_EXT, .06)]:
        t = masque_poly(shape, P[z]); t = cv2.dilate(t, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(2 * g * io) | 1,) * 2)); m = np.minimum(m, 1 - t)
    m = cv2.erode(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(.06 * io) | 1,) * 2))
    return cv2.GaussianBlur(m, (0, 0), .04 * io)

# ======================= MESURES DE FORME (normalisées par l'écart des iris) =======================
def mesures(P):
    R = repere_visage(P); U = vers_uv(P, R)
    m = {'oeil_d': np.linalg.norm(U[33] - U[133]), 'oeil_g': np.linalg.norm(U[263] - U[362])}
    m['oeil_d_h'] = np.linalg.norm(U[159] - U[145]); m['oeil_g_h'] = np.linalg.norm(U[386] - U[374])
    m['nez'] = abs(U[278, 0] - U[48, 0]); m['nez_ailes'] = abs(U[294, 0] - U[64, 0])
    # largeur du bas du visage à 4 hauteurs entre le bout du nez et le menton (contour interpolé)
    ovd = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152]; ovg = [454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152]
    vt, vc = U[1, 1], U[152, 1]
    for k, f in enumerate([.2, .45, .65, .8]):
        v = vt + f * (vc - vt); ud = np.interp(v, U[ovd, 1], U[ovd, 0]); ug = np.interp(v, U[ovg, 1], U[ovg, 0]); m['joue%d' % k] = ug - ud
    m['menton'] = vc - vt
    return m

# ======================= FILTRES SIMULÉS (laboratoire) =======================
# ---------- champs de déformation (mêmes formes pour simuler un filtre et pour l'annuler) ----------
def _cloche(r, R): return np.where(r < R, (1 - (r / R) ** 2) ** 2, 0)
def champ_oeil(U, c, k, R=.45):
    """loupe locale autour du centre de l'iris c : facteur k au centre, 1 au rayon R (en écarts d'iris)"""
    d = U - U[c]; r = np.hypot(d[:, 0], d[:, 1]); return U[c] + d * (1 + (k - 1) * _cloche(r, R))[:, None]
def champ_nez(U, k, R=.55):
    c = U[[1, 4, 5, 195, 98, 327]].mean(0); axe = U[[1, 4, 5, 195], 0].mean(); d = U - c; r = np.hypot(d[:, 0] * .8, d[:, 1])
    V = U.copy(); V[:, 0] = axe + (U[:, 0] - axe) * (1 + (k - 1) * _cloche(r, R)); return V
OVD = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152]; OVG = [454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152]
NIV = [.2, .45, .65, .8]
def champ_joues(U, ks):
    """resserre/élargit le bas du visage : facteur ks[i] au contour au niveau NIV[i] (0 = bout du nez, 1 = menton), moins vers le centre"""
    vt, vc = U[1, 1], U[152, 1]; mid = U[[168, 1, 152], 0].mean(); V = U.copy()
    t = (U[:, 1] - vt) / (vc - vt)
    k = np.interp(t, [-.45] + NIV + [1.05], [1] + list(ks) + [ks[-1]])
    hw = np.maximum(.05, (np.interp(U[:, 1], U[OVG, 1], U[OVG, 0]) - np.interp(U[:, 1], U[OVD, 1], U[OVD, 0])) / 2)
    w = np.clip(np.abs(U[:, 0] - mid) / hw, 0, 1.3) ** 2
    V[:, 0] = mid + (U[:, 0] - mid) * (1 + (k - 1) * w); return V
def _appliquer(img, P, V_uv, R):
    Pd = depuis_uv(V_uv, R); out, dep = deformer(img, P, Pd); return out, Pd, (dep > .5).astype(np.float32)

def f_grands_yeux(img, P, s=1.3):
    R = repere_visage(P); U = vers_uv(P, R); V = champ_oeil(champ_oeil(U, 468, s), 473, s); return _appliquer(img, P, V, R)
def f_affiner(img, P, k_visage=.1, k_nez=.18):
    R = repere_visage(P); U = vers_uv(P, R); V = champ_joues(U, [1 - k_visage * f for f in (.5, .9, 1, .8)]); V = champ_nez(V, 1 - k_nez); return _appliquer(img, P, V, R)
def f_lissage(img, P, force=1.0, eclat=8):
    R = repere_visage(P); io = R[3]; m = masque_peau(img.shape, P, io)[..., None]
    d = max(5, int(io * .12)) | 1; L = img.astype(np.float32)
    for _ in range(2): L = cv2.bilateralFilter(L, d, 35, io * .08)
    L = np.clip(L * (1 + eclat / 100) + np.array([2, 2, 6]) * (eclat / 8), 0, 255)
    out = img * (1 - m * force) + L * m * force; return np.clip(out, 0, 255).astype(np.uint8), m[..., 0]
def f_maquillage(img, P, rouge=(70, 40, 200), alpha=.45, joues=.22):
    R = repere_visage(P); io = R[3]; out = img.astype(np.float32); masq = np.zeros(img.shape[:2], np.float32)
    lev = masque_poly(img.shape, P[LEVRES_EXT], .02 * io) - masque_poly(img.shape, P[[78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]], .01 * io)
    lev = np.clip(lev, 0, 1); col = np.array(rouge, np.float32)
    lum = out.mean(2, keepdims=True); out = out * (1 - alpha * lev[..., None]) + (col * lum / 128) * alpha * lev[..., None]; masq = np.maximum(masq, lev * alpha)
    for c in [205, 425]:   # joues
        g = np.zeros(img.shape[:2], np.float32); cv2.circle(g, tuple(np.round(P[c]).astype(int)), int(.28 * io), 1, -1); g = cv2.GaussianBlur(g, (0, 0), .14 * io) * joues
        out = out * (1 - g[..., None]) + np.array([150, 120, 235], np.float32) * g[..., None]; masq = np.maximum(masq, g)
    return np.clip(out, 0, 255).astype(np.uint8), masq
def _ellipse(shape, c, ax, ang=0):
    m = np.zeros(shape[:2], np.float32); cv2.ellipse(m, tuple(np.round(c).astype(int)), tuple(np.maximum(1, np.round(ax)).astype(int)), ang, 0, 360, 1, -1, cv2.LINE_AA); return m
def f_chien(img, P, oreilles=True):
    """museau, moustaches, oreilles (couleurs et formes d'un filtre « chien » courant)"""
    R = repere_visage(P); o, ux, uy, io = R; ang = np.degrees(np.arctan2(ux[1], ux[0])); out = img.astype(np.float32); masq = np.zeros(img.shape[:2], np.float32)
    def poser(m, couleur, ombre=None):
        nonlocal out, masq; m = cv2.GaussianBlur(m, (0, 0), .01 * io + .5)
        c = np.array(couleur, np.float32)
        if ombre is not None: c = c[None, None] * (1 - ombre[..., None] * .35)
        out = out * (1 - m[..., None]) + c * m[..., None]; masq = np.maximum(masq, m)
    n = P[4] + uy * io * .02; m = _ellipse(img.shape, n, (io * .36, io * .24), ang)
    yy, xx = np.mgrid[:img.shape[0], :img.shape[1]]; ombre = np.clip(((xx - n[0]) * uy[0] + (yy - n[1]) * uy[1]) / (io * .24), 0, 1)
    poser(m, (30, 38, 52), ombre); poser(_ellipse(img.shape, n - uy * io * .1 - ux * io * .1, (io * .08, io * .05), ang), (210, 215, 225))
    for cote in (-1, 1):   # moustaches
        for k in range(3):
            a = P[4] + ux * cote * io * .38 + uy * io * (.05 + .08 * k); b = a + ux * cote * io * .55 + uy * io * (k - 1) * .12
            m = np.zeros(img.shape[:2], np.float32); cv2.line(m, tuple(np.round(a).astype(int)), tuple(np.round(b).astype(int)), 1, max(1, int(io * .018)), cv2.LINE_AA); poser(m, (25, 25, 30))
    if oreilles:
        for cote in (-1, 1):
            base = P[10] - uy * io * .25 + ux * cote * io * .75
            tri = np.array([base - ux * io * .35, base + ux * io * .35, base - uy * io * .9 + ux * cote * io * .25])
            m = np.zeros(img.shape[:2], np.float32); cv2.fillPoly(m, [np.round(tri).astype(np.int32)], 1, cv2.LINE_AA); poser(m, (40, 75, 120))
    return np.clip(out, 0, 255).astype(np.uint8), masq
def f_chat(img, P):
    R = repere_visage(P); o, ux, uy, io = R; out = img.astype(np.float32); masq = np.zeros(img.shape[:2], np.float32)
    def poser(m, c):
        nonlocal out, masq; m = cv2.GaussianBlur(m, (0, 0), .01 * io + .5); out = out * (1 - m[..., None]) + np.array(c, np.float32) * m[..., None]; masq = np.maximum(masq, m)
    n = P[4]; tri = np.array([n - ux * io * .14 - uy * io * .06, n + ux * io * .14 - uy * io * .06, n + uy * io * .1])
    m = np.zeros(img.shape[:2], np.float32); cv2.fillPoly(m, [np.round(tri).astype(np.int32)], 1, cv2.LINE_AA); poser(m, (170, 140, 245))
    for cote in (-1, 1):
        for k in range(3):
            a = P[4] + ux * cote * io * .3 + uy * io * (.06 * k); b = a + ux * cote * io * .6 + uy * io * (k - 1) * .1
            m = np.zeros(img.shape[:2], np.float32); cv2.line(m, tuple(np.round(a).astype(int)), tuple(np.round(b).astype(int)), 1, max(1, int(io * .014)), cv2.LINE_AA); poser(m, (245, 245, 245))
    return np.clip(out, 0, 255).astype(np.uint8), masq

# ======================= RECONSTRUCTION GUIDÉE PAR DES PHOTOS SANS FILTRE =======================
# Réglages : TOL = écart de forme toléré entre deux vraies photos de la même personne (mesuré sur le laboratoire, paires sans filtre)
REG = {'tol_oeil': .07, 'tol_nez': .08, 'tol_joue': .06, 'seuil_ajout': 26, 'detail_sigma': .035}

def _moyenne(ms):
    k = ms[0].keys(); return {x: float(np.median([m[x] for m in ms])) for x in k}

def _resoudre(f, cible, lo=.5, hi=1.6):
    """k tel que f(k) = cible (f croissante), par dichotomie"""
    for _ in range(40):
        m = (lo + hi) / 2
        if f(m) < cible: lo = m
        else: hi = m
    return (lo + hi) / 2
def corriger_forme(img, P, Mref, journal):
    """Déforme la photo filtrée pour que les proportions (yeux, nez, bas du visage) retrouvent celles des photos de référence.
       On n'agit que si l'écart dépasse la variation naturelle entre deux vraies photos (REG tol_*)."""
    R = repere_visage(P); U = vers_uv(P, R); V = U.copy(); Mf = mesures(P); bouge = False
    for cote, c, w in [('droit', 468, 'oeil_d'), ('gauche', 473, 'oeil_g')]:
        r = Mref[w] / Mf[w]
        if abs(1 - r) > REG['tol_oeil']:
            k = _resoudre(lambda k: mesures(depuis_uv(champ_oeil(V, c, k), R))[w], Mref[w]); V = champ_oeil(V, c, k); bouge = True
            journal.append(f"œil {cote} ramené à sa vraie taille (largeur ×{r:.2f})")
    r = Mref['nez'] / Mf['nez']
    if abs(1 - r) > REG['tol_nez']:
        k = _resoudre(lambda k: mesures(depuis_uv(champ_nez(V, k), R))['nez'], Mref['nez']); V = champ_nez(V, k); bouge = True
        journal.append(f"largeur du nez rétablie (×{r:.2f})")
    rs = [Mref['joue%d' % i] / Mf['joue%d' % i] for i in range(4)]
    if max(abs(1 - x) for x in rs) > REG['tol_joue']:
        V = champ_joues(V, rs); bouge = True; journal.append("largeur du bas du visage rétablie (" + ", ".join(f"×{x:.2f}" for x in rs) + ")")
    if not bouge: return img, P, np.zeros(img.shape[:2], np.float32)
    out, Pd, m = _appliquer(img, P, V, R); return out, Pd, m

def aligner_ref(ref, Pr, P, shape):
    """photo de référence déformée pour épouser le visage cible (TPS sur les 478 repères) + masque de validité"""
    h, w = shape[:2]; c = P.mean(0); s = max(w, h)
    S = tps_resoudre((P - c) / s, (Pr - c) / s, lam=1e-2); pas = 4
    gx, gy = np.meshgrid(np.arange(0, w + pas, pas), np.arange(0, h + pas, pas)); G = np.stack([gx.ravel(), gy.ravel()], 1).astype(np.float64)
    M = tps_eval(S, (G - c) / s) * s + c
    xx, yy = np.meshgrid(np.arange(w, dtype=np.float32) / pas, np.arange(h, dtype=np.float32) / pas)
    mx = cv2.remap(M[:, 0].reshape(gx.shape).astype(np.float32), xx, yy, cv2.INTER_LINEAR); my = cv2.remap(M[:, 1].reshape(gx.shape).astype(np.float32), xx, yy, cv2.INTER_LINEAR)
    out = cv2.remap(ref, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return out

def _flou_norm(x, m, sig):
    num = cv2.GaussianBlur(x * m[..., None] if x.ndim == 3 else x * m, (0, 0), sig); den = cv2.GaussianBlur(m, (0, 0), sig) + 1e-4
    return num / (den[..., None] if x.ndim == 3 else den)

def reconstruire(img, refs, P=None, journal=None, forme=False, gfpgan=True, maquillage=False, texture=False, sans_ref=False):
    """img : photo filtrée (BGR). refs : liste de photos de la MÊME personne sans filtre. Renvoie sortie, carte {zone: masque}, journal."""
    journal = [] if journal is None else journal
    P = reperes(img) if P is None else P
    if P is None: return img, {}, ["aucun visage trouvé sur la photo filtrée"]
    R_ = []
    for r in refs:
        Pr = reperes(r)
        if Pr is not None: R_.append((r, Pr))
    if not R_: return img, {}, ["aucun visage trouvé sur les photos de référence"]
    # 1) forme
    if forme:   # désactivé par défaut : voir REG et le registre (mesure trop bruitée d'une photo à l'autre)
        out, P2, m_forme = corriger_forme(img, P, _moyenne([mesures(Pr) for _, Pr in R_]), journal)
    else: out, P2, m_forme = img, P, np.zeros(img.shape[:2], np.float32)
    io = repere_visage(P2)[3]
    # 2) chaque référence épouse le visage corrigé ; on garde la plus proche (pose, expression) puis on recale ses couleurs
    peau = masque_peau(out.shape, P2, io); ovale = masque_poly(out.shape, P2[OVALE_ORD]); best = None
    for r, Pr in R_:
        W = aligner_ref(r, Pr, P2, out.shape).astype(np.float32)
        e = np.abs(cv2.GaussianBlur(cv2.cvtColor(W.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), .2 * io) - cv2.GaussianBlur(cv2.cvtColor(out, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), .2 * io))
        sc = float((e * peau).sum() / (peau.sum() + 1))
        if best is None or sc < best[0]: best = (sc, W)
    W = best[1]; F = out.astype(np.float32)
    # 3) ajouts (museau, moustaches, nez de chat…) : pixels du visage qui ne ressemblent ni à la peau de CETTE photo (teinte, ou
    #    beaucoup plus sombre/clair que la peau voisine) ni à un trait du visage connu (yeux, sourcils, lèvres, narines), alors
    #    qu'à cet endroit la référence montre de la peau.
    LabF = cv2.cvtColor(out, cv2.COLOR_BGR2LAB).astype(np.float32); LabR = cv2.cvtColor(np.clip(W, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    traits = np.zeros(out.shape[:2], np.float32)
    for z, g in [(OEIL_D_ORD, .1), (OEIL_G_ORD, .1), (SOURC_D_ORD, .07), (SOURC_G_ORD, .07), (LEVRES_EXT, .05)]:
        traits = np.maximum(traits, cv2.dilate(masque_poly(out.shape, P2[z]), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(2 * g * io) | 1,) * 2)))
    narines = cv2.dilate(masque_poly(out.shape, P2[[98, 97, 2, 326, 327, 294, 278, 1, 48, 64]]), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(.05 * io) | 1,) * 2))
    zone = np.clip(ovale - traits, 0, 1)
    def ecart_peau(Lab, poids):
        ref_loc = _flou_norm(Lab, poids, .35 * io)   # couleur de peau locale (ombres comprises), sans les candidats
        dc = np.hypot(Lab[..., 1] - ref_loc[..., 1], Lab[..., 2] - ref_loc[..., 2]); dl = np.abs(Lab[..., 0] - ref_loc[..., 0]) / np.maximum(ref_loc[..., 0], 20)
        return np.maximum(dc / 18, dl / .28)   # teinte différente, ou plus sombre / clair que la peau voisine
    # nouveauté de structure : contours nets présents sur la photo mais pas sur la référence alignée (une ombre ou un fard ont des
    # bords doux ; un museau, une moustache ou un nez dessiné ont des bords nets)
    gF = _grad(LabF[..., 0]); gW = _grad(LabR[..., 0]); pk = peau > .5
    kx = np.median(gF[pk]) / max(np.median(gW[pk]), 1e-3) if pk.sum() > 100 else 1
    nouv = gF / (cv2.dilate(gW * kx, np.ones((int(.03 * io) | 1,) * 2)) + 4)
    nouv_f = cv2.dilate((nouv > 2.2).astype(np.uint8), np.ones((3, 3)))
    # référence ramenée à la lumière de la photo (très grande échelle) : sert à vérifier qu'un candidat n'existe PAS sur la vraie peau
    Wn = W * (_flou_norm(F, ovale, .3 * io) / np.maximum(_flou_norm(W, ovale, .3 * io), 1))
    dFW = np.sqrt(((LabF - cv2.cvtColor(np.clip(Wn, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)) ** 2).sum(2))
    dFW = cv2.GaussianBlur(dFW, (0, 0), .01 * io + .5)
    ajout = np.zeros(out.shape[:2], np.float32); amin = (.035 * io) ** 2
    for it in range(3):
        sc = ecart_peau(LabF, peau * (1 - ajout))
        a = ((sc > .75) * zone).astype(np.uint8)
        a = cv2.morphologyEx(a, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(.05 * io) | 1,) * 2))
        n_, lab_, st_, _ = cv2.connectedComponentsWithStats(a, 8); garde = np.zeros_like(a)
        for i in range(1, n_):
            if st_[i, cv2.CC_STAT_AREA] < amin: continue
            ci = lab_ == i; bord = ci & ~cv2.erode(ci.astype(np.uint8), np.ones((3, 3))).astype(bool)
            fr = float(nouv_f[bord].mean()) if bord.sum() else 0; tres_sombre = float((sc[ci] > 1.6).mean())
            anneau = cv2.dilate(ci.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(.12 * io) | 1,) * 2)).astype(bool) & ~ci & (ovale > .5)
            dIn = float(dFW[ci].mean()); dAn = float(dFW[anneau].mean()) if anneau.sum() > 20 else 99
            absent_ref = dIn > 1.3 * dAn + 8   # présent sur la photo, absent (ou très différent) sur la référence : un ajout, pas un trait du visage
            if os.environ.get("DBG"): print("comp", st_[i, cv2.CC_STAT_AREA], round(dIn, 1), round(dAn, 1), round(fr, 2), round(tres_sombre, 2))
            if absent_ref and (fr > .25 or tres_sombre > .3): garde[ci] = 1
        inv = (1 - garde).astype(np.uint8); n2, l2, s2, _ = cv2.connectedComponentsWithStats(inv, 4)   # trous (reflets d'un museau) bouchés
        for i in range(1, n2):
            if s2[i, cv2.CC_STAT_AREA] < (.25 * io) ** 2: garde[l2 == i] = 1
        ajout = cv2.dilate(garde, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(.05 * io) | 1,) * 2)).astype(np.float32)
    ajout_f = cv2.GaussianBlur(ajout.astype(np.float32), (0, 0), .012 * io + .5)
    if ajout.sum() > (.002 * io * io): journal.append("éléments ajoutés recouverts grâce à ta photo de référence (%.0f %% du visage)" % (100 * ajout.sum() / (ovale.sum() + 1)))
    # remplissage : la STRUCTURE (détails, formes) vient de la référence, la LUMIÈRE vient de la photo filtrée autour de la zone
    s1 = .10 * io; libre = np.clip(ovale * (1 - cv2.dilate(ajout, np.ones((3, 3)))), 0, 1)
    baseF = _flou_norm(F, np.maximum(libre, 1e-3 * (1 - ovale)), s1 * 2.5)
    baseW = _flou_norm(W, np.maximum(libre, 1e-3 * (1 - ovale)), s1 * 2.5)
    Wc = W * (baseF / np.maximum(baseW, 1))
    LabW = cv2.cvtColor(np.clip(Wc, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    # 4) couleur du maquillage : la teinte moyenne (pas la lumière) des lèvres, joues et paupières revient à celle de la référence
    LabWc = LabW; sm = .06 * io; peau_l = np.clip(peau + np.clip(masque_poly(out.shape, P2[LEVRES_EXT]) - ajout, 0, 1), 0, 1)
    ab = LabF[..., 1:] - _flou_norm(LabF[..., 1:], peau_l, sm) + _flou_norm(LabWc[..., 1:], peau_l, sm)
    Lab2 = LabF.copy()
    if maquillage: Lab2[..., 1:] = LabF[..., 1:] * (1 - peau_l[..., None]) + ab * peau_l[..., None]
    dmaq = np.sqrt(((Lab2[..., 1:] - LabF[..., 1:]) ** 2).sum(2)) * peau_l
    if maquillage and (dmaq > 6).sum() > .01 * ovale.sum(): journal.append("teinte du maquillage remplacée par celle de ta peau / tes lèvres (référence)")
    # 5) grain de peau effacé par le lissage : on compare le grain FIN (pores) de la photo et de la référence sur toute la peau,
    #    et on rajoute le grain de la référence d'un seul niveau uniforme (pas les rides ni les ombres d'une autre lumière)
    sd = .012 * io + .4; Lf = Lab2[..., 0]; Lw = LabW[..., 0]
    Df = Lf - cv2.GaussianBlur(Lf, (0, 0), sd); Dw = Lw - cv2.GaussianBlur(Lw, (0, 0), sd)
    pk = (peau > .5) & (ajout_f < .1)
    ef, ew = (np.median(np.abs(Df[pk])), np.median(np.abs(Dw[pk]))) if pk.sum() > 100 else (1, 1)
    gain = float(np.clip(1 - ef / max(ew, 1e-3), 0, 1)) if (ew > .5 and texture) else 0.
    manque = peau * (1 - ajout_f) * gain
    Lab2[..., 0] = Lf + manque * Dw
    if texture and gain > .25: journal.append("grain de peau effacé par le lissage remis (%.0f %% du grain manquait)" % (100 * gain))
    if ajout.sum() == 0 and not (maquillage or texture):
        return out, {'forme': m_forme, 'ajouts': ajout_f, 'maquillage': 0 * ajout_f, 'texture': 0 * ajout_f}, journal + ["aucun élément de filtre trouvé sur le visage : photo laissée telle quelle"]
    sortie = cv2.cvtColor(np.clip(Lab2, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)
    if not (maquillage or texture): sortie = out.astype(np.float32)
    if sans_ref: Wc = cv2.inpaint(out, (ajout > 0).astype(np.uint8), max(3, int(.05 * io)), cv2.INPAINT_TELEA).astype(np.float32)
    sortie = sortie * (1 - ajout_f[..., None]) + np.clip(Wc, 0, 255) * ajout_f[..., None]
    sortie = np.clip(sortie, 0, 255).astype(np.uint8)
    # 6) finition : la zone recouverte (et ses abords) est redessinée par GFPGAN pour accorder lumière et netteté
    if gfpgan and ajout.sum() > 0:
        mg = cv2.GaussianBlur(cv2.dilate(ajout.astype(np.float32), np.ones((int(.08 * io) | 1,) * 2)), (0, 0), .03 * io)
        sortie = gfpgan_zone(sortie, P2, np.clip(mg, 0, 1)); journal.append("zone recouverte redessinée (lumière, netteté)")
    carte = {'forme': m_forme, 'ajouts': ajout_f, 'maquillage': np.clip(dmaq / 15, 0, 1), 'texture': manque}
    return sortie, carte, journal

# ---------- mesure par l'image (les repères MediaPipe sont trop « réguliers » : un œil agrandi de 27 % n'y grandit que de 7 %) ----------
def _grad(g):
    g = cv2.GaussianBlur(g, (0, 0), 1.0); return np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
def estimer_echelle(F, W, c, rayon, mode='iso', ks=np.arange(.70, 1.46, .01)):
    """Facteur k tel que la référence alignée W, agrandie de k autour de c, ressemble le plus à la photo F (corrélation des contours).
       mode 'iso' (œil) ou 'h' (largeur seulement, nez). Renvoie k et la qualité de l'appariement (0..1)."""
    x0, y0 = int(c[0] - 1.6 * rayon), int(c[1] - 1.6 * rayon); x1, y1 = int(c[0] + 1.6 * rayon), int(c[1] + 1.6 * rayon)
    h, w = F.shape[:2]; x0, y0, x1, y1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
    gF = _grad(cv2.cvtColor(F[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY).astype(np.float32)); gW = _grad(cv2.cvtColor(W[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY).astype(np.float32))
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32); cx, cy = c
    poids = _cloche(np.hypot(xx - cx, yy - cy), rayon).astype(np.float32)
    best = (-2, 1)
    a = gF * poids; a = a - (a * poids).sum() / poids.sum()
    for k in ks:
        sx = cx + (xx - cx) / k; sy = cy + (yy - cy) / (k if mode == 'iso' else 1)
        b = cv2.remap(gW, (sx - x0).astype(np.float32), (sy - y0).astype(np.float32), cv2.INTER_LINEAR) * poids; b = b - (b * poids).sum() / poids.sum()
        r = float((a * b * poids).sum() / (np.sqrt((a * a * poids).sum() * (b * b * poids).sum()) + 1e-6))
        if r > best[0]: best = (r, k)
    return best[1], best[0]

def rayon_iris(img, c, io):
    """Rayon de l'iris (en écarts d'iris) mesuré sur l'image : bord sombre→clair le plus net dans les secteurs gauche et droit
       (le haut et le bas sont souvent cachés par les paupières). La taille de l'iris est la même sur toutes les photos d'une personne."""
    g = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), max(.6, io * .004))
    rs = np.linspace(.05, .16, 45) * io; ang = np.concatenate([np.linspace(-.6, .6, 13), np.pi + np.linspace(-.6, .6, 13)])
    prof = np.array([[cv2.getRectSubPix(g, (1, 1), (float(c[0] + r * np.cos(a)), float(c[1] + r * np.sin(a))))[0, 0] for r in rs] for a in ang])
    d = np.diff(prof, axis=1)   # sombre → clair = dérivée positive
    best = []
    for p in d:
        i = int(np.argmax(p)); best.append(rs[i] / io if p[i] > 2 else np.nan)
    v = np.array(best); v = v[~np.isnan(v)]
    if len(v) < 6: return np.nan, 0
    m = np.median(v); return float(m), float(np.mean(np.abs(v - m) < .012))

# ---------- finition par GFPGAN : la zone recouverte est re-dessinée de façon cohérente (lumière, netteté) ----------
_gf = None
GABARIT = np.array([[192.98138, 239.94708], [318.90277, 240.1936], [256.63416, 314.01935], [201.26117, 371.41043], [313.08905, 371.15118]])
def gfpgan_zone(img, P, masque, chemin=None):
    """GFPGAN sur le visage aligné ; le résultat n'est gardé que dans `masque` (bord fondu). Renvoie l'image."""
    global _gf
    import onnxruntime as ort
    if _gf is None: _gf = ort.InferenceSession(chemin or os.environ.get('GFPGAN', os.path.join(ICI, '../../modeles/lourds/gfpgan14_int8w.onnx')), providers=['CPUExecutionProvider'])
    src = P[[468, 473, 1, 61, 291]].astype(np.float32); M, _ = cv2.estimateAffinePartial2D(src, GABARIT.astype(np.float32), method=cv2.LMEDS)
    al = cv2.warpAffine(img, M, (512, 512), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    x = (cv2.cvtColor(al, cv2.COLOR_BGR2RGB).astype(np.float32) / 127.5 - 1).transpose(2, 0, 1)[None]
    y = _gf.run(None, {'entree': x})[0][0].transpose(1, 2, 0); y = cv2.cvtColor(((np.clip(y, -1, 1) + 1) * 127.5).astype(np.float32), cv2.COLOR_RGB2BGR)
    y = y + (al.astype(np.float32).reshape(-1, 3).mean(0) - y.reshape(-1, 3).mean(0))   # même teinte moyenne
    h, w = img.shape[:2]; Mi = cv2.invertAffineTransform(M)
    back = cv2.warpAffine(y, Mi, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    valide = cv2.warpAffine(np.ones((512, 512), np.float32), Mi, (w, h)); m = (masque * cv2.erode(valide, np.ones((5, 5))))[..., None]
    return np.clip(img * (1 - m) + back * m, 0, 255).astype(np.uint8)

# ---------- détecteur appris (entrainer_ajouts.py) et remplissage MI-GAN : la chaîne qui sera portée dans l'app ----------
_det_aj = None; _mg = None
def detecter_ajouts(img, P, seuil=.5, chemin=None, S=192):
    """probabilité « élément ajouté par un filtre » (0..1) pour chaque pixel de l'image, via le petit U-Net du laboratoire"""
    global _det_aj
    import onnxruntime as ort
    if _det_aj is None: _det_aj = ort.InferenceSession(chemin or os.path.join(ICI, '../../modeles/lourds/detecteur_ajouts_v2.onnx'), providers=['CPUExecutionProvider'])
    o, ux, uy, io = repere_visage(P); c = o + uy * io * .35; s = io * 4.6; a = np.degrees(np.arctan2(ux[1], ux[0]))
    M = cv2.getRotationMatrix2D((float(c[0]), float(c[1])), a, S / s); M[:, 2] += np.array([S / 2, S / 2]) - c
    x = cv2.warpAffine(img, M, (S, S), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REFLECT).astype(np.float32).transpose(2, 0, 1)[None]
    p = 1 / (1 + np.exp(-_det_aj.run(None, {'image': x})[0][0, 0]))
    h, w = img.shape[:2]; return cv2.warpAffine(p.astype(np.float32), cv2.invertAffineTransform(M), (w, h), flags=cv2.INTER_LINEAR)
def remplir_migan(img, masque, chemin=None):
    """MI-GAN (MIT) : reconstruit la zone masque>0 à partir des alentours (comme « Effacer une zone » de l'app)"""
    global _mg
    import onnxruntime as ort
    if _mg is None: _mg = ort.InferenceSession(chemin or os.environ.get('MIGAN', os.path.join(ICI, 'migan_pipeline_v2.onnx')), providers=['CPUExecutionProvider'])
    ys, xs = np.nonzero(masque > 0)
    if not len(xs): return img
    h, w = img.shape[:2]; bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1; m = max(96, int(round(max(bw, bh) * .5)))   # même contexte que effacer.js
    x0, y0, x1, y1 = max(0, xs.min() - m), max(0, ys.min() - m), min(w, xs.max() + 1 + m), min(h, ys.max() + 1 + m)
    cr = img[y0:y1, x0:x1]; mk = (masque[y0:y1, x0:x1] > 0)
    r = _mg.run(None, {'image': cv2.cvtColor(cr, cv2.COLOR_BGR2RGB).transpose(2, 0, 1)[None].copy(), 'mask': ((1 - mk) * 255).astype(np.uint8)[None, None]})[0][0]
    r = cv2.cvtColor(r.transpose(1, 2, 0).astype(np.uint8), cv2.COLOR_RGB2BGR)
    out = img.copy(); a = mk[..., None].astype(np.float32); out[y0:y1, x0:x1] = (cr * (1 - a) + r * a).astype(np.uint8)   # comme l'app : la pièce ne couvre que le trou
    return out
def retirer_ajouts(img, P=None, seuil=.6, journal=None, gfpgan=True):
    """chaîne de l'app : détecteur appris → MI-GAN → GFPGAN sur le visage (dans la zone touchée seulement). Aucune référence requise."""
    journal = [] if journal is None else journal; P = reperes(img) if P is None else P
    if P is None: return img, np.zeros(img.shape[:2], np.float32), ["aucun visage trouvé"]
    o_, ux_, uy_, io = repere_visage(P); p = detecter_ajouts(img, P)
    yy, xx = np.mgrid[:img.shape[0], :img.shape[1]].astype(np.float32); dx, dy = xx - o_[0], yy - o_[1]
    u = (dx * ux_[0] + dy * ux_[1]) / io; v = (dx * uy_[0] + dy * uy_[1]) / io
    p = p * ((u / 1.7) ** 2 + ((v - .2) / 2.4) ** 2 < 1)   # seulement la tête et juste autour (oreilles d'animal) : pas le décor
    m = (p > seuil).astype(np.uint8); n_, l_, st_, _ = cv2.connectedComponentsWithStats(m, 8)
    m = np.isin(l_, [i for i in range(1, n_) if st_[i, cv2.CC_STAT_AREA] >= (.04 * io) ** 2]).astype(np.uint8)
    if not m.any(): return img, np.zeros(img.shape[:2], np.float32), journal + ["aucun élément de filtre trouvé : photo laissée telle quelle"]
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(.06 * io) | 1,) * 2))
    out = remplir_migan(img, m); ov = masque_poly(img.shape, P[OVALE_ORD])
    journal.append("éléments de filtre retirés (%.1f %% de l'image)" % (100 * m.mean()))
    if gfpgan and (m * ov).sum() > 0:
        mg = cv2.GaussianBlur(cv2.dilate((m * (ov > .5)).astype(np.float32), np.ones((int(.08 * io) | 1,) * 2)), (0, 0), .03 * io)
        out = gfpgan_zone(out, P, np.clip(mg, 0, 1)); journal.append("visage redessiné là où était le filtre")
    return out, m.astype(np.float32), journal
