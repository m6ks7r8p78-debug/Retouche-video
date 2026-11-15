"""Synthetic-only tests for RNE21 image-only multi-frame calibration. No media files."""
from __future__ import annotations
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'/'rne21') if 'tests' in Path(__file__).parts else Path(__file__).parent)
import unittest
import numpy as np
from anchorage import (PARTS, COLORS, toy_joints,camera_project,render_fiducials,
                       find_fiducials,solve_sequence,solve_single,anonymous_summary)


def sequence(upper=.82,forearm=.75,drop=False):
    result=[]
    for i in range(5):
        missing=['left_wrist','object'] if drop and i%2 else ()
        f,_=render_fiducials(upper=upper,forearm=forearm,phase=.36+.3*i,
             yaw=-.67+.33*i,scale=47+2*i,tx=3*i-6,ty=i,drop=missing)
        result.append(f)
    return result


class SyntheticGeometryTests(unittest.TestCase):
    def test_part_count(self):self.assertEqual(len(PARTS),10)
    def test_distinct_fiducial_colors(self):self.assertEqual(len(set(tuple(x) for x in COLORS.tolist())),10)
    def test_shape_bounds(self):
        with self.assertRaises(ValueError):toy_joints(-1,.6,.4)
    def test_nan_phase(self):
        with self.assertRaises(ValueError):toy_joints(.6,.6,float('nan'))
    def test_project_output(self):
        p,depth=camera_project(toy_joints(.7,.6,.5),.2,50)
        self.assertEqual(p.shape,(10,2));self.assertEqual(depth.shape,(10,))
    def test_fiducials_from_pixels(self):
        image,coords=render_fiducials(upper=.8,forearm=.7,phase=.5,yaw=.2,scale=48)
        detected=find_fiducials(image)
        self.assertGreater(int(np.isfinite(detected[:,0]).sum()),8)
        self.assertLess(float(np.nanmedian(np.linalg.norm(coords-detected,axis=1))),.8)
    def test_drop_absent_not_filled(self):
        image,_=render_fiducials(upper=.8,forearm=.7,phase=.5,yaw=.2,scale=48,drop=('right_wrist',))
        self.assertFalse(np.isfinite(find_fiducials(image)[PARTS.index('right_wrist')]).all())
    def test_corruption_observed_in_pixels(self):
        a,_=render_fiducials(upper=.8,forearm=.7,phase=.5,yaw=.2,scale=48)
        b,_=render_fiducials(upper=.8,forearm=.7,phase=.5,yaw=.2,scale=48,corrupt=(('right_elbow',(8,0)),))
        point=PARTS.index('right_elbow')
        self.assertGreater(float(np.linalg.norm(find_fiducials(a)[point]-find_fiducials(b)[point])),6)
    def test_input_not_modified(self):
        frames=sequence(); copy=[f.copy() for f in frames]
        solve_sequence(frames,manual_research_opt_in=True)
        self.assertTrue(all(np.array_equal(a,b) for a,b in zip(frames,copy)))
    def test_manual_opt_in_required(self):
        with self.assertRaises(PermissionError):solve_sequence(sequence())
    def test_reject_nonboolean_opt_in(self):
        with self.assertRaises(PermissionError):solve_sequence(sequence(),manual_research_opt_in=1)
    def test_bad_frames(self):
        with self.assertRaises(ValueError):solve_sequence([np.zeros((20,20,3),np.uint8)]*5,manual_research_opt_in=True)
    def test_bad_options(self):
        with self.assertRaises(ValueError):solve_sequence(sequence(),manual_research_opt_in=True,extra_seeds=0)
    def test_missing_anchors_abstain(self):
        frames=[]
        for i in range(5):
            img,_=render_fiducials(upper=.8,forearm=.7,phase=.3+i*.3,yaw=-.7+i*.3,scale=48,
                 drop=('neck',))
            frames.append(img)
        self.assertEqual(solve_sequence(frames,manual_research_opt_in=True).status,'insufficient_evidence')
    def test_missing_wrist_abstain(self):
        frames=[]
        for i in range(5):
            img,_=render_fiducials(upper=.8,forearm=.7,phase=.3+i*.3,yaw=-.7+i*.3,scale=48,
                 drop=('right_wrist',))
            frames.append(img)
        self.assertEqual(solve_sequence(frames,manual_research_opt_in=True).status,'insufficient_evidence')
    def test_with_partial_occlusion(self):
        r=solve_sequence(sequence(drop=True),manual_research_opt_in=True)
        self.assertEqual(r.status,'provisional')
    def test_relative_lengths_recovered(self):
        r=solve_sequence(sequence(.85,.7),manual_research_opt_in=True)
        self.assertLess(abs(r.upper_relative-.85),.08)
        self.assertLess(abs(r.forearm_relative-.7),.08)
    def test_camera_yaw_recovered(self):
        r=solve_sequence(sequence(),manual_research_opt_in=True)
        self.assertLess(abs(r.yaw_rad[0]+.67),.12)
    def test_fixed_baseline_fixed(self):
        r=solve_sequence(sequence(),variable_shape=False,manual_research_opt_in=True)
        self.assertEqual((r.upper_relative,r.forearm_relative),(.62,.58))
    def test_no_metres_claim(self):
        r=solve_sequence(sequence(),manual_research_opt_in=True)
        self.assertFalse(r.metric_scale_known)
    def test_no_real_reconstruction_claim(self):
        r=solve_sequence(sequence(),manual_research_opt_in=True)
        self.assertFalse(r.original_human_geometry_recovered)
        self.assertFalse(r.real_video_validated)
    def test_no_contact_claim(self):
        r=solve_sequence(sequence(),manual_research_opt_in=True)
        self.assertFalse(r.independent_optical_evidence)
    def test_no_publication(self):
        r=solve_sequence(sequence(),manual_research_opt_in=True)
        self.assertFalse(r.publish_or_deploy)
    def test_summary_anonymous(self):
        r=solve_sequence(sequence(),manual_research_opt_in=True)
        d=anonymous_summary(r)
        self.assertNotIn('filename',d)
    def test_summary_invalid_type(self):
        with self.assertRaises(TypeError):anonymous_summary({})
    def test_single_frame_fitted_from_pixels(self):
        a=solve_single(sequence()[0],manual_research_opt_in=True)
        self.assertEqual(a.used_frames,1)
        self.assertLess(abs(a.upper_relative-.82),.08)
    def test_single_frame_optin(self):
        with self.assertRaises(PermissionError):solve_single(sequence()[0])
    def test_single_hidden_wrist_abstains(self):
        image,_=render_fiducials(upper=.8,forearm=.7,phase=.6,yaw=.1,scale=50,
                                 drop=('right_wrist',))
        self.assertEqual(solve_single(image,manual_research_opt_in=True).status,'insufficient_evidence')
    def test_no_template_metadata_in_observation(self):
        image,_=render_fiducials(upper=.8,forearm=.7,phase=.7,yaw=.2,scale=50)
        # Only pixels are accepted; supplying hidden camera metadata must fail.
        with self.assertRaises(TypeError):solve_single(image,manual_research_opt_in=True,camera_truth=.2)

if __name__=='__main__':unittest.main()

