"""RNE temporal gradient loss tests: entirely synthetic, never personal media."""
import sys
import unittest
from pathlib import Path
import torch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'))
from temporal_gradients import gradient_consistency, original_temporal_loss


class GradientLossTests(unittest.TestCase):
    def setUp(self):
        self.a=torch.zeros(2,3,16,16)
        self.trust=torch.ones(2,1,16,16)
    def test_matching_gradients_zero(self):
        self.assertAlmostEqual(0.,float(gradient_consistency(self.a,self.a,self.trust)),places=7)
    def test_offset_has_zero_gradient(self):
        self.assertAlmostEqual(0.,float(gradient_consistency(self.a,self.a+.4,self.trust)),places=6)
    def test_edge_is_penalized(self):
        b=self.a.clone();b[:,:,:,8:]=.5
        self.assertGreater(float(gradient_consistency(b,self.a,self.trust)),.01)
    def test_invalid_zero_trust_is_zero(self):
        b=torch.rand_like(self.a)
        self.assertEqual(float(gradient_consistency(b,self.a,self.trust*0)),0.)
    def test_occlusion_masks_erase_penalty(self):
        b=self.a.clone();b[:,:,:,8:]=.5
        x=gradient_consistency(b,self.a,self.trust)
        mask=self.trust.clone();mask[:,:,:,7:9]=0
        self.assertLess(float(gradient_consistency(b,self.a,mask)),float(x)/10)
    def test_loss_backprop(self):
        p=torch.rand(2,3,16,16,requires_grad=True)
        gradient_consistency(p,self.a,self.trust).backward()
        self.assertTrue(bool(torch.isfinite(p.grad).all()))
    def test_prior_detached(self):
        pred=torch.rand(2,3,16,16,requires_grad=True)
        prior=torch.rand(2,3,16,16,requires_grad=True)
        gradient_consistency(pred,prior,self.trust).backward()
        self.assertIsNone(prior.grad)
    def test_nonfinite(self):
        bad=self.a.clone();bad[0,0,0,0]=float('nan')
        with self.assertRaises(ValueError):gradient_consistency(bad,self.a,self.trust)
    def test_confidence_out_of_range(self):
        with self.assertRaises(ValueError):gradient_consistency(self.a,self.a,self.trust*2)
    def test_wrong_channels(self):
        with self.assertRaises(ValueError):gradient_consistency(self.a[:,0:1],self.a[:,0:1],self.trust)
    def test_missing_samples_dimensions(self):
        with self.assertRaises(ValueError):gradient_consistency(self.a[:,:,:3,:],self.a[:,:,:3,:],self.trust[:,:,:3,:])
    def test_invalid_robust_eps(self):
        with self.assertRaises(ValueError):gradient_consistency(self.a,self.a,self.trust,robust_epsilon=0)
    def test_temporal_zero_when_equal(self):
        self.assertAlmostEqual(0.,float(original_temporal_loss(self.a,self.a,self.a,self.trust)))
    def test_temporal_prior_detached(self):
        a=self.a.clone().requires_grad_(True);p=(self.a+1).requires_grad_(True)
        original_temporal_loss(a,self.a,p,self.trust).backward()
        self.assertIsNone(p.grad)
    def test_temporal_requires_correct_shape(self):
        with self.assertRaises(ValueError):original_temporal_loss(self.a,self.a,self.a,self.trust[:,:,:4])
    def test_temporal_invalid_confidence(self):
        with self.assertRaises(ValueError):original_temporal_loss(self.a,self.a,self.a,self.trust*-1)


if __name__=='__main__':unittest.main()
