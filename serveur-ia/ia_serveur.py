"""IA « qualité maximale » de Retouche vidéo, sur une carte graphique distante (Kaggle).

Reproduit exactement SR.run de l'app (sr.js / sr-gpu.js) :
- mêmes poids : le fichier sr.bin de l'app (Real-ESRGAN general v3, deux jeux FP16 mélangés selon le débruitage dn) ;
- même réseau : SRVGGNetCompact (64 canaux, 32 couches, PReLU), bord à zéro, PixelShuffle ×4 + image d'entrée agrandie au plus proche ;
- résultat ×4 limité à [0, 1] puis gardé en 8 bits (texture RGBA8 de l'app) ;
- réduction à la taille demandée (round(W·s) × round(H·s)) par la moyenne de k×k points, k = ceil(max(rapport)), comme le shader FRES ;
- sortie arrondie en 8 bits.
Seule différence : la précision des calculs intermédiaires (demi-précision ici comme dans la version WebGL2 de l'app) ;
l'écart réel avec l'app est mesuré par tests/serveur_ia_compare.py.
"""
import math
import numpy as np
import torch
import torch.nn.functional as F

NF, NC = 64, 32
N_POIDS = 3 * NF * 9 + 2 * NF + NC * (NF * NF * 9 + 2 * NF) + NF * 48 * 9 + 48


def charger(sr_bin: bytes, dn: float, device="cuda", demi=True):
    """Poids de l'app pour un débruitage dn (mêmes formules que setWeights de sr.js)."""
    a = np.frombuffer(sr_bin, dtype=np.float16).astype(np.float64)
    if a.size != 2 * N_POIDS:
        raise ValueError("sr.bin inattendu : %d valeurs" % a.size)
    v = dn * a[:N_POIDS] + (1 - dn) * a[N_POIDS:]          # mélange fait en double puis gardé en float32, comme l'app
    v = v.astype(np.float32)
    couches, o = [], 0
    formes = [(3, NF, True)] + [(NF, NF, True)] * NC + [(NF, 48, False)]
    dt = torch.float16 if demi else torch.float32
    for ci, co, act in formes:
        w = torch.from_numpy(v[o:o + co * ci * 9].copy()).view(co, ci, 3, 3); o += co * ci * 9
        b = torch.from_numpy(v[o:o + co].copy()); o += co
        al = None
        if act:
            al = torch.from_numpy(v[o:o + co].copy()); o += co
        couches.append((w.to(device, dt), b.to(device, dt), None if al is None else al.to(device, dt).view(1, co, 1, 1)))
    assert o == N_POIDS
    return couches


def reseau(couches, x):
    """x : [N,3,H,W] dans [0,1] (même type que les poids) -> image ×4 dans [0,1], en float32."""
    o = x
    for w, b, al in couches:
        o = F.conv2d(o, w, b, padding=1)
        if al is not None:
            o = torch.where(o >= 0, o, o * al)
    o = F.pixel_shuffle(o, 4).float()
    return (o + F.interpolate(x.float(), scale_factor=4, mode="nearest")).clamp_(0, 1)


def _index(n_sortie, rapport, k, n_max, device):
    # calcul en float32 comme le shader (highp float)
    p = torch.arange(n_sortie, device=device, dtype=torch.float32).view(-1, 1)
    d = (torch.arange(k, device=device, dtype=torch.float32) + 0.5) / k
    q = torch.floor((p + d.view(1, -1)) * torch.tensor(rapport, dtype=torch.float32, device=device)).long().clamp_(0, n_max - 1)
    return q                                                # [n_sortie, k]


def reduire(full8, OW, OH):
    """Moyenne de k×k points (shader FRES) ; full8 : [N,3,FH,FW] en float32 déjà arrondi à 1/255."""
    N, C, FH, FW = full8.shape
    rx, ry = FW / OW, FH / OH
    k = min(8, max(1, math.ceil(max(rx, ry) - 1e-6)))
    qx = _index(OW, rx, k, FW, full8.device)
    qy = _index(OH, ry, k, FH, full8.device)
    s = torch.zeros(N, C, OH, OW, device=full8.device)
    for j in range(k):
        rows = full8.index_select(2, qy[:, j])
        for i in range(k):
            s += rows.index_select(3, qx[:, i])
    return s / (k * k)


@torch.inference_mode()
def traiter(couches, images_u8, s, demi=True):
    """images_u8 : tenseur uint8 [N,H,W,3] sur la carte graphique ; renvoie uint8 [N,OH,OW,3] (même résultat que SR.run(image, s, dn))."""
    N, H, W, _ = images_u8.shape
    s = min(4.0, max(0.25, s))
    OW, OH = max(2, math.floor(W * s + 0.5)), max(2, math.floor(H * s + 0.5))   # Math.round de JavaScript
    x = images_u8.permute(0, 3, 1, 2).to(torch.float16 if demi else torch.float32) / 255
    full = reseau(couches, x)
    full8 = torch.floor(full * 255 + 0.5) / 255             # texture RGBA8 de l'app
    out = reduire(full8, OW, OH)
    return torch.floor(out * 255 + 0.5).clamp_(0, 255).to(torch.uint8).permute(0, 2, 3, 1).contiguous()
