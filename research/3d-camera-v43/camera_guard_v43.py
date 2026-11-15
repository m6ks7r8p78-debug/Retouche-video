"""RetoucheProAI 3D v4.3 — camera-motion evidence from *pixels*.

Experimental, non-neural. Works entirely offline (OpenCV + NumPy).
This module estimates dominant 2-D SIMILARITY camera motion (translation,
rotation, zoom). Multiple competing broad motion planes produce abstention.
It DOES NOT identify persons, hands, objects, 3-D geometry or physical contact.

Input frames are decoded BGR uint8 images, 80x80 to 1280x720, 5..60 frames.
No network, filesystem, face recognition, or import of private material.
"""
from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np

SCHEMA = 'retouche-camera-evidence-v43'


class EvidenceError(ValueError):
    pass


def _validate(frames: list[np.ndarray] | tuple[np.ndarray, ...]) -> tuple[int, int]:
    if not isinstance(frames, (list, tuple)) or not 5 <= len(frames) <= 60:
        raise EvidenceError('expected 5..60 frames')
    first = frames[0]
    if not isinstance(first, np.ndarray) or first.dtype != np.uint8 or first.ndim != 3 or first.shape[2] != 3:
        raise EvidenceError('expected BGR uint8 frames')
    h, w = first.shape[:2]
    if min(h, w) < 80 or h*w > 1280*720:
        raise EvidenceError('unsupported image dimensions')
    if any(not isinstance(f, np.ndarray) or f.dtype != np.uint8 or f.shape != first.shape for f in frames):
        raise EvidenceError('frames must have identical shapes/dtypes')
    return h, w


def _support(points: np.ndarray, shape: tuple[int, int]) -> int:
    h, w = shape
    return len({(min(1, int(x*2/w)), min(1, int(y*2/h))) for x, y in points})


def _estimate(prev: np.ndarray, cur: np.ndarray) -> dict[str, Any]:
    """Robust similar-transform evidence, not a calibrated 3D camera pose."""
    h, w = prev.shape[:2]
    a = cv2.cvtColor(prev, cv2.COLOR_BGR2GRAY)
    b = cv2.cvtColor(cur, cv2.COLOR_BGR2GRAY)
    corners = cv2.goodFeaturesToTrack(a, maxCorners=450, qualityLevel=.015,
                                      minDistance=7, blockSize=5)
    if corners is None or len(corners) < 32:
        return {'status':'abstain_low_texture'}
    moved, valid, _ = cv2.calcOpticalFlowPyrLK(a, b, corners, None, winSize=(21,21),maxLevel=3)
    if moved is None or valid is None:
        return {'status':'abstain_flow_failed'}
    back, back_valid, _ = cv2.calcOpticalFlowPyrLK(b, a, moved, None, winSize=(21,21),maxLevel=3)
    if back is None or back_valid is None:
        return {'status':'abstain_flow_failed'}
    src, dst = corners.reshape(-1,2), moved.reshape(-1,2)
    good=(valid.reshape(-1)>0)&(back_valid.reshape(-1)>0)&(np.linalg.norm(back.reshape(-1,2)-src,axis=1)<1.3)
    src, dst = src[good], dst[good]
    if len(src)<26 or _support(src,(h,w))<3:
        return {'status':'abstain_sparse_support'}
    matrix, inliers=cv2.estimateAffinePartial2D(src,dst,method=cv2.RANSAC,
                            ransacReprojThreshold=1.7,maxIters=2000,confidence=.995)
    if matrix is None or inliers is None:
        return {'status':'abstain_affine_failed'}
    ins=inliers.ravel().astype(bool)
    frac=float(ins.mean())
    if ins.sum()<24 or frac<.58 or _support(src[ins],(h,w))<3:
        return {'status':'abstain_weak_consensus','inlier_ratio':round(frac,4)}
    p=np.column_stack((src,np.ones(len(src))))
    residual=np.linalg.norm((matrix@p.T).T-dst,axis=1)
    if float(np.median(residual[ins]))>1.5:
        return {'status':'abstain_high_error'}
    # Full-scene competing coherent motions are typical of depth layering or
    # competing camera hypotheses. A small local moving object is not sufficient.
    outside=~ins
    if outside.sum()>=24:
        alt, altmask=cv2.estimateAffinePartial2D(src[outside],dst[outside],method=cv2.RANSAC,
                                         ransacReprojThreshold=1.7,maxIters=900)
        if alt is not None and altmask is not None:
            altgood=altmask.ravel().astype(bool)
            if (altgood.sum()/len(src)>.23 and
                _support(src[outside][altgood],(h,w))>=2 and
                (np.ptp(src[outside][altgood,0])>.35*w or
                 np.ptp(src[outside][altgood,1])>.35*h)):
                return {'status':'abstain_competing_motion','inlier_ratio':round(frac,4)}
    angle=math.degrees(math.atan2(float(matrix[1,0]),float(matrix[0,0])))
    scale=math.hypot(float(matrix[0,0]),float(matrix[1,0]))
    tx,ty=map(float,matrix[:,2])
    if (abs(angle)>8 or not .94<=scale<=1.06 or abs(tx)>50 or abs(ty)>50):
        return {'status':'abstain_motion_out_of_scope'}
    return {'status':'estimated_similarity','matrix':matrix.astype(np.float64),
            'inlier_ratio':round(frac,4),'inliers':int(ins.sum()),
            'median_error_px':round(float(np.median(residual[ins])),3),
            'angle_deg':round(angle,3),'scale':round(scale,5)}


