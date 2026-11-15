"""RNE 0.20 - inverse synthetic articulated pose by image-only render-and-compare.

Input: a BGR image (no scene simulator metadata). Hypotheses are rendered from
an explicitly KNOWN 11-part ellipsoid body model and FIXED orthographic camera.
The estimator has no access to target ground truth pose, camera, segmentation,
UV, depth or contact. Not an estimator for human photos and not a 3D scan.
"""
from __future__ import annotations
from dataclasses import dataclass
import math
import numpy as np
import cv2
from pathlib import Path
import sys
try:
    from outils.rne.rne19.articulated_observable import render_scene
except ModuleNotFoundError:
    # Standalone research archive (renderer shipped beside this module).
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'rne19_articulated'))
    from articulated_observable import render_scene

TWO_PI=2*math.pi

@dataclass(frozen=True)
class InverseResult:
    yaw_rad: float
    articulation_phase_rad: float
    contact_hypothesis: str
    score: float
    alternative_score: float
    contact_ambiguous: bool
    fit_valid: bool
    pose_ambiguous: bool = False
    competing_pose_hypotheses: int = 0
    camera_calibrated_by_model: bool = True
    real_person_reconstructed: bool = False
    occluded_geometry_observed: bool = False
    input_provenance_verified: bool = False
    publish_or_deploy: bool = False


def _normalized_angle(x):
    return float(x%TWO_PI)


def _observation(frame, downsample=64):
    if not isinstance(frame,np.ndarray) or frame.ndim!=3 or frame.shape[2]!=3 or frame.dtype!=np.uint8:
        raise ValueError('BGR uint8 frame required')
    if min(frame.shape[:2])<96 or max(frame.shape[:2])>512 or frame.shape[0]!=frame.shape[1]:
        raise ValueError('Square synthetic viewport [96, 512] required')
    im=cv2.resize(frame,(downsample,downsample),interpolation=cv2.INTER_AREA)
    # Explicitly synthetic foreground barrier color. This is NOT a generic real-world occlusion detector.
    occluded=np.all(np.abs(im.astype(np.int16)-[28,38,195])<=12,axis=2)
    # Resize original exact color marker with nearest sampling for robust occlusion mask.
    occ_src=np.all(frame==np.array([28,38,195],np.uint8),axis=2).astype(np.uint8)
    occ=cv2.resize(occ_src,(downsample,downsample),interpolation=cv2.INTER_NEAREST)>0
    # Border antialias can be slightly contaminated. Dilate to prevent unfair penalty.
    ignore=cv2.dilate((occ|occluded).astype(np.uint8),np.ones((3,3),np.uint8),iterations=1).astype(bool)
    return im,~ignore


def _score_batch(query, templates, valid, method='rgb'):
    if method not in ('rgb','silhouette'):
        raise ValueError('Method restricted to rgb or silhouette')
    foreground_q=(query.max(axis=-1)>5)
    foreground_t=(templates.max(axis=-1)>5)
    disagreement=(foreground_t != foreground_q[None,:,:])
    mask=valid[None,:,:]
    denominator=max(int(valid.sum()),1)
    silhouette=(disagreement*mask).sum(axis=(1,2))/denominator
    if method=='silhouette':return silhouette.astype(float)
    diff=np.abs(templates.astype(np.int16)-query[None].astype(np.int16))
    # Brightness-independent? No, deliberately photometric scoring: test illumination failure.
    capped=np.minimum(diff,75).mean(axis=3)
    error=(capped*mask).sum(axis=(1,2))/denominator/75.
    return (0.60*error + 0.40*silhouette).astype(float)


