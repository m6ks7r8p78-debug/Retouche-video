"""P25 codec comparison contracts, adversarial inputs, and result accountability."""
from __future__ import annotations
import copy
import io
import json
import math
import os
import sys
import tempfile
import unittest
from pathlib import Path
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"src"))
from p25_crf_matrix import (
  SCHEMA,PROFILES,NFRAMES,FPS,validate_crfs,verify_source,
  peaks_for,encode_profile,run_checked,verify_lossless_master,
  assess_pair,frame_delta,percentile95,
)
from temporal_blend import load_controls

DATA=Path(os.environ.get("P25_DATA","studio-cinema/p22/results/controls.json"))


class P25Contracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=load_controls(DATA)

    def test_real_p19_p21_p22_source(self):
        self.assertIs(verify_source(self.data),self.data)
        self.assertEqual(len(self.data["frames"]),NFRAMES)
        self.assertEqual(FPS,60)

    def test_valid_three_profiles_exactly(self):
        self.assertEqual(tuple(validate_crfs(PROFILES)),(18,25,32))

    def test_reject_missing_profile(self):
        with self.assertRaisesRegex(ValueError,"fixed CRF"):
            validate_crfs((18,25))

    def test_reject_added_arbitrary_profile(self):
        with self.assertRaisesRegex(ValueError,"fixed CRF"):
            validate_crfs((18,25,32,40))

    def test_reject_duplicate_profile(self):
        with self.assertRaisesRegex(ValueError,"fixed CRF"):
            validate_crfs((18,18,32))

    def test_reject_profile_as_string(self):
        with self.assertRaisesRegex(ValueError,"fixed CRF"):
            validate_crfs(("18",25,32))

    def test_reject_profile_with_bool(self):
        with self.assertRaisesRegex(ValueError,"fixed CRF"):
            validate_crfs((True,25,32))

    def test_reject_profile_as_set_order_unknown(self):
        with self.assertRaisesRegex(ValueError,"fixed CRF"):
            validate_crfs({18,25,32})

    def test_reject_real_media_source(self):
        g=copy.deepcopy(self.data)
        g["source_media_accessed"]=True
        with self.assertRaisesRegex(ValueError,"provenance"):
            verify_source(g)

    def test_reject_unknown_synthetic_schema(self):
        g=copy.deepcopy(self.data)
        g["schema"]="retouche-person-video"
        with self.assertRaisesRegex(ValueError,"P22"):
            verify_source(g)

    def test_reject_invalid_sample_rate(self):
        g=copy.deepcopy(self.data)
        g["fps"]=45
        with self.assertRaisesRegex(ValueError,"timeline"):
            verify_source(g)

    def test_reject_truncated_trajectory(self):
        g=copy.deepcopy(self.data)
        g["frames"]=g["frames"][:-1]
        with self.assertRaisesRegex(ValueError,"timeline"):
            verify_source(g)

    def test_reject_failed_p21_source_qa(self):
        g=copy.deepcopy(self.data)
        g["control_qa"]["issue_count"]=1
        with self.assertRaisesRegex(ValueError,"control QA"):
            verify_source(g)

    def test_peaks_cover_exactly_four_gestures(self):
        peaks=peaks_for(self.data)
        self.assertEqual(set(peaks),{
          "lower_lip_bite","tongue_visible","lip_lick_lower","tongue_retract"})
        self.assertEqual(len(set(peaks.values())),4)

    def test_peak_contract_refuses_missing_amplitude(self):
        g=copy.deepcopy(self.data)
        for f in g["frames"]:
            f["p21_lip_lick_strength"]=0
        with self.assertRaisesRegex(ValueError,"Missing"):
            peaks_for(g)

    def test_encode_profile_does_not_accept_unreviewed_crfs(self):
        with self.assertRaisesRegex(ValueError,"preapproved"):
            encode_profile(Path("synthetic.mkv"),Path("synthetic.mp4"),42)
        with self.assertRaisesRegex(ValueError,"preapproved"):
            encode_profile(Path("synthetic.mkv"),Path("synthetic.mp4"),"25")

    def test_p95_rejects_nans(self):
        with self.assertRaisesRegex(ValueError,"finite"):
            percentile95([float("nan")])

    def test_frame_delta_exposes_non_equivalent_frames(self):
        a=np.zeros((4,4,3),dtype=np.uint8)
        b=a.copy()
        b[2,3]=(9,4,0)
        mae,count=frame_delta(a,b,threshold=8)
        self.assertEqual(count,1)
        self.assertGreater(mae,0)

    def test_report_schema_not_claim_human_fidelity(self):
        self.assertIn("comparative",SCHEMA)
        self.assertNotIn("human_verified",SCHEMA)

    def test_reject_shell_or_command_injection_profile_value(self):
        with self.assertRaisesRegex(ValueError,"preapproved"):
            encode_profile(Path("a.mkv"),Path("out.mp4"),"25; touch /tmp/bad")

    def test_reject_missing_or_private_source_metadata(self):
        g=copy.deepcopy(self.data)
        g["provenance"]="user_private_video"
        with self.assertRaisesRegex(ValueError,"provenance"):
            verify_source(g)


if __name__=="__main__":
    unittest.main(verbosity=2)
