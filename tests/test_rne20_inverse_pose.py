"""26 unit/protocol tests. All generated data: no real human, video or personal media."""
from __future__ import annotations
import math,sys,unittest, tempfile
from pathlib import Path
import numpy as np
import cv2
try:
    from outils.rne.rne20.inverse_pose import ArticulatedInverse, InverseResult, circular_error,_score_batch,_observation
except ModuleNotFoundError:
    from inverse_pose import ArticulatedInverse, InverseResult, circular_error,_score_batch,_observation
try:
    from outils.rne.rne19.articulated_observable import render_scene
except ModuleNotFoundError:
    from articulated_observable import render_scene

class TestImageOnlyInverse(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bank=ArticulatedInverse(nphase=8,nyaw=8,compare_size=48,
            bank_cache=Path(tempfile.gettempdir())/'RNE20_UNITTEST_SYNTHETIC_TEMPLATE.npz')
        cls.f=render_scene(.92,2.12,frame_id=0,size=128,hold=True,texture_seed=191)

    def fit(self,image=None,**kwargs):
        return self.bank.fit(self.f.bgr if image is None else image, manual_research_opt_in=True,**kwargs)

    def test_no_optin_rejected(self):
        with self.assertRaises(PermissionError):self.bank.fit(self.f.bgr)
    def test_false_optin_rejected(self):
        with self.assertRaises(PermissionError):self.bank.fit(self.f.bgr,manual_research_opt_in=False)
    def test_nonboolean_optin_rejected(self):
        with self.assertRaises(PermissionError):self.bank.fit(self.f.bgr,manual_research_opt_in=1)
    def test_no_ground_truth_object_input(self):
        with self.assertRaises(ValueError):self.fit(self.f)
    def test_float_frame_rejected(self):
        with self.assertRaises(ValueError):self.fit(self.f.bgr.astype('float32'))
    def test_rgb_2d_rejected(self):
        with self.assertRaises(ValueError):self.fit(self.f.bgr[:,:,0])
    def test_wrong_channels_rejected(self):
        with self.assertRaises(ValueError):self.fit(self.f.bgr[:,:,:2])
    def test_small_frame_rejected(self):
        with self.assertRaises(ValueError):self.fit(self.f.bgr[:80,:80])
    def test_rectangular_frame_rejected(self):
        with self.assertRaises(ValueError):self.fit(self.f.bgr[:100,:120])
    def test_giant_frame_rejected(self):
        with self.assertRaises(ValueError):self.fit(np.zeros((513,513,3),np.uint8))
    def test_invalid_metric_rejected(self):
        with self.assertRaises(ValueError):self.fit(method='secret_metric',refine=False)
    def test_refined_pose_numeric(self):
        r=self.fit()
        self.assertTrue(0<=r.yaw_rad<2*math.pi)
        self.assertTrue(0<=r.articulation_phase_rad<2*math.pi)
        self.assertTrue(math.isfinite(r.score))
    def test_coarse_fit_works(self):
        r=self.fit(refine=False)
        self.assertTrue(r.fit_valid)
    def test_silhouette_fit_works(self):
        r=self.fit(method='silhouette',refine=False)
        self.assertIsInstance(r,InverseResult)
    def test_pure_background_not_false_3d_certification(self):
        im=np.zeros((128,128,3),np.uint8)
        r=self.fit(im,refine=False)
        self.assertFalse(r.real_person_reconstructed)
    def test_result_not_real_person_claim(self):
        self.assertFalse(self.fit(refine=False).real_person_reconstructed)
    def test_result_not_observed_occlusion(self):
        self.assertFalse(self.fit(refine=False).occluded_geometry_observed)
    def test_no_export_or_deploy(self):
        self.assertFalse(self.fit(refine=False).publish_or_deploy)
    def test_caller_provenance_unknown(self):
        self.assertFalse(self.fit(refine=False).input_provenance_verified)
    def test_frame_not_mutated(self):
        x=self.f.bgr.copy();self.fit(refine=False)
        self.assertTrue(np.array_equal(x,self.f.bgr))
    def test_occluder_mask_derived_from_image(self):
        im=render_scene(.72,.9,frame_id=1,size=128,occluder=True).bgr
        _,mask=_observation(im,48)
        self.assertGreater(np.count_nonzero(~mask),2)
    def test_cached_template_has_both_states(self):
        self.assertEqual(len(self.bank.grid),128)
        self.assertEqual(sum(h for p,y,h in self.bank.grid),64)
    def test_angular_wrap(self):
        self.assertAlmostEqual(circular_error(0,2*math.pi),0,places=9)
    def test_angular_half_cycle(self):
        self.assertAlmostEqual(circular_error(0,math.pi),math.pi,places=9)
    def test_silhouette_metric_best_on_identical(self):
        q=np.full((48,48,3),180,np.uint8)
        imgs=np.stack([q.copy(),np.zeros_like(q)])
        scores=_score_batch(q,imgs,np.ones((48,48),bool),'silhouette')
        self.assertLess(scores[0],scores[1])
    def test_synthetic_held_state_is_only_hypothesis(self):
        self.assertIn(self.fit(refine=False).contact_hypothesis,('holding','released','unknown'))

if __name__=='__main__':unittest.main()