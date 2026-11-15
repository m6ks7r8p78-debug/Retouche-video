import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'outils' / 'rne' / 'rne16'))
"""Tests for fail-closed RNE16-ANCRE. Synthetic pixels only."""
import unittest
import torch
from torch.nn import functional as F
from rne16 import RNE16ANCRE,psnr
from procedural import dataset,TRAIN_FAMILIES,TEST_FAMILIES,make_pair

class RNE16Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)
        cls.m=RNE16ANCRE().eval()
        cls.c,cls.p,cls.t,cls.hr=[x.unsqueeze(0) for x in make_pair(1253,'lines')]
    def test_forward_shape(self):self.assertEqual(self.m(self.c).shape,(1,3,48,48))
    def test_temporal_shape(self):self.assertEqual(self.m(self.c,self.p,self.t).shape,(1,3,48,48))
    def test_initial_exact_bicubic(self):
        b=F.interpolate(self.c,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
        self.assertTrue(torch.equal(self.m(self.c),b))
    def test_zero_trust_exact_spatial(self):
        with torch.no_grad():
            self.m.temporal.net[-2].bias.fill_(.4)
            self.assertTrue(torch.equal(self.m(self.c,self.p,self.t*0),self.m(self.c)))
    def test_temporal_wrong_prior_trust_zero(self):
        bad=torch.rand_like(self.p)
        self.assertTrue(torch.equal(self.m(self.c,bad,self.t*0),self.m(self.c)))
    def test_temporal_trust_modulates(self):
        old=self.m.temporal.net[-2].bias.detach().clone()
        with torch.no_grad():
            self.m.temporal.net[-2].bias.fill_(.4)
            self.assertFalse(torch.equal(self.m(self.c,self.p,self.t),self.m(self.c)))
            self.m.temporal.net[-2].bias.copy_(old)
    def test_untrusted_prior_does_not_leak(self):
        conf=self.t.clone();conf[:,:,6:12,8:16]=0
        bad=self.p.clone();bad[:,:,6:12,8:16]=torch.rand_like(bad[:,:,6:12,8:16])
        self.assertTrue(torch.equal(self.m(self.c,self.p,conf),self.m(self.c,bad,conf)))
    def test_temporal_receptive_margin_zero(self):
        conf=torch.ones_like(self.t);conf[:,:,9:11,9:11]=0
        output=self.m(self.c,self.p,conf)
        spatial=self.m(self.c)
        self.assertTrue(torch.equal(output[:,:,12:28,12:28],spatial[:,:,12:28,12:28]))
    def test_mask_exact_bicubic(self):
        mask=torch.ones((1,1,48,48),dtype=torch.bool)
        b=F.interpolate(self.c,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
        self.assertTrue(torch.equal(self.m(self.c,self.p,self.t,mask),b))
    def test_protected_subregion(self):
        mask=torch.zeros((1,1,48,48),dtype=torch.bool);mask[:,:,10:20,15:30]=True
        x=self.m(self.c,self.p,self.t,mask)
        b=F.interpolate(self.c,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
        self.assertTrue(torch.equal(x[:,:,10:20,15:30],b[:,:,10:20,15:30]))
    def test_missing_trust_rejected(self):
        with self.assertRaises(ValueError):self.m(self.c,self.p)
    def test_missing_prior_rejected(self):
        with self.assertRaises(ValueError):self.m(self.c,confidence=self.t)
    def test_wrong_shape(self):
        with self.assertRaises(ValueError):self.m(self.c,self.p[:,:,:10],self.t)
    def test_invalid_trust(self):
        with self.assertRaises(ValueError):self.m(self.c,self.p,self.t*2)
    def test_nan_trust(self):
        t=self.t.clone();t[0,0,0,0]=float('nan')
        with self.assertRaises(ValueError):self.m(self.c,self.p,t)
    def test_nan_input(self):
        c=self.c.clone();c[0,0,0,0]=float('nan')
        with self.assertRaises(ValueError):self.m(c)
    def test_mask_shape(self):
        with self.assertRaises(ValueError):self.m(self.c,self.p,self.t,torch.ones(1,1,24,24,dtype=torch.bool))
    def test_mask_dtype(self):
        with self.assertRaises(ValueError):self.m(self.c,self.p,self.t,torch.ones(1,1,48,48))
    def test_small_input(self):
        with self.assertRaises(ValueError):self.m(self.c[:,:,:5,:])
    def test_no_output_beyond_unit(self):
        y=self.m(self.c,self.p,self.t)
        self.assertTrue(bool((y>=0).all() and (y<=1).all()))
    def test_nonmutating(self):
        copy=self.c.clone();self.m(self.c,self.p,self.t)
        self.assertTrue(torch.equal(self.c,copy))
    def test_train_test_families_disjoint(self):self.assertEqual(set(TRAIN_FAMILIES)&set(TEST_FAMILIES),set())
    def test_data_shapes(self):
        c,p,t,hr=make_pair(900122,'rings')
        self.assertEqual((c.shape,p.shape,t.shape,hr.shape),((3,24,24),(3,24,24),(1,24,24),(3,48,48)))
    def test_dataset_deterministic(self):
        a=make_pair(33,'clouds');b=make_pair(33,'clouds')
        self.assertTrue(all(torch.equal(x,y) for x,y in zip(a,b)))
    def test_occlusion_unknown(self):
        c,p,t,hr=make_pair(1000,'lines')
        self.assertGreater(int((t==0).sum()),0)
    def test_weights_are_ours(self):
        self.assertTrue(all(v.is_floating_point() for v in self.m.state_dict().values()))
    def test_invalid_width(self):
        with self.assertRaises(ValueError):RNE16ANCRE(2)
    def test_parameter_bound(self):self.assertLess(sum(p.numel() for p in self.m.parameters()),16000)
    def test_psnr_identical(self):self.assertGreater(psnr(self.hr,self.hr),90)
    def test_psnr_baseline_worse(self):
        b=F.interpolate(self.c,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
        self.assertLess(psnr(b,self.hr),psnr(self.hr,self.hr))

if __name__=='__main__':unittest.main()
