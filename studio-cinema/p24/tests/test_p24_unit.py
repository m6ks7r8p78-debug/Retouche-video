"""Unit tests of P24 offline codec analysis; never accesses user media."""
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"src"))
from p24_h264_audit import (
    VERSION,NFRAMES,W,H,EXPECTED_VIDEO_NAME,inspect_probe,ensure_movie,
    exact_bytes,frame_delta,percentile95
)


def fixture(audio=True):
    streams=[{"codec_type":"video","codec_name":"h264","r_frame_rate":"60/1",
              "nb_read_frames":"480","width":W,"height":H}]
    if audio:
        streams.append({"codec_type":"audio","codec_name":"aac"})
    return {"streams":streams,"format":{"duration":"8.000000"}}


class P24CodecUnitTests(unittest.TestCase):
    def test_video_codec_and_exact_fps_and_frames(self):
        r=inspect_probe(fixture(),expect_audio=True)
        self.assertEqual((r["codec"],r["frames"],r["fps"]),("h264",480,"60/1"))

    def test_aac_required_in_original_p23_movie(self):
        with self.assertRaisesRegex(ValueError,"AAC"):
            inspect_probe(fixture(False),expect_audio=True)

    def test_baseline_without_audio_is_valid(self):
        r=inspect_probe(fixture(False),expect_audio=False)
        self.assertFalse(r["aac_synthetic"])

    def test_baseline_cannot_have_fake_audio_stream(self):
        with self.assertRaisesRegex(ValueError,"no audio"):
            inspect_probe(fixture(True),expect_audio=False)

    def test_reject_duplicate_video_stream(self):
        f=fixture()
        f["streams"].insert(0,dict(f["streams"][0]))
        with self.assertRaisesRegex(ValueError,"Exactly one"):
            inspect_probe(f,expect_audio=True)

    def test_reject_wrong_video_codec(self):
        f=fixture()
        f["streams"][0]["codec_name"]="hevc"
        with self.assertRaisesRegex(ValueError,"H264"):
            inspect_probe(f,expect_audio=True)

    def test_reject_wrong_fps(self):
        f=fixture()
        f["streams"][0]["r_frame_rate"]="30/1"
        with self.assertRaisesRegex(ValueError,"frames"):
            inspect_probe(f,expect_audio=True)

    def test_reject_missing_frames(self):
        f=fixture()
        f["streams"][0]["nb_read_frames"]="479"
        with self.assertRaisesRegex(ValueError,"frames"):
            inspect_probe(f,expect_audio=True)

    def test_reject_wrong_dimensions(self):
        f=fixture()
        f["streams"][0]["width"]=1920
        with self.assertRaisesRegex(ValueError,"dimensions"):
            inspect_probe(f,expect_audio=True)

    def test_reject_bad_duration(self):
        f=fixture()
        f["format"]["duration"]="8.5"
        with self.assertRaisesRegex(ValueError,"duration"):
            inspect_probe(f,expect_audio=True)

    def test_reject_malformed_ffprobe_json(self):
        with self.assertRaisesRegex(ValueError,"Invalid ffprobe"):
            inspect_probe({"streams":"not an array"},expect_audio=True)

    def test_read_exact_rejects_incomplete_raw_frame(self):
        with self.assertRaises(EOFError):
            exact_bytes(io.BytesIO(b"abc"),4)

    def test_read_exact_consumes_only_n_bytes(self):
        stream=io.BytesIO(b"abcde")
        self.assertEqual(exact_bytes(stream,3),b"abc")
        self.assertEqual(exact_bytes(stream,2),b"de")

    def test_pixel_metrics_count_and_mae(self):
        before=np.zeros((3,3,3),dtype=np.uint8)
        after=before.copy()
        after[1,1]=[20,0,0]
        mean,pixels=frame_delta(before,after,threshold=8)
        self.assertEqual(pixels,1)
        self.assertAlmostEqual(mean,20/27)

    def test_pixel_metrics_no_wrong_array_alignment(self):
        a=np.zeros((2,2,3),dtype=np.uint8)
        b=np.zeros((3,2,3),dtype=np.uint8)
        with self.assertRaisesRegex(ValueError,"aligned"):
            frame_delta(a,b)

    def test_p95_finite_not_intuition_of_perceptual_quality(self):
        self.assertAlmostEqual(percentile95([0,10,20]),19)
        with self.assertRaisesRegex(ValueError,"finite"):
            percentile95([float("nan")])

    def test_path_gate_accepts_only_generated_synthetic_filename(self):
        with tempfile.TemporaryDirectory() as tmp:
            safe=Path(tmp)/EXPECTED_VIDEO_NAME
            safe.write_bytes(b"0"*11001)
            self.assertEqual(ensure_movie(safe),safe)
            other=Path(tmp)/"real_source_person.mp4"
            other.write_bytes(b"0"*11001)
            with self.assertRaisesRegex(ValueError,"Only"):
                ensure_movie(other)

    def test_numeric_contract_is_not_human_certification(self):
        self.assertEqual(NFRAMES,480)
        self.assertIn("decoded-qa",VERSION)
        self.assertTrue(EXPECTED_VIDEO_NAME.startswith("P23_"))


if __name__=="__main__":
    unittest.main(verbosity=2)
