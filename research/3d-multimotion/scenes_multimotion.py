"""Physics-inspired pinhole/layer synthetic stress cases with analytic scene provenance.
Textures are procedurally generated; no private media. Layers are 2D surfaces
with specified distance; a *simulated* camera translates horizontally.
"""
from __future__ import annotations
import cv2
import numpy as np

CASES=('two_depths','two_depths_rotated','two_depths_low_delta',
       'two_depths_mimic','two_depths_compressed','two_depths_cut',
       'single_plane','local_object','broad_object','blank','occlusion')


def make_scene(case='two_depths',seed=0,n=11,h=240,w=320):
    if case not in CASES:raise ValueError(case)
    rng=np.random.default_rng(seed)
    bg=rng.integers(15,225,(h,w,3),dtype=np.uint8)
    fg=rng.integers(15,225,(h,w,3),dtype=np.uint8)
    bg=cv2.GaussianBlur(bg,(3,3),.65); fg=cv2.GaussianBlur(fg,(3,3),.65)
    for im in (bg,fg):
        for _ in range(35):
            x,y=int(rng.integers(8,w-8)),int(rng.integers(8,h-8))
            cv2.circle(im,(x,y),int(rng.integers(2,7)),(20,240,210),-1)
    mask=np.zeros((h,w),np.uint8)
    # Distinct surface spans much of the scene. Not an annotated human or object.
    cv2.rectangle(mask,(24,17),(w-30,int(h*.54)),255,-1)
    if case=='broad_object':
        mask[:]=0;cv2.rectangle(mask,(21,22),(w-30,int(h*.61)),255,-1)
    if case=='local_object':
        mask[:]=0;cv2.rectangle(mask,(w//2-19,h//2-22),(w//2+19,h//2+22),255,-1)
    if case=='two_depths_cut':
        bg_after=rng.integers(15,225,(h,w,3),dtype=np.uint8)
        fg_after=rng.integers(15,225,(h,w,3),dtype=np.uint8)
        bg_after=cv2.GaussianBlur(bg_after,(3,3),.65)
        fg_after=cv2.GaussianBlur(fg_after,(3,3),.65)
    frames=[]
    # A pinhole camera with focal length 360 px translating 0.018 m/frame.
    focal=360.;tx_step=.018
    depth_bg=7.2;depth_fg=1.7
    for i in range(n):
        ang=(.18*i if case=='two_depths_rotated' else 0.)
        m0=cv2.getRotationMatrix2D((w/2,h/2),ang,1.)
        m0[0,2]-=focal*tx_step*i/depth_bg
        m1=cv2.getRotationMatrix2D((w/2,h/2),ang,1.)
        if case in ('two_depths','two_depths_rotated','occlusion','two_depths_mimic','two_depths_compressed','two_depths_cut'):
            m1[0,2]-=focal*tx_step*i/depth_fg
        elif case=='two_depths_low_delta':
            m1[0,2]-=focal*tx_step*i/(depth_bg*.8)
        elif case=='single_plane':
            m1[0,2]-=focal*tx_step*i/depth_bg
        elif case in ('broad_object','local_object'):
            m1[0,2]-=focal*tx_step*i/depth_bg
            m1[1,2]+=i*4.2
        else:
            m1[0,2]-=focal*tx_step*i/depth_bg
        ib=cv2.warpAffine(bg_after if case=='two_depths_cut' and i>=5 else bg,m0,(w,h),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT)
        iff=cv2.warpAffine(fg_after if case=='two_depths_cut' and i>=5 else fg,m1,(w,h),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT)
        mm=cv2.warpAffine(mask,m1,(w,h),flags=cv2.INTER_NEAREST,borderMode=cv2.BORDER_CONSTANT)
        image=np.where(mm[...,None]>0,iff,ib).astype(np.uint8)
        if case=='occlusion' and 4<=i<=6:
            cv2.rectangle(image,(w//3,0),(w//3+44,h), (60,60,60),-1)
        if case=='blank':image[:]=80
        if case=='two_depths_compressed':
            ok,encoded=cv2.imencode('.jpg',image,[cv2.IMWRITE_JPEG_QUALITY,52])
            if not ok:raise RuntimeError('jpeg encode failed')
            image=cv2.imdecode(encoded,cv2.IMREAD_COLOR)
        frames.append(image)
    return frames,{'case':case,'seed':seed,'focal_px':focal,'T_m_per_frame':tx_step,
                   'Z_background_m':depth_bg,'Z_foreground_m':depth_fg,
                   'is_camera_parallax':(case.startswith('two_depths') and case!='two_depths_mimic') or case=='occlusion',
                   'is_independent_object':case in ('broad_object','local_object','two_depths_mimic'),
                   'causal_interpretation':('independent planar object can produce exactly the same pixels' if case=='two_depths_mimic' else 'synthetic reference only')}