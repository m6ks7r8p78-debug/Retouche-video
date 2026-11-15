"""Research-only RNE07 multimode evidence gate.

An in-sample benchmark can reject models but NEVER authorize product rollout.
All metrics must be provided for clean, JPEG, blur/noise and real H264.
"""
from __future__ import annotations
from math import isfinite

MODES=('clean_area','jpeg55','blur_noise','h264_crf34')

def evaluate(summary:dict,*,new_videos_independent:bool=False,real_iphone_validated:bool=False):
    if not isinstance(summary,dict) or set(summary)!=set(MODES):
        raise ValueError('Complete four-mode aggregate evidence required')
    if type(new_videos_independent) is not bool or type(real_iphone_validated) is not bool:
        raise TypeError('Explicit evidence flags required')
    for name in MODES:
        row=summary[name]
        if not isinstance(row,dict):raise ValueError('Malformed mode report')
        for key in ('delta_psnr_robust_minus_control_db',
                    'delta_edge_robust_minus_control',
                    'delta_motion_proxy_robust_minus_control'):
            v=row.get(key)
            if isinstance(v,bool) or not isinstance(v,(int,float)) or not isfinite(v):
                raise ValueError('All numerical metrics must be finite and provided')
    blockers=[]
    for name in MODES:
        row=summary[name]
        if row['delta_psnr_robust_minus_control_db']<-.03:
            blockers.append('quality_regression_'+name)
        if row['delta_edge_robust_minus_control']>.0005:
            blockers.append('edge_regression_'+name)
        if row['delta_motion_proxy_robust_minus_control']>.0004:
            blockers.append('temporal_regression_'+name)
    for name in ('jpeg55','blur_noise','h264_crf34'):
        if summary[name]['delta_psnr_robust_minus_control_db']<.05:
            blockers.append('insufficient_gain_'+name)
    if not new_videos_independent:blockers.append('no_fresh_independent_videos')
    if not real_iphone_validated:blockers.append('no_real_iphone_safari_measurement')
    return {'status':'blocked' if blockers else 'human_review_required',
            'blockers':blockers,'automatic_deployment':False,
            'retraining_on_holdout_permitted':False,
            'before_after_filter_verified':False,
            'source_videos_or_weights_published':False}
