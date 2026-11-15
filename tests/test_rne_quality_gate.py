"""RNE guard: tests based on fully synthetic numeric metrics, no personal media."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'outils' / 'rne'))
from quality_gate import QualityEvidence, promotion_status, preview_route


def evidence(**changes):
    defaults=dict(protocol='internal_train',groups_unseen=0,gain_mean_db=.058,
                  gain_p05_db=-.12,failures_gt_half_db=3,samples=919,
                  paired_truth_verified=False,iphone_safari_checked=False,
                  temporal_artifacts_checked=False,identity_and_geometry_checked=False)
    defaults.update(changes)
    return QualityEvidence(**defaults)


class QualityGateTests(unittest.TestCase):
    def test_in_sample_not_a_release_benchmark(self):
        result=promotion_status(evidence())
        self.assertEqual(result['status'],'blocked')
        self.assertIn('score_not_from_real_paired_holdout',result['blockers'])
        self.assertFalse(result['automatic_deployment'])

    def test_even_fully_verified_candidate_requires_human_review(self):
        candidate=evidence(protocol='paired_real_holdout',groups_unseen=20,
            gain_mean_db=.45,gain_p05_db=-.1,failures_gt_half_db=0,
            paired_truth_verified=True,iphone_safari_checked=True,
            temporal_artifacts_checked=True,identity_and_geometry_checked=True)
        r=promotion_status(candidate)
        self.assertEqual(r['status'],'human_review_required')
        self.assertFalse(r['automatic_deployment'])

    def test_any_major_regression_blocks(self):
        candidate=evidence(protocol='paired_real_holdout',groups_unseen=20,
            gain_mean_db=.45,gain_p05_db=-.1,failures_gt_half_db=1,
            paired_truth_verified=True,iphone_safari_checked=True,
            temporal_artifacts_checked=True,identity_and_geometry_checked=True)
        self.assertIn('unresolved_regressions',promotion_status(candidate)['blockers'])

    def test_unverified_truth_blocks_even_when_psnr_positive(self):
        candidate=evidence(protocol='paired_real_holdout',groups_unseen=20,
            gain_mean_db=1.0,gain_p05_db=0,failures_gt_half_db=0,
            paired_truth_verified=False,iphone_safari_checked=True,
            temporal_artifacts_checked=True,identity_and_geometry_checked=True)
        self.assertIn('no_verified_real_ground_truth',promotion_status(candidate)['blockers'])

    def test_default_is_safe_recovery_not_neural(self):
        r=preview_route(manual_opt_in=False,source_protected=True,
            temporal_confidence=1,scene_cut=False,memory_budget_ok=True)
        self.assertEqual(r['route'],'bicubic_faithful')
        self.assertFalse(r['may_export_automatically'])

    def test_explicit_preview_is_never_autopublished(self):
        r=preview_route(manual_opt_in=True,source_protected=True,
            temporal_confidence=.98,scene_cut=False,memory_budget_ok=True)
        self.assertEqual(r['route'],'rne_experimental_preview')
        self.assertFalse(r['may_export_automatically'])
        self.assertTrue(r['original_preserved'])

    def test_scene_cut_low_confidence_and_memory_fallback(self):
        base=dict(manual_opt_in=True,source_protected=True,
            temporal_confidence=.99,scene_cut=False,memory_budget_ok=True)
        for change in ({'scene_cut':True}, {'temporal_confidence':.1},
                       {'memory_budget_ok':False}, {'source_protected':False}):
            self.assertEqual(preview_route(**(base|change))['route'],'bicubic_faithful')

    def test_finite_probability_required(self):
        with self.assertRaises(ValueError):
            preview_route(manual_opt_in=True,source_protected=True,
                temporal_confidence=float('nan'),scene_cut=False,memory_budget_ok=True)
        with self.assertRaises(ValueError):
            promotion_status(evidence(gain_mean_db=float('nan')))


if __name__ == '__main__':
    unittest.main()
