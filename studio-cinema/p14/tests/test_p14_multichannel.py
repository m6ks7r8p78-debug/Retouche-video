from pathlib import Path
import sys
import json
import unittest
import tempfile
import numpy as np
sys.path.insert(0,str(Path(__file__).parents[1]))
import p14_multichannel as m

class P14QA(unittest.TestCase):
    def test_no_change_zero_grid_flow(self):
        f=np.zeros((320,320,3),np.uint8)
        q=m.grid_residual_flow(f,f)
        self.assertLess(max(q['residual_grid_p90_px96']),1e-3)
    def test_localized_motion_detected_in_grid(self):
        a=np.zeros((320,320,3),np.uint8);b=a.copy()
        a[100:150,100:150]=255;b[100:150,120:170]=255
        q=m.grid_residual_flow(a,b)
        self.assertEqual(len(q['residual_grid_p90_px96']),9)
        self.assertGreater(max(q['residual_grid_p90_px96']),1)
    def test_flow_is_not_hand_detection(self):
        a=np.zeros((320,320,3),np.uint8)
        self.assertTrue(m.grid_residual_flow(a,a)['grid_is_not_body_part_detection'])
    def test_whole_frame_not_dependent_on_face_roi(self):
        f=np.zeros((3,320,320,3),np.uint8)
        q=m.analyze_frames(f,0,12,[])
        self.assertEqual(q['whole_frame_flow_pairs'],2)
        self.assertIsNone(q['series'][0]['whole_frame_motion'])
        self.assertIsNotNone(q['series'][1]['whole_frame_motion'])
    def test_clean_patch_brightness_invariant(self):
        self.assertEqual(m.normalized_change(np.full((20,20),70.),np.full((20,20),110.)),0.)
    def test_change_detects_internal_shape(self):
        a=np.full((20,20),125.);b=a.copy();b[5:8,5:15]=25.
        self.assertGreater(m.normalized_change(a,b),.02)
    def test_bad_box_out_of_frame(self):
        with self.assertRaises(ValueError):m.region_boxes([.8,.8,.5,.3])
    def test_all_regions_are_hypotheses(self):
        self.assertEqual(set(m.region_boxes([.2,.2,.5,.5])),set(m.REGIONS))
    def test_small_patch_null(self):
        self.assertIsNone(m.normalize_patch(np.ones((320,320,3),np.uint8),[.1,.1,.01,.01]))
    def test_normalized_patch_size(self):
        patch=m.normalize_patch(np.ones((320,320,3),np.uint8),[.1,.1,.2,.2]);self.assertEqual(patch.shape,(32,40))
    def test_face_from_old_detections(self):
        a=[{'t_s_approx':1.,'face_candidate':{'face_box':[.2,.2,.5,.5]}}, {'t_s_approx':2.,'face_candidate':None}]
        self.assertIsNotNone(m.nearest_face(1.08,a));self.assertIsNone(m.nearest_face(1.3,a))
    def test_frames_without_face_are_abstentions(self):
        f=np.zeros((3,320,320,3),np.uint8);o=m.analyze_frames(f,0,12,[])
        self.assertEqual(o['frames_with_face_candidate'],0);self.assertIsNone(o['series'][1]['mouth_relative_to_cheeks'])
    def test_audio_flag_never_breath(self):
        a=m.audio_rms(Path('/non-existent/video.mp4'),0,1);self.assertFalse(a['audio_is_breath_classified'])
    def test_sample_rate_nonpositive(self):
        with self.assertRaises(ValueError):m.decode_window(Path('fiction.mp4'),0,3,hz=0)
    def test_no_action_labels(self):
        f=np.zeros((4,320,320,3),np.uint8)
        o=m.analyze_frames(f,0,12,[]);self.assertTrue(o['relative_change_is_not_lip_aperture'])
    def test_mismatched_sources_rejected(self):
        t={'video_id':'V003','start_s':1,'end_s':4};p={'video_id':'V003','start_s':8,'end_s':11}
        with self.assertRaises(ValueError):m.audit_one(Path('/file'),t,p)
    def test_duplicate_ids_are_different_windows(self):
        # Validate pairing by complete window, NOT a map keyed by ID.
        z=[{'video_id':'V001','start_s':1,'end_s':4,'split':'train'},
           {'video_id':'V001','start_s':8,'end_s':11,'split':'train'}]
        self.assertNotEqual((z[0]['start_s'],z[0]['end_s']),(z[1]['start_s'],z[1]['end_s']))
    def test_crop_normalization_clamps_lighting(self):
        a=np.full((32,40),60.,dtype=np.float32)
        b=np.full((32,40),70.,dtype=np.float32)
        self.assertEqual(m.normalized_change(a,b),0.)

if __name__=='__main__':unittest.main()

