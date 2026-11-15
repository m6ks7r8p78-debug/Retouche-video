"""RNE17 inexpensive constant-blend control used for *research* comparison.

The 0.70 strength is derived from the RNE17 DEVELOPMENT set, before the
locked synthetic evaluation. It is a heuristic, not a product-safe default.
No media IO, no model loading, no online training, no hidden data logging.
"""
from __future__ import annotations
from dataclasses import dataclass
import torch
from torch.nn import functional as F

@dataclass(frozen=True)
class LimiterAudit:
    mode:str
    correction_strength:float
    manual_research_only:bool=True
    trained_model_needed:bool=False
    production_authorized:bool=False
    identity_validated:bool=False
    media_export_authorized:bool=False

@torch.inference_mode()
def conservative_preview(current, ancre_output, *,
                         research_opt_in=False, protected_mask=None):
    if type(research_opt_in) is not bool:
        raise TypeError('Boolean research permission required')
    if not isinstance(current,torch.Tensor) or not isinstance(ancre_output,torch.Tensor):
        raise TypeError('Torch tensors only')
    if current.ndim!=4 or current.shape[1]!=3 or min(current.shape[-2:])<8:
        raise ValueError('Expected B x 3 x H x W with H,W >=8')
    b,_,h,w=current.shape
    if max(h,w)>512 or ancre_output.shape!=(b,3,h*2,w*2):
        raise ValueError('Invalid or oversize predictions')
    if (current.dtype!=torch.float32 or ancre_output.dtype!=torch.float32 or
        current.device!=ancre_output.device or not bool(torch.isfinite(current).all()) or
        not bool(torch.isfinite(ancre_output).all())):
        raise ValueError('Float32 finite aligned tensors required')
    baseline=F.interpolate(current,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
    if protected_mask is not None:
        if (not isinstance(protected_mask,torch.Tensor) or protected_mask.dtype!=torch.bool
            or protected_mask.shape!=(b,1,h*2,w*2) or protected_mask.device!=current.device):
            raise ValueError('Protected mask bool B1(2H)(2W) required')
    if not research_opt_in:
        return baseline,LimiterAudit('bicubic_no_opt_in',0.)
    output=(baseline+.70*(ancre_output-baseline)).clamp(0,1)
    if protected_mask is not None:
        output=torch.where(protected_mask,baseline,output)
    return output,LimiterAudit('research_fixed_0_70',.70)
