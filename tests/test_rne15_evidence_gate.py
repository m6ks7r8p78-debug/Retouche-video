"""RNE0.15 paired evidence gate: synthetic-only records."""
import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'/'rne15'))
from evidence_gate import evaluate_additive_guard,anonymous_summary

def rep(ga=95,gn=92,ba=6,bn=2):
    return {'scenes':10,'counts':{
      'good_rne14_accepted':ga,'good_rne14_rejected':100-ga,
      'good_rne15_veto_accepted':gn,'good_rne15_veto_rejected':100-gn,
      'bad_rne14_accepted':ba,'bad_rne14_rejected':20-ba,
      'bad_rne15_veto_accepted':bn,'bad_rne15_veto_rejected':20-bn}}

class EvidenceTests(unittest.TestCase):
 def test_good_candidate_only_manual_review(self):
    x=evaluate_additive_guard([rep()]);self.assertEqual(x.state,'eligible_for_independent_human_review')
    self.assertFalse(x.automatic_deployment_allowed)
 def test_no_new_failures_prevented_rejected(self):
    x=evaluate_additive_guard([rep(ba=0,bn=0)])
    self.assertIn('no_additional_incorrect_motion_prevented',x.reasons)
 def test_good_loss_rejected(self):
    x=evaluate_additive_guard([rep(gn=60)])
    self.assertIn('excessive_rejection_of_correct_regions',x.reasons)
 def test_exact_95_percent_retention(self):
    x=evaluate_additive_guard([rep(ga=100,gn=95)])
    self.assertEqual(x.state,'eligible_for_independent_human_review')
 def test_unpaired_good_rejected(self):
    bad=rep();bad['counts']['good_rne15_veto_rejected']+=1
    with self.assertRaises(ValueError):evaluate_additive_guard([bad])
 def test_unpaired_bad_rejected(self):
    bad=rep();bad['counts']['bad_rne14_rejected']+=1
    with self.assertRaises(ValueError):evaluate_additive_guard([bad])
 def test_veto_promotes_invalid(self):
    with self.assertRaises(ValueError):evaluate_additive_guard([rep(ga=90,gn=95)])
 def test_empty(self):
    with self.assertRaises(ValueError):evaluate_additive_guard([])
 def test_bad_tolerance(self):
    with self.assertRaises(ValueError):evaluate_additive_guard([rep()],max_correct_loss_fraction=.5)
 def test_nan_count(self):
    bad=rep();bad['counts']['bad_rne14_accepted']=float('nan')
    with self.assertRaises(ValueError):evaluate_additive_guard([bad])
 def test_negative_count(self):
    bad=rep();bad['counts']['good_rne14_accepted']=-2
    with self.assertRaises(ValueError):evaluate_additive_guard([bad])
 def test_aggregation(self):
    x=evaluate_additive_guard([rep(),rep()]);self.assertEqual(x.good_baseline_accepted,190)
 def test_nonpositive_scene_count(self):
    bad=rep();bad['scenes']=0
    with self.assertRaises(ValueError):evaluate_additive_guard([bad])
 def test_no_ground_truth_good(self):
    bad=rep(ga=0,gn=0)
    x=evaluate_additive_guard([bad]);self.assertIn('no_supported_correct_regions_in_baseline',x.reasons)
 def test_summary_anonymous(self):
    a=anonymous_summary(evaluate_additive_guard([rep()]));self.assertNotIn('filenames',a)
 def test_summary_wrong_type(self):
    with self.assertRaises(TypeError):anonymous_summary(1)
 def test_hardcoded_real_proof_false(self):
    x=evaluate_additive_guard([rep()]);self.assertFalse(x.real_video_validated)
 def test_never_promote(self):
    x=evaluate_additive_guard([rep()]);self.assertFalse(x.model_promoted)

if __name__=='__main__':unittest.main()
