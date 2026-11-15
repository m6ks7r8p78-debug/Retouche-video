"""RNE19 — public standalone per-part evidence atlas adapter (synthetic research).

This is the generic *atlas provenance core*. The larger articulated ray-caster,
GLB poses, detailed benchmarks and user-facing demonstrations are supplied
separately in the private research archive. It does not estimate person pose,
3D geometry, camera calibration or contact from pixels.
"""
from __future__ import annotations
from dataclasses import dataclass
import numpy as np


@dataclass(frozen=True)
class CalibratedPartFrame:
    bgr: np.ndarray
    part_id: np.ndarray
    u: np.ndarray
    v: np.ndarray
    incidence: np.ndarray
    relative_view_bin: tuple[tuple[int, int], ...]
    frame_id: int
    simulator_ground_truth: bool = True
    inferred_from_personal_video: bool = False


@dataclass(frozen=True)
class PartEvidenceAtlas:
    bgr: np.ndarray
    observed: np.ndarray
    independent_views: np.ndarray
    corroborated: np.ndarray
    contested: np.ndarray
    research_only: bool = True
    inferred_human_shape: bool = False
    filled_unobserved: bool = False
    production_enabled: bool = False
    personal_media_exported: bool = False


def accumulate_part_evidence(frames: list[CalibratedPartFrame],
                             *, part_count: int, atlas_shape=(64, 128),
                             manual_research_opt_in: bool = False) -> PartEvidenceAtlas:
    """Never merge distinct objects into the same atlas surface.

    View bins are supplied from exact SIMULATOR part-relative orientation.
    They are NOT estimated. Same relative angular bin is counted only once
    for corroboration. This conservative module does not recover geometry.
    """
    if type(manual_research_opt_in) is not bool:
        raise TypeError('Explicit Boolean research permission required')
    if not manual_research_opt_in:
        raise PermissionError('Manual research mode required')
    if type(part_count) is not int or not 1 <= part_count <= 20:
        raise ValueError('Research part-count bound')
    if not isinstance(frames, list) or not 1 <= len(frames) <= 512:
        raise ValueError('1..512 calibrated frames required')
    h,w=atlas_shape
    if type(h) is not int or type(w) is not int or h<16 or w<32 or h*w>512*1024:
        raise ValueError('Atlas memory bound')
    n=part_count; cells=h*w
    sums=np.zeros((n,cells,3),np.float64)
    squares=np.zeros_like(sums)
    weights=np.zeros((n,cells),np.float64)
    bins=[{} for _ in range(n)]
    seen_ids=set()
    for frame in frames:
        if not isinstance(frame,CalibratedPartFrame) or type(frame.frame_id) is not int or frame.frame_id in seen_ids:
            raise ValueError('Invalid or repeated frame ID')
        seen_ids.add(frame.frame_id)
        if not frame.simulator_ground_truth or frame.inferred_from_personal_video:
            raise ValueError('Only exact synthetic-calibrated data supported')
        if not isinstance(frame.bgr,np.ndarray) or frame.bgr.dtype!=np.uint8 or frame.bgr.ndim!=3 or frame.bgr.shape[-1]!=3:
            raise TypeError('BGR uint8 image required')
        sh=frame.bgr.shape[:2]
        if min(sh)<16 or sh[0]*sh[1]>512*512:
            raise ValueError('Input pixel budget')
        if any(not isinstance(a,np.ndarray) or a.shape!=sh for a in
               (frame.u,frame.v,frame.part_id,frame.incidence)):
            raise ValueError('UV, incidence, segmentation shape')
        if any(not bool(np.isfinite(a).all()) for a in (frame.u,frame.v,frame.incidence)):
            raise ValueError('Nonfinite UV or confidence')
        if np.any(frame.part_id < -2) or np.any(frame.part_id >= n):
            raise ValueError('Invalid part label')
        if np.any((frame.incidence<0)|(frame.incidence>1)):
            raise ValueError('Incidence bounds')
        if len(frame.relative_view_bin)!=n:
            raise ValueError('One view bin per part required')
        for p in range(n):
            vis=(frame.part_id==p)&(frame.incidence>=.18)
            vis&=(frame.u>=0)&(frame.u<1)&(frame.v>=0)&(frame.v<=1)
            if not vis.any():
                continue
            view=tuple(frame.relative_view_bin[p])
            if len(view)!=2 or any(type(x) is not int for x in view):
                raise ValueError('Invalid angular bin')
            xx=np.floor(frame.u[vis]*w).astype(np.int32)%w
            yy=np.rint(frame.v[vis]*(h-1)).astype(np.int32).clip(0,h-1)
            idx=yy*w+xx
            alpha=frame.incidence[vis].astype(np.float64)**2
            px=frame.bgr[vis].astype(np.float64)
            weights[p]+=np.bincount(idx,weights=alpha,minlength=cells)
            for channel in range(3):
                sums[p,:,channel]+=np.bincount(idx,weights=alpha*px[:,channel],minlength=cells)
                squares[p,:,channel]+=np.bincount(idx,weights=alpha*px[:,channel]**2,minlength=cells)
            if view not in bins[p]:
                bins[p][view]=np.zeros(cells,dtype=bool)
            bins[p][view][np.unique(idx)]=True
    hits=np.zeros((n,cells),np.uint16)
    for p in range(n):
        for cells_visible in bins[p].values():
            hits[p]+=cells_visible.astype(np.uint16)
    observed=weights>0
    rgb=np.zeros((n,cells,3),np.uint8)
    rgb[observed]=np.clip(np.rint(sums[observed]/weights[observed,None]),0,255).astype(np.uint8)
    mean=sums[observed]/weights[observed,None]
    std=np.zeros((n,cells),np.float32)
    std[observed]=np.sqrt(np.maximum(0,squares[observed]/weights[observed,None]-mean**2)).mean(axis=1)
    contested=(hits>=2)&(std>16.)
    return PartEvidenceAtlas(rgb.reshape(n,h,w,3),observed.reshape(n,h,w),
        hits.reshape(n,h,w),((hits>=2)&~contested).reshape(n,h,w),
        contested.reshape(n,h,w))
