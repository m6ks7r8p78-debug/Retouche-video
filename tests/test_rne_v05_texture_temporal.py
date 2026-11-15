"""RNE 0.5 privacy and high-frequency training tests: synthetic only."""
from pathlib import Path
import sys
import unittest

import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "outils" / "rne"))
from texture_temporal_v05 import laplacian_l1, assess_candidate


class TextureLossTests(unittest.TestCase):
    def test_identical_zero(self):
        x = torch.rand((2, 3, 16, 16))
        self.assertAlmostEqual(float(laplacian_l1(x, x)), 0)

    def test_high_frequency_error(self):
        x = torch.zeros((1, 3, 16, 16))
        y = x.clone()
        y[:, :, :, ::2] = .4
        self.assertGreater(float(laplacian_l1(x, y)), 0)

    def test_constant_shift_interior_zero(self):
        x = torch.zeros((1, 3, 16, 16))
        self.assertAlmostEqual(float(laplacian_l1(x, x + .2)), 0, places=5)

    def test_backward_finite(self):
        x = torch.rand((2, 3, 16, 16), requires_grad=True)
        laplacian_l1(x, torch.rand_like(x)).backward()
        self.assertTrue(bool(torch.isfinite(x.grad).all()))

    def test_wrong_shape(self):
        with self.assertRaises(ValueError):
            laplacian_l1(torch.zeros(1, 3, 16, 16), torch.zeros(1, 3, 12, 12))

    def test_rgb_required(self):
        with self.assertRaises(ValueError):
            laplacian_l1(torch.zeros(1, 1, 16, 16), torch.zeros(1, 1, 16, 16))


class EvidenceSafetyTests(unittest.TestCase):
    def setUp(self):
        self.r = {
            "catalogue": {"catalogue": 157, "unique_sha256": 154},
            "used_new_41_uploads": False,
            "comparison": {
                "candidate_psnr_minus_control_db_in_sample": .00162,
                "candidate_temporal_residual_minus_control_in_sample": .000044,
            },
        }

    def test_blocks_observed_candidate(self):
        q = assess_candidate(self.r)
        self.assertFalse(q["research_candidate_preferred"])
        self.assertIn("temporal_coherence_regresses", q["blockers"])

    def test_never_auto_deploy_even_good_numbers(self):
        r = {**self.r, "comparison": {
            "candidate_psnr_minus_control_db_in_sample": .3,
            "candidate_temporal_residual_minus_control_in_sample": -.05,
        }}
        q = assess_candidate(r)
        self.assertFalse(q["automatic_deployment"])
        self.assertIn("no_unseen_video_validation", q["blockers"])

    def test_no_41_training(self):
        with self.assertRaises(PermissionError):
            assess_candidate({**self.r, "used_new_41_uploads": True})

    def test_no_partial_catalogue(self):
        with self.assertRaises(ValueError):
            assess_candidate({**self.r, "catalogue": {
                "catalogue": 30, "unique_sha256": 30,
            }})

    def test_reject_nan(self):
        with self.assertRaises(ValueError):
            assess_candidate({**self.r, "comparison": {
                "candidate_psnr_minus_control_db_in_sample": float("nan"),
                "candidate_temporal_residual_minus_control_in_sample": .0,
            }})

    def test_bad_threshold(self):
        with self.assertRaises(ValueError):
            assess_candidate(self.r, minimum_psnr_gain_db=-.1)

    def test_no_publishing(self):
        self.assertFalse(assess_candidate(self.r)["original_media_published"])

    def test_boolean_metrics_rejected(self):
        with self.assertRaises(ValueError):
            assess_candidate({**self.r, "comparison": {
                "candidate_psnr_minus_control_db_in_sample": True,
                "candidate_temporal_residual_minus_control_in_sample": .0,
            }})


if __name__ == "__main__":
    unittest.main()
