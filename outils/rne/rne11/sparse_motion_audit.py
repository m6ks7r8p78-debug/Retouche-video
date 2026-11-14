"""RNE 0.11 — independent sparse-vs-dense motion cross-check (research only).

Reddit r/computervision discussion on spatially distributed keypoints suggests an
independent feature-tracking sanity check. OpenCV supports Lucas-Kanade features,
Farneback dense flow and forward/backward tracking checks. No claim of recovering
occluded pixels or validating facial identity. Does not alter model weights.

Do not enable in production based on synthetic/historical-data benchmarks.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
import cv2
import numpy as np


@dataclass(frozen=True)
class SparseMotionAudit:
    verdict: str
    total_corners: int
    tracked_corners: int
    valid_corners: int
    represented_cells: int
    total_cells: int
    median_lk_cycle_error_px: float | None
    median_dense_sparse_disagreement_px: float | None
    large_disagreement_fraction: float | None
    abstain_from_neural: bool
    research_only: bool = True
    geometry_certified: bool = False
    deployment_allowed: bool = False
    personal_media_exported: bool = False


def _verify(current, previous, dense):
    if not isinstance(current, np.ndarray) or not isinstance(previous, np.ndarray):
        raise TypeError('Two numpy BGR frames required')
    if (current.dtype != np.uint8 or previous.dtype != np.uint8 or current.ndim != 3
            or current.shape[2] != 3 or previous.shape != current.shape):
        raise ValueError('Frames must match as BGR uint8 HWC')
    h, w = current.shape[:2]
    if min(h, w) < 64 or h*w > 1280*720:
        raise ValueError('Frame outside research CPU budget')
    if dense is not None:
        if not isinstance(dense, np.ndarray) or dense.shape != (h, w, 2) or dense.dtype != np.float32:
            raise ValueError('Dense current-to-previous flow must be float32 HW2')
        if not bool(np.isfinite(dense).all()):
            raise ValueError('Dense motion has nonfinite values')


def _sample_grid_corners(gray, nx=4, ny=4, per_cell=8):
    h, w = gray.shape
    arr, ids = [], []
    for gy in range(ny):
        y0 = int(round(gy*h/ny))
        y1 = int(round((gy+1)*h/ny))
        for gx in range(nx):
            x0 = int(round(gx*w/nx))
            x1 = int(round((gx+1)*w/nx))
            if x1-x0 < 11 or y1-y0 < 11:
                continue
            crop = gray[y0+4:y1-4, x0+4:x1-4]
            if crop.size == 0:
                continue
            pts = cv2.goodFeaturesToTrack(crop, maxCorners=per_cell,
                    qualityLevel=.01, minDistance=5, blockSize=3)
            if pts is None:
                continue
            for point in pts.reshape(-1, 2):
                arr.append([float(point[0]+x0+4), float(point[1]+y0+4)])
                ids.append(gy*nx+gx)
    if not arr:
        return np.empty((0, 1, 2), np.float32), np.empty((0,), np.int32)
    return np.asarray(arr, np.float32).reshape(-1, 1, 2), np.asarray(ids, np.int32)


def _lk(gray0, gray1, pts):
    return cv2.calcOpticalFlowPyrLK(gray0, gray1, pts, None,
        winSize=(15, 15), maxLevel=2,
        criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, .01),
        minEigThreshold=1e-4)


def audit_sparse_motion(current: np.ndarray, previous: np.ndarray, *,
                        dense_current_to_previous: np.ndarray | None = None,
                        manual_research_opt_in: bool = False) -> SparseMotionAudit:
    """Independent optical-flow observer, not geometric truth.

    RNE triad.alignment already computes Farneback in both directions; this
    compares its current->previous flow with sparse pyramidal Lucas-Kanade.
    Both estimators can fail together on repeated texture, blur or occlusions.

    The .75px median discrepancy threshold was selected after a perturbation
    probe of historical training videos. It is not a product-calibrated value;
    a more sensitive threshold may produce false alerts on difficult motion.
    The .9px cycle bound and 35% fraction are likewise experimental.
    """
    _verify(current, previous, dense_current_to_previous)
    if type(manual_research_opt_in) is not bool:
        raise TypeError('Explicit Boolean research opt-in required')
    if not manual_research_opt_in:
        return SparseMotionAudit('disabled', 0, 0, 0, 0, 16, None, None, None, True)
    cur = cv2.cvtColor(current, cv2.COLOR_BGR2GRAY)
    prev = cv2.cvtColor(previous, cv2.COLOR_BGR2GRAY)
    points, cells = _sample_grid_corners(cur)
    total = len(points)
    if total == 0:
        return SparseMotionAudit('insufficient_evidence', 0, 0, 0, 0, 16, None, None, None, True)
    nxt, st1, _ = _lk(cur, prev, points)
    if nxt is None or st1 is None:
        return SparseMotionAudit('insufficient_evidence', total, 0, 0, 0, 16, None, None, None, True)
    back, st2, _ = _lk(prev, cur, nxt)
    if back is None or st2 is None:
        return SparseMotionAudit('insufficient_evidence', total,
                                 int(np.count_nonzero(st1)), 0, 0, 16, None, None, None, True)
    a = points.reshape(-1, 2)
    b = nxt.reshape(-1, 2)
    c = back.reshape(-1, 2)
    h, w = cur.shape
    inbounds = (b[:, 0] >= 1) & (b[:, 0] < w-1) & (b[:, 1] >= 1) & (b[:, 1] < h-1)
    cycle = np.linalg.norm(c-a, axis=1)
    tracked = (st1.ravel() > 0) & (st2.ravel() > 0) & inbounds & np.isfinite(cycle)
    valid = tracked & (cycle <= .9)
    represented = len(set(cells[valid].tolist()))
    tracked_count = int(tracked.sum())
    valid_count = int(valid.sum())
    med_cycle = round(float(np.median(cycle[tracked])), 5) if tracked_count else None
    if valid_count < 12 or represented < 4:
        return SparseMotionAudit('insufficient_evidence', total, tracked_count, valid_count,
                                 represented, 16, med_cycle, None, None, True)
    flow = dense_current_to_previous
    if flow is None:
        flow = cv2.calcOpticalFlowFarneback(cur, prev, None, .5, 3, 15, 3, 5, 1.2, 0)
    ax = a[valid, 0].reshape(-1, 1).astype(np.float32)
    ay = a[valid, 1].reshape(-1, 1).astype(np.float32)
    sampled = cv2.remap(flow, ax, ay, cv2.INTER_LINEAR,
                       borderMode=cv2.BORDER_REFLECT101).reshape(-1, 2)
    sparse = (b-a)[valid]
    errors = np.linalg.norm(sparse-sampled, axis=1)
    median = round(float(np.median(errors)), 5)
    bad = round(float(np.mean(errors > 1.5)), 5)
    disagreement = bad > .35 or median > .75
    return SparseMotionAudit('disagreement' if disagreement else 'provisional_agreement',
                             total, tracked_count, valid_count, represented, 16,
                             med_cycle, median, bad, bool(disagreement))


def audit_to_anonymous_dict(x: SparseMotionAudit) -> dict:
    if not isinstance(x, SparseMotionAudit):
        raise TypeError('Expected audit result')
    return asdict(x)
