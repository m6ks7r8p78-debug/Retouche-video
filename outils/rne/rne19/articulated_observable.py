"""RNE 0.19: articulated OBSERVABLE 3D with synthetic, exactly known geometry.

A small, original CPU ray caster and per-part evidence atlas. No trained model,
no inverse pose/3D reconstruction, no private videos, no generative inpainting.
All camera transforms, UVs, object IDs, contact and visibility are SIMULATOR GROUND TRUTH.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Mapping
import math
import cv2
import numpy as np


PARTS = ('torso', 'head', 'left_upper_arm', 'left_forearm', 'left_hand',
         'right_upper_arm', 'right_forearm', 'right_hand', 'held_object',
         'left_leg', 'right_leg')


@dataclass(frozen=True)
class Primitive:
    name: str
    center: np.ndarray
    radii: np.ndarray
    rotation: np.ndarray  # canonical local -> world


@dataclass(frozen=True)
class ContactTruth:
    state: str
    surface_gap_m: float
    contact: bool
    estimated_from_pixels: bool = False


@dataclass(frozen=True)
class SyntheticFrame:
    bgr: np.ndarray
    part_id: np.ndarray  # nearest visible surface after exact z-buffer
    u: np.ndarray
    v: np.ndarray
    incidence: np.ndarray
    depth: np.ndarray
    view_bin: tuple[tuple[int, int], ...]
    independently_visible_pixels: tuple[int, ...]
    camera_yaw: float
    phase: float
    frame_id: int
    contact: ContactTruth
    exact_simulator_geometry: bool = True
    inferred_from_real_camera: bool = False


@dataclass(frozen=True)
class ArticulatedAtlas:
    parts: tuple[str, ...]
    colors: np.ndarray  # N,H,W,3
    weights: np.ndarray  # N,H,W
    observed: np.ndarray  # N,H,W
    corroborated: np.ndarray  # N,H,W (>=2 distinct angular view bins)
    contested: np.ndarray  # N,H,W
    independent_views: np.ndarray  # N,H,W
    color_std_255: np.ndarray  # N,H,W
    research_only: bool = True
    real_3d_reconstruction: bool = False
    human_identity_reconstructed: bool = False
    unobserved_filled: bool = False
    publish_private_media: bool = False
    production_enabled: bool = False


def _unit(x):
    return np.asarray(x, dtype=np.float64)/np.linalg.norm(x)


def _rotation_from_y(direction):
    """Rotation with canonical +Y axis along given segment, not arbitrary pose fitting."""
    y=_unit(direction)
    ref=np.array([0.,0.,1.]) if abs(y[2]) < .95 else np.array([1.,0.,0.])
    x=_unit(np.cross(y,ref))
    z=np.cross(x,y)
    return np.column_stack((x,y,z))


def _segment(name, a, b, width):
    a=np.asarray(a,dtype=np.float64);b=np.asarray(b,dtype=np.float64)
    return Primitive(name,(a+b)*.5,np.array([width,np.linalg.norm(b-a)*.56,width*.91]),
                     _rotation_from_y(b-a))


def _rotation_y(yaw):
    c,s=math.cos(yaw),math.sin(yaw)
    return np.array([[c,0.,s],[0.,1.,0.],[-s,0.,c]],dtype=np.float64)


def pose_primitives(phase:float, hold:bool=True)->tuple[tuple[Primitive,...], ContactTruth]:
    """Deterministic articulated toy 'mannequin'; contact is 3D geometry truth."""
    if not np.isfinite(phase):raise ValueError('Finite phase required')
    shoulder=np.array([.61,.48,.04])
    elbow=np.array([.79+.12*math.sin(phase),.02+.23*math.sin(phase),.23])
    wrist=np.array([.97+.25*math.sin(phase),-.20+.40*math.sin(phase),.48+.16*math.cos(phase)])
    lsh=np.array([-.61,.48,.04]);lel=np.array([-.78,-.08,.07]);lw=np.array([-.91,-.58,.15])
    palm=wrist+_unit(wrist-elbow)*.16
    object_r=.27; hand_r=.17
    object_center=palm+np.array([object_r+hand_r+(0. if hold else .52),0.,0.])
    gap=float(np.linalg.norm(object_center-palm)-object_r-hand_r)
    # Exact meeting along +X under the sphere proxy in canonical synthetic 3D.
    contact=ContactTruth('holding' if hold else 'released',round(gap,8),bool(gap<=.000001))
    eye=np.eye(3,dtype=np.float64)
    parts=(
      Primitive('torso',np.array([0.,.0,0.]),np.array([.51,.78,.31]),eye),
      Primitive('head',np.array([0.,1.11,.03]),np.array([.34,.40,.33]),eye),
      _segment('left_upper_arm',lsh,lel,.20),
      _segment('left_forearm',lel,lw,.16),
      Primitive('left_hand',lw+_unit(lw-lel)*.12,np.array([.16,.19,.15]),eye),
      _segment('right_upper_arm',shoulder,elbow,.20),
      _segment('right_forearm',elbow,wrist,.16),
      Primitive('right_hand',palm,np.array([hand_r,hand_r,hand_r]),eye),
      Primitive('held_object',object_center,np.array([object_r]*3),eye),
      _segment('left_leg',[-.24,-.63,0.],[-.34,-1.61,.1],.23),
      _segment('right_leg',[.24,-.63,0.],[.34,-1.61,.1],.23),
    )
    assert tuple(p.name for p in parts)==PARTS
    return parts,contact


def synthetic_part_texture(part_i:int, shape=(80,160),texture_seed:int=0):
    h,w=shape
    if h<32 or w<64:raise ValueError('Atlas too small')
    yy,xx=np.mgrid[:h,:w].astype(np.float32)
    if type(texture_seed) is not int or texture_seed<0 or texture_seed>100000:raise ValueError('Synthetic texture seed bound')
    rng=np.random.default_rng(1719+part_i*19+texture_seed*7919)
    base=np.asarray(((50+17*part_i)%170+45,(32+41*part_i)%150+65,(80+23*part_i)%140+50),dtype=np.float32)
    waves=25*np.sin(2*np.pi*(4*xx/w+(part_i%4+1)*yy/h))
    waves+=12*np.sin(2*np.pi*((part_i%5+3)*xx/w-5*yy/h))
    dots=5*rng.standard_normal((h,w)).astype(np.float32)
    texture=base[None,None,:]+waves[:,:,None]+dots[:,:,None]
    texture+=np.stack((8*np.sin(xx/10),8*np.cos(yy/9),6*np.sin((xx+yy)/13)),axis=-1)
    return np.clip(np.rint(texture),0,255).astype(np.uint8)


def _camera(yaw:float, pitch:float=.08):
    cy,sy=math.cos(yaw),math.sin(yaw)
    cp,sp=math.cos(pitch),math.sin(pitch)
    yrot=np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]],dtype=np.float64)
    prot=np.array([[1,0,0],[0,cp,-sp],[0,sp,cp]],dtype=np.float64)
    return prot@yrot


def render_scene(phase:float,yaw:float,*,frame_id:int,size:int=192,hold:bool=True,
                 occluder:bool=False,texture_seed:int=0)->SyntheticFrame:
    """Orthographic ellipsoid ray casting, exact per-pixel visibility via z buffer.

    UV, depth, camera, pose, contact and per-part segmentation come from ground
    truth; this function does NOT infer 3D data from images.
    """
    if type(frame_id) is not int or frame_id<0:raise ValueError('Nonnegative integer frame_id')
    if not np.isfinite(yaw) or not np.isfinite(phase):raise ValueError('Finite yaw/phase')
    if type(hold) is not bool or type(occluder) is not bool:raise TypeError('Boolean controls required')
    if not isinstance(size,int) or not 96<=size<=512:raise ValueError('Preview image bound')
    parts,contact=pose_primitives(phase,hold)
    cam=_camera(yaw)
    ys,xs=np.mgrid[:size,:size]
    # Synthetic camera viewport in world units: centered +X right, +Y up.
    X=(xs-(size-1)/2)*3.9/(size-1)
    Y=((size-1)/2-ys)*3.9/(size-1)
    front=np.full((size,size),-np.inf,dtype=np.float32)
    part_id=np.full((size,size),-1,np.int16)
    U=np.zeros((size,size),np.float32);V=U.copy();INC=U.copy()
    independent=[]
    view_bins=[]
    # Exact camera direction towards camera in world coordinates.
    camdir=cam.T@np.array([0.,0.,1.])
    textures=[synthetic_part_texture(i,texture_seed=texture_seed) for i in range(len(parts))]
    img=np.zeros((size,size,3),dtype=np.uint8)
    for part_i,part in enumerate(parts):
        center=cam@part.center
        R=cam@part.rotation
        A=(R*(1./(part.radii*part.radii))[None,:])@R.T
        dx=X-center[0];dy=Y-center[1]
        a=A[2,2];b=2*(A[0,2]*dx+A[1,2]*dy)
        c=A[0,0]*dx*dx+2*A[0,1]*dx*dy+A[1,1]*dy*dy-1
        disc=b*b-4*a*c
        hit=disc>=0
        depth=center[2]+(-b+np.sqrt(np.maximum(disc,0)))/(2*a)
        # Visible ray candidates are those closer to camera than existing surface.
        nearer=hit&(depth>front)
        independent.append(int(np.count_nonzero(hit)))
        # Camera direction transformed to each part's canonical axes.
        viewlocal=part.rotation.T@camdir
        az=math.atan2(float(viewlocal[0]),float(viewlocal[2]))
        el=math.asin(float(np.clip(viewlocal[1],-1,1)))
        # 15 degree angular bins; same camera rotated around moving limbs can be
        # different relative angles; repeating same pose and camera cannot corroborate.
        view_bins.append((int(math.floor((az+math.pi)/(math.pi/12)))%24,
                          int(math.floor((el+math.pi/2)/(math.pi/12)))))
        if not nearer.any():continue
        # Local surface coordinate from ray hit, then stable spherical UV.
        px=dx;py=dy;pz=depth-center[2]
        qx=(R[0,0]*px+R[1,0]*py+R[2,0]*pz)/part.radii[0]
        qy=(R[0,1]*px+R[1,1]*py+R[2,1]*pz)/part.radii[1]
        qz=(R[0,2]*px+R[1,2]*py+R[2,2]*pz)/part.radii[2]
        uu=(.5+np.arctan2(qx,qz)/(2*np.pi))%1
        vv=np.arccos(np.clip(-qy,-1,1))/np.pi
        nx=A[0,0]*px+A[0,1]*py+A[0,2]*pz
        ny=A[1,0]*px+A[1,1]*py+A[1,2]*pz
        nz=A[2,0]*px+A[2,1]*py+A[2,2]*pz
        incidence=np.clip(nz/np.sqrt(nx*nx+ny*ny+nz*nz+1e-12),0,1)
        near=np.where(nearer)
        tex=textures[part_i]
        mx=(uu[near]*tex.shape[1]).astype(np.float32)
        my=(vv[near]*(tex.shape[0]-1)).astype(np.float32)
        trip=np.concatenate((tex,tex,tex),axis=1)
        values=cv2.remap(trip,(mx+tex.shape[1]).reshape(-1,1),my.reshape(-1,1),
                         cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE).reshape(-1,3)
        img[near]=values
        front[near]=depth[near].astype(np.float32)
        part_id[near]=part_i
        U[near]=uu[near].astype(np.float32)
        V[near]=vv[near].astype(np.float32)
        INC[near]=incidence[near].astype(np.float32)
    # Extrinsic foreground barrier not included in atlas, depth > any relevant part.
    if occluder:
        mask=(X>.15+.25*math.sin(phase))&(X<.52+.25*math.sin(phase))&(Y>-.55)&(Y<.95)
        img[mask]=(28,38,195)
        part_id[mask]=-2
        front[mask]=10.
        INC[mask]=0
        U[mask]=0;V[mask]=0
    return SyntheticFrame(img,part_id,U,V,INC,front,tuple(view_bins),
                          tuple(independent),float(yaw),float(phase),frame_id,contact)


def accumulate_parts(frames:list[SyntheticFrame],*,shape=(80,160),min_incidence=.18)->ArticulatedAtlas:
    """Canonical per-part color memory with distinct relative-view support.

    Each surface cell's weighted color includes ONLY visible pixels with exact
    part ID. Hidden parts are NEVER filled; duplicate view bins count once.
    """
    if not frames or len(frames)>512:raise ValueError('1..512 simulator frames required')
    h,w=shape
    if h<32 or w<64 or h*w>512*1024:raise ValueError('Atlas shape outside budget')
    if not (0<=min_incidence<=1):raise ValueError('Incidence threshold')
    n=len(PARTS);sz=h*w
    C=np.zeros((n,sz,3),np.float64)
    S=np.zeros_like(C)
    W=np.zeros((n,sz),np.float64)
    used_frame_ids=set()
    bins={name:{} for name in PARTS}
    for frame in frames:
        if not isinstance(frame,SyntheticFrame) or type(frame.frame_id) is not int or frame.frame_id in used_frame_ids:
            raise ValueError('Invalid frame or duplicate id')
        used_frame_ids.add(frame.frame_id)
        if not frame.exact_simulator_geometry or frame.inferred_from_real_camera:
            raise ValueError('Only calibrated simulator ground truth accepted')
        spatial=frame.bgr.shape[:2]
        if (frame.bgr.dtype!=np.uint8 or frame.bgr.ndim!=3 or frame.bgr.shape[2]!=3
            or any(x.shape!=spatial for x in (frame.part_id,frame.u,frame.v,frame.incidence))
            or len(frame.view_bin)!=n or not np.isfinite(frame.u).all()
            or not np.isfinite(frame.v).all() or not np.isfinite(frame.incidence).all()
            or bool(((frame.part_id < -2) | (frame.part_id >= n)).any())
            or bool(((frame.incidence < 0) | (frame.incidence > 1)).any())):
            raise ValueError('Frame / calibration shape or value invalid')
        for i,name in enumerate(PARTS):
            vis=(frame.part_id==i)&(frame.incidence>=min_incidence)
            vis&=(frame.u>=0)&(frame.u<1)&(frame.v>=0)&(frame.v<=1)
            if not vis.any():continue
            xx=np.floor(frame.u[vis]*w).astype(np.int32)%w
            yy=np.rint(frame.v[vis]*(h-1)).astype(np.int32).clip(0,h-1)
            idx=yy*w+xx
            weight=frame.incidence[vis].astype(np.float64)**2
            pix=frame.bgr[vis].astype(np.float64)
            W[i]+=np.bincount(idx,weights=weight,minlength=sz)
            for ch in range(3):
                C[i,:,ch]+=np.bincount(idx,weights=weight*pix[:,ch],minlength=sz)
                S[i,:,ch]+=np.bincount(idx,weights=weight*pix[:,ch]**2,minlength=sz)
            bin_key=tuple(frame.view_bin[i])
            if len(bin_key)!=2 or not all(type(v) is int for v in bin_key):
                raise ValueError('Invalid viewpoint bin')
            if bin_key not in bins[name]:bins[name][bin_key]=np.zeros(sz,dtype=bool)
            bins[name][bin_key][np.unique(idx)]=True
    E=np.zeros((n,sz),np.uint16)
    for i,name in enumerate(PARTS):
        for ids in bins[name].values():E[i]+=ids.astype(np.uint16)
    observed=W>0
    colors=np.zeros((n,sz,3),np.uint8)
    colors[observed]=np.clip(np.rint(C[observed]/W[observed,None]),0,255).astype(np.uint8)
    std=np.full((n,sz),np.nan,np.float32)
    avg=C[observed]/W[observed,None]
    std[observed]=np.mean(np.sqrt(np.maximum(S[observed]/W[observed,None]-avg**2,0)),axis=1)
    contested=(E>=2)&(std>16)
    corroborated=(E>=2)&~contested
    return ArticulatedAtlas(tuple(PARTS),colors.reshape(n,h,w,3),W.reshape(n,h,w),
           observed.reshape(n,h,w),corroborated.reshape(n,h,w),contested.reshape(n,h,w),
           E.reshape(n,h,w),std.reshape(n,h,w))


def atlas_metrics(atlas:ArticulatedAtlas)->dict:
    if not isinstance(atlas,ArticulatedAtlas):raise TypeError('ArticulatedAtlas required')
    report={}
    for i,name in enumerate(PARTS):
        report[name]={
         'observed_fraction':round(float(atlas.observed[i].mean()),5),
         'corroborated_fraction':round(float(atlas.corroborated[i].mean()),5),
         'contested_cells':int(atlas.contested[i].sum()),
         'never_observed_cells':int((~atlas.observed[i]).sum())}
    return report


def visual_diagnostic(frame:SyntheticFrame,atlas:ArticulatedAtlas)->np.ndarray:
    """Repaint only pixels whose PART+UV surface was actually seen (black=unknown)."""
    h,w=frame.part_id.shape
    out=np.zeros((h,w,3),np.uint8)
    ah,aw=atlas.observed.shape[1:]
    for i in range(len(PARTS)):
        mask=(frame.part_id==i)
        yy=np.rint(frame.v[mask]*(ah-1)).astype(np.int32).clip(0,ah-1)
        xx=np.floor(frame.u[mask]*aw).astype(np.int32)%aw
        known=atlas.observed[i,yy,xx]
        pts=np.argwhere(mask)
        out[pts[known,0],pts[known,1]]=atlas.colors[i,yy[known],xx[known]]
    return out