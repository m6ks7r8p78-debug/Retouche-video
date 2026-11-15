"""Private-data-free procedural paired LR-HR video-like test scenes.

Train and eval use disjoint seed ranges and different pattern families.
Synthesized motion/occlusions are not actual footage or recovered true details.
"""
from __future__ import annotations
import cv2,numpy as np, torch

TRAIN_FAMILIES=('lines','polygons','clouds')
TEST_FAMILIES=('rings','letters','checker')

def image(seed:int, family:str, side:int=48):
    rng=np.random.default_rng(seed)
    h=w=side
    bg=rng.uniform(20,230,(3,)).astype(np.float32)
    yy,xx=np.mgrid[:h,:w].astype(np.float32)
    grad=(xx/h*rng.uniform(-25,25)+yy/h*rng.uniform(-25,25))[:,:,None]
    out=np.clip(bg[None,None,:]+grad,0,255).astype(np.uint8)
    if family=='lines':
        for _ in range(12):
            p1=tuple(int(x) for x in rng.integers(0,side,2))
            p2=tuple(int(x) for x in rng.integers(0,side,2))
            cv2.line(out,p1,p2,tuple(int(x) for x in rng.integers(0,256,3)),int(rng.integers(1,3)),cv2.LINE_AA)
    elif family=='polygons':
        for _ in range(7):
            p=rng.integers(0,side,(int(rng.integers(3,7)),2)).astype(np.int32)
            cv2.fillPoly(out,[p],tuple(int(x) for x in rng.integers(0,256,3)),cv2.LINE_AA)
    elif family=='clouds':
        for _ in range(25):
            pos=tuple(int(x) for x in rng.integers(0,side,2))
            cv2.circle(out,pos,int(rng.integers(1,8)),tuple(int(x) for x in rng.integers(0,256,3)),thickness=-1,lineType=cv2.LINE_AA)
    elif family=='rings':
        cx,cy=tuple(int(x) for x in rng.integers(side//4,3*side//4,2))
        for rad in range(3,side//2,4):
            cv2.circle(out,(cx,cy),rad,tuple(int(x) for x in rng.integers(0,256,3)),1,cv2.LINE_AA)
    elif family=='letters':
        for _ in range(7):
            c=chr(int(rng.integers(65,91)))
            xy=tuple(int(x) for x in rng.integers(0,side,2))
            cv2.putText(out,c,xy,cv2.FONT_HERSHEY_SIMPLEX,float(rng.uniform(.3,.7)),tuple(int(x) for x in rng.integers(0,256,3)),1,cv2.LINE_AA)
    elif family=='checker':
        interval=int(rng.choice([3,5,7]))
        grid=((xx//interval+yy//interval)%2).astype(np.uint8)
        shade=rng.integers(40,130)
        out=np.clip(out.astype(np.float32)+((grid.astype(np.float32)*2-1)*shade)[:,:,None],0,255).astype(np.uint8)
    else:raise ValueError('Unknown family')
    return out

def make_pair(seed:int, family:str, side:int=48):
    rng=np.random.default_rng(seed+98271)
    clean=image(seed,family,side)
    # Previous source differs via deterministic camera shift, which is re-aligned
    # analytically using the known displacement (separate from actual flow estimator).
    dx,dy=map(int,rng.integers(-3,4,2))
    prev=cv2.warpAffine(clean,np.float32([[1,0,-dx],[0,1,-dy]]),(side,side),
                       borderMode=cv2.BORDER_REFLECT101)
    aligned=cv2.warpAffine(prev,np.float32([[1,0,dx],[0,1,dy]]),(side,side),
                       borderMode=cv2.BORDER_REFLECT101)
    # Different independent noise in current and previous LR captures;
    # no future frame; second observation may help only where confidence permits.
    curr_lr=cv2.resize(clean,(side//2,side//2),interpolation=cv2.INTER_AREA)
    prior_lr=cv2.resize(aligned,(side//2,side//2),interpolation=cv2.INTER_AREA)
    sigma=float(rng.choice([0,2,5,9]))
    current=np.clip(curr_lr.astype(np.float32)+rng.normal(0,sigma,curr_lr.shape),0,255).astype(np.uint8)
    previous=np.clip(prior_lr.astype(np.float32)+rng.normal(0,sigma,prior_lr.shape),0,255).astype(np.uint8)
    # Occlusion simulates movement of an unmodelled foreground object.
    trust=np.ones((side//2,side//2),np.float32)
    if seed%4==0:
        y=int(rng.integers(0,side//4));x=int(rng.integers(0,side//4))
        y1=y+int(rng.integers(side//8,side//4))
        x1=x+int(rng.integers(side//8,side//4))
        previous[y:y1,x:x1]=rng.integers(0,256,(y1-y,x1-x,3),dtype=np.uint8)
        trust[y:y1,x:x1]=0.
    # Valid boundary only if inverse translation has source support, conservative.
    if dx>0: trust[:, :max(1,(dx+1)//2)]=0
    if dx<0: trust[:, dx//2:]=0
    if dy>0: trust[:max(1,(dy+1)//2),:]=0
    if dy<0: trust[dy//2:,:]=0
    def chw(a):return torch.from_numpy(np.ascontiguousarray(a[:,:,::-1])).permute(2,0,1).float()/255
    return chw(current),chw(previous),torch.from_numpy(trust[None]),chw(clean)

def dataset(n:int,train:bool,side:int=48):
    families=TRAIN_FAMILIES if train else TEST_FAMILIES
    return [make_pair((1000 if train else 900000)+i*37,families[i%len(families)],side) for i in range(n)]
