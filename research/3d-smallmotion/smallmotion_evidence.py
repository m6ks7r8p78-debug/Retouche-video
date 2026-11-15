"""Local-only small motion candidate extractor, experimental 2D research.

Dense Farneback flow is compared against *independently supplied* depth and
camera motion using the existing DepthMotion pinhole approximation. No image
semantics/ID/contact claims; all outputs are only image-motion hypotheses.
"""
from __future__ import annotations
import numpy as np
import cv2
from depthmotion_evidence import _predict, _validate_motion, _depth_maps_validate
try:
    from multimotion_evidence import validate
except ModuleNotFoundError:
    from baseline_multimotion import validate

SCHEMA = 'retouche-smallmotion-candidate-experimental-1'


def analyze_pair(prev, current, depth, camera_motion):
    if prev.shape != current.shape or prev.ndim != 3 or prev.dtype != np.uint8 or current.dtype != np.uint8:
        raise ValueError('identical BGR uint8 frames required')
    h,w=prev.shape[:2]
    if depth.shape!=(h,w) or depth.dtype not in (np.dtype('float32'),np.dtype('float64')):
        raise ValueError('positive float depth required')
    _validate_motion([camera_motion],2)
    a=cv2.cvtColor(prev,cv2.COLOR_BGR2GRAY)
    b=cv2.cvtColor(current,cv2.COLOR_BGR2GRAY)
    # Full-frame changes invalidate dense flow, not a giant moving object.
    if float(np.median(np.abs(a.astype(np.int16)-b.astype(np.int16))))>46:
        return {'state':'abstain_abrupt_change','candidates':[]}
    if np.nanmean(np.isfinite(depth))<.85 or np.all(a==a.flat[0]):
        return {'state':'abstain_insufficient_input','candidates':[]}
    flow=cv2.calcOpticalFlowFarneback(a,b,None,.5,3,13,4,5,1.2,0)
    ys,xs=np.indices((h,w),dtype=np.float32)
    src=np.stack([xs.ravel(),ys.ravel()],axis=-1)
    valid=np.isfinite(depth)
    d=np.where(valid,depth,np.nan)
    predicted=_predict(src,np.where(np.isfinite(d.ravel()),d.ravel(),1.0),camera_motion,(h,w)).reshape(h,w,2)
    residual=flow-(predicted-np.stack([xs,ys],axis=-1))
    magnitude=np.linalg.norm(residual,axis=-1)
    # Reject frame edges and unknown depth, where occlusion dominates image flow.
    candidate=(magnitude>2.9)&valid
    candidate[:8,:]=0;candidate[-8:,:]=0;candidate[:,:8]=0;candidate[:,-8:]=0
    mask=cv2.morphologyEx(candidate.astype('uint8'),cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
    n,lab,stats,centroids=cv2.connectedComponentsWithStats(mask,8)
    results=[]
    for i in range(1,n):
        x,y,cw,ch,area=map(int,stats[i])
        if area<130 or cw<12 or ch<12 or cw*ch>h*w*.52 or area/(cw*ch)<.22:
            continue
        vals=magnitude[lab==i]
        if len(vals)<130: continue
        # Prevent a thin parallax edge spanning huge background area from
        # being promoted as a convincing local region.
        med=float(np.median(vals));p90=float(np.percentile(vals,90))
        if med<3.3 or p90>38: continue
        results.append({'box':[x,y,cw,ch],'area_px':area,
                        'median_residual_px':round(med,2),'center':[round(float(v),1) for v in centroids[i]],
                        'class':'unclassified_2d_motion_region'})
    results.sort(key=lambda z:z['area_px'],reverse=True)
    # Giant global inconsistency can be camera/depth calibration error.
    high_ratio=float(np.count_nonzero(candidate))/float(h*w)
    if high_ratio>.58:
        return {'state':'abstain_global_inconsistency','candidates':[], 'high_motion_fraction':round(high_ratio,3)}
    return {'state':'candidate_regions' if results else 'no_supported_local_candidate',
            'candidates':results[:6],'high_motion_fraction':round(high_ratio,3)}


def analyze_sequence(frames, depths, motions, *, source='synthetic_oracle'):
    h,w=validate(frames)
    _depth_maps_validate(frames,depths)
    _validate_motion(motions,len(frames))
    if source not in ('synthetic_oracle','independent_sensor','rgb_inferred','unknown'):
        raise ValueError('unknown provenance')
    if source != 'synthetic_oracle':
        return {'schema':SCHEMA,'status':'abstain_unverified_depth_source','transitions':[], 'causal_claim':False}
    events=[analyze_pair(frames[i],frames[i+1],depths[i],motions[i]) for i in range(len(motions))]
    if any(t['state'].startswith('abstain') for t in events):
        status='abstain_temporal_or_calibration_gap'
    else:
        local=sum(any(x['area_px'] < .15*h*w for x in t['candidates']) for t in events)
        broad=sum(any(x['area_px'] >=.15*h*w for x in t['candidates']) for t in events)
        status=('repeated_local_2d_motion_candidate' if local >= .6*len(events) else
                'repeated_broad_2d_motion_candidate' if broad >=.6*len(events) else
                'no_repeated_small_motion_evidence')
    return {'schema':SCHEMA,'status':status,'origin':'synthetic_experiment' if source=='synthetic_oracle' else 'sensor_claim_unverified',
            'transitions':events, 'causal_claim':False,
            'limitations':['Dense optical flow is heuristic and can fail under occlusion or motion blur',
                           'Depth and camera calibration must be independent and validated',
                           'Candidate regions are not object detections, persistent IDs, interactions or 3D']}