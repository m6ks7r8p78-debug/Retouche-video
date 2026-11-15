"""DepthMotion: conservative 2D flow vs externally supplied depth + egomotion.

Depth source and egomotion must be declared *independent* for an inference to be
made. A synthetic oracle is usable ONLY for synthetic controlled experiments.
No 3D reconstruction or semantic object classification. No media IO/network.
"""
from __future__ import annotations

import math
from typing import Any
import cv2
import numpy as np
try:
    from multimotion_evidence import _flow, validate
except ModuleNotFoundError:
    from baseline_multimotion import _flow, validate  # archive-only fallback

SCHEMA = "retouche-depthmotion-evidence-experiment-1"
DEPTH_SOURCES = {"synthetic_oracle", "independent_sensor", "rgb_inferred", "unknown"}
POSE_SOURCES = {"synthetic_oracle", "independent_sensor", "rgb_inferred", "unknown"}


def _depth_maps_validate(frames, depths):
    if not isinstance(depths, (list, tuple)) or len(depths) != len(frames):
        raise ValueError("one depth map per frame required")
    h, w = frames[0].shape[:2]
    for depth in depths:
        if (not isinstance(depth, np.ndarray) or depth.shape != (h, w) or
                depth.dtype not in (np.dtype('float32'), np.dtype('float64'))):
            raise ValueError("depth must be float32/float64 HxW maps")
        if np.isinf(depth).any() or (np.isfinite(depth) & (depth <= 0)).any():
            raise ValueError("depth maps must contain positive distances or NaNs for missing pixels")


def _validate_motion(motions, n):
    if not isinstance(motions, (list, tuple)) or len(motions) != n-1:
        raise ValueError("expected n-1 camera motions")
    for item in motions:
        if not isinstance(item, dict) or set(item) != {'translation_x_m', 'rotation_deg', 'focal_px'}:
            raise ValueError("camera motion must specify tx, in-plane rotation and focal_px")
        for k in ('translation_x_m','rotation_deg','focal_px'):
            v = item[k]
            if type(v) not in (float, int) or not math.isfinite(v):
                raise ValueError("nonfinite/malformed camera motion")
        if not 1 <= item['focal_px'] <= 10000 or abs(item['rotation_deg']) > 45 or abs(item['translation_x_m']) > 20:
            raise ValueError("camera motion exceeds conservative experimental bounds")


def _predict(src, source_depths, motion, hw):
    h, w = hw
    theta = np.deg2rad(motion['rotation_deg'])
    # OpenCV getRotationMatrix2D sign matches the synthetic renderer.
    rot = cv2.getRotationMatrix2D((w/2, h/2), motion['rotation_deg'], 1.)
    projected = (rot @ np.column_stack((src, np.ones(len(src)))).T).T
    projected[:, 0] -= motion['focal_px'] * motion['translation_x_m'] / source_depths
    return projected


