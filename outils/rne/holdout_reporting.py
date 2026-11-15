"""Privacy-first RNE holdout statistics and evidence gate.

No dependencies on specific users, files, paths, video content or model weights.
Keeps correlated frame samples grouped by video. Never allows automatic deployment.
"""
from __future__ import annotations
from collections import defaultdict
from math import isfinite
import numpy as np


def _valid_number(value):
    return isinstance(value,(int,float,np.floating)) and not isinstance(value,(bool,np.bool_)) and isfinite(value)


def _validate_cases(rows,key):
    if not isinstance(rows,list):raise TypeError('List of offline measurement records required')
    for row in rows:
        if not isinstance(row,dict) or not isinstance(row.get('video_id'),str) or not row['video_id'].strip():
            raise ValueError('Anonymous, nonblank video_id required')
        if not _valid_number(row.get(key)):
            raise ValueError('Finite measurement required')
        if key=='gain_psnr' and not -30 <= row[key] <=30:
            raise ValueError('Unexpected dB gain')
        if key=='delta_temporal_mae' and not -255<=row[key]<=255:
            raise ValueError('Unexpected 8-bit motion MAE difference')


def grouped_bootstrap(rows, metric, seed=20261114, resamples=2000):
    """Return video-level mean and 95% bootstrap interval, not frame-pooled CI."""
    _validate_cases(rows,metric)
    if not isinstance(seed,int) or not 100<=resamples<=100000:
        raise ValueError('Invalid bootstrap configuration')
    groups=defaultdict(list)
    for row in rows:groups[row['video_id']].append(float(row[metric]))
    if not groups:raise ValueError('At least one independently sampled video required')
    video_means=np.array([np.mean(groups[key]) for key in sorted(groups)],np.float64)
    rng=np.random.default_rng(seed)
    if len(video_means)>1:
        draw=rng.integers(0,len(video_means),size=(resamples,len(video_means)))
        confidence=np.quantile(video_means[draw].mean(axis=1),[.025,.975])
    else:
        confidence=np.array([video_means[0],video_means[0]])
    return {'videos':len(groups),'samples':len(rows),
            'mean_across_video_means':round(float(video_means.mean()),5),
            'bootstrap_95pct_CI':[round(float(x),5) for x in confidence],
            'ci_is_exploratory':True,
            'frame_samples_not_treated_as_independent':True}


def independent_video_gate(*,uploaded_count,exact_duplicates,scene_overlap_exclusions,
                           provisional_candidates,scene_independence_verified,
                           real_reference_paired,real_iphone_validated,
                           regressions,spatial_ci,temporal_ci):
    """Conservative decision that never grants automatic product activation.

    Strong matches are removed but absence of a match is not proof of novelty.
    Synthetic-downsampling ground truth isn't a verified before-filter source.
    """
    sizes=[uploaded_count,exact_duplicates,scene_overlap_exclusions,provisional_candidates,regressions]
    if any(isinstance(x,bool) or not isinstance(x,int) or x<0 for x in sizes):
        raise ValueError('Counts must be nonnegative integers')
    if uploaded_count!=exact_duplicates+scene_overlap_exclusions+provisional_candidates:
        raise ValueError('Every uploaded video must be accounted for exactly once')
    for x in (scene_independence_verified,real_reference_paired,real_iphone_validated):
        if not isinstance(x,bool):raise TypeError('Evidence flags must be explicit booleans')
    if not all(isinstance(x,dict) and isinstance(x.get('bootstrap_95pct_CI'),list) and len(x['bootstrap_95pct_CI'])==2
               and all(_valid_number(y) for y in x['bootstrap_95pct_CI']) for x in (spatial_ci,temporal_ci)):
        raise ValueError('Finite per-video bootstrap intervals required')
    blockers=[]
    if provisional_candidates<10:blockers.append('too_few_candidate_clips')
    if not scene_independence_verified:blockers.append('visual_scene_independence_not_verified')
    if not real_reference_paired:blockers.append('original_before_filter_ground_truth_missing')
    if spatial_ci['bootstrap_95pct_CI'][0]<=0:blockers.append('psnr_confidence_interval_includes_nonimprovement')
    if temporal_ci['bootstrap_95pct_CI'][1]>=0:blockers.append('temporal_confidence_interval_not_strictly_better')
    if regressions>0:blockers.append('spatial_regressions_remain')
    if not real_iphone_validated:blockers.append('no_real_iphone_safari_validation')
    return {'status':'research_only_blocked' if blockers else 'human_review_required',
            'blockers':blockers,'automatic_deployment':False,
            'allows_private_training_reuse':False,
            'published_media':False,
            'accepts_simulated_LR_as_real_AR_ground_truth':False}
