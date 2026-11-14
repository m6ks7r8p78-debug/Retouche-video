"""RNE 0.5: optional texture Laplacian loss and conservative research gate.

Neither function imports private media or weights. The paired 157-video training
runner and all checkpoints stay in the owner's private archive.
No NVIDIA DLSS 5, no automatic model promotion or deployment.
"""
from __future__ import annotations

from math import isfinite

import torch
from torch.nn import functional as F


def laplacian_l1(a: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
    """Weighted high-frequency mismatch of two RGB BCHW tensors.

    Edges derived from the target are detached; 2-pixel border excluded to
    avoid rewarding convolution padding artifacts. Does not measure identity.
    """
    if (a.ndim != 4 or b.shape != a.shape or a.shape[1] != 3
            or a.shape[-1] < 4 or a.shape[-2] < 4):
        raise ValueError("Equal RGB BCHW tensors with nontrivial resolution required")
    kernel = a.new_tensor([[0., -1., 0.], [-1., 4., -1.], [0., -1., 0.]])
    kernel = kernel.view(1, 1, 3, 3).expand(3, 1, 3, 3)
    ax = F.conv2d(a, kernel, groups=3, padding=1)
    bx = F.conv2d(b, kernel, groups=3, padding=1)
    local = bx[:, :, 2:-2, 2:-2].abs().mean(dim=1, keepdim=True)
    texture = (1. + 2. * local.clamp(0., .25)).detach()
    return (torch.abs(ax[:, :, 2:-2, 2:-2] - bx[:, :, 2:-2, 2:-2])
            * texture).mean()


def assess_candidate(report: dict, minimum_psnr_gain_db: float = .05) -> dict:
    """Review in-sample A/B findings. Always block any product deployment."""
    if not isinstance(report, dict):
        raise TypeError("Expected aggregate research report")
    corpus = report.get("catalogue", {})
    if not isinstance(corpus, dict) or (corpus.get("catalogue") != 157
                                       or corpus.get("unique_sha256") != 154):
        raise ValueError("Research report cannot cover only part of original corpus")
    if report.get("used_new_41_uploads") is not False:
        raise PermissionError("Reserved 41 test files must remain training-free")
    c = report.get("comparison", {})
    gain = c.get("candidate_psnr_minus_control_db_in_sample")
    temporal = c.get("candidate_temporal_residual_minus_control_in_sample")
    if any(not isinstance(v, (float, int)) or isinstance(v, bool) or not isfinite(v)
           for v in (gain, temporal)):
        raise ValueError("Missing or invalid numerical results")
    if not 0 < minimum_psnr_gain_db <= 1:
        raise ValueError("Invalid predeclared effect threshold")
    blockers = ["no_unseen_video_validation"]
    if gain < minimum_psnr_gain_db:
        blockers.append("gain_too_small")
    if temporal > 0:
        blockers.append("temporal_coherence_regresses")
    return {
        "decision": "keep_reference_do_not_promote",
        "research_candidate_preferred": gain >= minimum_psnr_gain_db and temporal <= 0,
        "automatic_deployment": False,
        "original_media_published": False,
        "holdout_training_permitted": False,
        "blockers": blockers,
        "min_mean_psnr_effect_db_for_research_preference": minimum_psnr_gain_db,
        "paired_in_sample_only": True,
    }
