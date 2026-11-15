"""Synthetic privacy-preserving tests for physical back-projection."""
import unittest
import numpy as np
import cv2
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'))
from data_consistency import project_once,input_luma_consistency

class ProjectionTests(unittest.TestCase):
    def setUp(self):
        g=np.random.default_rng(345)
        self.sr=g.integers(5,245,(64,80,3),dtype=np.uint8)
        self.lr=cv2.resize(self.sr,(40,32),interpolation=cv2.INTER_AREA)
    def test_same_shape(self):
        out,meta=project_once(self.sr,self.lr,known_area_downsample=True)
        self.assertEqual(out.shape,self.sr.shape)
        self.assertEqual(out.dtype,np.uint8)
    def test_no_training_claim(self):
        out,meta=project_once(self.sr,self.lr,known_area_downsample=True)
        self.assertFalse(meta['learned_parameters_updated'])
        self.assertFalse(meta['automatic_deployment'])
    def test_no_real_camera_claim(self):
        self.assertFalse(project_once(self.sr,self.lr,known_area_downsample=True)[1]['valid_for_unknown_real_camera_pipeline'])
    def test_luma_error_decreases_when_wrong(self):
        wrong=np.clip(self.sr.astype(np.int16)+20,0,255).astype(np.uint8)
        before=input_luma_consistency(wrong,self.lr)
        out,meta=project_once(wrong,self.lr,known_area_downsample=True)
        self.assertLess(input_luma_consistency(out,self.lr),before)
    def test_zero_correction_unchanged(self):
        flat=np.full((64,80,3),120,np.uint8)
        l=cv2.resize(flat,(40,32),interpolation=cv2.INTER_AREA)
        out,meta=project_once(flat,l,known_area_downsample=True)
        self.assertTrue(np.array_equal(out,flat))
    def test_inputs_unchanged(self):
        a=self.sr.copy();b=self.lr.copy()
        project_once(self.sr,self.lr,known_area_downsample=True)
        self.assertTrue(np.array_equal(a,self.sr));self.assertTrue(np.array_equal(b,self.lr))
    def test_mismatch_dimensions(self):
        with self.assertRaises(ValueError):project_once(self.sr,self.lr[:20],known_area_downsample=True)
    def test_dtype(self):
        with self.assertRaises(TypeError):project_once(self.sr.astype(np.float32),self.lr,known_area_downsample=True)
    def test_small_rejected(self):
        with self.assertRaises(ValueError):project_once(np.zeros((16,16,3),np.uint8),np.zeros((8,8,3),np.uint8),known_area_downsample=True)
    def test_constant_offset_bounded(self):
        wrong=np.full((64,80,3),90,np.uint8);l=np.full((32,40,3),80,np.uint8)
        out,m=project_once(wrong,l,known_area_downsample=True)
        self.assertEqual(int(out.mean()),80)
    def test_different_arrays(self):
        out,_=project_once(self.sr,self.lr,known_area_downsample=True)
        self.assertFalse(np.shares_memory(out,self.sr))
    def test_unknown_camera_pipeline_blocked_by_default(self):
        with self.assertRaises(PermissionError):project_once(self.sr,self.lr)
    def test_fake_boolean_rejected(self):
        with self.assertRaises(PermissionError):project_once(self.sr,self.lr,known_area_downsample=1)
    def test_luma_mae_nonnegative(self):
        self.assertGreaterEqual(input_luma_consistency(self.sr,self.lr),0)

if __name__=='__main__': unittest.main()
