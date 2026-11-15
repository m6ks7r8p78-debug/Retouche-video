"""RNE0.13: grid-wise independent sparse-vs-dense motion safety research.

Outputs 16 regional decisions; never a certificate of flow correctness.
Only uses current/previous BGR8 and dense current->previous flow.
No model weights, user media, network, image export, or product integration.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
import cv2
import numpy as np

@dataclass(frozen=True)
class TileAudit:
    row:int
    col:int
    status:str
    corners:int
    valid_tracks:int
    median_dense_lk_epe_px:float|None
    fraction_large_error:float|None
    median_photo_mae_255:float|None
    mean_dense_magnitude_px:float|None

@dataclass(frozen=True)
class RegionalAudit:
    status:str
    supported_tiles:int
    disagreement_tiles:int
    insufficient_tiles:int
    tiles:tuple[TileAudit,...]
    manual_research_only:bool=True
    calibrated_for_real_video:bool=False
    motion_truth_certified:bool=False
    automatic_rendering_allowed:bool=False
    exports_personal_media:bool=False

def _check(current,previous,flow):
    if not isinstance(current,np.ndarray) or not isinstance(previous,np.ndarray):
        raise TypeError('BGR arrays required')
    if (current.dtype!=np.uint8 or previous.dtype!=np.uint8 or current.ndim!=3
            or current.shape[2]!=3 or previous.shape!=current.shape):
        raise ValueError('Matched BGR uint8 HWC required')
    h,w=current.shape[:2]
    if min(h,w)<64 or h*w>1280*720:
        raise ValueError('Dimensions outside CPU research budget')
    if (not isinstance(flow,np.ndarray) or flow.shape!=(h,w,2)
            or flow.dtype!=np.float32 or not bool(np.isfinite(flow).all())):
        raise ValueError('Finite float32 current->previous flow HWC2 required')

def _tiles(h,w,grid=4):
    for r in range(grid):
        y0,y1=round(r*h/grid),round((r+1)*h/grid)
        for c in range(grid):
            x0,x1=round(c*w/grid),round((c+1)*w/grid)
            yield r,c,int(y0),int(y1),int(x0),int(x1)

def audit_regions(current:np.ndarray,previous:np.ndarray,flow:np.ndarray,*,
                  manual_research_opt_in:bool=False)->RegionalAudit:
    """Conservative tile audit, NOT a binary good-flow label.

    Exploratory thresholds, NOT calibrated for real-world video: 5 stable
    LK points/tile, median LK-vs-dense distance <=0.8px, <=30% tracks
    with error >1.5px, photo error <=25/255, >=60% in-bounds.
    """
    if type(manual_research_opt_in) is not bool:
        raise TypeError('Explicit Boolean research opt-in required')
    _check(current,previous,flow)
    if not manual_research_opt_in:
        return RegionalAudit('research_disabled',0,0,16,tuple())
    h,w=current.shape[:2]
    cgray=cv2.cvtColor(current,cv2.COLOR_BGR2GRAY)
    pgray=cv2.cvtColor(previous,cv2.COLOR_BGR2GRAY)
    points=[];tile_numbers=[];corner_totals=[0]*16
    for r,c,y0,y1,x0,x1 in _tiles(h,w):
        iy0,iy1=y0+3,y1-3
        ix0,ix1=x0+3,x1-3
        if iy1-iy0<8 or ix1-ix0<8:
            continue
        p=cv2.goodFeaturesToTrack(cgray[iy0:iy1,ix0:ix1],maxCorners=12,
                qualityLevel=.01,minDistance=4,blockSize=3)
        if p is None:
            continue
        cell=4*r+c
        for xy in p.reshape(-1,2):
            points.append([xy[0]+ix0,xy[1]+iy0])
            tile_numbers.append(cell)
            corner_totals[cell]+=1
    if points:
        q=np.asarray(points,np.float32).reshape(-1,1,2)
        prev_pts,st1,_=cv2.calcOpticalFlowPyrLK(cgray,pgray,q,None,
            winSize=(15,15),maxLevel=2,
            criteria=(cv2.TERM_CRITERIA_COUNT|cv2.TERM_CRITERIA_EPS,30,.01))
        if prev_pts is None or st1 is None:
            prev_pts=np.zeros_like(q)
            st1=np.zeros((len(q),1),np.uint8)
            back=np.zeros_like(q)
            st2=np.zeros_like(st1)
        else:
            back,st2,_=cv2.calcOpticalFlowPyrLK(pgray,cgray,prev_pts,None,
                winSize=(15,15),maxLevel=2,
                criteria=(cv2.TERM_CRITERIA_COUNT|cv2.TERM_CRITERIA_EPS,30,.01))
            if back is None or st2 is None:
                back=np.zeros_like(q)
                st2=np.zeros((len(q),1),np.uint8)
        pxy=q.reshape(-1,2)
        xy1=prev_pts.reshape(-1,2)
        xy2=back.reshape(-1,2)
        inb=(xy1[:,0]>=1)&(xy1[:,0]<w-1)&(xy1[:,1]>=1)&(xy1[:,1]<h-1)
        valid=(st1.ravel()>0)&(st2.ravel()>0)&inb&(np.linalg.norm(xy2-pxy,axis=1)<=.9)
        fx=cv2.remap(flow[:,:,0],pxy[:,0].reshape(-1,1),pxy[:,1].reshape(-1,1),
                     cv2.INTER_LINEAR).ravel()
        fy=cv2.remap(flow[:,:,1],pxy[:,0].reshape(-1,1),pxy[:,1].reshape(-1,1),
                     cv2.INTER_LINEAR).ravel()
        epe=np.linalg.norm(np.stack((fx,fy),axis=-1)-(xy1-pxy),axis=1)
        belongs=np.asarray(tile_numbers,np.int32)
    else:
        valid=np.empty(0,dtype=bool)
        epe=np.empty(0,dtype=np.float32)
        belongs=np.empty(0,dtype=np.int32)
    yy,xx=np.mgrid[:h,:w].astype(np.float32)
    mapx,mapy=xx+flow[...,0],yy+flow[...,1]
    warped=cv2.remap(previous,mapx,mapy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    photo=np.abs(current.astype(np.float32)-warped.astype(np.float32)).mean(axis=2)
    inside=(mapx>=0)&(mapx<w-1)&(mapy>=0)&(mapy<h-1)
    result=[]
    for r,c,y0,y1,x0,x1 in _tiles(h,w):
        cell=4*r+c
        take=(belongs==cell)&valid
        n=int(take.sum())
        median=float(np.median(epe[take])) if n else None
        large=float(np.mean(epe[take]>1.5)) if n else None
        ip=inside[y0:y1,x0:x1]
        pp=photo[y0:y1,x0:x1][ip]
        phot=float(np.median(pp)) if len(pp) else None
        mag=float(np.mean(np.linalg.norm(flow[y0:y1,x0:x1],axis=2)))
        if n<5 or len(pp)<.60*((y1-y0)*(x1-x0)):
            status='insufficient_evidence'
        elif median>.8 or large>.30 or phot>25:
            status='disagreement'
        else:
            status='supported'
        result.append(TileAudit(r,c,status,corner_totals[cell],n,
            None if median is None else round(median,4),
            None if large is None else round(large,4),
            None if phot is None else round(phot,4),round(mag,4)))
    return RegionalAudit('completed',sum(x.status=='supported' for x in result),
        sum(x.status=='disagreement' for x in result),
        sum(x.status=='insufficient_evidence' for x in result),tuple(result))

def anonymous_summary(a:RegionalAudit)->dict:
    """No media or filename; only numerical tile audit."""
    if not isinstance(a,RegionalAudit):
        raise TypeError('RegionalAudit required')
    out=asdict(a)
    out['tiles']=[dict(x) for x in out['tiles']]
    return out
