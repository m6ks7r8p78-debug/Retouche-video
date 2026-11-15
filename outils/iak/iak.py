# Prototype de référence « IA par images clés » (à porter à l'identique en JavaScript : iak.js)
import numpy as np, cv2
SW, TILE, R, KMAX, CONF_MIN = 320, 10, 6, 8, 0.6

def luma(f, sw):
    h, w = f.shape[:2]; sh = max(2, round(h * sw / w))
    g = cv2.resize(f, (sw, sh), interpolation=cv2.INTER_AREA).astype(np.float32)
    return g[..., 0] * .299 + g[..., 1] * .587 + g[..., 2] * .114

def mouvement(cur, key):
    """vecteur par tuile (petite échelle) : cur(x) ≈ key(x + d) ; confiance d'après l'écart restant"""
    h, w = cur.shape; gy, gx = h // TILE, w // TILE
    big = np.pad(key, R, mode="edge")
    best = np.full((gy, gx), 1e9, np.float32); bd = np.zeros((gy, gx, 2), np.float32)
    cc = cur[:gy * TILE, :gx * TILE]
    sads = {}
    for dy in range(-R, R + 1):
        for dx in range(-R, R + 1):
            k = big[R + dy:R + dy + gy * TILE, R + dx:R + dx + gx * TILE]
            s = np.abs(cc - k).reshape(gy, TILE, gx, TILE).mean((1, 3))
            sads[(dx, dy)] = s
            m = s < best; best[m] = s[m]; bd[m] = (dx, dy)
    # affinage sous-pixel (parabole sur les voisins)
    sub = bd.copy()
    for j in range(gy):
        for i in range(gx):
            dx, dy = int(bd[j, i, 0]), int(bd[j, i, 1]); c = sads[(dx, dy)][j, i]
            if -R < dx < R:
                a, b = sads[(dx - 1, dy)][j, i], sads[(dx + 1, dy)][j, i]; d = a - 2 * c + b
                if d > 1e-6: sub[j, i, 0] += np.clip(.5 * (a - b) / d, -.5, .5)
            if -R < dy < R:
                a, b = sads[(dx, dy - 1)][j, i], sads[(dx, dy + 1)][j, i]; d = a - 2 * c + b
                if d > 1e-6: sub[j, i, 1] += np.clip(.5 * (a - b) / d, -.5, .5)
    conf = np.clip(1 - np.maximum(0, best - 1.5) / 6, 0, 1)
    return sub, conf

def champ(t, H, W):
    """grandeur par tuile -> champ continu à la taille de sortie (interpolation entre centres de tuiles)"""
    return cv2.resize(t, (W, H), interpolation=cv2.INTER_LINEAR)

DN = 1.0
def debruite(f):
    """filtre préservant les contours 3×3 (le même que le débruitage de l'app, FSB) : retire le bruit propre à chaque image"""
    if DN <= 0: return f.astype(np.float32)
    x = f.astype(np.float32) / 255; p = np.pad(x, ((1, 1), (1, 1), (0, 0)), mode="edge"); h, w = x.shape[:2]
    acc = np.zeros_like(x); ws = np.zeros(x.shape[:2] + (1,), np.float32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            n = p[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]; d = n - x; k = np.exp(-(d * d).sum(2, keepdims=True) / .01)
            acc += n * k; ws += k
    return (x + DN * (acc / ws - x)) * 255

class IAK:
    def __init__(self, sr): self.sr, self.key, self.n, self.nk = sr, None, 0, 0
    def frame(self, f):
        sw = min(SW, f.shape[1]); cur = luma(f, sw)
        if self.key is not None and self.n < KMAX and self.key[0].shape == cur.shape:
            d, conf = mouvement(cur, self.key[0])
            if conf.mean() >= CONF_MIN:
                res = self.key[1]; H, W = res.shape[:2]; s = W / sw
                vx, vy = champ(d[..., 0] * s, H, W), champ(d[..., 1] * s, H, W); cf = champ(conf, H, W)
                yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
                warp = cv2.remap(res, xx + vx, yy + vy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
                base = cv2.resize(debruite(f), (W, H), interpolation=cv2.INTER_CUBIC)
                self.n += 1
                return np.clip(base + cf[..., None] * warp, 0, 255).astype(np.uint8)
        out = self.sr(f); H, W = out.shape[:2]
        base = cv2.resize(debruite(f), (W, H), interpolation=cv2.INTER_CUBIC)
        self.key = (cur, out.astype(np.float32) - base); self.n = 1; self.nk += 1
        return out
