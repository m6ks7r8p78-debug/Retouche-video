"""RNE0.15 offline paired-evidence gate for research candidates.

Prevents additive guards from being promoted merely because they spot a
synthetic corruption that existing guards already reject. Not a production
approval system or statistical proof of real-world quality.
"""
from __future__ import annotations
from dataclasses import dataclass,asdict

@dataclass(frozen=True)
class EvidenceDecision:
    state: str
    reasons: tuple[str, ...]
    bad_baseline_accepted: int
    bad_candidate_accepted: int
    good_baseline_accepted: int
    good_candidate_accepted: int
    correct_retention_fraction: float
    additional_bad_rejections: int
    paired_reconstructions_synthetic_only: bool = True
    real_video_validated: bool = False
    model_promoted: bool = False
    automatic_deployment_allowed: bool = False

def evaluate_additive_guard(reports: list[dict],*,max_correct_loss_fraction=0.05):
    """Compare on paired ground-truth regions, never independent pooled frames.

    A candidate qualifies for *manual evaluation* only if it rejects a newly
    found erroneous acceptance AND retains >=95% of baseline good acceptances.
    It never authorizes merging, deployment or training on the reserved set.
    """
    if not isinstance(reports,list) or not reports:
        raise ValueError('At least one paired report required')
    if type(max_correct_loss_fraction) is not float or max_correct_loss_fraction!=.05:
        raise ValueError('Fixed preregistered 5% research tolerance required')
    totals=dict(bad_old=0,bad_new=0,good_old=0,good_new=0)
    for rep in reports:
        if not isinstance(rep,dict) or 'counts' not in rep or 'scenes' not in rep:
            raise ValueError('Report must include counts and number of scenes')
        if type(rep['scenes']) is not int or rep['scenes']<1:
            raise ValueError('Scene count must be positive')
        v=rep['counts']
        if not isinstance(v,dict):raise TypeError('Counts must be a dict')
        def count(name):
            x=v.get(name,0)
            if type(x) is not int or x<0:raise ValueError('Nonnegative integer counts only')
            return x
        for cls in ('good','bad'):
            bo=count(f'{cls}_rne14_accepted');br=count(f'{cls}_rne14_rejected')
            no=count(f'{cls}_rne15_veto_accepted');nr=count(f'{cls}_rne15_veto_rejected')
            if bo+br!=no+nr:raise ValueError(f'Paired {cls} support differs')
            if no>bo:raise ValueError('Veto-only candidate cannot promote baseline refusals')
            totals[f'{cls}_old']+=bo
            totals[f'{cls}_new']+=no
    retained=(totals['good_new']/totals['good_old']) if totals['good_old'] else 0.
    additional=totals['bad_old']-totals['bad_new']
    reasons=[]
    if totals['good_old']==0:reasons.append('no_supported_correct_regions_in_baseline')
    if additional<=0:reasons.append('no_additional_incorrect_motion_prevented')
    if retained<.95:reasons.append('excessive_rejection_of_correct_regions')
    return EvidenceDecision('rejected' if reasons else 'eligible_for_independent_human_review',
        tuple(reasons),totals['bad_old'],totals['bad_new'],
        totals['good_old'],totals['good_new'],round(retained,6),additional)

def anonymous_summary(result):
    if not isinstance(result,EvidenceDecision):raise TypeError('Expected EvidenceDecision')
    return asdict(result)
