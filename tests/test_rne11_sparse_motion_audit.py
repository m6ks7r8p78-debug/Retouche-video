"""Synthetic-only tests for independent sparse-vs-dense motion sanity checks."""
from __future__ import annotations
import sys, unittest
from pathlib import Path
import numpy as np
import cv2
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'outils'/'rne'/'rne11'))
from sparse_motion_audit import audit_sparse_motion, audit_to_anonymous_dict


def textured(seed=13, shape=(192, 192)):
    rng = np.random.default_rng(seed)
    g = rng.integers(20, 236, shape, dtype=np.uint8)
    g = cv2.GaussianBlur(g, (3, 3), .5)
    return cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)


def shifted(a, dx=2, dy=1):
    h, w = a.shape[:2]
    matrix = np.float32([[1, 0, dx], [0, 1, dy]])
    return cv2.warpAffine(a, matrix, (w, h), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_REFLECT101)


class TestSparseMotion(unittest.TestCase):
    def setUp(self):
        self.prev = textured()
        self.curr = shifted(self.prev, 2, 1)

    def test_disabled_default(self):
        out = audit_sparse_motion(self.curr, self.prev)
        self.assertEqual(out.verdict, 'disabled')
        self.assertTrue(out.abstain_from_neural)

    def test_static_textured(self):
        a = audit_sparse_motion(self.prev, self.prev, manual_research_opt_in=True)
        self.assertEqual(a.verdict, 'provisional_agreement')

    def test_shifted_textured(self):
        a = audit_sparse_motion(self.curr, self.prev, manual_research_opt_in=True)
        self.assertEqual(a.verdict, 'provisional_agreement')
        self.assertGreater(a.valid_corners, 12)

    def test_wrong_flow_detected(self):
        dense = np.full((*self.curr.shape[:2], 2), 20, np.float32)
        a = audit_sparse_motion(self.curr, self.prev,
                                dense_current_to_previous=dense,
                                manual_research_opt_in=True)
        self.assertEqual(a.verdict, 'disagreement')
        self.assertTrue(a.abstain_from_neural)

    def test_zero_wrong_flow_on_shift(self):
        dense = np.zeros((*self.curr.shape[:2], 2), np.float32)
        a = audit_sparse_motion(self.curr, self.prev,
                                dense_current_to_previous=dense,
                                manual_research_opt_in=True)
        self.assertEqual(a.verdict, 'disagreement')

    def test_one_pixel_wrong_dense_disagrees(self):
        g1 = cv2.cvtColor(self.curr, cv2.COLOR_BGR2GRAY)
        g2 = cv2.cvtColor(self.prev, cv2.COLOR_BGR2GRAY)
        dense = cv2.calcOpticalFlowFarneback(g1, g2, None, .5, 3, 15, 3, 5, 1.2, 0)
        dense[..., 0] += 1.
        a = audit_sparse_motion(self.curr, self.prev,
                                dense_current_to_previous=dense,
                                manual_research_opt_in=True)
        self.assertEqual(a.verdict, 'disagreement')

    def test_known_motion_flow_agrees(self):
        dense = np.zeros((*self.curr.shape[:2], 2), np.float32)
        dense[..., 0] = -2
        dense[..., 1] = -1
        a = audit_sparse_motion(self.curr, self.prev,
                                dense_current_to_previous=dense,
                                manual_research_opt_in=True)
        self.assertEqual(a.verdict, 'provisional_agreement')

    def test_flat_abstains(self):
        f = np.full((192, 192, 3), 120, np.uint8)
        a = audit_sparse_motion(f, f, manual_research_opt_in=True)
        self.assertEqual(a.verdict, 'insufficient_evidence')

    def test_one_corner_only_abstains(self):
        f = np.zeros((192, 192, 3), np.uint8)
        f[10:17, 10:17] = 255
        a = audit_sparse_motion(f, f, manual_research_opt_in=True)
        self.assertTrue(a.abstain_from_neural)

    def test_mismatched_shape(self):
        with self.assertRaises(ValueError):
            audit_sparse_motion(self.curr, self.prev[:80], manual_research_opt_in=True)

    def test_float_frames_rejected(self):
        with self.assertRaises(ValueError):
            audit_sparse_motion(self.curr.astype(np.float32), self.prev, manual_research_opt_in=True)

    def test_different_channels(self):
        with self.assertRaises(ValueError):
            audit_sparse_motion(self.curr[:, :, 0], self.prev, manual_research_opt_in=True)

    def test_missing_frames(self):
        with self.assertRaises(TypeError):
            audit_sparse_motion(None, self.prev, manual_research_opt_in=True)

    def test_wrong_flow_shape(self):
        with self.assertRaises(ValueError):
            audit_sparse_motion(self.curr, self.prev,
                                dense_current_to_previous=np.zeros((12, 13, 2), np.float32),
                                manual_research_opt_in=True)

    def test_wrong_flow_dtype(self):
        with self.assertRaises(ValueError):
            audit_sparse_motion(self.curr, self.prev,
                                dense_current_to_previous=np.zeros((192, 192, 2), np.float64),
                                manual_research_opt_in=True)

    def test_nan_flow(self):
        flow = np.zeros((192, 192, 2), np.float32)
        flow[0, 0, 0] = np.nan
        with self.assertRaises(ValueError):
            audit_sparse_motion(self.curr, self.prev,
                                dense_current_to_previous=flow,
                                manual_research_opt_in=True)

    def test_bool_optin_type(self):
        with self.assertRaises(TypeError):
            audit_sparse_motion(self.curr, self.prev, manual_research_opt_in=1)

    def test_originals_unchanged(self):
        b = self.prev.copy()
        c = self.curr.copy()
        audit_sparse_motion(self.curr, self.prev, manual_research_opt_in=True)
        self.assertTrue(np.array_equal(self.prev, b))
        self.assertTrue(np.array_equal(self.curr, c))

    def test_no_publishing_or_deploy(self):
        a = audit_sparse_motion(self.curr, self.prev, manual_research_opt_in=True)
        self.assertFalse(a.deployment_allowed)
        self.assertFalse(a.personal_media_exported)
        self.assertFalse(a.geometry_certified)

    def test_anonymous_dict(self):
        a = audit_sparse_motion(self.curr, self.prev, manual_research_opt_in=True)
        d = audit_to_anonymous_dict(a)
        self.assertIn('median_lk_cycle_error_px', d)
        self.assertNotIn('filename', d)

    def test_no_strong_claim_even_agree(self):
        a = audit_sparse_motion(self.prev, self.prev, manual_research_opt_in=True)
        self.assertFalse(a.geometry_certified)

    def test_short_dimensions(self):
        with self.assertRaises(ValueError):
            audit_sparse_motion(self.curr[:40], self.prev[:40], manual_research_opt_in=True)

    def test_large_flow_values_are_disagreement(self):
        flow = np.full((192, 192, 2), 10000, np.float32)
        a = audit_sparse_motion(self.curr, self.prev,
                                dense_current_to_previous=flow,
                                manual_research_opt_in=True)
        self.assertTrue(a.abstain_from_neural)


if __name__ == '__main__':
    unittest.main()
