"""Synthetic-only statistics and safe decision rules for independent holdouts."""
import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'))
from holdout_reporting import grouped_bootstrap,independent_video_gate

class HoldoutTests(unittest.TestCase):
 def setUp(self):
  self.s=[{'video_id':'a','gain_psnr':.5},{'video_id':'a','gain_psnr':.1},{'video_id':'b','gain_psnr':.3}]
  self.t=[{'video_id':'a','delta_temporal_mae':-.03},{'video_id':'b','delta_temporal_mae':.01}]
  self.kw={'uploaded_count':41,'exact_duplicates':3,'scene_overlap_exclusions':9,
           'provisional_candidates':29,'scene_independence_verified':False,
           'real_reference_paired':False,'real_iphone_validated':False,
           'regressions':3,'spatial_ci':grouped_bootstrap(self.s,'gain_psnr',resamples=200),
           'temporal_ci':grouped_bootstrap(self.t,'delta_temporal_mae',resamples=200)}
 def test_grouped_not_frame_weighted(self):
  x=grouped_bootstrap(self.s,'gain_psnr',resamples=200)
  self.assertEqual(x['videos'],2);self.assertAlmostEqual(x['mean_across_video_means'],.3)
 def test_bootstrap_reproducible(self):
  x=grouped_bootstrap(self.s,'gain_psnr',resamples=200)
  self.assertEqual(x,grouped_bootstrap(self.s,'gain_psnr',resamples=200))
 def test_motion_independent_groups(self):
  x=grouped_bootstrap(self.t,'delta_temporal_mae',resamples=200)
  self.assertEqual(x['samples'],2)
 def test_reject_nan(self):
  with self.assertRaises(ValueError):grouped_bootstrap([{'video_id':'a','gain_psnr':float('nan')}],'gain_psnr')
 def test_reject_no_id(self):
  with self.assertRaises(ValueError):grouped_bootstrap([{'gain_psnr':.5}],'gain_psnr')
 def test_reject_empty(self):
  with self.assertRaises(ValueError):grouped_bootstrap([],'gain_psnr')
 def test_reject_bool(self):
  with self.assertRaises(ValueError):grouped_bootstrap([{'video_id':'a','gain_psnr':True}],'gain_psnr')
 def test_default_never_activate(self):
  x=independent_video_gate(**self.kw)
  self.assertFalse(x['automatic_deployment']);self.assertEqual(x['status'],'research_only_blocked')
 def test_block_unverified_scenes(self):
  x=independent_video_gate(**self.kw)
  self.assertIn('visual_scene_independence_not_verified',x['blockers'])
 def test_block_no_real_AR_pairs(self):
  x=independent_video_gate(**self.kw)
  self.assertIn('original_before_filter_ground_truth_missing',x['blockers'])
 def test_block_persistent_regressions(self):
  x=independent_video_gate(**self.kw)
  self.assertIn('spatial_regressions_remain',x['blockers'])
 def test_video_counts_conserved(self):
  kw={**self.kw,'provisional_candidates':30}
  with self.assertRaises(ValueError):independent_video_gate(**kw)
 def test_negative_count(self):
  kw={**self.kw,'regressions':-1}
  with self.assertRaises(ValueError):independent_video_gate(**kw)
 def test_invalid_ci(self):
  kw={**self.kw,'spatial_ci':{'bootstrap_95pct_CI':[0,float('nan')]}}
  with self.assertRaises(ValueError):independent_video_gate(**kw)
 def test_none_claims_training_authorization(self):
  x=independent_video_gate(**self.kw)
  self.assertFalse(x['allows_private_training_reuse']);self.assertFalse(x['published_media'])
 def test_all_checks_even_if_impossible_remain_manual(self):
  kw={**self.kw,'regressions':0,'scene_independence_verified':True,'real_reference_paired':True,'real_iphone_validated':True,
      'spatial_ci':{'bootstrap_95pct_CI':[.4,.6]},'temporal_ci':{'bootstrap_95pct_CI':[-.1,-.01]}}
  x=independent_video_gate(**kw)
  self.assertEqual(x['status'],'human_review_required');self.assertFalse(x['automatic_deployment'])

if __name__=='__main__':unittest.main()
