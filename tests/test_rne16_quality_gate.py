import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'outils' / 'rne' / 'rne16'))
"""Synthetic RNE16 promotion controls. Never publish media or enable deployment."""
import unittest
from quality_gate import check_results

class GateTests(unittest.TestCase):
 def setUp(self):
  self.a={'model':'RNE16-ANCRE','source_train':'procedural synthetic generators ONLY',
          'training_reuses_reserved_41':False}
  self.b={'model':'RNE16-ANCRE','source_private_media_used':False,
          'families':{'spirals':{'dual_gain_vs_bicubic_db':.3,'severe_losses_gt_0_5db':0}}}
 def test_never_auto_deploy(self):self.assertFalse(check_results(self.a,self.b).production_deployment_allowed)
 def test_no_model_promotion(self):self.assertFalse(check_results(self.a,self.b).promotion_allowed)
 def test_requires_real_reference(self):self.assertIn('no_real_before_after_video_ground_truth',check_results(self.a,self.b).blockers)
 def test_requires_iphone(self):self.assertIn('no_iphone_safari_test',check_results(self.a,self.b).blockers)
 def test_rejects_regressions(self):
  self.b['families']['spirals']['severe_losses_gt_0_5db']=2
  self.assertIn('severe_loss_on_frozen_test:spirals',check_results(self.a,self.b).blockers)
 def test_rejects_negative_families(self):
  self.b['families']['spirals']['dual_gain_vs_bicubic_db']=-.1
  self.assertIn('no_positive_mean_gain:spirals',check_results(self.a,self.b).blockers)
 def test_rejects_nan(self):
  self.b['families']['spirals']['dual_gain_vs_bicubic_db']=float('nan')
  with self.assertRaises(ValueError):check_results(self.a,self.b)
 def test_rejects_unauthorized_sources(self):
  self.a['training_reuses_reserved_41']=True
  with self.assertRaises(ValueError):check_results(self.a,self.b)
 def test_rejects_no_families(self):
  self.b['families']={}
  with self.assertRaises(ValueError):check_results(self.a,self.b)
 def test_rejects_wrong_model(self):
  self.b['model']='NOT_RNE16'
  with self.assertRaises(ValueError):check_results(self.a,self.b)

if __name__=='__main__':unittest.main()
