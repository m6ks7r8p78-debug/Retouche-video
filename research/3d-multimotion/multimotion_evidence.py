"""RetoucheProAI — 2D multi-motion evidence, research-only.

Uses OpenCV Lucas–Kanade bidirectional point matching plus two robust
partial-affine hypotheses. It can reveal competing 2D motion fields; it does
NOT decide which is camera, depth, object, contact, motion identity, or grasp.
No external network, images, models, or person identifiers.
"""
from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np

SCHEMA = 'retouche-multimotion-evidence-experiment-1'


def validate(frames):
    if not isinstance(frames,(list,tuple)) or not (5 <= len(frames) <= 60):
        raise ValueError('expected 5..60 frames')
    f=frames[0]
    if not isinstance(f,np.ndarray) or f.dtype != np.uint8 or f.ndim!=3 or f.shape[2]!=3:
        raise ValueError('expected BGR uint8 frames')
    h,w=f.shape[:2]
    if min(h,w)<80 or h*w>1280*720 or any(not isinstance(g,np.ndarray) or g.dtype != np.uint8 or g.shape!=f.shape for g in frames):
        raise ValueError('incompatible dimensions or dtype')
    return h,w


def _flow(prev,cur):
    a=cv2.cvtColor(prev,cv2.COLOR_BGR2GRAY); b=cv2.cvtColor(cur,cv2.COLOR_BGR2GRAY)
    p=cv2.goodFeaturesToTrack(a,maxCorners=650,qualityLevel=.012,minDistance=5,blockSize=5)
    if p is None or len(p)<30:return None,None
    q,status,_=cv2.calcOpticalFlowPyrLK(a,b,p,None,winSize=(21,21),maxLevel=3)
    if q is None:return None,None
    back,backstatus,_=cv2.calcOpticalFlowPyrLK(b,a,q,None,winSize=(21,21),maxLevel=3)
    if back is None:return None,None
    src=p.reshape(-1,2); dst=q.reshape(-1,2)
    good=(status.ravel()>0)&(backstatus.ravel()>0)&(np.linalg.norm(back.reshape(-1,2)-src,axis=1)<1.2)
    src,dst=src[good],dst[good]
    if len(src)<28:return None,None
    return src,dst


def _fit(src,dst):
    if len(src)<15:return None,None,None
    mat,inliers=cv2.estimateAffinePartial2D(src,dst,method=cv2.RANSAC,
                        ransacReprojThreshold=1.25,maxIters=1600,confidence=.995,
                        refineIters=12)
    if mat is None or inliers is None:return None,None,None
    pred=(mat @ np.column_stack((src,np.ones(len(src)))).T).T
    err=np.linalg.norm(pred-dst,axis=1)
    # Use own error threshold instead of relying on inlier flags after refinement.
    fit=err<1.5
    return mat,fit,err


def _spread(pts,hw):
    if len(pts)<4:return False
    h,w=hw
    bx=float(np.ptp(pts[:,0]))/w; by=float(np.ptp(pts[:,1]))/h
    # Broad geometry support; independent small objects should fail this test.
    area=bx*by
    return area>=.095 and bx>=.24 and by>=.21


def _four_quadrants(pts,hw):
    h,w=hw
    return len(set((int(x>=w/2),int(y>=h/2)) for x,y in pts))


def _offset(mat1,mat2,hw):
    h,w=hw
    pts=np.array([[w*.2,h*.2,1.],[w*.8,h*.2,1.],[w*.2,h*.8,1.],[w*.8,h*.8,1.]])
    return float(np.median(np.linalg.norm((mat1 @ pts.T).T - (mat2 @ pts.T).T,axis=1)))