def _coherent_residual(src, residual, hw, minimum=12):
    # A broad, coherent, non-camera displacement is not the same thing as an
    # independently tracked object; it remains an image-motion *candidate*.
    h, w = hw
    if len(src) < minimum:
        return (False, 0, 0.)
    # Candidate vectors may include LK tracking error and object boundaries.
    best = (False, 0, 0.)
    # Several hypotheses, deterministic, robust to outlier vectors.
    for vx, vy in (np.median(residual, axis=0), *residual[::max(1,len(residual)//24)]):
        support = np.linalg.norm(residual - np.array([vx,vy]), axis=1) < 1.5
        count = int(support.sum())
        if count < minimum:
            continue
        p = src[support]
        spread_x = float(np.ptp(p[:,0])) / w
        spread_y = float(np.ptp(p[:,1])) / h
        # A tiny cluster of bad correspondences must not be declared an object.
        if spread_x < .08 or spread_y < .08 or spread_x*spread_y < .008:
            continue
        median_norm = float(np.median(np.linalg.norm(residual[support],axis=1)))
        if median_norm > 2.6 and count > best[1]:
            best = (True, count, round(median_norm,3))
    return best


def analyze_pair(prev, cur, depth, camera_motion) -> dict[str,Any]:
    """Compare *observed* LK flow with predicted flow of static depth geometry.

    All inputs are caller-supplied, so physical provenance is NOT authenticated
    by this function. The sequence wrapper enforces conservative origin labels.
    """
    if prev.shape != cur.shape:
        raise ValueError('frame dimensions changed')
    h, w = prev.shape[:2]
    src, dst = _flow(prev,cur)
    if src is None:
        return {'state':'abstain_insufficient_features','matched':0}
    n = len(src)
    coords=np.clip(np.rint(src).astype(int), [0,0], [w-1,h-1])
    z=depth[coords[:,1],coords[:,0]]
    good=np.isfinite(z)
    if good.sum() < 30 or good.mean() < .75:
        return {'state':'abstain_insufficient_depth','matched':n,'valid_depth_features':int(good.sum())}
    src,dst,z=src[good],dst[good],z[good]
    predicted=_predict(src,z,camera_motion,(h,w))
    residual=dst-predicted
    err=np.linalg.norm(residual,axis=1)
    static=err<=1.8
    nstatic=int(static.sum())
    ratio=nstatic/len(src)
    response={'matched':n,'valid_depth_features':len(src),'static_support':nstatic,
              'static_ratio':round(ratio,3),'median_static_residual_px':round(float(np.median(err)),3)}
    # Do not attribute motion when the supplied ego model explains <~1/3 of flow.
    if nstatic < 25 or ratio < .34:
        response['state']='abstain_no_static_reference'
        return response
    atypical=err>2.6
    if atypical.sum() < 12:
        response['state']='depth_camera_explains_observed_motion'
        return response
    coherent, count, medmag=_coherent_residual(src[atypical],residual[atypical],(h,w))
    if coherent and count>=12 and count/len(src)>=.055:
        response.update({'state':'independent_motion_candidate','residual_support':count,
                         'residual_motion_px':medmag})
    elif ratio>=.8:
        # Tiny amount of inconsistency does not automatically imply an object.
        response['state']='depth_camera_explains_observed_motion'
    else:
        response['state']='abstain_unexplained_residuals'
    return response


def analyze_sequence(frames, depths, camera_motions, *, depth_source: str,
                     camera_source: str, origin='synthetic', timestamps_ms=None,
                     depth_uncertainty_rel=None, camera_uncertainty_rel=None,
                     _skip_sensitivity=False):
    """Never present RGB-only inferred depth/pose as causal proof of independent motion."""
    h,w=validate(frames)
    _depth_maps_validate(frames,depths)
    _validate_motion(camera_motions,len(frames))
    if depth_source not in DEPTH_SOURCES or camera_source not in POSE_SOURCES:
        raise ValueError('unknown depth or camera provenance')
    for uncertainty in (depth_uncertainty_rel, camera_uncertainty_rel):
        if uncertainty is not None and (type(uncertainty) not in (int, float) or
            not math.isfinite(uncertainty) or not 0<=uncertainty<=.5):
            raise ValueError('uncertainty must be finite fractional bound in [0, 0.5]')
    if origin not in ('synthetic','real_unvalidated'):
        raise ValueError('origin cannot claim validated data')
    if timestamps_ms is None:
        timestamps_ms=[i*100 for i in range(len(frames))]
    if (len(timestamps_ms)!=len(frames) or
            any(type(t) is not int or t<0 for t in timestamps_ms) or
            any(b<=a for a,b in zip(timestamps_ms,timestamps_ms[1:]))):
        raise ValueError('invalid timestamps_ms')
    # Synthetic oracle cannot be represented as direct observation of a real scene.
    trusted=(depth_source=='independent_sensor' and camera_source=='independent_sensor') or (
        origin=='synthetic' and depth_source=='synthetic_oracle' and camera_source=='synthetic_oracle')
    common={'schema':SCHEMA,'origin':origin,'depth_source':depth_source,'camera_source':camera_source,
            'scope':'controlled_synthetic' if origin=='synthetic' else 'unvalidated_real',
            'limitations':['No human/action recognition, contact or grasp evidence',
                           'No metric 3D reconstruction or persistent object IDs',
                           'Sensor provenance is asserted by caller, not cryptographically verified',
                           'Depth inferred from the same RGB frames is not independent causal evidence']}
    if not trusted:
        return {**common,'status':'abstain_non_independent_evidence','transitions':[],
                'counts':{'independent':0,'explained':0,'abstain':len(frames)-1},
                'causal_claim':False}
    if (origin=='real_unvalidated' and (depth_uncertainty_rel is None or camera_uncertainty_rel is None)):
        return {**common,'status':'abstain_unquantified_sensor_uncertainty',
                'transitions':[],'counts':{'independent':0,'explained':0,'abstain':len(frames)-1},
                'causal_claim':False}
    transitions=[]
    for k,(prev,cur) in enumerate(zip(frames,frames[1:])):
        result=analyze_pair(prev,cur,depths[k],camera_motions[k])
        result.update({'from_ms':timestamps_ms[k],'to_ms':timestamps_ms[k+1]})
        transitions.append(result)
    n=len(transitions)
    cntind=sum(t['state']=='independent_motion_candidate' for t in transitions)
    cntexp=sum(t['state']=='depth_camera_explains_observed_motion' for t in transitions)
    abstain=n-cntind-cntexp
    if abstain:
        status='abstain_temporal_or_geometric_gap'
    elif cntind>=.6*n:
        status='repeated_independent_motion_candidate'
    elif cntexp>=.8*n:
        status='motion_explained_by_depth_and_camera'
    else:
        status='mixed_motion_evidence'
    summary={**common,'status':status,'counts':{'independent':cntind,'explained':cntexp,'abstain':abstain},
            'transitions':transitions,'causal_claim':False}
    if not _skip_sensitivity and ((depth_uncertainty_rel or 0)>0 or (camera_uncertainty_rel or 0)>0):
        stress=[]
        for dz, dc in ((-(depth_uncertainty_rel or 0),0),
                       ((depth_uncertainty_rel or 0),0),
                       (0,-(camera_uncertainty_rel or 0)),
                       (0,(camera_uncertainty_rel or 0))):
            if dz==0 and dc==0: continue
            znew=[np.where(np.isfinite(z),z*(1+dz),np.nan).astype(z.dtype) for z in depths]
            mnew=[dict(m,translation_x_m=m['translation_x_m']*(1+dc)) for m in camera_motions]
            alt=analyze_sequence(frames,znew,mnew,depth_source=depth_source,
                    camera_source=camera_source,origin=origin,timestamps_ms=timestamps_ms,
                    depth_uncertainty_rel=depth_uncertainty_rel,
                    camera_uncertainty_rel=camera_uncertainty_rel,_skip_sensitivity=True)
            stress.append({'depth_delta_rel':dz,'camera_tx_delta_rel':dc,'status':alt['status']})
        summary['calibration_sensitivity']={'tested':len(stress), 'outcomes':stress,
                'all_same_status':all(t['status']==status for t in stress)}
        if not summary['calibration_sensitivity']['all_same_status']:
            summary['status']='abstain_calibration_sensitivity'
    return summary