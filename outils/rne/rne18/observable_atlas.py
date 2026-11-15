"""RNE18 OBSERVABLE: conservative surface atlas from SYNTHETIC calibrated views.

A reproducible proof of concept for evidence-first dynamic 3D reconstruction.
This module does NOT infer geometry, camera pose, identity or hidden regions.
Do not apply raw videos from users, publish source media, or deploy automatically.
"""
from __future__ import annotations
from dataclasses import dataclass
import numpy as np
import cv2


@dataclass(frozen=True)
class EvidenceFrame:
    bgr: np.ndarray
    u: np.ndarray  # known synthetic inverse projection; not inferred from a real video
    v: np.ndarray
    visible: np.ndarray  # known synthetic visibility/occlusion mask
    incidence: np.ndarray  # cosine of surface angle to camera
    frame_id: int
    known_yaw: float  # supplied by synthetic renderer, NOT estimated


@dataclass(frozen=True)
class AtlasResult:
    bgr: np.ndarray
    evidence_views: np.ndarray # number of DISTINCT frames supporting each atlas cell
    weight: np.ndarray
    observed: np.ndarray
    corroborated: np.ndarray
    contested: np.ndarray  # multiple views with divergent color evidence
    color_std_255: np.ndarray # image-level uncertainty proxy, not calibrated geometry
    research_only: bool = True
    geometry_3d_estimated: bool = False
    real_identity_reconstructed: bool = False
    unobserved_surface_synthesized: bool = False
    automatic_deployment: bool = False


def synthetic_texture(h: int = 160, w: int = 320, seed: int = 16) -> np.ndarray:
    """Seam-aware *synthetic*, original texture with smoothly varying marks."""
    if h < 64 or w < 128:
        raise ValueError('Texture size too small')
    y, x = np.mgrid[:h, :w].astype(np.float32)
    u = x / w
    v = y / (h - 1)
    rng = np.random.default_rng(seed)
    bands = []
    for c in range(3):
        harmonic = np.zeros_like(u)
        for i in range(1, 9):
            a = float(rng.uniform(.005, .055))
            f = int(rng.integers(1, 13))
            g = int(rng.integers(0, 8))
            phase = float(rng.uniform(0, 2*np.pi))
            harmonic += a * np.sin(2*np.pi*(f*u + g*v)+phase)
        base = .52 + .19*np.sin(2*np.pi*(c+1)*u) * np.sin(np.pi*(1+c%2)*v)
        marks = .09*np.sin(2*np.pi*(u*3+v*(2*c+1)))
        bands.append(np.clip(base+harmonic+marks, .08, .92))
    return np.round(np.stack(bands, axis=-1)*255).astype(np.uint8)


def _geometry(size: int, yaw: float):
    if size < 64 or size > 1024:
        raise ValueError('Synthetic preview size outside bounds')
    y,x=np.mgrid[:size,:size].astype(np.float32)
    xx=(x-(size-1)/2)/((size-1)/2*.92)
    yy=(y-(size-1)/2)/((size-1)/2*.92)
    rr=xx**2+yy**2
    disk=rr < .999
    z=np.sqrt(np.clip(1-rr,0,1))
    c,s=np.cos(yaw),np.sin(yaw)
    # Inverse rotation: camera front -> persistent object UV coordinates
    objx=c*xx-s*z
    objz=s*xx+c*z
    u=(.5+np.arctan2(objx,objz)/(2*np.pi))%1
    v=np.arccos(np.clip(-yy,-1,1))/np.pi
    return u.astype(np.float32),v.astype(np.float32),disk,z.astype(np.float32)


