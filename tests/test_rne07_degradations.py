"""Synthetic-only RNE07 degradation tests; includes real ffmpeg H264 in-memory."""
import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'/'rne07'))
import numpy as np
from degradations import degrade,h264_roundtrip,MODES

class DegradationsTest(unittest.TestCase):
    def setUp(self):
        rng=np.random.default_rng(7)
        x=rng.integers(0,256,(128,128,3),dtype=np.uint8)
        self.frames=[np.roll(x,i,axis=1) for i in (0,1,2)]
    def test_modes(self):self.assertEqual(len(MODES),4)
    def test_shapes(self):
        for m in MODES:
            with self.subTest(m=m):
                v=degrade(self.frames,m,seed=21)
                self.assertEqual(len(v),3)
                self.assertTrue(all(a.shape==(64,64,3) and a.dtype==np.uint8 for a in v))
    def test_true_codec_changes_pixels(self):
        a=degrade(self.frames,'clean_area')
        b=degrade(self.frames,'h264_crf34')
        self.assertGreater(float(np.abs(a[2].astype(int)-b[2].astype(int)).mean()),.5)
    def test_deterministic(self):
        for m in MODES:
            a=degrade(self.frames,m,seed=101)
            b=degrade(self.frames,m,seed=101)
            self.assertTrue(all(np.array_equal(x,y) for x,y in zip(a,b)))
    def test_noise_seed_changes(self):
        a=degrade(self.frames,'blur_noise',seed=11)
        b=degrade(self.frames,'blur_noise',seed=21)
        self.assertFalse(np.array_equal(a[-1],b[-1]))
    def test_inputs_unchanged(self):
        a=[x.copy() for x in self.frames]
        for m in MODES:degrade(self.frames,m,seed=0)
        self.assertTrue(all(np.array_equal(x,y) for x,y in zip(a,self.frames)))
    def test_bad_triplet(self):
        with self.assertRaises(TypeError):degrade(self.frames[:2],'jpeg55')
    def test_bad_shape(self):
        with self.assertRaises(ValueError):degrade([x[:63] for x in self.frames],'clean_area')
    def test_bad_mode(self):
        with self.assertRaises(ValueError):degrade(self.frames,'bad')
    def test_bad_seed(self):
        with self.assertRaises(TypeError):degrade(self.frames,'clean_area',seed=1.)
    def test_invalid_crf(self):
        with self.assertRaises(ValueError):h264_roundtrip(degrade(self.frames,'clean_area'),50)
    def test_codec_3_frames(self):
        self.assertEqual(len(h264_roundtrip(degrade(self.frames,'clean_area'))),3)
    def test_non_lossless_jpeg(self):
        self.assertFalse(np.array_equal(degrade(self.frames,'clean_area')[0],
                                        degrade(self.frames,'jpeg55')[0]))
    def test_even_dimensions_required(self):
        with self.assertRaises(ValueError):degrade([x[:127] for x in self.frames],'clean_area')
    def test_codec_no_disk_output_required(self):
        self.assertEqual(degrade(self.frames,'h264_crf34')[-1].shape,(64,64,3))

if __name__=='__main__':unittest.main()
