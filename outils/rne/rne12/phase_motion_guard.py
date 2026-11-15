"""RNE0.12 research only: third observer (global phase correlation).

Pass only when sparse LK and dense Farneback agree AND phase correlation gives
strong evidence for a *single global translation*. Cannot certify nonrigid
motion, occlusions, faces or true detail. A provisional agreement is NOT a
geometric guarantee. Explicit research opt-in required; no production use.
"""
from __future__ import annotations
from dataclasses import dataclass,asdict
import cv2,numpy as np
from outils.rne.rne11.sparse_motion_audit import audit_sparse_motion

@dataclass(frozen=True)
class PhaseMotionAudit:
    verdict:str
    reason:str
    phase_response:float|None
    phase_shift_x:float|None
    phase_shift_y:float|None
    median_dense_phase_disagreement:float|None
    fraction_dense_phase_over_2px:float|None
    sparse_verdict:str
    research_only:bool=True
    rigid_translation_only:bool=True
    face_identity_verified:bool=False
    generalization_proven:bool=False
    production_allowed:bool=False
    exports_personal_media:bool=False


def phase_motion_gate(current:np.ndarray,previous:np.ndarray,dense_current_to_previous:np.ndarray,
                      *,manual_research_opt_in:bool=False):
    """Conservative abstention or provisional agreement for rigid global shifts.

    Bounds are hypotheses fixed for this research stage:
    phase peak response 0.35; median mismatch 0.75 px; maximum 15% outliers
    over 2px. Not calibrated for moving people/camera zoom or iPhone videos.
    """
    if type(manual_research_opt_in) is not bool:
        raise TypeError('Research opt-in requires Boolean')
    # Reuse RNE0.11 input validation; do not silently allow zero/NaN flows.
    sparse=audit_sparse_motion(current,previous,
                dense_current_to_previous=dense_current_to_previous,
                manual_research_opt_in=manual_research_opt_in)
    if not manual_research_opt_in:
        return PhaseMotionAudit('abstain','research_disabled',None,None,None,None,None,sparse.verdict)
    if sparse.verdict!='provisional_agreement':
        return PhaseMotionAudit('abstain','sparse_evidence_'+sparse.verdict,None,None,None,None,None,sparse.verdict)
    gcur=cv2.cvtColor(current,cv2.COLOR_BGR2GRAY).astype(np.float32)
    gprev=cv2.cvtColor(previous,cv2.COLOR_BGR2GRAY).astype(np.float32)
    h,w=gcur.shape
    # Hanning reduces artifacts at transformed frame boundaries.
    win=cv2.createHanningWindow((w,h),cv2.CV_32F)
    shift,response=cv2.phaseCorrelate(gcur,gprev,win)
    if not (np.isfinite(response) and np.all(np.isfinite(shift))):
        return PhaseMotionAudit('abstain','invalid_phase',None,None,None,None,None,sparse.verdict)
    sx,sy=float(shift[0]),float(shift[1]); response=float(response)
    def answer(verdict,reason,med=None,fraction=None):
        return PhaseMotionAudit(verdict,reason,round(response,5),round(sx,5),round(sy,5),
            None if med is None else round(float(med),5),
            None if fraction is None else round(float(fraction),5),sparse.verdict)
    if response <.35:return answer('abstain','weak_phase_peak')
    # Exclude borders subject to unknown padding. Avoid sampling >1M pixels.
    margin=max(10,min(30,int(np.ceil(max(abs(sx),abs(sy))))+3))
    if h<=2*margin+8 or w<=2*margin+8:
        return answer('abstain','insufficient_interior')
    interior=dense_current_to_previous[margin:h-margin,margin:w-margin]
    disagreement=np.linalg.norm(interior-np.asarray((sx,sy),np.float32),axis=2)
    med=float(np.median(disagreement))
    fraction=float(np.mean(disagreement>2.))
    if med>.75:return answer('abstain','global_translation_disagrees',med,fraction)
    if fraction>.15:return answer('abstain','spatial_nonuniformity_or_occlusion',med,fraction)
    return answer('provisional_agreement','three_observers_consistent_global_shift',med,fraction)


def to_dict(a:PhaseMotionAudit):
    if not isinstance(a,PhaseMotionAudit):raise TypeError('PhaseMotionAudit required')
    return asdict(a)
