"""RNE fidelity guard tests on synthetic, nonpersonal arrays."""
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'))
import numpy as np
from fidelity_guard import limit_fidelity

class FidelityGuardTests(unittest.TestCase):
    def setUp(self):
        rng=np.random.default_rng(14)
        self.base=rng.integers(0,255,(64,80,3),dtype=np.uint8)
        self.pred=np.clip(self.base.astype(np.int16)+17,0,255).astype(np.uint8)
    def test_shape(self):
        o,m=limit_fidelity(self.base,self.pred)
        self.assertEqual(o.shape,self.base.shape)
        self.assertEqual(o.dtype,np.uint8)
    def test_bounded_difference(self):
        o,_=limit_fidelity(self.base,self.pred,edge_limit=5,flat_limit=11)
        self.assertLessEqual(np.abs(o.astype(np.int16)-self.base.astype(np.int16)).max(),11)
    def test_protected_mask_exact(self):
        mask=np.zeros((64,80),dtype=np.uint8);mask[12:32,13:42]=255
        o,m=limit_fidelity(self.base,self.pred,protected=mask)
        self.assertTrue(np.array_equal(o[mask==255],self.base[mask==255]))
        self.assertTrue(m['verified_protection_supplied'])
    def test_no_protection_claim_without_mask(self):
        _,m=limit_fidelity(self.base,self.pred)
        self.assertFalse(m['automatic_face_protection_claimed'])
        self.assertFalse(m['quality_improvement_proven'])
        self.assertFalse(m['auto_deployment_allowed'])
    def test_identity_input_no_change(self):
        o,m=limit_fidelity(self.base,self.base)
        self.assertTrue(np.array_equal(o,self.base))
        self.assertEqual(m['changed_pixels_fraction'],0)
    def test_no_input_mutation(self):
        b=self.base.copy();p=self.pred.copy();limit_fidelity(self.base,self.pred)
        self.assertTrue(np.array_equal(self.base,b))
        self.assertTrue(np.array_equal(self.pred,p))
    def test_reject_wrong_dtype(self):
        with self.assertRaises(TypeError):limit_fidelity(self.base.astype(np.float32),self.pred)
    def test_reject_wrong_shape(self):
        with self.assertRaises(TypeError):limit_fidelity(self.base,self.pred[:20])
    def test_reject_mask_ambiguous(self):
        m=np.ones((64,80),np.uint8)
        with self.assertRaises(TypeError):limit_fidelity(self.base,self.pred,protected=m)
    def test_reject_nan_limits(self):
        with self.assertRaises(ValueError):limit_fidelity(self.base,self.pred,edge_limit=float('nan'))
    def test_reject_out_of_range_limit(self):
        with self.assertRaises(ValueError):limit_fidelity(self.base,self.pred,edge_limit=20,flat_limit=12)
    def test_zero_limit_preserves_original(self):
        o,_=limit_fidelity(self.base,self.pred,edge_limit=0,flat_limit=0)
        self.assertTrue(np.array_equal(o,self.base))
    def test_limit_equal_to_boundary(self):
        o,_=limit_fidelity(self.base,self.pred,edge_limit=8,flat_limit=8)
        self.assertLessEqual(np.abs(o.astype(int)-self.base.astype(int)).max(),8)
    def test_large_frame_refused(self):
        a=np.zeros((5000,2000,3),np.uint8)
        with self.assertRaises(ValueError):limit_fidelity(a,a)
    def test_values_clamped(self):
        a=np.full((32,32,3),250,np.uint8);b=np.full_like(a,255)
        o,_=limit_fidelity(a,b)
        self.assertLessEqual(int(o.max()),255)
if __name__=='__main__':unittest.main()
