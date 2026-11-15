"""RNE17 / AEGIS: learned *conservative* residual-amplitude gate for frozen ANCRE.

We train only a lightweight confidence head on entirely synthetic images;
RNE16 weights are frozen. The head does not hallucinate independent colors or
geometries: output is per-pixel convex blend of the bicubic baseline and ANCRE.
This is NOT a certified protection of anatomical identity, faces or text.
"""
from __future__ import annotations
import torch
from torch import nn
from torch.nn import functional as F

class RNE17AEGIS(nn.Module):
    def __init__(self, channels=12):
        super().__init__()
        if not isinstance(channels,int) or not 8 <= channels <= 32:
            raise ValueError('channels from 8 to 32')
        self.net = nn.Sequential(
            nn.Conv2d(9, channels, 3, padding=1),nn.ReLU(inplace=True),
            nn.Conv2d(channels, channels, 3, padding=1),nn.ReLU(inplace=True),
            nn.Conv2d(channels, 1, 1),
        )
        # Conservative initial correction: attenuate, not eliminate ANCRE.
        nn.init.zeros_(self.net[-1].weight)
        nn.init.constant_(self.net[-1].bias, .85)

    @staticmethod
    def _inputs(current, prior, trust, original_pred, bicubic):
        if not all(isinstance(x,torch.Tensor) for x in (current,prior,trust,original_pred,bicubic)):
            raise TypeError('Five tensors required')
        if current.ndim!=4 or current.shape[1]!=3:
            raise ValueError('RGB BCHW required')
        b,_,h,w=current.shape
        if min(h,w)<8 or max(h,w)>512 or current.shape!=prior.shape or trust.shape!=(b,1,h,w):
            raise ValueError('Incompatible or oversized LR inputs')
        if bicubic.shape!=(b,3,2*h,2*w) or original_pred.shape!=bicubic.shape:
            raise ValueError('HR dimension mismatch')
        if any(x.dtype!=current.dtype or x.device!=current.device for x in (prior,trust,original_pred,bicubic)):
            raise ValueError('Device/dtype mismatch')
        if not current.is_floating_point() or not all(bool(torch.isfinite(x).all()) for x in (current,prior,trust,original_pred,bicubic)):
            raise ValueError('Only finite floating tensors supported')
        if not bool(((trust>=0)&(trust<=1)).all()):
            raise ValueError('Trust outside [0,1]')
        gray=(current[:,0:1]*.299+current[:,1:2]*.587+current[:,2:3]*.114)
        gx=F.pad((gray[:,:,:,1:]-gray[:,:,:,:-1]).abs(),(0,1))
        gy=F.pad((gray[:,:,1:,:]-gray[:,:,:-1,:]).abs(),(0,0,0,1))
        edge=(gx+gy).clamp(0,1)
        mismatch=(current-prior).abs().mean(dim=1,keepdim=True)*trust
        residual=F.avg_pool2d((original_pred-bicubic).abs().mean(dim=1,keepdim=True),2)
        lowpass=(current-F.avg_pool2d(current,3,stride=1,padding=1)).abs().mean(dim=1,keepdim=True)
        # 3 rgb + 6 separate descriptors = 9 channels
        return torch.cat((current,edge,trust,mismatch,residual,lowpass,gray),dim=1)

    def forward(self,current,prior,trust,original_pred,bicubic,
                protected_mask=None,return_alpha=False):
        features=self._inputs(current,prior,trust,original_pred,bicubic)
        h,w=current.shape[-2:]
        alpha=F.interpolate(torch.sigmoid(self.net(features)),size=(h*2,w*2),mode='bilinear',align_corners=False)
        output=bicubic+alpha*(original_pred-bicubic)
        if protected_mask is not None:
            if protected_mask.shape!=(current.shape[0],1,2*h,2*w) or protected_mask.dtype!=torch.bool:
                raise ValueError('Protected mask HR BCHW bool required')
            output=torch.where(protected_mask,bicubic,output)
            alpha=torch.where(protected_mask,torch.zeros_like(alpha),alpha)
        output=output.clamp(0,1)
        return (output,alpha) if return_alpha else output

@torch.no_grad()
def frozen_ancre_predictions(anchor,current,prior,trust):
    # Don't import personal weights or allow gradients into the ANCRE backbone.
    anchor.eval()
    bicubic=F.interpolate(current,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
    original=anchor(current,prior,trust)
    return original.detach(),bicubic.detach()
