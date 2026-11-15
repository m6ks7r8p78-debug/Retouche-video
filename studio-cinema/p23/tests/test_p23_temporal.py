"""P23 adversarial continuity checks on genuine P19/P21/P22 SYNTHETIC sources only."""
import copy
import json
import os
import sys
import unittest
from pathlib import Path
import cv2
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"src"))
from temporal_blend import (
    GESTURES, VERSION, strength, ease, isolate, blend_p23, audit,
    draw_p19, load_controls, residual_energy, changed_pixels, mobile_changed_pixels,
)

DATA=Path(os.environ.get("P23_DATA","studio-cinema/p22/results/controls.json"))


class P23TemporalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=load_controls(DATA)
        cls.report=audit(cls.data)

    def sample(self,i):
        f=self.data["frames"][i]
        return f,draw_p19(f,i,480)

    def test_source_is_authentic_p22_provenance(self):
        self.assertEqual(len(self.data["frames"]),480)
        self.assertEqual(self.data["provenance"],"synthetic_procedural_only")
        self.assertFalse(self.data["source_media_accessed"])

    def test_complete_temporal_gate(self):
        self.assertEqual(self.report["status"],"synthetic_temporal_gate_pass")

    def test_each_of_four_onsets_has_smaller_residual_jump(self):
        self.assertEqual(set(self.report["gesture_onsets"]),{x[0] for x in GESTURES})
        for label,item in self.report["gesture_onsets"].items():
            self.assertGreater(item["raw_p22_onset_residual_jump"],0,label)
            self.assertGreaterEqual(item["p23_onset_residual_jump"],0,label)
            self.assertLess(item["p23_onset_residual_jump"],
                            item["raw_p22_onset_residual_jump"],label)

    def test_four_gestures_remain_graphically_visible_at_peak(self):
        for name,item in self.report["gesture_onsets"].items():
            self.assertGreaterEqual(item["peak_synthetic_visible_pixels"],15,name)

    def test_four_peak_gestures_survive_360px_rescale_with_pixels(self):
        for name,item in self.report["gesture_onsets"].items():
            self.assertGreater(item["peak_changed_pixels_360px"],0,name)

    def test_reduced_240px_measure_is_reported_not_false_safari_certification(self):
        for name,item in self.report["gesture_onsets"].items():
            self.assertIsInstance(item["peak_changed_pixels_240px"],int,name)
            self.assertGreaterEqual(item["peak_changed_pixels_240px"],0,name)
        self.assertTrue(self.report["reduced_resolution_pixel_changes_are_not_mobile_readability_proof"])

    def test_idle_frames_do_not_change(self):
        for i in (0,110,235,275,400):
            f,raw=self.sample(i)
            self.assertTrue(np.array_equal(raw,blend_p23(raw,f)),i)

    def test_full_blend_alters_only_mouth_roi(self):
        for i in (289,291,437,446,453,458):
            f,raw=self.sample(i)
            altered=blend_p23(raw,f)
            self.assertGreater(changed_pixels(raw,altered,f,threshold=3),0,i)

    def test_blend_does_not_modify_p19_source_frame_or_controls(self):
        f,raw=self.sample(291)
        orig=raw.copy()
        state=copy.deepcopy(f)
        _=blend_p23(raw,f)
        self.assertTrue(np.array_equal(raw,orig))
        self.assertEqual(f,state)

    def test_first_gesture_has_less_contrast_than_raw_p22(self):
        name,flag=GESTURES[0]
        i=self.report["gesture_onsets"][name]["onset_frame"]
        pose,raw=self.sample(i)
        old=isolate(raw,pose,name,soft=False)
        new=isolate(raw,pose,name,soft=True)
        self.assertLess(residual_energy(raw,new,pose),residual_energy(raw,old,pose))

    def test_smoothstep_no_sharp_boundary_and_unit_values(self):
        self.assertEqual(ease(0),0)
        self.assertEqual(ease(1),1)
        self.assertAlmostEqual(ease(0.5),0.5)
        self.assertLess(ease(.1),.1)
        self.assertGreater(ease(.9),.9)

    def test_bad_strengths_are_rejected_not_clipped_silently(self):
        pose,_=self.sample(291)
        changed=dict(pose);changed["p21_lower_lip_fold"]=-.006
        with self.assertRaisesRegex(ValueError,"intensity"):
            strength(changed,"lower_lip_bite")
        changed["p21_lower_lip_fold"]=float("nan")
        with self.assertRaisesRegex(ValueError,"intensity"):
            strength(changed,"lower_lip_bite")
        changed["p21_lower_lip_fold"]=.5
        with self.assertRaisesRegex(ValueError,"intensity"):
            strength(changed,"lower_lip_bite")

    def test_reject_unknown_gesture(self):
        f,_=self.sample(100)
        with self.assertRaisesRegex(ValueError,"Unsupported"):
            strength(f,"invented_depth_or_contact")

    def test_no_real_identity_or_anatomical_claim_in_qa(self):
        s=json.dumps(self.report)
        self.assertFalse(self.report["human_motion_certified"])
        self.assertFalse(self.report["anatomy_certified"])
        self.assertFalse(self.report["physical_iphone_tested"])
        self.assertFalse(self.report["person_media_accessed"])
        self.assertFalse(self.report["model_trained"])
        self.assertFalse(self.report["automatic_video_restoration"])
        for private in ("PRIVATE_FILENAME","reviewer_A","annotator_id","source_person"):
            self.assertNotIn(private,s)

    def test_audit_rejects_bad_provenance(self):
        d=dict(self.data);d["provenance"]="real_person_media"
        with self.assertRaisesRegex(ValueError,"synthetic"):
            audit(d)

    def test_measured_inside_mouth_only_and_proof_source(self):
        self.assertEqual(self.report["outside_mouth_violations"],0)
        self.assertGreaterEqual(self.report["idle_frames_checked"],10)
        self.assertEqual(self.report["source"],"P19_P21_P22_synthetic_only")


if __name__=="__main__":
    unittest.main(verbosity=2)
