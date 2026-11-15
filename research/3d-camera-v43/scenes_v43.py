"""Reproducible geometry-only synthetic adversarial scenes, no personal media."""
from __future__ import annotations
import cv2
import numpy as np

CASES=('translation','rotation','zoom','rotation_object','camera_object','still_object','blank','parallax','occlusion')


def make_scene(case='rotation',seed=0,n=12,h=240,w=320):
    if case not in CASES: raise ValueError(case)
    rng=np.random.default_rng(seed)
    texture=rng.integers(20,190,(h,w,3),dtype=np.uint8)
    texture=cv2.GaussianBlur(texture,(3,3),.7)
    for _ in range(70):
        x,y=int(rng.integers(5,w-5)),int(rng.integers(5,h-5))
        cv2.circle(texture,(x,y),int(rng.integers(2,6)),(240,215,200),-1)
    frames=[];true=[]
    for i in range(n):
        # Similarity transform maps world/reference coordinates into camera frame.
        angle=(i*1.05 if case in ('rotation','rotation_object') else .0)
        zoom=1+i*.008 if case=='zoom' else 1.0
        m=cv2.getRotationMatrix2D((w/2,h/2),angle,zoom)
        m[0,2]+=i*1.35 if case in ('translation','camera_object','occlusion','still_object','parallax') else 0.
        m[1,2]+=i*.4 if case in ('camera_object','occlusion') else 0.
        image=cv2.warpAffine(texture,m,(w,h),borderMode=cv2.BORDER_REFLECT)
        if case=='parallax':
            # Two wide planes move differently. This is a parallax *proxy* only.
            nmat=m.copy();nmat[0,2]-=i*2.4
            second=cv2.warpAffine(texture,nmat,(w,h),borderMode=cv2.BORDER_REFLECT)
            image[:h//2]=second[:h//2]
        gt=[]
        if case in ('rotation_object','camera_object','still_object','occlusion'):
            x=(60+8*i if case!='still_object' else 95)
            y=100 if case!='occlusion' else 110
            px,py=m@np.array([x,y,1.])
            cv2.rectangle(image,(round(px)-12,round(py)-12),(round(px)+12,round(py)+12),
                          (20,35,240),-1)
            if case=='occlusion' and 4<=i<=7:
                cv2.rectangle(image,(round(px)-18,round(py)-17),(round(px)+20,round(py)+20),
                              (90,90,90),-1)
            gt.append((x,y)) # location *after* camera stabilization
        if case=='blank': image[:]=90
        frames.append(image);true.append(gt)
    return frames,true