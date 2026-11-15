"""RNE22 synthetic-only tests; no user video, checkpoint or network."""
import unittest
import sys
from pathlib import Path
import cv2,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"outils"/"rne"/"rne22") if (Path(__file__).resolve().parents[1]/"outils"/"rne"/"rne22").exists() else str(Path(__file__).resolve().parent))
from markerless_perspective import (render_toy,project,toy_points,_read_image,_curve_samples,
  fit_markerless,fit_single_markerless,fit_with_optical_center,uncertainty_camera_family,SIZE)
from evaluate_locked import make_case,scored

class RNE22Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
    cls.frames=[render_toy(.78,.63,yaw=y,phase=p,focal=175.,distance=4.15)
                for y,p in [(0.0,.7),(.2,1.1),(-.25,1.35)]]
    cls.fit=fit_markerless(cls.frames,manual_research_opt_in=True,starts=1,max_nfev=55)
 def test_render_shape(self):self.assertEqual(self.frames[0].shape,(128,128))
 def test_render_grayscale(self):self.assertEqual(self.frames[0].ndim,2)
 def test_render_uint8(self):self.assertEqual(self.frames[0].dtype,np.uint8)
 def test_render_foreground_present(self):self.assertGreater(int((self.frames[0]>100).sum()),150)
 def test_render_has_no_color_fiducials(self):self.assertEqual(self.frames[0].ndim,2)
 def test_known_geometry_points(self):self.assertEqual(toy_points(.7,.8,.5).shape,(9,3))
 def test_projection(self):self.assertEqual(project(toy_points(.7,.8,.5),.2,190,4).shape,(9,2))
 def test_positive_projection_depth(self):
    with self.assertRaises(ValueError):project(toy_points(.7,.8,.5),.2,190,-.1)
 def test_curve_samples(self):self.assertGreater(len(_curve_samples(project(toy_points(.7,.8,.5),.2,190,4))),40)
 def test_evidence(self):self.assertEqual(_read_image(self.frames[0])[0].shape,(128,128))
 def test_blank_evidence_refused(self):
    with self.assertRaises(ValueError):_read_image(np.zeros((128,128),np.uint8))
 def test_wrong_shape_refused(self):
    with self.assertRaises(ValueError):_read_image(np.zeros((127,128),np.uint8))
 def test_wrong_dtype_refused(self):
    with self.assertRaises(ValueError):_read_image(np.zeros((128,128),np.float32))
 def test_wrong_channels_refused(self):
    with self.assertRaises(ValueError):_read_image(np.zeros((128,128,3),np.uint8))
 def test_no_optin(self):
    with self.assertRaises(PermissionError):fit_markerless(self.frames)
 def test_optin_type(self):
    with self.assertRaises(PermissionError):fit_markerless(self.frames,manual_research_opt_in=1)
 def test_min_two_distinct_frames_required(self):
    with self.assertRaises(ValueError):fit_markerless(self.frames[:1],manual_research_opt_in=True)
 def test_abnormally_many_frames(self):
    with self.assertRaises(ValueError):fit_markerless(self.frames*3,manual_research_opt_in=True)
 def test_bad_budget(self):
    with self.assertRaises(ValueError):fit_markerless(self.frames,manual_research_opt_in=True,max_nfev=1)
 def test_bad_starts(self):
    with self.assertRaises(ValueError):fit_markerless(self.frames,manual_research_opt_in=True,starts=8)
 def test_multi_length_plausible(self):self.assertLess(abs(self.fit.upper_torso_units-.78),.15)
 def test_multi_forearm_plausible(self):self.assertLess(abs(self.fit.forearm_torso_units-.63),.15)
 def test_multi_magnification(self):self.assertLess(abs(self.fit.magnification_f_over_d-175/4.15),2.)
 def test_multi_phase(self):self.assertLess(abs(self.fit.phase_rad[0]-.7),.20)
 def test_multi_camera_yaw(self):self.assertLess(abs(self.fit.yaw_rad[0]),.2)
 def test_no_focal_claim(self):self.assertIsNone(self.fit.focal_length_px)
 def test_no_metric_claim(self):self.assertFalse(self.fit.metric_body_scale_known)
 def test_no_human_claim(self):self.assertFalse(self.fit.real_person_reconstructed)
 def test_no_deployment(self):self.assertFalse(self.fit.production_ready)
 def test_no_media_export(self):self.assertFalse(self.fit.media_export_allowed)
 def test_single_from_one_frame(self):
    r=fit_single_markerless(self.frames[0],manual_research_opt_in=True,starts=1,max_nfev=55)
    self.assertEqual(r.frames,1)
 def test_uncertainty_family(self):
    a=uncertainty_camera_family(42.)
    self.assertEqual(len(a),3)
    self.assertTrue(all(abs(f/d-42)<.001 for f,d in a))
 def test_invalid_uncertainty(self):
    with self.assertRaises(ValueError):uncertainty_camera_family(-1)
 def test_ground_truth_not_input(self):
    ims,truth=make_case(399,'clean')
    self.assertEqual(len(ims),3)
    self.assertTrue('upper' in truth)
    self.assertTrue(all(isinstance(im,np.ndarray) for im in ims))
 def test_private_pixels_not_mutated(self):
    frames=[x.copy() for x in self.frames];fit_markerless(frames,manual_research_opt_in=True,starts=1,max_nfev=50)
    self.assertTrue(all(np.array_equal(x,y) for x,y in zip(frames,self.frames)))
 def test_missing_partial_mask_is_not_certified(self):
    ims,_=make_case(122,'partial_missing')
    r=fit_markerless(ims,manual_research_opt_in=True,starts=1,max_nfev=50)
    self.assertFalse(r.pose_certified)
 def test_centered_fit_recovers_offset(self):
    frames=[cv2.warpAffine(f,np.float32([[1,0,8],[0,1,-5]]),(128,128)) for f in self.frames]
    r=fit_with_optical_center(frames,manual_research_opt_in=True,max_nfev=65,starts=2)
    self.assertLess(abs(r.principal_point_offset_xy_px[0]-8),1.5)
    self.assertLess(abs(r.principal_point_offset_xy_px[1]+5),1.5)
 def test_centered_camera_not_certified(self):
    r=fit_with_optical_center(self.frames,manual_research_opt_in=True,max_nfev=50,starts=1)
    self.assertFalse(r.camera_intrinsics_unique)
    self.assertFalse(r.metric_depth_known)
 def test_centered_is_research_only(self):
    r=fit_with_optical_center(self.frames,manual_research_opt_in=True,max_nfev=50,starts=1)
    self.assertFalse(r.production_ready)
 def test_centered_without_optin_refuses(self):
    with self.assertRaises(PermissionError):fit_with_optical_center(self.frames)
 def test_centered_copies_refused(self):
    r=fit_with_optical_center([self.frames[0]]*3,manual_research_opt_in=True)
    self.assertEqual(r.status,'insufficient_independent_views')
 def test_centered_no_colors_required(self):
    r=fit_with_optical_center(self.frames,manual_research_opt_in=True,starts=1,max_nfev=50)
    self.assertGreater(r.magnification_f_over_d,30)
 def test_no_repeat_as_independent_evidence_claim(self):
    r=fit_markerless([self.frames[0]]*3,manual_research_opt_in=True,starts=1,max_nfev=50)
    self.assertFalse(r.unique_camera_calibration_proven)
    self.assertEqual(r.status,'insufficient_independent_views')

if __name__=='__main__':unittest.main()