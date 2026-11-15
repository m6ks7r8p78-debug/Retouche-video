"""Synthetic-only public regression tests for RNE17 ANCRE/AEGIS ablation."""
from __future__ import annotations
import sys,unittest
from pathlib import Path
import torch
from torch.nn import functional as F
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'/'rne17'))
from rne17 import RNE17AEGIS
from research_limiter import conservative_preview
from promotion_gate import review

class RNE17PublicTests(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(17)
        self.c=torch.rand(1,3,16,16)
        self.p=torch.rand_like(self.c)
        self.t=torch.ones(1,1,16,16)
        self.b=F.interpolate(self.c,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)
        self.a=(self.b*.9+.02).clamp(0,1)
        self.model=RNE17AEGIS().eval()
    def call(self,**kwargs):return self.model(self.c,self.p,self.t,self.a,self.b,**kwargs)
    def test_param_count(self):
        self.assertEqual(sum(x.numel() for x in self.model.parameters()),2305)
    def test_shape(self):self.assertEqual(self.call().shape,self.b.shape)
    def test_bounded_alpha(self):
        _,alpha=self.call(return_alpha=True)
        self.assertTrue(bool(((alpha>=0)&(alpha<=1)).all()))
    def test_convex_residual(self):
        v,alpha=self.call(return_alpha=True)
        self.assertTrue(torch.allclose(v,(self.b+alpha*(self.a-self.b)).clamp(0,1)))
    def test_equal_output_exact(self):
        self.assertTrue(torch.equal(self.model(self.c,self.p,self.t,self.b,self.b),self.b))
    def test_zero_trust_masks_prior(self):
        z=self.t*0
        first=self.model(self.c,self.p,z,self.a,self.b)
        second=self.model(self.c,torch.rand_like(self.p),z,self.a,self.b)
        self.assertTrue(torch.equal(first,second))
    def test_protected_exact_bicubic(self):
        mask=torch.zeros((1,1,32,32),dtype=torch.bool);mask[:,:,6:20,6:20]=True
        out=self.call(protected_mask=mask)
        self.assertTrue(torch.equal(out[:,:,6:20,6:20],self.b[:,:,6:20,6:20]))
    def test_wrong_mask(self):
        with self.assertRaises(ValueError):self.call(protected_mask=torch.zeros((1,1,32,32)))
    def test_wrong_prior(self):
        with self.assertRaises(ValueError):
            self.model(self.c,self.p[:,:,:8,:],self.t,self.a,self.b)
    def test_wrong_trust(self):
        with self.assertRaises(ValueError):
            self.model(self.c,self.p,self.t[:,:,:8,:],self.a,self.b)
    def test_nan(self):
        x=self.c.clone();x[0,0,0,0]=float('nan')
        with self.assertRaises(ValueError):
            self.model(x,self.p,self.t,self.a,self.b)
    def test_invalid_trust(self):
        with self.assertRaises(ValueError):
            self.model(self.c,self.p,self.t*2,self.a,self.b)
    def test_determinism(self):
        self.assertTrue(torch.equal(self.call(),self.call()))
    def test_preview_no_optin(self):
        out,audit=conservative_preview(self.c,self.a)
        self.assertTrue(torch.equal(out,self.b))
        self.assertFalse(audit.production_authorized)
    def test_preview_fixed_70(self):
        out,audit=conservative_preview(self.c,self.a,research_opt_in=True)
        self.assertTrue(torch.allclose(out,(self.b+.7*(self.a-self.b)).clamp(0,1)))
        self.assertFalse(audit.media_export_authorized)
    def test_preview_rejects_nonboolean_permission(self):
        with self.assertRaises(TypeError):
            conservative_preview(self.c,self.a,research_opt_in=1)
    def test_preview_mask(self):
        m=torch.ones((1,1,32,32),dtype=torch.bool)
        out,_=conservative_preview(self.c,self.a,research_opt_in=True,protected_mask=m)
        self.assertTrue(torch.equal(out,self.b))
    @staticmethod
    def reports():
        return (
            {'overall':{'n':270,'aegis_gain_db':-.04823,'ancre_gain_db':-.11006,
              'aegis_severe_losses_vs_bicubic':3,'ancre_severe_losses_vs_bicubic':16,
              'delta_aegis_vs_ancre_db':.06184},
             'by_family':{'diagram':{'aegis_gain_db':-.164},
                          'facade':{'aegis_gain_db':.00249},
                          'foliage':{'aegis_gain_db':.01683}}},
            {'families':{'overall':{'n':270,'learned_minus_fixed':-.000083,
                                  'learned_severe':3,'fixed_severe':3}}}
        )
    def test_quality_rejects(self):
        a=review(*self.reports())
        self.assertEqual(a.decision,'REJECT_LEARNED_HEAD')
        self.assertIn('not_better_than_cheap_fixed_blend',a.failed_rules)
    def test_quality_no_deploy(self):
        a=review(*self.reports())
        self.assertFalse(a.allow_app_deployment)
        self.assertFalse(a.allow_automatic_publish)
    def test_quality_refuses_missing_comparator(self):
        with self.assertRaises(ValueError):review(self.reports()[0],{})
    def test_quality_refuses_nan(self):
        a,b=self.reports();a['overall']['aegis_gain_db']=float('nan')
        with self.assertRaises(ValueError):review(a,b)

if __name__=='__main__':unittest.main()
