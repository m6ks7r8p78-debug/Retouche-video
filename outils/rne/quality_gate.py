"""RNE research selection gate: no secret media, models or automatic deployment.

This gate does not measure quality, run a model or infer ground truth. It is an
independent policy separating internal/synthetic scores from real-world proof.
"""
from __future__ import annotations
from dataclasses import dataclass
from math import isfinite


@dataclass(frozen=True)
class QualityEvidence:
    protocol: str  # 'internal_train', 'synthetic_holdout', or 'paired_real_holdout'
    groups_unseen: int
    gain_mean_db: float
    gain_p05_db: float
    failures_gt_half_db: int
    samples: int
    paired_truth_verified: bool
    iphone_safari_checked: bool
    temporal_artifacts_checked: bool
    identity_and_geometry_checked: bool


def promotion_status(evidence: QualityEvidence) -> dict:
    if not isinstance(evidence, QualityEvidence):
        raise TypeError('Explicit numerical evidence required')
    if evidence.protocol not in {'internal_train', 'synthetic_holdout', 'paired_real_holdout'}:
        raise ValueError('Unknown benchmark type')
    if evidence.groups_unseen < 0 or evidence.failures_gt_half_db < 0 or evidence.samples < 0:
        raise ValueError('Negative counts are not valid')
    if evidence.failures_gt_half_db > evidence.samples:
        raise ValueError('Failures cannot exceed cases')
    if not isfinite(evidence.gain_mean_db) or not isfinite(evidence.gain_p05_db):
        raise ValueError('Non-finite PSNR gain')
    for key in ('paired_truth_verified', 'iphone_safari_checked',
                'temporal_artifacts_checked','identity_and_geometry_checked'):
        if not isinstance(getattr(evidence, key), bool):
            raise TypeError(f'Expected boolean for {key}')
    blockers=[]
    if evidence.protocol != 'paired_real_holdout':
        blockers.append('score_not_from_real_paired_holdout')
    if evidence.groups_unseen < 10 or evidence.samples < 100:
        blockers.append('insufficient_unseen_groups_or_cases')
    if not evidence.paired_truth_verified:
        blockers.append('no_verified_real_ground_truth')
    if evidence.gain_mean_db < .3 or evidence.gain_p05_db < -.25:
        blockers.append('insufficient_quality_or_tail_regression')
    if evidence.failures_gt_half_db > 0:
        blockers.append('unresolved_regressions')
    if not evidence.iphone_safari_checked:
        blockers.append('no_real_iphone_validation')
    if not evidence.temporal_artifacts_checked:
        blockers.append('no_temporal_artifact_review')
    if not evidence.identity_and_geometry_checked:
        blockers.append('no_identity_geometry_review')
    return {'status':'blocked' if blockers else 'human_review_required',
            'blockers':blockers, 'automatic_deployment':False,
            'publication_of_personal_media':False}


def preview_route(*, manual_opt_in: bool, source_protected: bool,
                  temporal_confidence: float, scene_cut: bool,
                  memory_budget_ok: bool) -> dict:
    if any(type(k) is not bool for k in (manual_opt_in,source_protected,scene_cut,memory_budget_ok)):
        raise TypeError('Explicit boolean flags required')
    if not isfinite(temporal_confidence) or not 0 <= temporal_confidence <= 1:
        raise ValueError('Invalid temporal confidence')
    allow = (manual_opt_in and source_protected and memory_budget_ok
             and not scene_cut and temporal_confidence >= .90)
    return {'route': 'rne_experimental_preview' if allow else 'bicubic_faithful',
            'may_export_automatically': False,
            'original_preserved': True,
            'invented_details_not_claimed_real': True}
