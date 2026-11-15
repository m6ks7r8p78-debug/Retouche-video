"""Ground-truth depth maps for existing deterministic MultiMotion scenes.

This is a *synthetic oracle*; maps are generated from declared 2D layer
geometry, not a learned model or real range sensor. Not a validation dataset.
"""
from __future__ import annotations
import cv2
import numpy as np

try:
    from scenes_multimotion import make_scene, CASES
except ModuleNotFoundError:
    from baseline_scenes import make_scene, CASES  # archive-only fallback


def make_scene_with_oracle(case='two_depths',seed=0,n=11,h=240,w=320):
    frames,meta=make_scene(case,seed,n=n,h=h,w=w)
    depth_bg=float(meta['Z_background_m']);depth_fg=float(meta['Z_foreground_m'])
    f=float(meta['focal_px']);t=float(meta['T_m_per_frame'])
    depths=[]
    mask=np.zeros((h,w),np.uint8)
    if case == 'broad_object':
        cv2.rectangle(mask,(21,22),(w-30,int(h*.61)),255,-1)
    elif case == 'local_object':
        cv2.rectangle(mask,(w//2-19,h//2-22),(w//2+19,h//2+22),255,-1)
    else:
        cv2.rectangle(mask,(24,17),(w-30,int(h*.54)),255,-1)
    for i in range(n):
        if case == 'two_depths_low_delta':
            actual_depth_fg=depth_bg*.8
        elif (case.startswith('two_depths') and case != 'two_depths_mimic') or case == 'occlusion':
            actual_depth_fg=depth_fg
        else:
            actual_depth_fg=depth_bg
        ang=(.18*i if case=='two_depths_rotated' else 0.)
        m1=cv2.getRotationMatrix2D((w/2,h/2),ang,1.)
        if case in ('two_depths','two_depths_rotated','occlusion','two_depths_mimic','two_depths_compressed','two_depths_cut'):
            # The mimic moves with the same rendered pixel trajectory as the real
            # parallax layer, even though its real physical depth is bg depth.
            m1[0,2]-=f*t*i/depth_fg
        elif case=='two_depths_low_delta':
            m1[0,2]-=f*t*i/(depth_bg*.8)
        else:
            m1[0,2]-=f*t*i/depth_bg
            if case in ('broad_object','local_object'):
                m1[1,2]+=i*4.2
        mm=cv2.warpAffine(mask,m1,(w,h),flags=cv2.INTER_NEAREST,
                         borderMode=cv2.BORDER_CONSTANT,borderValue=0)
        zm=np.full((h,w),depth_bg,dtype=np.float32)
        if actual_depth_fg!=depth_bg:
            zm[mm>0]=actual_depth_fg
        # Artificial opaque occluder depth is deliberately unknown: guard can abstain.
        if case=='occlusion' and 4<=i<=6:
            zm[:,w//3:w//3+45]=np.nan
        depths.append(zm)
    motions=[{'translation_x_m':t,'rotation_deg':.18 if case=='two_depths_rotated' else 0.,
              'focal_px':f} for _ in range(n-1)]
    return frames,depths,motions,meta