def analyse_frames(frames: list[np.ndarray] | tuple[np.ndarray, ...],
                   *, threshold: int=32, min_area: int=75,
                   timestamps_ms: list[int] | None=None,
                   origin: str='synthetic') -> dict[str, Any]:
    """Produces frame-local 2D region *proposals*, with no semantic IDs.

    Once camera evidence becomes ambiguous, refuses the entire sequence
    rather than replacing the camera estimate with a fabricated motion.
    """
    h,w=_validate(frames)
    if origin not in ('synthetic','real_unvalidated'):
        raise EvidenceError('origin requires independent annotations to claim more')
    if type(threshold) is not int or not 10<=threshold<=90:
        raise EvidenceError('threshold must be an integer 10..90')
    if type(min_area) is not int or not 16<=min_area<=20000:
        raise EvidenceError('min_area must be an integer 16..20000')
    if timestamps_ms is None:
        timestamps_ms=[i*100 for i in range(len(frames))]
    if (len(timestamps_ms)!=len(frames) or
        any(type(t) is not int or t<0 for t in timestamps_ms) or
        any(y<=x for x,y in zip(timestamps_ms,timestamps_ms[1:]))):
        raise EvidenceError('timestamps must be increasing nonnegative integer ms')
    cumulative=np.eye(3,dtype=np.float64)
    transforms=[cumulative.copy()]
    quality=[]
    for i in range(1,len(frames)):
        ev=_estimate(frames[i-1],frames[i])
        if ev['status']!='estimated_similarity':
            return {'schema':SCHEMA,'origin':origin,'status':ev['status'],
                    'failed_transition':i,'camera_evidence':{k:v for k,v in ev.items() if k!='matrix'},
                    'frames':[],'no_semantic_claims':True}
        step=np.vstack([ev['matrix'],[0.,0.,1.]])
        cumulative=step@cumulative
        transforms.append(cumulative.copy())
        quality.append({k:v for k,v in ev.items() if k!='matrix'})
    stabilized=[]; valids=[]
    ones=np.full((h,w),255,np.uint8)
    for im,forward in zip(frames,transforms):
        inverse=cv2.invertAffineTransform(forward[:2,:])
        stabilized.append(cv2.warpAffine(im,inverse,(w,h),flags=cv2.INTER_LINEAR,
                                         borderMode=cv2.BORDER_CONSTANT))
        valids.append(cv2.warpAffine(ones,inverse,(w,h),flags=cv2.INTER_NEAREST,
                                    borderMode=cv2.BORDER_CONSTANT)>0)
    overlap=np.logical_and.reduce(valids)
    overlap_ratio=float(overlap.mean())
    if overlap_ratio<.64:
        return {'schema':SCHEMA,'origin':origin,'status':'abstain_insufficient_overlap',
                'overlap_ratio':round(overlap_ratio,4),'frames':[],'no_semantic_claims':True}
    # A one-frame border erosion reduces interpolation-triggered false motion.
    overlap=cv2.erode(overlap.astype(np.uint8),np.ones((3,3),np.uint8))>0
    reference=np.median(np.stack(stabilized),axis=0).astype(np.uint8)
    results=[]
    for i,im in enumerate(stabilized):
        delta=np.max(cv2.absdiff(im,reference),axis=2)
        mask=((delta>=threshold)&overlap).astype(np.uint8)*255
        mask=cv2.morphologyEx(mask,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
        mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
        ratio=float(np.count_nonzero(mask))/max(1,int(overlap.sum()))
        if ratio>.23:
            results.append({'timestamp_ms':timestamps_ms[i], 'state':'abstain_large_residual',
                            'residual_fraction':round(ratio,4),'regions':[]})
            continue
        n,labels,stats,centroids=cv2.connectedComponentsWithStats(mask,8)
        regions=[]
        for j in range(1,n):
            x,y,bw,bh,area=[int(a) for a in stats[j]]
            if (area<min_area or area>h*w*.22 or bw<5 or bh<5 or
                bw>w*.68 or bh>h*.68):
                continue
            regions.append({'bbox_px':[x,y,bw,bh],
                            'center':[round(float(centroids[j][0]),2),round(float(centroids[j][1]),2)],
                            'area_px':area,'state':'unclassified_motion_region'})
        results.append({'timestamp_ms':timestamps_ms[i],'state':'processed',
                        'residual_fraction':round(ratio,4),'regions':regions})
    return {'schema':SCHEMA,'origin':origin,'status':'processed_unvalidated',
            'width':w,'height':h,'overlap_ratio':round(overlap_ratio,4),
            'frames':results,'camera_quality':quality,'no_semantic_claims':True,
            'limitations':['2D similarity is not 3D camera calibration',
                           'Parallax and multiple independently moving surfaces may force abstention',
                           'Stationary objects generally cannot be discovered by motion difference',
                           'No persistent identities, hand detection, contact, grasp or anatomy']}