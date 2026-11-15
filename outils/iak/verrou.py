import numpy as np, cv2
def tente(x, step):
    k = np.array([1, 2, 1], np.float32) / 4; out = x.astype(np.float32)
    for ax in (0, 1):
        a = np.roll(out, step, ax); b = np.roll(out, -step, ax); out = out * .5 + (a + b) * .25
    return out
def verrou(c, src, fid=1.0):
    """émulation du shader v8.3 : c = image traitée (taille de sortie), src = image d'origine (petite)"""
    H, W = c.shape[:2]; s = W // src.shape[1]
    up = lambda x: cv2.resize(x, (W, H), interpolation=cv2.INTER_LINEAR)
    bs = up(tente(src, 1)); bc = tente(c, s)
    lo = up(cv2.erode(src, np.ones((3, 3), np.uint8)).astype(np.float32)); hi = up(cv2.dilate(src, np.ones((3, 3), np.uint8)).astype(np.float32))
    r = bs + (c.astype(np.float32) - bc)
    m = 255 * (.025 + .06 * np.sqrt(((hi - lo) / 255) ** 2).sum(2, keepdims=True) / np.sqrt(3) * np.sqrt(3))
    m = 255 * (.025 + .06 * np.linalg.norm((hi - lo) / 255, axis=2, keepdims=True))
    out = np.clip(r, lo - m, hi + m)
    return np.clip(c + fid * (out - c), 0, 255).astype(np.uint8)
