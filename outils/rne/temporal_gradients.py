"""RNE — causal motion-confidence-weighted gradient stability of neural residual.

This is a research loss, not an identity/face restoration, not a de-filter, and
not a proof that a smoother output is a better video. No user media or weights.
"""
from __future__ import annotations
import torch


def gradient_consistency(residual: torch.Tensor, prior: torch.Tensor,
                         trust: torch.Tensor, *, robust_epsilon: float = .01) -> torch.Tensor:
    """Differentiable confidence-gated Charbonnier loss on detail gradients.

    Residual and aligned previous residual: [N,3,H,W], trust: [N,1,H,W].
    Gradient contributions require BOTH neighboring pixels to be trusted.
    Previous-frame target is detached. Returns zero for identical gradients.
    """
    if residual.ndim != 4 or residual.shape != prior.shape or residual.shape[1] != 3:
        raise ValueError('Matched RGB residual and prior BCHW tensors required')
    if min(residual.shape[-2:]) < 5 or trust.shape != (residual.shape[0], 1, *residual.shape[-2:]):
        raise ValueError('Trust map must be N1HW and frames at least 5x5')
    if not 0 < robust_epsilon <= .1:
        raise ValueError('Invalid loss epsilon')
    if not (torch.isfinite(residual).all() and torch.isfinite(prior).all() and
            torch.isfinite(trust).all() and ((trust >= 0) & (trust <= 1)).all()):
        raise ValueError('Nonfinite tensors or invalid confidence')
    prior = prior.detach()
    loss = residual.new_zeros(())
    weights = residual.new_zeros(())
    for dimension in (-1, -2):
        if dimension == -1:
            a = residual[:,:,:,1:] - residual[:,:,:,:-1]
            b = prior[:,:,:,1:] - prior[:,:,:,:-1]
            confident = torch.minimum(trust[:,:,:,1:], trust[:,:,:,:-1])
        else:
            a = residual[:,:,1:,:] - residual[:,:,:-1,:]
            b = prior[:,:,1:,:] - prior[:,:,:-1,:]
            confident = torch.minimum(trust[:,:,1:,:],trust[:,:,:-1,:])
        diff = a - b
        robust = (diff.square() + robust_epsilon**2).sqrt() - robust_epsilon
        loss = loss + (robust * confident).sum()
        weights = weights + confident.sum()*3
    return loss / (weights + 1e-6)


def original_temporal_loss(prediction: torch.Tensor, bicubic: torch.Tensor,
                           prior: torch.Tensor, trust: torch.Tensor) -> torch.Tensor:
    if prediction.shape != bicubic.shape or prediction.shape != prior.shape:
        raise ValueError('Mismatch in temporal RGB residuals')
    if trust.shape != (prediction.shape[0],1,*prediction.shape[-2:]):
        raise ValueError('Mismatch in confidence map')
    if not ((trust >= 0) & (trust <= 1)).all():
        raise ValueError('Invalid confidence')
    return (torch.abs((prediction-bicubic) - prior.detach())*trust).sum()/(3*trust.sum()+1e-6)
