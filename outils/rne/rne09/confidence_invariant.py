"""RNE0.9 research-only fail-closed check of aligned-history confidence invariants.

The original RNE alignment() limits confidence by
max(0,min(1,(30 - photometric_error_255)/22)). If a supplied confidence map
exceeds that cap substantially, the context is inconsistent. Reject the WHOLE
frame and fall back to bicubic instead of tampering with already aligned pixels.
This detects certain corrupt/stale metadata, NOT all ghosting or hallucinations.
"""
from __future__ import annotations
from dataclasses import dataclass
import torch
from torch.nn import functional as F

@dataclass(frozen=True)
class InvariantAudit:
    mismatch_fraction_first: float
    mismatch_fraction_second: float
    refused_frames: int
    total_frames: int
    cutoff_fraction: float
    tolerance: float
    manual_preview_only: bool = True
    deployment_authorized: bool = False
    media_export_authorized: bool = False


def _check_inputs(cur,p1,p2,c1,c2):
    if any(not isinstance(x,torch.Tensor) for x in (cur,p1,p2,c1,c2)):
        raise TypeError('Five torch tensors required')
    if cur.ndim!=4 or cur.shape[1]!=3 or cur.shape[0]<1:
        raise ValueError('Expected RGB BCHW')
    if any(x.shape!=cur.shape for x in (p1,p2)):
        raise ValueError('Aligned temporal frame shape mismatch')
    b,_,h,w=cur.shape
    if min(h,w)<16 or h*w>1280*720 or any(x.shape!=(b,1,h,w) for x in (c1,c2)):
        raise ValueError('Invalid spatial size or trust shape')
    if any(x.device!=cur.device or x.dtype!=torch.float32 for x in (cur,p1,p2,c1,c2)):
        raise TypeError('Same-device float32 expected')
    if any(not bool(torch.isfinite(x).all()) or not bool(((x>=0)&(x<=1)).all()) for x in (cur,p1,p2,c1,c2)):
        raise ValueError('Finite normalized data only')


def confidence_invariant_gate(cur,p1,p2,c1,c2,*,manual_research_opt_in=False,
                              tolerance=0.05,cutoff_fraction=0.01):
    """All-or-nothing per-frame refusal mask; never modify input tensors.

    The 0.05 tolerance and 1% cutoff are research heuristics selected post hoc,
    NOT thresholds calibrated or validated for public product deployment.
    """
    if type(manual_research_opt_in) is not bool:
        raise TypeError('Manual research permission must be Boolean')
    if type(tolerance) is not float or abs(tolerance-.05)>1e-10:
        raise ValueError('Post-hoc tolerance must remain fixed to 0.05')
    if type(cutoff_fraction) is not float or abs(cutoff_fraction-.01)>1e-10:
        raise ValueError('Post-hoc cutoff must remain fixed to 0.01')
    _check_inputs(cur,p1,p2,c1,c2)
    fractions=[]
    for prior,conf in ((p1,c1),(p2,c2)):
        photo=(cur-prior).abs().mean(dim=1,keepdim=True)*255.
        upper=((30.-photo)/22.).clamp(0,1)
        inconsistent=(conf-upper)>tolerance
        fractions.append(inconsistent.float().mean(dim=(1,2,3)))
    refuse=(fractions[0]>cutoff_fraction)|(fractions[1]>cutoff_fraction)
    if not manual_research_opt_in:
        refuse=torch.ones_like(refuse,dtype=torch.bool)
    audit=InvariantAudit(
       mismatch_fraction_first=round(float(fractions[0].mean()),6),
       mismatch_fraction_second=round(float(fractions[1].mean()),6),
       refused_frames=int(refuse.sum().item()),total_frames=cur.shape[0],
       cutoff_fraction=cutoff_fraction,tolerance=tolerance,
    )
    return refuse,audit


@torch.inference_mode()
def guarded_research_frame(model,cur,p1,p2,c1,c2,*,manual_research_opt_in=False):
    refuse,audit=confidence_invariant_gate(cur,p1,p2,c1,c2,
                manual_research_opt_in=manual_research_opt_in)
    bic=F.interpolate(cur,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
    if bool(refuse.all()):
        return bic,audit
    neural=model(cur,p1,p2,c1,c2).clamp(0,1)
    return torch.where(refuse[:,None,None,None],bic,neural),audit
