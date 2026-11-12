# Recalage fin image contre image (similitude à 4 paramètres, Gauss-Newton, 3 échelles) — référence Python de `recaler`
# dans filtre-video.js (même algorithme, mêmes bornes). Utilisé par les bancs F10 (tests/labo_filtres) et F14 (tests/visage_ia).
import cv2, numpy as np
BORNES = (.12, .15, .08)   # échelle, angle (rad), déplacement (part du côté) au-delà desquels le recalage est refusé
def recaler(Rg, Ig, poids, it=12, bornes=None):
    """Cherche D (2×3) tel que Ig(D(x)) ≈ Rg(x) sur la zone pondérée ; images carrées en niveaux de gris (float32).
    YuNet seul se trompe de plusieurs degrés et de quelques % d'échelle (mesuré). Renvoie None si le résultat sort des bornes."""
    HS = Rg.shape[0]; A = np.eye(2); tr = np.zeros(2); c = np.array([HS / 2, HS / 2]); bornes = bornes or BORNES   # D(x) = A·(x − c) + tr + c
    for ech in (8, 4, 2):
        n = HS // ech; R = cv2.GaussianBlur(cv2.resize(Rg, (n, n), interpolation=cv2.INTER_AREA), (0, 0), 1.); I0 = cv2.GaussianBlur(cv2.resize(Ig, (n, n), interpolation=cv2.INTER_AREA), (0, 0), 1.)
        w = cv2.resize(poids, (n, n), interpolation=cv2.INTER_AREA); y, x = np.mgrid[:n, :n].astype(np.float32); x -= (n - 1) / 2; y -= (n - 1) / 2
        for _ in range(it):
            mx = (A[0, 0] * x + A[0, 1] * y + tr[0] / ech + (n - 1) / 2).astype(np.float32); my = (A[1, 0] * x + A[1, 1] * y + tr[1] / ech + (n - 1) / 2).astype(np.float32)
            Iw = cv2.remap(I0, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE); gx = cv2.Sobel(Iw, cv2.CV_32F, 1, 0, ksize=3) / 8; gy = cv2.Sobel(Iw, cv2.CV_32F, 0, 1, ksize=3) / 8
            e = ((Iw - R) * w).ravel().astype(np.float64); J = (np.stack([gx * x + gy * y, -gx * y + gy * x, gx, gy], -1) * w[..., None]).reshape(-1, 4).astype(np.float64)
            d = np.linalg.solve(J.T @ J + 1e-3 * np.eye(4), -J.T @ e)
            U = np.array([[1 + d[0], -d[1]], [d[1], 1 + d[0]]]); tr = tr + A @ d[2:] * ech; A = A @ U   # D ← D ∘ (I + δ)
            if np.abs(d[2:]).max() < .01 and np.abs(d[:2]).max() < 1e-4: break
    if abs(np.hypot(A[0, 0], A[1, 0]) - 1) > bornes[0] or abs(np.arctan2(A[1, 0], A[0, 0])) > bornes[1] or np.abs(tr).max() > bornes[2] * HS: return None
    return np.hstack([A, (tr + c - A @ c)[:, None]])
def composer(D, M):
    """cadrage recalé : M' = D⁻¹ ∘ M (image → repère de la référence)"""
    return (np.linalg.inv(np.vstack([D, [0, 0, 1]])) @ np.vstack([M, [0, 0, 1]]))[:2]
