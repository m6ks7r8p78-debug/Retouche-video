"""Retouche Neural Engine: conservative pixel-fidelity limiter, not a face detector.

Bounds changes relative to bicubic, tighter on structural edges. An explicit,
user-verified mask protects exactly. Absence of mask is NOT facial protection.
No network, model, video IO, identity matching, deployment or NVIDIA SDK.
"""
from __future__ import annotations
import cv2
import numpy as np

def _validate(bicubic: np.ndarray, neural: np.ndarray, protected: np.ndarray | None):
    if not isinstance(bicubic, np.ndarray) or not isinstance(neural, np.ndarray):
        raise TypeError('BGR NumPy arrays required')
    if bicubic.ndim != 3 or bicubic.shape[2] != 3 or bicubic.dtype != np.uint8 or neural.shape != bicubic.shape or neural.dtype != np.uint8:
        raise TypeError('Matched BGR uint8 frames required')
    h,w=bicubic.shape[:2]
    if h<16 or w<16 or h*w>4096*2160:
        raise ValueError('Dimensions exceed tested prototype budget')
    if protected is not None and (not isinstance(protected,np.ndarray) or protected.dtype!=np.uint8 or protected.shape!=(h,w) or not np.isin(protected,[0,255]).all()):
        raise TypeError('Verified protection mask must be HxW with 0/255 values')

def limit_fidelity(bicubic: np.ndarray, neural: np.ndarray, *, protected: np.ndarray | None = None,
                   edge_limit: float = 8., flat_limit: float = 16.,
                   edge_quantile: float = .70) -> tuple[np.ndarray,dict]:
    """Bound residual from bicubic, preserve explicit mask exactly.

    Limiting edits is NOT proof of authentic recovered pixels or face identity.
    """
    _validate(bicubic,neural,protected)
    if not all(np.isfinite(v) for v in (edge_limit,flat_limit,edge_quantile)) or not (0 <= edge_limit <= flat_limit <= 32) or not (.5 <= edge_quantile <= .95):
        raise ValueError('Invalid bounded intervention settings')
    gray=cv2.cvtColor(bicubic,cv2.COLOR_BGR2GRAY).astype(np.float32)
    dx=cv2.Sobel(gray,cv2.CV_32F,1,0,ksize=3)
    dy=cv2.Sobel(gray,cv2.CV_32F,0,1,ksize=3)
    mag=cv2.magnitude(dx,dy)
    threshold=float(np.quantile(mag,edge_quantile))
    edge=(mag>threshold)&(mag>5)
    cap=np.where(edge,edge_limit,flat_limit).astype(np.float32)
    difference=neural.astype(np.float32)-bicubic.astype(np.float32)
    adjusted=np.clip(np.rint(bicubic.astype(np.float32)+np.clip(difference,-cap[:,:,None],cap[:,:,None])),0,255).astype(np.uint8)
    if protected is not None:adjusted[protected==255]=bicubic[protected==255]
    changed=np.any(adjusted!=neural,axis=2)
    return adjusted,{'changed_pixels_fraction':round(float(changed.mean()),6),
      'edge_fraction':round(float(edge.mean()),6),
      'max_abs_change_from_reference':int(np.abs(adjusted.astype(np.int16)-bicubic.astype(np.int16)).max()),
      'verified_protection_supplied':protected is not None,
      'automatic_face_protection_claimed':False,
      'quality_improvement_proven':False,
      'auto_deployment_allowed':False,'nvidia_sdk_used':False}