def analyze_pair(prev,cur)->dict[str,Any]:
    """Per-transition *hypothesis*, not a 3D or semantic interpretation."""
    h,w=prev.shape[:2]
    if prev.shape!=cur.shape or prev.dtype!=np.uint8 or cur.dtype!=np.uint8 or prev.ndim!=3:
        raise ValueError('pair must contain identical BGR uint8 images')
    src,dst=_flow(prev,cur)
    if src is None:return {'state':'abstain_insufficient_features','matched':0}
    primary,mask,err=_fit(src,dst)
    if primary is None:return {'state':'abstain_ransac_failed','matched':len(src)}
    n=len(src); n1=int(mask.sum())
    # Do not trust a motion field concentrated in a tiny patch.
    if n1<25 or not _spread(src[mask],(h,w)):
        return {'state':'abstain_insufficient_primary_support','matched':n,'inliers':n1}
    if n1/n<.43:
        return {'state':'abstain_weak_primary_consensus','matched':n,'inliers':n1}
    rem=~mask
    response={'state':'one_broad_motion_hypothesis','matched':n,
              'primary_support':n1,'primary_ratio':round(n1/n,3)}
    if rem.sum()<18:return response
    secondary,mask2,err2=_fit(src[rem],dst[rem])
    if secondary is None:return response
    sub=src[rem][mask2]; n2=len(sub)
    # A second coherent field needs enough samples, spatial support, and
    # distinct motion. This avoids promoting a small tracked object to a plane.
    enough=n2 >= 25 and n2/n >= .16 and n2/max(1,int(rem.sum())) >= .59
    if not enough:return response
    if not _spread(sub,(h,w)):
        response['local_residual_warning']=True
        return response
    shift=_offset(primary,secondary,(h,w))
    if shift<1.9:return response
    # Evidence remains ambiguous: an independent large object can mimic a plane.
    # Report ONLY two broad 2D motions with local support, nothing causal.
    response.update({'state':'two_broad_motion_hypotheses',
                     'secondary_support':n2,'secondary_ratio':round(n2/n,3),
                     'model_disagreement_px':round(shift,3),
                     'quads_primary':_four_quadrants(src[mask],(h,w)),
                     'quads_secondary':_four_quadrants(sub,(h,w))})
    return response


def analyze_sequence(frames, *, origin='synthetic', timestamps_ms=None):
    """Combines weak pair evidence without implying persistent object IDs."""
    validate(frames)
    if origin not in ('synthetic','real_unvalidated'):
        raise ValueError('origin must not assert unverified real annotations')
    if timestamps_ms is None: timestamps_ms=[100*i for i in range(len(frames))]
    if len(timestamps_ms)!=len(frames) or any(type(t) is not int or t<0 for t in timestamps_ms) or any(b<=a for a,b in zip(timestamps_ms,timestamps_ms[1:])):
        raise ValueError('invalid timestamps_ms')
    transitions=[]
    for i in range(1,len(frames)):
        e=analyze_pair(frames[i-1],frames[i]);e['from_ms']=timestamps_ms[i-1];e['to_ms']=timestamps_ms[i]
        transitions.append(e)
    two=sum(e['state']=='two_broad_motion_hypotheses' for e in transitions)
    one=sum(e['state']=='one_broad_motion_hypothesis' for e in transitions)
    invalid=len(transitions)-two-one
    frac=two/len(transitions)
    if invalid==len(transitions):status='abstain_insufficient_evidence'
    elif invalid>0:status='abstain_temporal_gap'
    elif frac>=.6:status='repeated_two_motion_evidence'
    elif one>=.65*len(transitions) and two==0:status='single_dominant_evidence'
    elif invalid>.5*len(transitions):status='abstain_insufficient_evidence'
    else:status='ambiguous_mixed_motion_evidence'
    return {'schema':SCHEMA,'origin':origin,'status':status,
            'counts':{'two':two,'one':one,'unresolved':invalid,'transitions':len(transitions)},
            'transitions':transitions,'limitations':[
            'Multiple 2D motion fields do not establish depth or camera ego-motion',
            'A large independently moving object can also produce two broad fields',
            'No persistent object identities, hand detection, contact, grasp, or 3D reconstruction',
            'Synthetic validation is not real-world accuracy'],
            'no_semantic_claims':True}