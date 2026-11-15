"""All tests synthetic: no user footage, hashes, features, fitted weights."""
from __future__ import annotations
import unittest
import copy
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'/'rne08'))
from risk_audit import audit_rne08_tail_risk, validate_historical_rows, grouped_tail_summary, MODES


def fake(n=12):
    rows=[]
    for i in range(n):
        for moment in (0,1):
            for mode in MODES:
                severe = (i==2 and mode=='clean_area' and moment==0)
                rows.append({'opaque_id':f'anon_{i}','group':f'g_{i//2}',
                             'moment':moment,'mode':mode,'gain_db':-0.7 if severe else 0.3})
    return rows

class RiskAuditTests(unittest.TestCase):
    def setUp(self):self.r=fake()
    def test_cardinality(self):self.assertEqual(validate_historical_rows(self.r,12),(12,6))
    def test_summary(self):
        x=grouped_tail_summary(self.r,0,resamples=300)
        self.assertEqual(x['severe_regressions'],1)
        self.assertEqual(x['groups_with_severe_regression'],1)
    def test_group_bootstrap_deterministic(self):
        self.assertEqual(grouped_tail_summary(self.r,0,resamples=300),grouped_tail_summary(self.r,0,resamples=300))
    def test_zero_events_valid(self):
        x=grouped_tail_summary(self.r,1,resamples=300)
        self.assertEqual(x['severe_rate'],0.)
        self.assertEqual(x['bootstrap_probability_of_zero_sampled_events'],1.)
    def test_reject_wrong_video_count(self):
        with self.assertRaises(ValueError):audit_rne08_tail_risk(self.r,expected_videos=157)
    def test_reject_duplicate(self):
        with self.assertRaises(ValueError):validate_historical_rows(self.r+[self.r[0]])
    def test_reject_missing_mode(self):
        with self.assertRaises(ValueError):validate_historical_rows(self.r[:-1])
    def test_reject_mismatched_group(self):
        bad=copy.deepcopy(self.r);bad[1]['group']='other'
        with self.assertRaises(ValueError):validate_historical_rows(bad)
    def test_reject_nan(self):
        bad=copy.deepcopy(self.r);bad[1]['gain_db']=float('nan')
        with self.assertRaises(ValueError):validate_historical_rows(bad)
    def test_reject_bool_psnr(self):
        bad=copy.deepcopy(self.r);bad[1]['gain_db']=True
        with self.assertRaises(ValueError):validate_historical_rows(bad)
    def test_reject_wrong_moment(self):
        bad=copy.deepcopy(self.r);bad[1]['moment']=2
        with self.assertRaises(ValueError):validate_historical_rows(bad)
    def test_reject_unknown_mode(self):
        bad=copy.deepcopy(self.r);bad[1]['mode']='secret'
        with self.assertRaises(ValueError):validate_historical_rows(bad)
    def test_unchangeable_risk_threshold(self):
        with self.assertRaises(ValueError):grouped_tail_summary(self.r,0,threshold_db=-0.1)
    def test_reject_too_few_draws(self):
        with self.assertRaises(ValueError):grouped_tail_summary(self.r,0,resamples=12)
    def test_blocks_promotion(self):
        x=audit_rne08_tail_risk(self.r)
        self.assertFalse(x['automatic_product_deployment'])
        self.assertEqual(x['promotion_status'],'blocked')
    def test_blocks_weakening_requirements(self):
        with self.assertRaises(ValueError):audit_rne08_tail_risk(self.r,required_failure_groups=1)
    def test_no_private_identifiers_in_output(self):
        x=str(audit_rne08_tail_risk(self.r))
        self.assertNotIn('anon_2',x)
    def test_no_training_new_videos_claim(self):
        self.assertFalse(audit_rne08_tail_risk(self.r)['trained_on_new_41_uploads'])

if __name__=='__main__':unittest.main()