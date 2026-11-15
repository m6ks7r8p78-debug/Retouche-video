"""RNE 0.21 ANCRAGE — original synthetic multi-frame inverse-kinematics prototype.

This is a 2D fiducial-marker experiment, NOT reconstruction of an unmarked
human or recovery of actual physical scale. The solver receives RGB image pixels
ONLY. It estimates shared right arm length proportions and per-frame orthographic
camera yaw, motion phase and camera scale by robust reprojection optimization.
No user media, model training, network I/O, or publication of private files.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import Sequence
import math
import cv2
import numpy as np
from scipy.optimize import least_squares

PARTS=("pelvis", "neck", "left_shoulder", "right_shoulder", "chest_front",
       "left_elbow", "left_wrist", "right_elbow", "right_wrist", "object")
# Unique synthetic fiducials, NOT anatomical point detectors.
COLORS=np.array([(245,30,30),(30,245,30),(30,30,245),(245,245,30),
                 (245,30,245),(30,245,245),(185,90,30),(90,185,30),
                 (30,90,185),(185,30,90)],dtype=np.uint8)
CAMERA_PITCH=0.08 # fixed synthetic convention, not inferred real intrinsics


def toy_joints(upper:float,forearm:float,phase:float,holding:bool=True)->np.ndarray:
    if not (0.28<upper<1.4 and 0.28<forearm<1.4 and np.isfinite(phase)):
        raise ValueError('Relative synthetic lengths and phase must be finite and bounded')
    shoulder=np.array([.52,.44,.08])
    elbow=shoulder+upper*np.array([math.cos(phase),-math.sin(phase),.36*math.sin(phase+.4)])
    wrist=elbow+forearm*np.array([math.cos(phase+.75),-math.sin(phase+.75),.45*math.sin(phase+1.1)])
    object_center=wrist+np.array([.25+(0.48 if not holding else 0.),0.,.025])
    return np.stack((
        [0.,-.55,0.],[0.,.67,0.],[-.52,.44,-.08],shoulder,[0.,.11,.34],
        [-.83,-.05,.16],[-1.02,-.53,.22],elbow,wrist,object_center
    ))


def camera_project(joints:np.ndarray,yaw:float,scale:float,tx=0.,ty=0.,size=192)->tuple[np.ndarray,np.ndarray]:
    cy,sy=math.cos(yaw),math.sin(yaw)
    cp,sp=math.cos(CAMERA_PITCH),math.sin(CAMERA_PITCH)
    ry=np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]],dtype=np.float64)
    rx=np.array([[1,0,0],[0,cp,-sp],[0,sp,cp]],dtype=np.float64)
    pts=joints@(rx@ry).T
    return np.column_stack((size/2+tx+scale*pts[:,0],size/2+ty-scale*pts[:,1])),pts[:,2]


def render_fiducials(*,upper:float,forearm:float,phase:float,yaw:float,
                     scale:float,holding=True,tx=0.,ty=0.,drop=(),corrupt=(),size=192):
    """Build a toy image; ground-truth returned separately, never passed to fit.

    Deliberate fiducials make image-only keypoint extraction testable. They are
    NOT a stand-in for detecting real people's joints from arbitrary video.
    """
    if size!=192 or not 34<=scale<=75 or not np.isfinite((yaw,tx,ty)).all():
        raise ValueError('Synthetic camera outside bounded research viewport')
    pts=toy_joints(upper,forearm,phase,holding)
    coords,depth=camera_project(pts,yaw,scale,tx,ty,size=size)
    canvas=np.zeros((size,size,3),np.uint8)
    dropped=set(drop)
    changed=dict(corrupt)
    for idx in np.argsort(depth):
        name=PARTS[idx]
        if name in dropped:continue
        xy=coords[idx]+np.asarray(changed.get(name,(0,0)),dtype=float)
        x,y=np.rint(xy).astype(int)
        if 4<=x<size-4 and 4<=y<size-4:
            cv2.circle(canvas,(int(x),int(y)),2,COLORS[idx].tolist(),-1,lineType=cv2.LINE_8)
    return canvas,coords


def find_fiducials(image:np.ndarray)->np.ndarray:
    """Analyze pixels, never access renderer or metadata. NaN = absent point."""
    if not isinstance(image,np.ndarray) or image.shape!=(192,192,3) or image.dtype!=np.uint8:
        raise ValueError('BGR8 192-square fiducial-only research image required')
    out=np.full((len(PARTS),2),np.nan,dtype=np.float64)
    for i,color in enumerate(COLORS):
        delta=np.abs(image.astype(np.int16)-color.astype(np.int16))
        mask=(np.max(delta,axis=2)<=8).astype(np.uint8)
        n,labels,stats,cent=cv2.connectedComponentsWithStats(mask,8)
        objects=[j for j in range(1,n) if 5<=stats[j,cv2.CC_STAT_AREA]<=28]
        if len(objects)==1:
            out[i]=cent[objects[0]]
    return out


def _valid_observations(images):
    if not isinstance(images,(list,tuple)) or not 1<=len(images)<=12:
        raise ValueError('1 to 12 research-only images required')
    observations=np.stack([find_fiducials(x) for x in images])
    # Keep at least one pair of fixed torso anchors per frame. If either is absent,
    # the frame provides insufficient anchoring to discriminate camera translation.
    visible=np.isfinite(observations).all(axis=2)
    anchor=visible[:,0]&visible[:,1]
    return observations,visible,anchor


def _params_unpack(x:np.ndarray,n:int,variable_shape:bool):
    if variable_shape:upper,forearm=x[:2];offset=2
    else:upper,forearm=.62,.58;offset=0
    rest=x[offset:].reshape(n,3)
    return upper,forearm,rest # yaw, phase, scale each


def _objective(x,obs,valid,anchor,variable_shape):
    n=len(obs)
    upper,forearm,pars=_params_unpack(x,n,variable_shape)
    residual=[]
    for k in range(n):
        if not anchor[k]:continue
        yaw,phase,scale=pars[k]
        image_coords,_=camera_project(toy_joints(upper,forearm,phase),yaw,scale)
        image_anchor=image_coords[:2].mean(axis=0)
        observed_anchor=obs[k,:2].mean(axis=0)
        ok=valid[k]
        difference=(image_coords[ok]-image_anchor)-(obs[k,ok]-observed_anchor)
        residual.extend(difference.ravel().tolist())
    return np.asarray(residual,dtype=float)


@dataclass(frozen=True)
class InverseSequenceResult:
    status:str
    upper_relative:float|None
    forearm_relative:float|None
    yaw_rad:tuple[float,...]
    phase_rad:tuple[float,...]
    pixels_per_torso_unit:tuple[float,...]
    reprojection_median_px:float|None
    observed_points:int
    used_frames:int
    competing_hypotheses:int
    anchored_camera_scale:bool
    metric_scale_known:bool=False
    original_human_geometry_recovered:bool=False
    real_video_validated:bool=False
    independent_optical_evidence:bool=False
    publish_or_deploy:bool=False


def solve_sequence(images:Sequence[np.ndarray],*,variable_shape=True,manual_research_opt_in=False,
                   extra_seeds=1)->InverseSequenceResult:
    """Bundle solve with fixed torso gauge and robust loss, report uncertainty.

    Never takes caller 3D truth, ground-truth landmarks, camera poses or UV.
    Shared lengths estimated only relative to fixed synthetic torso, not meters.
    """
    if type(manual_research_opt_in) is not bool or not manual_research_opt_in:
        raise PermissionError('Explicit research-only opt-in required')
    if type(variable_shape) is not bool or type(extra_seeds) is not int or not 1<=extra_seeds<=3:
        raise ValueError('Invalid research options')
    obs,valid,anchor=_valid_observations(images)
    n=len(images);count=int(valid[anchor].sum());used=int(anchor.sum())
    if used<2 or count<used*5 or int(valid[anchor,8].sum())<2:
        return InverseSequenceResult('insufficient_evidence',None,None,(),(),(),None,count,used,0,True)
    dims=(2 if variable_shape else 0)+3*n
    lo=np.array(([.36,.34] if variable_shape else [])+sum(([-1.25,.05,34.] for _ in range(n)),[]))
    hi=np.array(([1.25,1.25] if variable_shape else [])+sum(([1.25,2.75,75.] for _ in range(n)),[]))
    # Values of frames without anchors are still variables but do not influence
    # residuals; flag incomplete rather than hallucinate their poses.
    if used!=n:
        return InverseSequenceResult('insufficient_evidence',None,None,(),(),(),None,count,used,0,True)
    # Estimate camera scale from torso vertical image distance, no GT camera.
    torso=np.linalg.norm(obs[:,1]-obs[:,0],axis=1)
    starting_scales=np.clip(torso/1.22,36.,70.)
    candidates=[]
    for seed in range(extra_seeds):
        yaw_seed=[0.,.45,-.45][seed]
        phase_seed=[.90,1.48,.43][seed]
        init=np.array(([.65,.66] if variable_shape else [])+
            sum(([yaw_seed,phase_seed,float(sc)] for sc in starting_scales),[]))
        opt=least_squares(_objective,init,bounds=(lo,hi),args=(obs,valid,anchor,variable_shape),
                          loss='soft_l1',f_scale=2.0,max_nfev=95,ftol=1e-6,xtol=1e-6,gtol=1e-6)
        err=np.abs(_objective(opt.x,obs,valid,anchor,variable_shape))
        median=float(np.median(err))
        candidates.append((median,opt.x,opt.success))
    candidates.sort(key=lambda x:x[0])
    median,vec,success=candidates[0]
    upper,fore,pars=_params_unpack(vec,n,variable_shape)
    equivalent=sum(1 for e,v,s in candidates[1:] if e<=median+.25 and
                   variable_shape and np.linalg.norm(v[:2]-vec[:2])>.15)
    status='provisional' if success and median<=2.5 and not equivalent else 'ambiguous_or_poor_fit'
    return InverseSequenceResult(status,round(float(upper),5),round(float(fore),5),
              tuple(round(float(y),5) for y in pars[:,0]),
              tuple(round(float(p),5) for p in pars[:,1]),
              tuple(round(float(s),4) for s in pars[:,2]),
              round(median,5),count,used,equivalent,True)


def anonymous_summary(out:InverseSequenceResult):
    if not isinstance(out,InverseSequenceResult):raise TypeError('Expected synthetic inverse result')
    return asdict(out)


def solve_single(image:np.ndarray,*,manual_research_opt_in:bool=False)->InverseSequenceResult:
    """Independent single-image variable-shape reference, no duplicated frames.

    It uses exactly the same projection/robust objective and synthetic fiducials
    as the multi-frame model. It does not assume the morphology is known.
    """
    if type(manual_research_opt_in) is not bool or not manual_research_opt_in:
        raise PermissionError('Research-only opt-in required')
    obs,valid,anchor=_valid_observations([image])
    count=int(valid[0].sum())
    if not anchor[0] or count<6 or not valid[0,8]:
        return InverseSequenceResult('insufficient_evidence',None,None,(),(),(),None,count,int(anchor[0]),0,True)
    lo=[.36,.34,-1.25,.05,34.]
    hi=[1.25,1.25,1.25,2.75,75.]
    torso=float(np.linalg.norm(obs[0,1]-obs[0,0]))
    scales=np.clip(torso/1.22,36.,70.)
    candidates=[]
    for yaw_seed,phase_seed in ((0.,.9),(.45,1.45),(-.45,.4)):
        init=[.65,.66,yaw_seed,phase_seed,float(scales)]
        out=least_squares(_objective,init,bounds=(lo,hi),args=(obs,valid,anchor,True),
                          loss='soft_l1',f_scale=2,max_nfev=100)
        residual=np.abs(_objective(out.x,obs,valid,anchor,True))
        candidates.append((float(np.median(residual)),out.x,bool(out.success)))
    candidates.sort(key=lambda x:x[0])
    error,p,ok=candidates[0]
    others=sum(1 for e,v,_ in candidates[1:] if e<=error+.25 and
               np.linalg.norm(v[:2]-p[:2])>.15)
    return InverseSequenceResult('provisional' if ok and error<=2.5 and not others else 'ambiguous_or_poor_fit',
       round(float(p[0]),5),round(float(p[1]),5),
       (round(float(p[2]),5),),(round(float(p[3]),5),),(round(float(p[4]),4),),
       round(error,5),count,1,others,True)

