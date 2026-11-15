"""P26 offline unit/adversarial tests. No user's video ever loaded."""
from __future__ import annotations
import copy
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"src"))
from p26_recompression import (
    VERSION,PROFILES,NFRAMES,PREVIEW_PAIR,validate_pair,expected_first_path,
    encode_again,decoded_audio_fingerprint,check_audio_preserved,mouth_mae,
    validate_second_generation_report,verify_source,load_controls
)

DATA=Path(os.environ.get("P26_DATA","studio-cinema/p22/results/controls.json"))


class TestP26SecondCompression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=load_controls(DATA)

    def test_original_p25_provenance_contract(self):
        self.assertIs(verify_source(self.data),self.data)
        self.assertEqual(len(self.data["frames"]),480)
        self.assertTrue(self.data["source_media_accessed"] is False)

    def test_nine_pairs_defined(self):
        cases={(x,y) for x in PROFILES for y in PROFILES}
        self.assertEqual(len(cases),9)
        self.assertEqual(set(PROFILES),{18,25,32})

    def test_validated_crf_pairs(self):
        for a in PROFILES:
            for b in PROFILES:
                self.assertEqual(validate_pair(a,b),(a,b))

    def test_reject_arbitrary_crf(self):
        with self.assertRaisesRegex(ValueError,"approved"):
            validate_pair(17,25)

    def test_reject_negative_crf(self):
        with self.assertRaisesRegex(ValueError,"approved"):
            validate_pair(18,-1)

    def test_reject_string_crf(self):
        with self.assertRaisesRegex(ValueError,"approved"):
            validate_pair("18",25)

    def test_reject_float_crf(self):
        with self.assertRaisesRegex(ValueError,"approved"):
            validate_pair(18,25.0)

    def test_reject_bool_crf(self):
        with self.assertRaisesRegex(ValueError,"approved"):
            validate_pair(True,25)

    def test_reject_command_injection_as_profile(self):
        with self.assertRaisesRegex(ValueError,"approved"):
            validate_pair(18,"32; rm /tmp/test")

    def test_missing_first_pass_movie_refused(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,"Missing"):
                expected_first_path(d,18)

    def test_wrong_named_first_pass_refused_before_encoding(self):
        with self.assertRaisesRegex(ValueError,"named original"):
            encode_again("private_video.mov","P26_test.mp4",18,25)

    def test_path_gate_allows_named_synthetic_p25_fixture(self):
        with tempfile.TemporaryDirectory() as folder:
            f=Path(folder)/"P25_CRF18_synthetic_H264_AAC.mp4"
            f.write_bytes(b"0"*11000)
            self.assertEqual(expected_first_path(folder,18),f)

    def test_bad_source_provenance_refused(self):
        changed=copy.deepcopy(self.data)
        changed["source_media_accessed"]=True
        with self.assertRaisesRegex(ValueError,"provenance"):
            verify_source(changed)

    def test_audio_copy_proof_equal_digest(self):
        fixture={"sha256":"a"*64,"pcm_bytes":384000}
        with patch("p26_recompression.decoded_audio_fingerprint",return_value=fixture) as fn:
            self.assertTrue(check_audio_preserved("before.mp4","after.mp4"))
            self.assertEqual(fn.call_count,2)

    def test_audio_change_is_hard_failure(self):
        with patch("p26_recompression.decoded_audio_fingerprint",
                   side_effect=[{"sha256":"a"*64,"pcm_bytes":384000},
                                {"sha256":"b"*64,"pcm_bytes":384000}]):
            with self.assertRaisesRegex(ValueError,"AAC audio changed"):
                check_audio_preserved("before.mp4","after.mp4")

    def test_audio_missing_is_hard_failure(self):
        with patch("p26_recompression.run_checked",return_value=b"tiny"):
            with self.assertRaisesRegex(ValueError,"missing or truncated"):
                decoded_audio_fingerprint("synthetic.mp4")

    def test_zero_error_same_image(self):
        frame=np.zeros((8,8,3),dtype=np.uint8)
        self.assertEqual(mouth_mae(frame,frame,np.s_[:,:]),0)

    def test_measured_error_to_original(self):
        frame=np.zeros((8,8,3),dtype=np.uint8)
        altered=frame.copy()
        altered[2,2]=[30,30,30]
        self.assertAlmostEqual(mouth_mae(frame,altered,np.s_[:,:]),30/64)

    def test_report_rejects_shortened_video(self):
        with self.assertRaisesRegex(ValueError,"Incomplete"):
            validate_second_generation_report({"frames_compared":479,"transitions_compared":479})

    def test_report_rejects_lost_aac(self):
        row={"frames_compared":480,"transitions_compared":479,"audio_pcm_digest_equal":False}
        with self.assertRaisesRegex(ValueError,"audio"):
            validate_second_generation_report(row)

    def test_report_rejects_missing_gestures(self):
        row={"frames_compared":480,"transitions_compared":479,"audio_pcm_digest_equal":True,
             "gesture_peak_comparisons":{"lower_lip_bite":{}}}
        with self.assertRaisesRegex(ValueError,"gesture peaks"):
            validate_second_generation_report(row)

    def test_report_rejects_nan_metrics(self):
        row={"frames_compared":480,"transitions_compared":479,"audio_pcm_digest_equal":True,
             "gesture_peak_comparisons":{k:{} for k in ("a","b","c","d")},
             "p95_additional_rgb_mae_vs_source":float("nan")}
        with self.assertRaisesRegex(ValueError,"Invalid pixel"):
            validate_second_generation_report(row)

    def test_report_accepts_fixed_audit_contract(self):
        row={"frames_compared":480,"transitions_compared":479,"audio_pcm_digest_equal":True,
             "gesture_peak_comparisons":{k:{} for k in ("a","b","c","d")},
             "p95_additional_rgb_mae_vs_source":0.35}
        self.assertTrue(validate_second_generation_report(row))

    def test_preview_is_single_synthetic_pair(self):
        self.assertEqual(PREVIEW_PAIR,(25,32))
        self.assertIn("second-generation-h264",VERSION)

    def test_original_workflow_kept_unchanged(self):
        self.assertFalse(self.data["source_media_accessed"])
        self.assertFalse(self.data["control_qa"]["issue_count"])
        self.assertEqual(NFRAMES,480)


if __name__=="__main__":
    unittest.main(verbosity=2)