class ArticulatedInverse:
    def __init__(self, *, nphase=12, nyaw=16, search_size=96, compare_size=64, bank_cache=None):
        if type(nphase) is not int or type(nyaw) is not int or nphase<8 or nyaw<8 or nphase>24 or nyaw>24:
            raise ValueError('Bounded angular search resolution required')
        if search_size not in (96,128) or compare_size not in (48,64):
            raise ValueError('Research CPU sizes only')
        self.nphase,self.nyaw=nphase,nyaw
        self.search_size,self.compare_size=search_size,compare_size
        self.grid=[]
        if bank_cache is not None and Path(bank_cache).is_file():
            with np.load(bank_cache,allow_pickle=False) as data:
                bank=data['bank']; grid=data['grid']
            if bank.shape != (nphase*nyaw*2,compare_size,compare_size,3) or bank.dtype!=np.uint8 or grid.shape!=(nphase*nyaw*2,3):
                raise ValueError('Invalid immutable synthetic template bank')
            self.bank=bank
            self.grid=[(float(p),float(y),bool(h)) for p,y,h in grid]
            return
        frames=[]
        for hold in (True, False):
            for j in range(nyaw):
                yaw=j*TWO_PI/nyaw
                for k in range(nphase):
                    phase=k*TWO_PI/nphase
                    image=render_scene(phase,yaw,frame_id=0,size=search_size,hold=hold,occluder=False,texture_seed=0).bgr
                    img=cv2.resize(image,(compare_size,compare_size),interpolation=cv2.INTER_AREA)
                    self.grid.append((phase,yaw,hold))
                    frames.append(img)
        self.bank=np.stack(frames)
        if bank_cache is not None:
            np.savez_compressed(bank_cache,bank=self.bank,grid=np.asarray(self.grid,dtype=np.float64))

    def _render(self,phase,yaw,hold):
        image=render_scene(_normalized_angle(phase),_normalized_angle(yaw),
                           frame_id=0,size=self.search_size,hold=hold,texture_seed=0).bgr
        return cv2.resize(image,(self.compare_size,self.compare_size),interpolation=cv2.INTER_AREA)

    def fit(self, bgr:np.ndarray, *, method='rgb', refine=True, manual_research_opt_in:bool=False)->InverseResult:
        if type(manual_research_opt_in) is not bool or not manual_research_opt_in:
            raise PermissionError('Explicit local research consent required; this is not a production image estimator')
        im,mask=_observation(bgr,self.compare_size)
        if mask.mean()<.4:
            return InverseResult(0,0,'unknown',1.,1.,True,False)
        scores=_score_batch(im,self.bank,mask,method)
        bestids=np.argsort(scores)[:min(32,len(scores))]
        # Force an alternate holding hypothesis even if its coarse score is poor.
        for h in (True,False):
            subset=np.array([k for k,item in enumerate(self.grid) if item[2]==h])
            selected=int(subset[np.argmin(scores[subset])])
            if selected not in bestids:bestids=np.append(bestids,selected)
        bestids=sorted(bestids,key=lambda j:float(scores[int(j)]))
        seeds=[]
        for id in bestids:
            phase,yaw,hold=self.grid[int(id)]
            if all(hold!=item[2] or (abs(math.remainder(phase-item[0],TWO_PI))>.55 or abs(math.remainder(yaw-item[1],TWO_PI))>.45) for item in seeds):
                seeds.append((phase,yaw,hold))
            if len(seeds)>=5:break
        # Fine local search restricted to top hypotheses; no hidden metadata used.
        choices=[]
        for phase,yaw,hold in seeds:
            score=float(_score_batch(im,self._render(phase,yaw,hold)[None],mask,method)[0])
            if refine:
                for step in (0.5, 0.25, 0.125):
                    candidates=[]
                    imgs=[]
                    for dy in (-step,0,step):
                        for dp in (-step,0,step):
                            yp=_normalized_angle(yaw + dy*(TWO_PI/self.nyaw))
                            pp=_normalized_angle(phase + dp*(TWO_PI/self.nphase))
                            candidates.append((pp,yp,hold))
                            imgs.append(self._render(pp,yp,hold))
                    ss=_score_batch(im,np.stack(imgs),mask,method)
                    ind=int(np.argmin(ss))
                    if float(ss[ind])<=score+1e-10:
                        score=float(ss[ind]);phase,yaw,hold=candidates[ind]
            choices.append((score,phase,yaw,hold))
        choices.sort(key=lambda x:x[0])
        best=choices[0]
        competing=sum(1 for c in choices[1:] if c[0]<=best[0]+.012 and
                      (abs(math.remainder(c[1]-best[1],TWO_PI))>.55 or
                       abs(math.remainder(c[2]-best[2],TWO_PI))>.45))
        ambiguous_pose=bool(competing>0)
        # Compare both contact hypotheses at matching coarse grid; do not infer contact
        # as certain merely from small winning photometric differences.
        best_state={h:float(scores[np.array([item[2]==h for item in self.grid])].min()) for h in (True,False)}
        margin=abs(best_state[True]-best_state[False])
        ambiguous=(margin<.012)
        alternative=float(choices[1][0]) if len(choices)>1 else float('inf')
        status='unknown' if ambiguous else ('holding' if best[3] else 'released')
        # Only an in-model template fit, not calibrated posterior confidence.
        fit_valid=bool(best[0]<.22)
        return InverseResult(_normalized_angle(best[2]),_normalized_angle(best[1]),
                             status,round(float(best[0]),6),round(alternative,6),
                             bool(ambiguous),fit_valid,ambiguous_pose,competing)


def circular_error(a,b):
    return abs(math.remainder(float(a)-float(b),TWO_PI))