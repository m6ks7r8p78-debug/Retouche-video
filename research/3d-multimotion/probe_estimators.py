"""MAGSAC++ built into OpenCV vs partial-affine RANSAC (single pair).
A probe, NOT a validated segmentation algorithm: homography and partial-affine
fit models with different degrees of freedom. This cannot infer depth.
"""
from __future__ import annotations
import json
import statistics
import time
from pathlib import Path

import cv2
import numpy as np
from multimotion_evidence import _flow,_fit
from scenes_multimotion import make_scene


def measure(seeds=range(12)):
    if not hasattr(cv2,'USAC_MAGSAC'):
        return {'status':'unavailable','opencv':cv2.__version__}
    data=[]
    for case in ('two_depths','two_depths_rotated','single_plane','broad_object'):
        for seed in seeds:
            frames,_=make_scene(case,seed)
            src,dst=_flow(frames[3],frames[4])
            if src is None:continue
            t=time.perf_counter()
            a,ma,ea=_fit(src,dst)
            a_ms=(time.perf_counter()-t)*1000
            t=time.perf_counter()
            H,mh=cv2.findHomography(src,dst,cv2.USAC_MAGSAC,1.5,maxIters=1600,confidence=.995)
            h_ms=(time.perf_counter()-t)*1000
            ha=[]
            if H is not None:
                pp=cv2.perspectiveTransform(src.reshape(-1,1,2).astype(np.float32),H).reshape(-1,2)
                ha=np.linalg.norm(pp-dst,axis=1)
            data.append({'case':case,'seed':seed,'matched':len(src),
               'affine_inliers':int(np.sum(ma)) if ma is not None else 0,
               'homography_inliers':int(np.sum(np.asarray(ha)<1.5)) if len(ha) else 0,
               'affine_ms':a_ms,'magsac_ms':h_ms})
    return {'status':'measured','opencv':cv2.__version__,'protocol':'single frame pair index=3->4; no accuracy label',
      'by_case':{c:{'runs':len(rs),'affine_mean_inliers':round(statistics.mean(x['affine_inliers'] for x in rs),1),
           'magsac_mean_inliers':round(statistics.mean(x['homography_inliers'] for x in rs),1),
           'affine_median_ms':round(statistics.median(x['affine_ms'] for x in rs),3),
           'magsac_median_ms':round(statistics.median(x['magsac_ms'] for x in rs),3)}
          for c in ('two_depths','two_depths_rotated','single_plane','broad_object')
          for rs in [[x for x in data if x['case']==c]]}}

if __name__=='__main__':
    print(json.dumps(measure(),indent=2))