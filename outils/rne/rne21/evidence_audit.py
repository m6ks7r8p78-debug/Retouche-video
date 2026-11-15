"""RNE21 evidence audit: no confidence certificate from low reprojection error.

Checks distinct estimated viewpoints and cross-frame consistency independently
of the shared-shape optimizer, and abstains on conflicting images. Synthetic
color-coded landmarks only; NEVER use as a real-human identity or shape validator.
"""
from __future__ import annotations
from dataclasses import dataclass,asdict
from typing import Sequence
import numpy as np
from anchorage import solve_sequence,solve_single,find_fiducials

@dataclass(frozen=True)
class EvidenceAudit:
    verdict:str
    reason:str
    images:int
    wrist_frames:int
    estimated_yaw_span_deg:float|None
    upper_single_median:float|None
    forearm_single_median:float|None
    upper_single_mad:float|None
    forearm_single_mad:float|None
    shared_vs_independent_distance:float|None
    calibrated_for_real_people:bool=False
    metric_size_supported:bool=False
    contact_proven:bool=False
    identity_proven:bool=False
    automatic_deployment:bool=False


def audit_evidence(images:Sequence[np.ndarray],*,manual_research_opt_in=False)->EvidenceAudit:
    if type(manual_research_opt_in) is not bool or not manual_research_opt_in:
        raise PermissionError('Research opt-in required')
    shared=solve_sequence(images,variable_shape=True,manual_research_opt_in=True,extra_seeds=2)
    n=len(images)
    wrist_frames=sum(bool(np.isfinite(find_fiducials(im)[8]).all()) for im in images)
    if shared.status!='provisional':
        return EvidenceAudit('abstain','poor_or_underdetermined_joint_fit',n,wrist_frames,None,None,None,None,None,None)
    span=float((max(shared.yaw_rad)-min(shared.yaw_rad))*180/np.pi)
    ones=[solve_single(im,manual_research_opt_in=True) for im in images]
    good=[s for s in ones if s.status=='provisional']
    if len(good)<3:
        return EvidenceAudit('abstain','insufficient_independent_single_image_fits',n,wrist_frames,round(span,2),None,None,None,None,None)
    u=np.array([s.upper_relative for s in good]); f=np.array([s.forearm_relative for s in good])
    um=float(np.median(u));fm=float(np.median(f))
    umad=float(np.median(abs(u-um)));fmad=float(np.median(abs(f-fm)))
    distance=float(max(abs(um-shared.upper_relative),abs(fm-shared.forearm_relative)))
    if wrist_frames<3:
        verdict,reason='abstain','inadequate_visible_wrist_support'
    elif span<18:
        verdict,reason='abstain','no_diverse_camera_evidence'
    elif max(umad,fmad)>.075:
        verdict,reason='abstain','inconsistent_single_image_lengths'
    elif distance>.07:
        verdict,reason='abstain','shared_and_independent_disagree'
    else:
        verdict,reason='provisional_agreement','synthetic_cross_view_evidence_agrees'
    return EvidenceAudit(verdict,reason,n,wrist_frames,round(span,2),
        round(um,5),round(fm,5),round(umad,5),round(fmad,5),round(distance,5))


def anonymous_summary(out:EvidenceAudit):
    if not isinstance(out,EvidenceAudit):raise TypeError('EvidenceAudit required')
    return asdict(out)

