"""RNE 0.14 — illumination-tolerant, ambiguity-aware *research* tile audit.

Re-evaluates ONLY the photometric veto of RNE13, never its sparse-motion or
coverage veto. Census rank descriptors offer partial illumination invariance;
periodic/low-texture images are flagged as ambiguous. No image/model changes,
user media, network, export, or production rendering.
"""
from __future__ import annotations
from dataclasses import dataclass,asdict
import cv2
import numpy as np
from outils.rne.rne13.regional_motion_audit import _check,_tiles,audit_regions

@dataclass(frozen=True)
class CensusTile:
    row:int
    col:int
    original:str
    decision:str
    reason:str
    census_disagreement:float|None
    contrast_std:float|None
    periodicity_corr:float|None

@dataclass(frozen=True)
class CensusAudit:
    state:str
    supported_tiles:int
    promoted_from_photometric_veto:int
    provisional_tiles:tuple[CensusTile,...]
    manual_research_only:bool=True
    independently_validated:bool=False
    verifies_geometric_truth:bool=False
    automatic_deployment:bool=False
    media_export_authorized:bool=False


def _census_difference(cur_gray,prev_gray):
    c=cur_gray.astype(np.int16)
    p=prev_gray.astype(np.int16)
    out=np.zeros(c.shape,np.float32)
    offsets=((-2,-2),(-2,0),(-2,2),(0,-2),(0,2),(2,-2),(2,0),(2,2))
    for dy,dx in offsets:
        cs=np.roll(c,(-dy,-dx),axis=(0,1))
        ps=np.roll(p,(-dy,-dx),axis=(0,1))
        out+=((cs>c)!=(ps>p)).astype(np.float32)/len(offsets)
    return out


def _correlation_14(tile):
    x=tile.astype(np.float32)
    corr=[]
    for axis in (0,1):
        if x.shape[axis]<=20:continue
        if axis==0:a=x[:-14].ravel();b=x[14:].ravel()
        else:a=x[:,:-14].ravel();b=x[:,14:].ravel()
        a=a-a.mean();b=b-b.mean()
        if np.std(a)>4 and np.std(b)>4:
            corr.append(float(a.dot(b)/(np.linalg.norm(a)*np.linalg.norm(b)+1e-8)))
    return max(corr,default=0.)


def audit_lighting(current,previous,flow,*,manual_research_opt_in:bool=False)->CensusAudit:
    """Photometric-veto-only second opinion. Experimental fixed criteria.

    Attempts to support only RNE13 tiles with enough valid LK tracks,
    median motion disagreement <=.8 px, fraction large error <=.30,
    raw photometric failure >25 RGB/255, and >60% inbounds.
    Requires mean 8-bit census disagreement <=0.05, grayscale std>=18,
    max 14px self-correlation <=.90, no clipping dominant. Thresholds were
    chosen after examining historical-synthetic development samples; their
    performance on real footage and recurrent patterns is unverified.
    """
    if type(manual_research_opt_in) is not bool:
        raise TypeError('Boolean research opt-in required')
    _check(current,previous,flow)
    if not manual_research_opt_in:
        return CensusAudit('disabled',0,0,tuple())
    # Compute baseline internally from the SAME raw frames/flow. Caller cannot
    # attach old/stale LK evidence from a different frame or video.
    original=audit_regions(current,previous,flow,manual_research_opt_in=True)
    h,w=current.shape[:2]
    yy,xx=np.mgrid[:h,:w].astype(np.float32)
    mx,my=xx+flow[...,0],yy+flow[...,1]
    inbounds=(mx>=2)&(mx<w-3)&(my>=2)&(my<h-3)
    warped=cv2.remap(previous,mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    grayc=cv2.cvtColor(current,cv2.COLOR_BGR2GRAY)
    grayp=cv2.cvtColor(warped,cv2.COLOR_BGR2GRAY)
    errors=_census_difference(grayc,grayp)
    results=[];promoted=0
    for tile,(r,c,y0,y1,x0,x1) in zip(original.tiles,_tiles(h,w)):
        if (tile.row,tile.col)!=(r,c):
            raise ValueError('Tile coordinates not aligned with actual frame')
        old=tile.status
        # Do not override a pre-existing LK or coverage failure.
        plausible=(old=='disagreement' and tile.valid_tracks>=5 and
                   tile.median_dense_lk_epe_px is not None and tile.median_dense_lk_epe_px<=.8 and
                   tile.fraction_large_error is not None and tile.fraction_large_error<=.30 and
                   tile.median_photo_mae_255 is not None and tile.median_photo_mae_255>25)
        if not plausible:
            results.append(CensusTile(r,c,old,old,'not_a_photometric_only_veto',None,None,None))
            continue
        inside=inbounds[y0:y1,x0:x1]
        if inside.mean()<=.6:
            results.append(CensusTile(r,c,old,old,'insufficient_inbounds',None,None,None));continue
        raw=grayc[y0:y1,x0:x1]
        saturation=float(((raw<8)|(raw>247))[inside].mean())
        contrast=float(raw[inside].std())
        repetition=_correlation_14(raw)
        census=float(errors[y0:y1,x0:x1][inside].mean())
        reason='supported_by_census' if census<=.05 and contrast>=18 and repetition<=.90 and saturation<.40 else (
            'insufficient_distinct_texture' if contrast<18 else 'periodic_ambiguous' if repetition>.90
            else 'saturated_image' if saturation>=.40 else 'census_mismatch')
        decision='supported' if reason=='supported_by_census' else old
        promoted+=decision=='supported'
        results.append(CensusTile(r,c,old,decision,reason,round(census,5),round(contrast,3),round(repetition,3)))
    return CensusAudit('completed',sum(t.decision=='supported' for t in results),promoted,tuple(results))


def anonymous_summary(a:CensusAudit):
    if not isinstance(a,CensusAudit):raise TypeError('CensusAudit expected')
    return asdict(a)