"""RNE 0.8: group-aware audit of rare severe quality regressions.

Run on PRIVATE historical feature/label records. Outputs anonymous aggregate
statistics only. This does not learn a deployable detector or validate unseen
videos; it is an explicit reason to block model promotion.
"""
from __future__ import annotations

from collections import defaultdict
from math import isfinite
import numpy as np

MODES = ('blur_noise', 'clean_area', 'h264_crf34', 'jpeg55')


def validate_historical_rows(rows: list[dict], expected_videos: int | None = None):
    if not isinstance(rows, list) or not rows:
        raise ValueError('Nonempty private records required')
    samples = set()
    video_to_group = {}
    for row in rows:
        if not isinstance(row, dict):
            raise TypeError('Record must be a dictionary')
        vid, group = row.get('opaque_id'), row.get('group')
        moment, mode, gain = row.get('moment'), row.get('mode'), row.get('gain_db')
        if not isinstance(vid, str) or not vid or not isinstance(group, str) or not group:
            raise ValueError('Opaque video and group IDs must be present')
        if type(moment) is not int or moment not in (0, 1) or mode not in MODES:
            raise ValueError('Only fixed historical moments and degradation modes allowed')
        if isinstance(gain, bool) or not isinstance(gain, (int, float, np.floating)) or not isfinite(gain):
            raise ValueError('Finite PSNR gain required')
        key = (vid, moment, mode)
        if key in samples:
            raise ValueError('Duplicate video/moment/mode entry')
        samples.add(key)
        if vid in video_to_group and video_to_group[vid] != group:
            raise ValueError('Same clip assigned to different scene groups')
        video_to_group[vid] = group
    n = len(video_to_group)
    if expected_videos is not None and n != expected_videos:
        raise ValueError('Incorrect number of historical source clips')
    if len(rows) != n * 2 * len(MODES):
        raise ValueError('Incomplete train/validation cross product')
    for video in video_to_group:
        if any((video, moment, mode) not in samples for moment in (0, 1) for mode in MODES):
            raise ValueError('Missing conditions for a historical clip')
    return n, len(set(video_to_group.values()))


def grouped_tail_summary(rows: list[dict], moment: int, *, threshold_db: float = -0.5,
                         seed: int = 20261114, resamples: int = 5000) -> dict:
    """Cluster bootstrap by scene group; never bootstrap correlated frames singly."""
    if type(moment) is not int or moment not in (0, 1):
        raise ValueError('Invalid moment')
    if threshold_db != -0.5:
        raise ValueError('A post-hoc change of severe-loss threshold is forbidden')
    if type(resamples) is not int or not 200 <= resamples <= 20000:
        raise ValueError('Invalid bootstrap count')
    if type(seed) is not int:
        raise ValueError('Integer deterministic seed required')
    selected = [r for r in rows if r['moment'] == moment]
    groups = defaultdict(list)
    by_mode = {x: 0 for x in MODES}
    for row in selected:
        severe = bool(row['gain_db'] < threshold_db)
        groups[row['group']].append(severe)
        by_mode[row['mode']] += int(severe)
    ordered = [groups[k] for k in sorted(groups)]
    count_per = np.array([len(x) for x in ordered], dtype=np.int64)
    fail_per = np.array([sum(x) for x in ordered], dtype=np.int64)
    point = int(fail_per.sum()) / int(count_per.sum())
    rng = np.random.default_rng(seed + moment)
    choices = rng.integers(0, len(ordered), size=(resamples, len(ordered)))
    numerator = fail_per[choices].sum(axis=1)
    denominator = count_per[choices].sum(axis=1)
    rates = numerator / denominator
    bounds = np.quantile(rates, [0.025, 0.975])
    return {
        'moment': 'selector_training' if moment == 0 else 'group_exclusive_validation',
        'samples': len(selected),
        'scene_groups': len(ordered),
        'severe_regressions': int(fail_per.sum()),
        'groups_with_severe_regression': int(np.count_nonzero(fail_per)),
        'severe_rate': round(point, 7),
        'cluster_bootstrap_95pct_rate': [round(float(v), 7) for v in bounds],
        'bootstrap_probability_of_zero_sampled_events': round(float(np.mean(numerator == 0)), 5),
        'severe_by_degradation': by_mode,
        'fixed_severity_threshold_db': threshold_db,
        'data_are_historical_and_seen_by_RNE04': True,
    }


def audit_rne08_tail_risk(rows: list[dict], *, expected_videos: int | None = None,
                          required_failure_groups: int = 10,
                          required_failure_cases: int = 25) -> dict:
    """Fail-closed report, never a license to deploy or tune on newer videos."""
    if required_failure_groups < 5 or required_failure_cases < 10:
        raise ValueError('Do not weaken pre-specified diversity requirements')
    n, groups = validate_historical_rows(rows, expected_videos)
    train = grouped_tail_summary(rows, 0)
    check = grouped_tail_summary(rows, 1)
    blockers = []
    if any(x['groups_with_severe_regression'] < required_failure_groups for x in (train, check)):
        blockers.append('insufficient_distinct_scene_failure_groups')
    if any(x['severe_regressions'] < required_failure_cases for x in (train, check)):
        blockers.append('insufficient_severe_failure_examples')
    blockers.extend(['underlying_RNE04_pretrained_on_all_historical_scenes',
                     'no_independent_natural_video_holdout_for_selector',
                     'no_real_iPhone_Safari_validation'])
    return {
        'protocol': 'RNE08 historical severe-tail group bootstrap, not a safety certification',
        'unique_historical_videos': n,
        'historical_scene_groups': groups,
        'training': train,
        'validation': check,
        'risk_detector_trainable_with_current_evidence': False if blockers else None,
        'promotion_status': 'blocked',
        'blockers': blockers,
        'trained_on_new_41_uploads': False,
        'publication_of_private_media': False,
        'automatic_product_deployment': False,
    }