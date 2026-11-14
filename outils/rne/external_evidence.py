"""RNE — strict interpretation of external-photo evidence (independent of NVIDIA).

This module takes aggregate numeric results, no video files, images, ROI
coordinates, personal identifiers or neural weights. It cannot enable exports.
"""
from __future__ import annotations

from math import isfinite

EXPECTED = frozenset({
    'sources', 'reconstructions', 'model_wins', 'model_losses',
    'model_regressions_below_minus_half_db', 'mean_psnr_gain_db',
    'worst_psnr_gain_db', 'roi_face_frame_proposals',
    'mean_bicubic_temporal_mae_255', 'mean_rne_temporal_mae_255'
})
COUNTS = ('sources','reconstructions','model_wins','model_losses',
          'model_regressions_below_minus_half_db','roi_face_frame_proposals')
VALUES = ('mean_psnr_gain_db','worst_psnr_gain_db',
          'mean_bicubic_temporal_mae_255','mean_rne_temporal_mae_255')

def interpret_external_photos(metrics: dict) -> dict:
    """Make protocol limits explicit; no metric alone certifies natural video."""
    if type(metrics) is not dict or set(metrics) != EXPECTED:
        raise ValueError('Require exact anonymized aggregate keys')
    for k in COUNTS:
        if type(metrics[k]) is not int or metrics[k] < 0:
            raise ValueError(f'Invalid count {k}')
    for k in VALUES:
        if type(metrics[k]) not in (int,float) or not isfinite(metrics[k]):
            raise ValueError(f'Invalid finite metric {k}')
    if metrics['sources'] < 1 or metrics['reconstructions'] < metrics['sources']:
        raise ValueError('No photographic sources')
    if metrics['model_wins']+metrics['model_losses'] > metrics['reconstructions']:
        raise ValueError('Wins/losses exceed samples')
    if metrics['model_regressions_below_minus_half_db'] > metrics['model_losses']:
        raise ValueError('Regression count exceeds losses')
    if metrics['roi_face_frame_proposals'] > metrics['reconstructions']:
        raise ValueError('Face proposal count exceeds sample count')
    if min(metrics['mean_bicubic_temporal_mae_255'],
           metrics['mean_rne_temporal_mae_255']) < 0:
        raise ValueError('Temporal errors must be nonnegative')
    problems = [
        'photographs_not_naturally_filmed_video',
        'simulated_motion_is_not_camera_motion_ground_truth',
        'face_region_proposal_is_not_identity_verification',
        'iphone_safari_quality_speed_memory_not_measured'
    ]
    if metrics['mean_rne_temporal_mae_255'] > metrics['mean_bicubic_temporal_mae_255']:
        problems.append('temporal_error_higher_than_bicubic')
    if metrics['model_losses']:
        problems.append('some_spatial_regressions')
    if metrics['mean_psnr_gain_db'] <= 0:
        problems.append('mean_psnr_not_improved')
    return {
        'status':'research_only',
        'limitations':tuple(problems),
        'external_photo_measurement':True,
        'independent_real_video_proof':False,
        'verified_face_identity_or_geometry':False,
        'iphone_safari_validated':False,
        'nvidia_dlss5_integrated':False,
        'weights_promotion_allowed':False,
        'automatic_export_allowed':False,
        'automatic_deployment_allowed':False
    }
