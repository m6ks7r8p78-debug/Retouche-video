"""RNE16 / ANCRE: own lightweight causal 2x residual video reconstruction model.

Architecture developed for RetoucheProAI research, not a derivative of another model's
weights. Only train the checkpoint with explicitly allowed data. Source frame remains
available, bicubic anchor limits learned corrections, and a zero-confidence motion map
removes any dependency on temporal input exactly. This bound is NOT a formal guarantee
of anatomical, geometric or identity fidelity. Do not deploy without independent review.
"""
from __future__ import annotations
import torch
from torch import nn
from torch.nn import functional as F

class FeatureHead(nn.Module):
    def __init__(self, inputs: int, width: int=16):
        super().__init__()
        self.net=nn.Sequential(
            nn.Conv2d(inputs,width,3,padding=1),nn.LeakyReLU(.1,inplace=True),
            nn.Conv2d(width,width,3,padding=1),nn.LeakyReLU(.1,inplace=True),
            nn.Conv2d(width,12,3,padding=1),nn.PixelShuffle(2),
        )
        nn.init.zeros_(self.net[-2].weight)
        nn.init.zeros_(self.net[-2].bias)
    def forward(self,x):return self.net(x)

class RNE16ANCRE(nn.Module):
    def __init__(self, width:int=16):
        super().__init__()
        if not isinstance(width,int) or not 8<=width<=64:
            raise ValueError('width 8..64')
        self.spatial=FeatureHead(3,width)
        self.temporal=FeatureHead(7,width)
        self.version='RNE16-ANCRE-experiment'
    def forward(self, current:torch.Tensor, aligned_previous:torch.Tensor|None=None,
                confidence:torch.Tensor|None=None, protected_mask:torch.Tensor|None=None):
        if not isinstance(current,torch.Tensor) or current.ndim!=4 or current.shape[1]!=3 or min(current.shape[-2:])<8:
            raise ValueError('current RGB BCHW required')
        if not current.is_floating_point() or not bool(torch.isfinite(current).all()):
            raise ValueError('finite float inputs required')
        b,_,h,w=current.shape
        if current.numel()>3*512*512*8:
            raise ValueError('research tile limit')
        base=F.interpolate(current,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
        # Non-generative anchor is always accessible and is the exact output on protected zones.
        spatial=(.10*torch.tanh(self.spatial(current)))
        out=base+spatial
        if aligned_previous is None and confidence is None:
            pass
        elif aligned_previous is None or confidence is None:
            raise ValueError('Temporal prior and confidence must be supplied together')
        else:
            if aligned_previous.shape!=current.shape or confidence.shape!=(b,1,h,w):
                raise ValueError('Prior/trust sizes mismatch')
            if (aligned_previous.dtype!=current.dtype or confidence.dtype!=current.dtype or
                aligned_previous.device!=current.device or confidence.device!=current.device):
                raise ValueError('Prior/trust dtype and device must match')
            if not bool(torch.isfinite(aligned_previous).all()) or not bool(torch.isfinite(confidence).all()) or not bool(((confidence>=0)&(confidence<=1)).all()):
                raise ValueError('Invalid prior or confidence')
            # Skip temporal path completely when no trust: not only multiply its output by zero.
            if bool((confidence>0).any()):
                # Never expose untrusted prior pixels to any temporal convolution.
                safe_prior=aligned_previous*confidence+current*(1-confidence)
                pred=self.temporal(torch.cat((current,safe_prior,confidence),dim=1))
                # 3 successive 3x3 convolutions have 7x7 LR receptive field.
                # Erode trust to prevent influence from an untrusted area across its border.
                safe_trust=-F.max_pool2d(-confidence,kernel_size=7,stride=1,padding=3)
                gate=F.interpolate(safe_trust,size=(2*h,2*w),mode='nearest')
                out=out+.05*gate*torch.tanh(pred)
        if protected_mask is not None:
            if protected_mask.shape!=(b,1,2*h,2*w) or protected_mask.dtype!=torch.bool:
                raise ValueError('Protected mask must be Boolean HR BCHW')
            out=torch.where(protected_mask,base,out)
        return out.clamp(0,1)

@torch.no_grad()
def state_for_private_saving(model:RNE16ANCRE)->dict:
    if not isinstance(model,RNE16ANCRE):raise TypeError('RNE16 model required')
    return {k:v.detach().cpu().clone() for k,v in model.state_dict().items()}


def psnr(pred:torch.Tensor, target:torch.Tensor)->float:
    mse=float(F.mse_loss(pred,target))
    return -10*__import__('math').log10(max(mse,1e-12))
