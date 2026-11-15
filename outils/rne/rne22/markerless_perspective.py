"""RNE0.22 MASKFIT: silhouette-only analysis by synthesis of a known toy skeleton.

Input to the solver: ONLY binary images, no joint labels, fiducials, hidden pose or camera GT.
Not body shape recovery; calibrated synthetic toy geometry is fixed, metric scale unknown.
Perspective projection with joint focal/distance ambiguity explicitly reported.
No user media, weight training, network, deployment or private exports.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
import hashlib
import math
import cv2
import numpy as np
from scipy.optimize import least_squares
from scipy.ndimage import map_coordinates

SIZE=128
# 3D toy mannequin. Fixed torso scale is a gauge, not an observed physical measurement.
SEGMENTS=((0,1),(1,2),(1,3),(2,4),(4,5),(3,6),(6,7))

def toy_points(upper:float,fore:float,phase:float):
    shoulder=np.array([.48,.38,.08])
    elbow=shoulder+upper*np.array([math.cos(phase),-math.sin(phase),.35*math.sin(phase+.4)])
    wrist=elbow+fore*np.array([math.cos(phase+.7),-math.sin(phase+.7),.42*math.sin(phase+.9)])
    return np.stack([[0.,-.55,0.],[0.,.58,0.],[-.48,.38,-.08],shoulder,
                     [-.68,-.12,-.04],[-.85,-.55,-.04],elbow,wrist,
                     [0.,.80,0.]])

# Segment set includes head neck center; no coloured dots or labels in rendered image
DRAW_SEGMENTS=SEGMENTS+((1,8),)

def project(pts:np.ndarray,yaw:float,focal:float,distance:float):
    cy,sy=math.cos(yaw),math.sin(yaw)
    rotated=np.column_stack((cy*pts[:,0]+sy*pts[:,2],pts[:,1],-sy*pts[:,0]+cy*pts[:,2]))
    depth=distance+rotated[:,2]
    if np.any(depth<=0):raise ValueError('Invalid camera depth')
    return np.column_stack((SIZE/2+focal*rotated[:,0]/depth,SIZE/2-focal*rotated[:,1]/depth))

def render_toy(upper=.79,fore=.65,yaw=.20,phase=.95,focal=190.,distance=4.35, *, occlusion=False,blur=False):
    image=np.zeros((SIZE,SIZE),np.uint8)
    p=project(toy_points(upper,fore,phase),yaw,focal,distance)
    for i,j in DRAW_SEGMENTS:
        xy1=np.rint(p[i]).astype(int); xy2=np.rint(p[j]).astype(int)
        cv2.line(image,tuple(xy1),tuple(xy2),255,3,cv2.LINE_AA)
    cv2.circle(image,tuple(np.rint(p[8]).astype(int)),5,255,-1,cv2.LINE_AA)
    if occlusion:image[28:48,78:96]=0
    if blur:image=cv2.GaussianBlur(image,(5,5),1.1)
    return image

def _curve_samples(p):
    curves=[]
    for i,j in DRAW_SEGMENTS:
        t=np.linspace(0,1,9)[:,None]
        curves.append((1-t)*p[i]+t*p[j])
    # head is not a fiducial; only a silhouette disk
    ang=np.arange(0,2*np.pi,2*np.pi/12)
    curves.append(p[8]+np.stack([5*np.cos(ang),5*np.sin(ang)],axis=1))
    return np.concatenate(curves)

def _distance_to_projected_skeleton(observed_xy,p):
    # Continuous point-to-segment distance with min over segments
    d2=[]
    for a,b in DRAW_SEGMENTS:
        u=p[b]-p[a]
        t=np.clip(((observed_xy-p[a])*u).sum(axis=1)/(np.dot(u,u)+1e-7),0,1)
        delta=observed_xy-(p[a]+t[:,None]*u)
        d2.append((delta*delta).sum(axis=1))
    # distance to head circle boundary (not a labelled point)
    d2.append(np.maximum(0,np.linalg.norm(observed_xy-p[8],axis=1)-5)**2)
    return np.sqrt(np.minimum.reduce(d2)+1e-9)

def _read_image(img):
    if not isinstance(img,np.ndarray) or img.ndim!=2 or img.dtype!=np.uint8 or img.shape!=(SIZE,SIZE):
        raise ValueError('Only 128x128 grayscale uint8 synthetic test images accepted')
    mask=img>=100
    if int(mask.sum())<90:raise ValueError('Insufficient foreground evidence')
    foreground=np.column_stack(np.nonzero(mask))[:,::-1].astype(np.float64)
    # Sample deterministic pixels distributed across the silhouette
    fg=foreground[::max(1,len(foreground)//240)][:240]
    dt=cv2.distanceTransform((~mask).astype(np.uint8),cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
    return dt,fg

def _residual(x,evidence,frame_count, *, freeze_camera=False):
    upper,fore,scale=x[:3]
    # The focal/distance ratio is identifiable; the two are not generally separable.
    focal=190.0
    distance=focal/scale
    out=[]
    for k,(dt,fg) in enumerate(evidence):
        yaw,phase=x[3+2*k:5+2*k]
        p=project(toy_points(upper,fore,phase),yaw,focal,distance)
        sample=_curve_samples(p)
        # Analytic bilinear samples of observed distance transform
        distance_map=map_coordinates(dt,[sample[:,1],sample[:,0]],order=1,mode='constant',cval=10.0)
        reverse=_distance_to_projected_skeleton(fg,p)
        out.extend(distance_map[::2].tolist())
        out.extend((.62*reverse).tolist())
    return np.asarray(out)

@dataclass(frozen=True)
class MaskFitResult:
    status:str
    upper_torso_units:float|None
    forearm_torso_units:float|None
    magnification_f_over_d:float|None
    yaw_rad:tuple[float,...]
    phase_rad:tuple[float,...]
    chamfer_residual_px:float|None
    frames:int
    focal_length_px:None=None
    metric_body_scale_known:bool=False
    unique_camera_calibration_proven:bool=False
    pose_certified:bool=False
    real_person_reconstructed:bool=False
    production_ready:bool=False
    media_export_allowed:bool=False


def fit_markerless(images,*,manual_research_opt_in=False,max_nfev=65,starts=2):
    if type(manual_research_opt_in) is not bool or not manual_research_opt_in:
        raise PermissionError('Research-only explicit opt-in required')
    if not isinstance(images,(tuple,list)) or not 2<=len(images)<=6:
        raise ValueError('2 to 6 grayscale frames required')
    if type(max_nfev) is not int or not 10<=max_nfev<=250 or type(starts) is not int or not 1<=starts<=4:
        raise ValueError('Budget must be bounded')
    evidence=[_read_image(a) for a in images]
    n=len(evidence)
    # Copies of the same view are NOT independent geometric evidence.
    fingerprints={hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest() for a in images}
    if len(fingerprints)<2:
        return MaskFitResult('insufficient_independent_views',None,None,None,(),(),None,n)
    low=np.array([.38,.38,30]+[-.75,.10]*n,dtype=float)
    high=np.array([1.20,1.20,58]+[.75,2.10]*n,dtype=float)
    attempts=[]
    for seed in range(starts):
        yaw0=(0.0,.25,-.25,.50)[seed];phase0=(1.0,.7,1.35,1.6)[seed]
        init=np.array([.78,.66,44]+[yaw0,phase0]*n,dtype=float)
        solution=least_squares(_residual,init,bounds=(low,high),
           args=(evidence,n),max_nfev=max_nfev,loss='soft_l1',f_scale=2.,diff_step=1e-3)
        err=_residual(solution.x,evidence,n)
        attempts.append((float(np.median(np.abs(err))),solution.x,solution.success))
    attempts.sort(key=lambda a:a[0]);median,x,success=attempts[0]
    return MaskFitResult('provisional' if success and median<2.0 else 'ambiguous_or_poor_fit',
         round(float(x[0]),4),round(float(x[1]),4),round(float(x[2]),4),
         tuple(round(float(x[3+2*k]),4) for k in range(n)),
         tuple(round(float(x[4+2*k]),4) for k in range(n)),round(median,4),n)


def uncertainty_camera_family(magnification:float, distances=(3.3,4.35,5.9)):
    """Exactly equal f/d ratio, yet distinct focal+distance values; these are not identical
    full perspective if body has depth extent. This is a *weak-perspective ambiguity diagnostic*.
    """
    if not 20<magnification<100:raise ValueError('Invalid ratio')
    return [(round(float(magnification*d),3),round(float(d),3)) for d in distances]


def fit_single_markerless(image,*,manual_research_opt_in=False,max_nfev=65,starts=2):
    """Same toy geometry, loss and optimizer as multi-frame; ONE image (not copied)."""
    if type(manual_research_opt_in) is not bool or not manual_research_opt_in:
        raise PermissionError('Research-only explicit opt-in required')
    if type(max_nfev) is not int or not 10<=max_nfev<=250 or type(starts) is not int or not 1<=starts<=4:
        raise ValueError('Budget must be bounded')
    evidence=[_read_image(image)]
    low=np.array([.38,.38,30,-.75,.10],dtype=float)
    high=np.array([1.20,1.20,58,.75,2.10],dtype=float)
    attempts=[]
    for seed in range(starts):
        init=np.array([.78,.66,44,(0.,.25,-.25,.5)[seed],(1.,.7,1.35,1.6)[seed]])
        opt=least_squares(_residual,init,bounds=(low,high),args=(evidence,1),
                max_nfev=max_nfev,loss='soft_l1',f_scale=2.,diff_step=1e-3)
        err=_residual(opt.x,evidence,1)
        attempts.append((float(np.median(np.abs(err))),opt.x,opt.success))
    attempts.sort(key=lambda a:a[0]);median,x,ok=attempts[0]
    return MaskFitResult('provisional' if ok and median<2. else 'ambiguous_or_poor_fit',
      round(float(x[0]),4),round(float(x[1]),4),round(float(x[2]),4),
      (round(float(x[3]),4),),(round(float(x[4]),4),),round(median,4),1)

@dataclass(frozen=True)
class CalibratedMaskFit:
    status:str
    upper_torso_units:float|None
    forearm_torso_units:float|None
    magnification_f_over_d:float|None
    principal_point_offset_xy_px:tuple[float,float]|None
    yaw_rad:tuple[float,...]
    phase_rad:tuple[float,...]
    reprojection_median_px:float|None
    camera_intrinsics_unique:bool=False
    metric_depth_known:bool=False
    identifies_real_person:bool=False
    production_ready:bool=False


def _residual_centered(x,evidence):
    # Shared unknown optical-center shift across ALL images of the same synthetic camera.
    upper,fore,ratio,dx,dy=x[:5]
    out=[]
    for k,(dt,fg) in enumerate(evidence):
        yaw,phase=x[5+2*k:7+2*k]
        p=project(toy_points(upper,fore,phase),yaw,190.,190./ratio)
        p+=np.array([dx,dy])[None,:]
        sample=_curve_samples(p)
        dmap=map_coordinates(dt,[sample[:,1],sample[:,0]],order=1,mode='constant',cval=10.)
        reverse=_distance_to_projected_skeleton(fg,p)
        out.extend(dmap[::2].tolist());out.extend((.62*reverse).tolist())
    return np.asarray(out)


def fit_with_optical_center(images,*,manual_research_opt_in=False,max_nfev=75,starts=2):
    """Optical center shared across frames; camera focal/distance STILL not individually identifiable.

    More degrees of freedom can overfit silhouettes, so this candidate must
    ALWAYS be compared against the simpler no-offset solver on unseen seeds.
    """
    if type(manual_research_opt_in) is not bool or not manual_research_opt_in:
        raise PermissionError('Explicit local research opt-in required')
    if not isinstance(images,(tuple,list)) or not 2<=len(images)<=6:
        raise ValueError('2..6 grayscale frames required')
    if type(max_nfev) is not int or not 10<=max_nfev<=250 or type(starts) is not int or not 1<=starts<=4:
        raise ValueError('Invalid search budget')
    evidence=[_read_image(a) for a in images]
    n=len(images)
    if len({hashlib.sha256(x.tobytes()).hexdigest() for x in images})<2:
        return CalibratedMaskFit('insufficient_independent_views',None,None,None,None,(),(),None)
    lo=np.array([.38,.38,30,-12,-12]+[-.75,.10]*n,dtype=float)
    hi=np.array([1.2,1.2,58,12,12]+[.75,2.10]*n,dtype=float)
    fits=[]
    for seed in range(starts):
        init=np.array([.78,.66,44,0.,0.]+[(0.,.25,-.25,.5)[seed],(1.,.7,1.35,1.6)[seed]]*n)
        opt=least_squares(_residual_centered,init,args=(evidence,),bounds=(lo,hi),
            max_nfev=max_nfev,loss='soft_l1',f_scale=2.,diff_step=1e-3)
        error=float(np.median(np.abs(_residual_centered(opt.x,evidence))))
        fits.append((error,opt.x,opt.success))
    fits.sort(key=lambda x:x[0]);error,x,success=fits[0]
    return CalibratedMaskFit('provisional_fit_not_geometric_truth' if success and error<2 else 'ambiguous_or_poor_fit',
        round(float(x[0]),4),round(float(x[1]),4),round(float(x[2]),4),
        (round(float(x[3]),3),round(float(x[4]),3)),
        tuple(round(float(x[5+2*k]),4) for k in range(n)),
        tuple(round(float(x[6+2*k]),4) for k in range(n)),round(error,4))