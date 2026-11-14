"""RNE experiment: one-step motion-compensated smoothing of neural DETAIL only.

Never warp the full rendered frame or accumulate previous corrected outputs.
No NVIDIA SDK, no automatic activation, no proof of recovered original detail.
"""
from __future__ import annotations
import cv2
import numpy as np
from temporal_safety import _frame

def stabilize_detail(prev_lr,cur_lr,prev_bic,cur_bic,prev_pred,cur_pred,
                     *,alpha=.25,protected_mask=None):
    """Return (BGR8 corrected x2 frame, numerical-only diagnostics).

    Only current and previous frames are used. Confidence is derived from LR
    forward/backward optical-flow consistency and photometric agreement.
    """
    for a in (prev_lr,cur_lr,prev_bic,cur_bic,prev_pred,cur_pred):_frame(a)
    if prev_lr.shape!=cur_lr.shape:raise ValueError('LR size mismatch')
    h,w=cur_lr.shape[:2]
    if any(a.shape!=(h*2,w*2,3) for a in (prev_bic,cur_bic,prev_pred,cur_pred)):
        raise ValueError('HR shape mismatch')
    if not isinstance(alpha,(int,float)) or not np.isfinite(alpha) or not 0<=alpha<=.35:
        raise ValueError('Alpha must be between 0 and 0.35')
    if protected_mask is not None and (
        not isinstance(protected_mask,np.ndarray) or protected_mask.dtype!=np.uint8 or
        protected_mask.shape!=(h,w)):
        raise TypeError('Protected region must be HxW uint8')
    result=cur_pred.copy()
    diagnostic={'temporal_applied':False,'protected':protected_mask is not None,
                'scene_cut':False,'trusted_fraction':0.,'deployment_allowed':False}
    difference=float(np.mean(cv2.absdiff(prev_lr,cur_lr)))/255
    if difference>.24:diagnostic['scene_cut']=True
    elif alpha>0 and not np.array_equal(prev_lr,cur_lr):
        c=cv2.cvtColor(cur_lr,cv2.COLOR_BGR2GRAY)
        p=cv2.cvtColor(prev_lr,cv2.COLOR_BGR2GRAY)
        back=cv2.calcOpticalFlowFarneback(c,p,None,.5,3,15,3,5,1.2,0)
        forward=cv2.calcOpticalFlowFarneback(p,c,None,.5,3,15,3,5,1.2,0)
        gy,gx=np.mgrid[0:h,0:w].astype(np.float32)
        px,py=gx+back[...,0],gy+back[...,1]
        inside=(px>=1)&(px<w-2)&(py>=1)&(py<h-2)
        old_lr=cv2.remap(prev_lr,px,py,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
        fb=cv2.remap(forward,px,py,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)+back
        fb_error=np.linalg.norm(fb,axis=2)
        photo=np.mean(np.abs(old_lr.astype(np.float32)-cur_lr.astype(np.float32)),axis=2)
        confidence=np.exp(-fb_error/1.5)*np.clip((26.-photo)/18.,0.,1.)*inside
        diagnostic['trusted_fraction']=round(float((confidence>.2).mean()),5)
        if diagnostic['trusted_fraction']>.10:
            high_flow=cv2.resize(back,(2*w,2*h),interpolation=cv2.INTER_LINEAR)*2
            yy,xx=np.mgrid[0:2*h,0:2*w].astype(np.float32)
            previous_residual=prev_pred.astype(np.float32)-prev_bic.astype(np.float32)
            projected=cv2.remap(previous_residual,xx+high_flow[...,0],yy+high_flow[...,1],
                               cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
            current_residual=cur_pred.astype(np.float32)-cur_bic.astype(np.float32)
            high_trust=cv2.resize(confidence.astype(np.float32),(2*w,2*h),interpolation=cv2.INTER_LINEAR)
            weight=(float(alpha)*high_trust)[...,None]
            result=np.clip(np.rint(cur_bic.astype(np.float32)+
                           current_residual*(1-weight)+projected*weight),0,255).astype(np.uint8)
            diagnostic['temporal_applied']=True
    if protected_mask is not None:
        mask=cv2.resize(protected_mask,(2*w,2*h),interpolation=cv2.INTER_NEAREST)
        result[mask>0]=cur_bic[mask>0]
    return result,diagnostic
