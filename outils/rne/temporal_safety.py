"""RNE — offline temporal-risk diagnostics on 2D video (not quality ground truth).

Pure measurement; no face recognition, media export, neural weights or deployment.
"""
from __future__ import annotations
import cv2
import numpy as np

def _frame(x):
    if not isinstance(x,np.ndarray) or x.dtype!=np.uint8 or x.ndim!=3 or x.shape[2]!=3:
        raise TypeError('BGR uint8 frame required')
    if x.shape[0]<16 or x.shape[1]<16 or x.size>3*1280*720:
        raise ValueError('Frame dimensions out of CPU research budget')

def compare_temporal_pair(prev_lr,curr_lr,prev_bic,curr_bic,prev_rne,curr_rne):
    """Motion-compensated difference; lower error does NOT prove better detail."""
    for f in (prev_lr,curr_lr,prev_bic,curr_bic,prev_rne,curr_rne): _frame(f)
    if prev_lr.shape!=curr_lr.shape: raise ValueError('LR frame shape mismatch')
    h,w=curr_lr.shape[:2]
    if any(f.shape!=(2*h,2*w,3) for f in (prev_bic,curr_bic,prev_rne,curr_rne)):
        raise ValueError('HR outputs must be x2')
    if float(np.mean(cv2.absdiff(prev_lr,curr_lr)))/255.>.24:
        return {'usable':False,'reason':'possible_scene_cut','scene_cut':True}
    c=cv2.cvtColor(curr_lr,cv2.COLOR_BGR2GRAY)
    p=cv2.cvtColor(prev_lr,cv2.COLOR_BGR2GRAY)
    flow=(np.zeros((h,w,2),np.float32) if np.array_equal(prev_lr,curr_lr)
          else cv2.calcOpticalFlowFarneback(c,p,None,.5,3,15,3,5,1.2,0))
    yy,xx=np.mgrid[0:h,0:w].astype(np.float32)
    mx,my=xx+flow[...,0],yy+flow[...,1]
    inside=(mx>=1)&(mx<w-2)&(my>=1)&(my<h-2)
    aligned=cv2.remap(prev_lr,mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    photo=np.mean(cv2.absdiff(aligned,curr_lr),axis=2)
    trusted=inside&(photo<=25)
    if int(trusted.sum())<max(48,int(.20*h*w)):
        return {'usable':False,'reason':'insufficient_motion_matches','scene_cut':False}
    highflow=cv2.resize(flow,(2*w,2*h),interpolation=cv2.INTER_LINEAR)*2
    yy2,xx2=np.mgrid[0:2*h,0:2*w].astype(np.float32)
    highmask=cv2.resize(trusted.astype(np.uint8),(2*w,2*h),interpolation=cv2.INTER_NEAREST).astype(bool)
    def mae(prev,cur):
        shifted=cv2.remap(prev,xx2+highflow[...,0],yy2+highflow[...,1],
                          cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
        return float(np.mean(np.abs(shifted.astype(np.float32)-cur.astype(np.float32))[highmask]))
    return {'usable':True,'scene_cut':False,
            'trusted_fraction':round(float(trusted.mean()),5),
            'motion_px':round(float(np.linalg.norm(flow,axis=2)[trusted].mean()),4),
            'bicubic_warp_mae_255':round(mae(prev_bic,curr_bic),5),
            'rne_warp_mae_255':round(mae(prev_rne,curr_rne),5),
            'alteration_vs_bicubic_mae_255':round(float(
                np.mean(np.abs(curr_rne.astype(np.float32)-curr_bic.astype(np.float32)))),5)}

def review_segment(cases,*,manual_opt_in=False):
    """Strict lab-only decision. The default is always bicubic; no auto export."""
    if type(manual_opt_in) is not bool: raise TypeError('Explicit boolean opt-in required')
    if not isinstance(cases,list) or not all(isinstance(x,dict) for x in cases):
        raise TypeError('Numerical cases required')
    valid=[x for x in cases if x.get('usable')]
    cuts=sum(bool(x.get('scene_cut')) for x in cases)
    if len(valid)<3:
        return {'disposition':'no_preview','reason':'too_few_reliable_transitions',
                'transitions':len(valid),'scene_cuts':cuts,'deployment_allowed':False}
    bc=np.asarray([x['bicubic_warp_mae_255'] for x in valid],np.float64)
    nn=np.asarray([x['rne_warp_mae_255'] for x in valid],np.float64)
    if not np.isfinite(bc).all() or not np.isfinite(nn).all() or (bc<0).any() or (nn<0).any():
        raise ValueError('Invalid temporal measurement')
    delta=nn-bc
    # Exploratory thresholds, not calibrated against human visual review.
    harmful=int(np.sum(delta>np.maximum(.2,.03*bc)))
    risk=harmful>0 or float(np.median(nn))>float(np.median(bc))+.2 or cuts>0
    status=('manual_laboratory_preview_only' if manual_opt_in and not risk
            else 'fallback_bicubic_for_research')
    return {'disposition':status,'reason':('temporal_risk_or_cut' if risk else
            'explicit_opt_in_required' if not manual_opt_in else 'lab_preview_only'),
            'transitions':len(valid),'scene_cuts':cuts,'worse_transitions':harmful,
            'bicubic_temporal_median_mae_255':round(float(np.median(bc)),4),
            'rne_temporal_median_mae_255':round(float(np.median(nn)),4),
            'delta_median_mae_255':round(float(np.median(delta)),4),
            'deployment_allowed':False,'truth_verified':False,
            'iphone_safari_checked':False,'no_promise_of_recovered_detail':True}
