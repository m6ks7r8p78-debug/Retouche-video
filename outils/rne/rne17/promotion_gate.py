"""RNE17 experimental quality gate, rejecting unfounded complexity.

Even a synthetic pass NEVER authorizes product deployment; independent real
video, motion, AR identity and Safari tests remain mandatory. A cheaper fixed
amplitude reference is a required competitor.
"""
from __future__ import annotations
from dataclasses import dataclass,asdict
import math

@dataclass(frozen=True)
class PromotionAudit:
    decision:str
    failed_rules:tuple[str,...]
    allow_app_deployment:bool=False
    allow_automatic_publish:bool=False
    real_video_verified:bool=False

def review(locked_report:dict,constant_report:dict)->PromotionAudit:
    if not isinstance(locked_report,dict) or not isinstance(constant_report,dict):
        raise TypeError('Two reports required')
    overall=locked_report.get('overall',{})
    by=locked_report.get('by_family',{})
    fixed=constant_report.get('families',{}).get('overall',{})
    req=['aegis_gain_db','ancre_gain_db','aegis_severe_losses_vs_bicubic',
         'ancre_severe_losses_vs_bicubic','delta_aegis_vs_ancre_db']
    for key in req:
        if type(overall.get(key)) not in (int,float) or not math.isfinite(overall[key]):
            raise ValueError(f'Missing or invalid locked metric {key}')
    for key in ('learned_minus_fixed','learned_severe','fixed_severe','n'):
        if type(fixed.get(key)) not in (int,float) or not math.isfinite(fixed[key]):
            raise ValueError(f'Missing or invalid constant baseline {key}')
    if fixed['n']!=overall.get('n') or fixed['n']<100 or len(by)<3:
        raise ValueError('Incomplete or unmatched evaluation reports')
    failed=[]
    if overall['aegis_gain_db']<0:failed.append('still_below_bicubic_overall')
    if any(x.get('aegis_gain_db',float('-inf'))<0 for x in by.values()):
        failed.append('still_below_bicubic_in_one_or_more_families')
    if overall['delta_aegis_vs_ancre_db']<.02:failed.append('no_mean_gain_over_ancre')
    if overall['aegis_severe_losses_vs_bicubic']>overall['ancre_severe_losses_vs_bicubic']:
        failed.append('more_severe_losses_than_ancre')
    if fixed['learned_minus_fixed']<.02:failed.append('not_better_than_cheap_fixed_blend')
    if fixed['learned_severe']>fixed['fixed_severe']:
        failed.append('more_severe_losses_than_cheap_fixed_blend')
    return PromotionAudit('REJECT_LEARNED_HEAD' if failed else 'SYNTHETIC_RESEARCH_CANDIDATE_ONLY',tuple(failed))

def anonymous_summary(a:PromotionAudit)->dict:
    if not isinstance(a,PromotionAudit):raise TypeError('PromotionAudit required')
    return asdict(a)
