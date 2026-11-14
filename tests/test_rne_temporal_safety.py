"""RNE: temporal safety tests, synthetic-only. No personal videos in CI."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'))
import unittest
import numpy as np
import cv2
from temporal_safety import compare_temporal_pair,review_segment

class TemporalSafetyTests(unittest.TestCase):
    def setUp(self):
        rng=np.random.default_rng(55)
        self.a=cv2.GaussianBlur(rng.integers(0,255,(64,64,3),dtype=np.uint8),(9,9),2)
        self.b=np.roll(self.a,1,axis=1)
        self.a2=cv2.resize(self.a,(128,128),interpolation=cv2.INTER_CUBIC)
        self.b2=cv2.resize(self.b,(128,128),interpolation=cv2.INTER_CUBIC)
    def test_identical(self):
        r=compare_temporal_pair(self.a,self.a,self.a2,self.a2,self.a2,self.a2)
        self.assertTrue(r['usable']);self.assertEqual(r['bicubic_warp_mae_255'],0);self.assertEqual(r['rne_warp_mae_255'],0)
    def test_motion_measurable(self):
        r=compare_temporal_pair(self.a,self.b,self.a2,self.b2,self.a2,self.b2)
        self.assertTrue(r['usable']);self.assertAlmostEqual(r['bicubic_warp_mae_255'],r['rne_warp_mae_255'])
    def test_excess_flicker(self):
        noisy=np.clip(self.b2.astype(np.int16)+20,0,255).astype(np.uint8)
        r=compare_temporal_pair(self.a,self.b,self.a2,self.b2,self.a2,noisy)
        self.assertTrue(r['usable']);self.assertGreater(r['rne_warp_mae_255'],r['bicubic_warp_mae_255'])
    def test_cut(self):
        white=np.full_like(self.a,255)
        r=compare_temporal_pair(np.zeros_like(self.a),white,self.a2,self.b2,self.a2,self.b2)
        self.assertFalse(r['usable']);self.assertTrue(r['scene_cut'])
    def test_shapes(self):
        with self.assertRaises(ValueError):compare_temporal_pair(self.a,self.b,self.a2,self.a2[:60],self.a2,self.b2)
    def test_immutable_inputs(self):
        a=self.a.copy();b=self.b.copy();compare_temporal_pair(self.a,self.b,self.a2,self.b2,self.a2,self.b2)
        self.assertTrue(np.array_equal(self.a,a));self.assertTrue(np.array_equal(self.b,b))
    def test_default_fallback(self):
        c=[{'usable':True,'bicubic_warp_mae_255':2.,'rne_warp_mae_255':1.9}]*5
        self.assertEqual(review_segment(c)['disposition'],'fallback_bicubic_for_research')
    def test_optional_preview_only(self):
        c=[{'usable':True,'bicubic_warp_mae_255':2.,'rne_warp_mae_255':1.9}]*5
        r=review_segment(c,manual_opt_in=True);self.assertEqual(r['disposition'],'manual_laboratory_preview_only');self.assertFalse(r['deployment_allowed'])
    def test_single_bad_transition_fallback(self):
        c=[{'usable':True,'bicubic_warp_mae_255':2.,'rne_warp_mae_255':1.9}]*4+[{'usable':True,'bicubic_warp_mae_255':2.,'rne_warp_mae_255':3.}]
        self.assertEqual(review_segment(c,manual_opt_in=True)['disposition'],'fallback_bicubic_for_research')
    def test_scene_cut_fallback(self):
        c=[{'usable':True,'bicubic_warp_mae_255':2.,'rne_warp_mae_255':1.9}]*4+[{'usable':False,'scene_cut':True}]
        self.assertEqual(review_segment(c,manual_opt_in=True)['disposition'],'fallback_bicubic_for_research')
    def test_insufficient_data(self):
        self.assertEqual(review_segment([{'usable':True,'bicubic_warp_mae_255':1,'rne_warp_mae_255':1}])['disposition'],'no_preview')
    def test_nan_rejected(self):
        c=[{'usable':True,'bicubic_warp_mae_255':1.,'rne_warp_mae_255':float('nan')}]*5
        with self.assertRaises(ValueError):review_segment(c)
    def test_never_ground_truth(self):
        c=[{'usable':True,'bicubic_warp_mae_255':2.,'rne_warp_mae_255':1.1}]*5
        r=review_segment(c,manual_opt_in=True);self.assertFalse(r['truth_verified']);self.assertFalse(r['iphone_safari_checked'])

if __name__=='__main__':unittest.main()