def project_texture(texture: np.ndarray, yaw: float, size: int=192,
                    occlusion: str='none', phase:int=0) -> EvidenceFrame:
    if not isinstance(texture,np.ndarray) or texture.dtype!=np.uint8 or texture.ndim!=3 or texture.shape[2]!=3:
        raise TypeError('Synthetic BGR8 texture required')
    h,w=texture.shape[:2]
    u,v,disk,z=_geometry(size,yaw)
    # cv2 supports wrap for horizontal seam and nearest border for pole.
    mapx=(u*w).astype(np.float32)
    mapy=np.clip(v*(h-1),0,h-1).astype(np.float32)
    # tiled texture ensures correct seam interpolation (no external content)
    wrapped=np.concatenate((texture,texture,texture),axis=1)
    img=cv2.remap(wrapped,mapx+w,mapy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
    occ=np.zeros((size,size),dtype=bool)
    if occlusion=='ellipse':
        yy,xx=np.mgrid[:size,:size]
        cx=size*(.48+.18*np.sin(phase*.7)); cy=size*(.54+.12*np.cos(phase*.8))
        occ=((xx-cx)/(size*.27))**2+((yy-cy)/(size*.28))**2 < 1
    elif occlusion=='band':
        xx=np.arange(size)[None,:]
        occ=np.broadcast_to((xx>size*(.3+.1*np.sin(phase)))&(xx<size*(.48+.1*np.sin(phase))),disk.shape)
    elif occlusion!='none':
        raise ValueError('Unknown synthetic occlusion')
    visible=disk&(~occ)&(z>.11) # reject grazing angles
    img[~disk]=0
    img[occ & disk]=np.array([30,50,220],dtype=np.uint8)
    return EvidenceFrame(img,u,v,visible,z,phase,float(yaw))


def accumulate_visible_surface(frames:list[EvidenceFrame], shape=(160,320),
                               min_incidence:float=.16)->AtlasResult:
    if not frames:
        raise ValueError('At least one calibrated synthetic observation required')
    h,w=shape
    if not 64<=h<=1024 or not 128<=w<=2048:
        raise ValueError('Atlas memory bound exceeded')
    if not 0<=min_incidence<=1:
        raise ValueError('Invalid incidence threshold')
    size=h*w
    colors=np.zeros((size,3),np.float64)
    squared=np.zeros((size,3),np.float64)
    weights=np.zeros(size,np.float64)
    hits=np.zeros(size,np.uint16)
    orientation_masks={}  # one vote per 15-degree view bin, not per repeated frame
    if len(frames)>4096:
        raise ValueError('Excessive view count for bounded evidence memory')
    used=set()
    for frame in frames:
        if not isinstance(frame,EvidenceFrame) or type(frame.frame_id) is not int or frame.frame_id in used:
            raise ValueError('Each synthetic frame must have a unique integer index')
        used.add(frame.frame_id)
        if not np.isfinite(frame.known_yaw) or not isinstance(frame.known_yaw,(float,int)):
            raise ValueError('Finite calibrated yaw required')
        angle_bin=int(round(((float(frame.known_yaw)%(2*np.pi))/(2*np.pi))*24))%24
        if angle_bin not in orientation_masks:
            orientation_masks[angle_bin]=np.zeros(size,np.bool_)
        if frame.bgr.dtype!=np.uint8 or frame.bgr.ndim!=3 or frame.bgr.shape[-1]!=3:
            raise TypeError('BGR8 frame required')
        spatial=frame.bgr.shape[:2]
        arrays=(frame.u,frame.v,frame.visible,frame.incidence)
        if any(not isinstance(a,np.ndarray) or a.shape!=spatial for a in arrays):
            raise ValueError('Untrusted calibration/visibility shape')
        if (frame.visible.dtype!=np.bool_
                or any(not np.isfinite(a).all() for a in (frame.u,frame.v,frame.incidence))
                or bool(((frame.incidence<0)|(frame.incidence>1)).any())):
            raise ValueError('Invalid calibrated visibility/coordinates')
        valid=frame.visible&(frame.incidence>=min_incidence)&(frame.u>=0)&(frame.u<1)&(frame.v>=0)&(frame.v<=1)
        if not valid.any():
            continue
        # Conservative nearest-cell projection: an unobserved cell is NEVER filled.
        yy=np.clip(np.rint(frame.v[valid]*(h-1)).astype(np.int32),0,h-1)
        xx=np.floor(frame.u[valid]*w).astype(np.int32)%w
        idx=yy*w+xx
        weight=(frame.incidence[valid]**2).astype(np.float64)
        for ch in range(3):
            colors[:,ch]+=np.bincount(idx,weight*frame.bgr[valid,ch],minlength=size)
            squared[:,ch]+=np.bincount(idx,weight*(frame.bgr[valid,ch].astype(np.float64)**2),minlength=size)
        weights+=np.bincount(idx,weight,minlength=size)
        orientation_masks[angle_bin][np.unique(idx)]=True
    # Corroboration requires a geometrically DISTINCT view bin (15 degrees).
    # This is a research heuristic and does not prove independent identities.
    for evidence_mask in orientation_masks.values():
        hits += evidence_mask.astype(np.uint16)
    observed=weights>0
    out=np.zeros_like(colors,dtype=np.uint8)
    out[observed]=np.clip(np.rint(colors[observed]/weights[observed,None]),0,255).astype(np.uint8)
    std=np.full(size,np.nan,dtype=np.float32)
    std[observed]=np.sqrt(np.maximum(0,(squared[observed]/weights[observed,None]
                      -(colors[observed]/weights[observed,None])**2)).mean(axis=1)).astype(np.float32)
    # Fixed heuristic: repeated observations with strong disagreement are CONTESTED,
    # not corroborated. This is not calibrated for real camera exposure or identities.
    contested=(hits>=2)&(std>16.)
    corroborated=(hits>=2)&(~contested)
    return AtlasResult(out.reshape(h,w,3),hits.reshape(h,w),weights.reshape(h,w),
                       observed.reshape(h,w),corroborated.reshape(h,w),
                       contested.reshape(h,w),std.reshape(h,w))


def render_known_surface(atlas:AtlasResult, yaw:float, size:int=192):
    """Preview ONLY the observed UV cells, never fill unseen regions."""
    if not isinstance(atlas,AtlasResult):
        raise TypeError('AtlasResult required')
    u,v,disk,inc=_geometry(size,yaw)
    h,w=atlas.observed.shape
    xx=np.floor(u*w).astype(np.int32)%w
    yy=np.clip(np.rint(v*(h-1)).astype(np.int32),0,h-1)
    known=disk & atlas.observed[yy,xx]
    trusted=disk & atlas.corroborated[yy,xx]
    preview=np.zeros((size,size,3),np.uint8)
    preview[known]=atlas.bgr[yy[known],xx[known]]
    return preview,known,trusted,disk


def metrics_on_novel_view(atlas:AtlasResult, truth_texture:np.ndarray, yaw:float, size:int=192):
    truth=project_texture(truth_texture,yaw,size,occlusion='none')
    predicted,known,corroborated,disk=render_known_surface(atlas,yaw,size)
    m=known&truth.visible
    e=(predicted.astype(np.float32)-truth.bgr.astype(np.float32))**2
    mse=float(np.mean(e[m])) if m.any() else None
    psnr=float(10*np.log10(255**2/mse)) if mse is not None and mse>0 else (float('inf') if mse==0 else None)
    return {'observed_fraction':float((known&disk).sum()/max(1,disk.sum())),
            'corroborated_fraction':float((corroborated&disk).sum()/max(1,disk.sum())),
            'visible_gt_fraction':float(m.sum()/max(1,truth.visible.sum())),
            'psnr_on_observed_pixels_db':psnr,
            'unknown_pixels':int((disk&~known).sum()),
            'truth_evaluation_has_unknown_excluded':True}