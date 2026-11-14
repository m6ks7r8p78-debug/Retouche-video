"""RNE: synthetic-only tests of optional causal residual smoothing."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'))
import unittest
import numpy as np
import cv2
from residual_temporal import stabilize_detail

class DetailStabilizationTests(unittest.TestCase):
    def setUp(self):
        rng=np.random.default_rng(2026)
        a=cv2.GaussianBlur(rng.integers(0,255,(64,64,3),dtype=np.uint8),(9,9),2)
        self.prev=a;self.cur=np.roll(a,1,axis=1)
        self.pb=cv2.resize(self.prev,(128,128),interpolation=cv2.INTER_CUBIC)
        self.cb=cv2.resize(self.cur,(128,128),interpolation=cv2.INTER_CUBIC)
        self.pp=np.clip(self.pb.astype(int)+5,0,255).astype(np.uint8)
        self.cp=np.clip(self.cb.astype(int)+9,0,255).astype(np.uint8)
    def call(self,**kw):
        return stabilize_detail(self.prev,self.cur,self.pb,self.cb,self.pp,self.cp,**kw)
    def test_shape_dtype(self):
        a,d=self.call();self.assertEqual(a.shape,(128,128,3));self.assertEqual(a.dtype,np.uint8);self.assertFalse(d['deployment_allowed'])
    def test_changes_uncertain_detail(self):
        a,d=self.call();self.assertTrue(d['temporal_applied']);self.assertLess(np.abs(a.astype(int)-self.cb.astype(int)).mean(),9)
    def test_zero_alpha(self):
        a,d=self.call(alpha=0);self.assertTrue(np.array_equal(a,self.cp));self.assertFalse(d['temporal_applied'])
    def test_cut_reset(self):
        black=np.zeros_like(self.prev);white=np.full_like(self.prev,255)
        a,d=stabilize_detail(black,white,self.pb,self.cb,self.pp,self.cp)
        self.assertTrue(d['scene_cut']);self.assertTrue(np.array_equal(a,self.cp))
    def test_protected_exactly_bicubic(self):
        mask=np.zeros((64,64),np.uint8);mask[:,:32]=255
        a,d=self.call(protected_mask=mask)
        self.assertTrue(np.array_equal(a[:,:64],self.cb[:,:64]))
    def test_full_protection(self):
        a,d=self.call(protected_mask=np.full((64,64),255,np.uint8));self.assertTrue(np.array_equal(a,self.cb))
    def test_bad_mask(self):
        with self.assertRaises(TypeError):self.call(protected_mask=np.zeros((2,3),np.uint8))
    def test_does_not_modify_input(self):
        p=self.prev.copy();c=self.cur.copy();pb=self.pb.copy();self.call()
        self.assertTrue(np.array_equal(p,self.prev));self.assertTrue(np.array_equal(c,self.cur));self.assertTrue(np.array_equal(pb,self.pb))
    def test_nonfinite_alpha(self):
        with self.assertRaises(ValueError):self.call(alpha=float('nan'))
    def test_alpha_bound(self):
        with self.assertRaises(ValueError):self.call(alpha=.36)
    def test_strict_dimensions(self):
        with self.assertRaises(ValueError):stabilize_detail(self.prev,self.cur,self.pb,self.cb[:10],self.pp,self.cp)
    def test_repeated_frame_neutral(self):
        a,d=stabilize_detail(self.prev,self.prev,self.pb,self.pb,self.pp,self.pp)
        self.assertFalse(d['temporal_applied']);self.assertTrue(np.array_equal(a,self.pp))
    def test_bounded_output_memory(self):
        for _ in range(5):
            a,d=self.call();self.assertEqual(a.nbytes,self.cp.nbytes)

if __name__=='__main__':unittest.main()
