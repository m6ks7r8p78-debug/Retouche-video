"""RNE: pure-tensor tests for an optional experimental gradient loss."""
from pathlib import Path
import sys
import unittest
import torch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'))
from train_texture_detail import spatial_gradient_loss

class SpatialGradientTests(unittest.TestCase):
    def test_exact_match_zero_loss(self):
        x=torch.rand(2,3,32,32)
        self.assertEqual(float(spatial_gradient_loss(x,x)),0.)
    def test_constant_offset_has_zero_gradient_error(self):
        x=torch.zeros(1,3,16,16);y=torch.full_like(x,.25)
        self.assertEqual(float(spatial_gradient_loss(x,y)),0.)
    def test_stripes_have_positive_gradient_error(self):
        x=torch.zeros(1,3,16,16);y=x.clone();y[:,:,:,::2]=.5
        self.assertGreater(float(spatial_gradient_loss(x,y)),0.)
    def test_nonmatching_shapes_rejected(self):
        with self.assertRaises(ValueError):
            spatial_gradient_loss(torch.zeros(1,3,16,16),torch.zeros(1,3,12,12))
    def test_backward_is_defined(self):
        x=torch.rand(1,3,16,16,requires_grad=True);gt=torch.rand(1,3,16,16)
        spatial_gradient_loss(x,gt).backward()
        self.assertTrue(bool(torch.isfinite(x.grad).all()))
if __name__=='__main__':unittest.main()
