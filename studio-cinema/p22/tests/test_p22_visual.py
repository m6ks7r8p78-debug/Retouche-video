"""P22 regression tests against the real P19 vector renderer & P21 synthetic controls."""
import copy
import json
import os
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from render_p22 import audit, draw_p19, load_controls, overlay_p21, pixel_metrics, mouth_roi, LABELS

DATA = Path(os.environ.get("P22_DATA", "studio-cinema/p22/results/controls.json"))


class TestP22Visual(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_controls(DATA)
        cls.report = audit(cls.data)

    def pose(self, i):
        f = self.data["frames"][i]
        original = draw_p19(f, i, len(self.data["frames"]))
        return f, original, overlay_p21(original, f)

    def test_480_real_p19_frames(self):
        self.assertEqual(self.data["fps"], 60)
        self.assertEqual(len(self.data["frames"]), 480)
        self.assertTrue(all(f["generated_control_pose"] for f in self.data["frames"]))

    def test_vector_gate_pass(self):
        self.assertEqual(self.report["status"], "synthetic_vector_pixel_gate_pass")

    def test_all_four_p21_gestures_measurable(self):
        self.assertEqual(set(self.report["gesture_checks"]), set(LABELS))
        for item in self.report["gesture_checks"].values():
            self.assertTrue(item["meets_vector_visibility_gate"])
            self.assertGreater(item["maximum_changed_pixels"], 15)

    def test_original_p19_frame_is_not_modified(self):
        f, before, after = self.pose(291)
        self.assertFalse((before == after).all())
        repeat = draw_p19(f, 291, 480)
        self.assertTrue((before == repeat).all())

    def test_idle_0_has_no_overlay(self):
        _, before, after = self.pose(0)
        self.assertTrue((before == after).all())

    def test_idle_phase_contact_does_not_edit(self):
        _, before, after = self.pose(110)
        self.assertTrue((before == after).all())

    def test_idle_frames_measured(self):
        self.assertTrue(self.report["idle_has_no_overlay"])
        self.assertGreater(self.report["idle_samples"], 5)

    def test_bite_visible_and_only_mouth(self):
        f, before, after = self.pose(291)
        m = pixel_metrics(before, after, f)
        self.assertTrue(f["p21_lower_lip_bite"])
        self.assertGreater(m["mouth_changed_pixels"], 15)
        self.assertEqual(m["outside_mouth_changed_pixels"], 0)

    def test_lick_vector_visible(self):
        f, before, after = self.pose(446)
        self.assertTrue(f["p21_lip_lick_lower"])
        self.assertGreater(pixel_metrics(before, after, f)["mouth_changed_pixels"], 15)

    def test_tongue_tip_and_retraction_visible(self):
        f, before, after = self.pose(457)
        self.assertTrue(f["p21_tongue_retract"])
        self.assertGreater(pixel_metrics(before, after, f)["mouth_changed_pixels"], 15)

    def test_preview_never_claims_human_realism(self):
        self.assertFalse(self.report["human_realism_certified"])
        self.assertFalse(self.report["anatomical_accuracy_certified"])
        self.assertFalse(self.report["safari_iphone_physically_tested"])
        self.assertEqual(self.report["photographic_faces_generated"], 0)

    def test_no_personal_filename_in_report(self):
        s = json.dumps(self.report)
        for secret in ("reviewer", "PRIVATE", "filename", "annotator_id", "source_person"):
            self.assertNotIn(secret, s)
        self.assertTrue(self.report["no_media_upload"])

    def test_refuse_real_media_flag(self):
        changed = copy.deepcopy(self.data)
        changed["source_media_accessed"] = True
        file = DATA.parent / "corrupt_source_flag.json"
        file.write_text(json.dumps(changed), encoding="utf-8")
        try:
            with self.assertRaisesRegex(ValueError, "provenance"):
                load_controls(file)
        finally:
            file.unlink(missing_ok=True)

    def test_refuse_unverified_human_claim(self):
        changed = copy.deepcopy(self.data)
        changed["frames"][42]["p21_generated_semantics"]["human_gesture_verified"] = True
        file = DATA.parent / "corrupt_human_flag.json"
        file.write_text(json.dumps(changed), encoding="utf-8")
        try:
            with self.assertRaisesRegex(ValueError, "Human motion"):
                load_controls(file)
        finally:
            file.unlink(missing_ok=True)

    def test_refuse_broken_frame_times(self):
        changed = copy.deepcopy(self.data)
        changed["frames"][38]["t"] = -1
        file = DATA.parent / "corrupt_timestamp.json"
        file.write_text(json.dumps(changed), encoding="utf-8")
        try:
            with self.assertRaisesRegex(ValueError, "timestamp"):
                load_controls(file)
        finally:
            file.unlink(missing_ok=True)

    def test_roi_is_local_to_mouth(self):
        f, before, _ = self.pose(440)
        x0, y0, x1, y1 = mouth_roi(before, f)
        self.assertLess(x1-x0, 110)
        self.assertLess(y1-y0, 80)
        self.assertGreater(x0, 0)
        self.assertGreater(y0, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
