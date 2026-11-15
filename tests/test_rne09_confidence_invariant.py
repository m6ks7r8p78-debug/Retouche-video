"""RNE09 confidence-invariant research-only checks, entirely synthetic tensors."""
import sys,unittest
from pathlib import Path
import torch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outils'/'rne'/'rne09'))
from confidence_invariant import confidence_invariant_gate,guarded_research_frame

class Dummy:
    def __call__(self,cur,p1,p2,c1,c2):
        return torch.nn.functional.interpolate(cur,scale_factor=2,mode='bicubic',align_corners=False).clamp(0,1)*.95

class TestGate(unittest.TestCase):
    def setUp(self):
        self.cur=torch.full((2,3,24,24),.5)
        self.p=self.cur.clone()
        self.c=torch.ones((2,1,24,24))
    def g(self,p1=None,p2=None,c1=None,c2=None,opt=True):
        return confidence_invariant_gate(self.cur,p1 if p1 is not None else self.p,
            p2 if p2 is not None else self.p,c1 if c1 is not None else self.c,
            c2 if c2 is not None else self.c,manual_research_opt_in=opt)
    def test_matches_prior_accepts(self):
        a,_=self.g();self.assertFalse(bool(a.any()))
    def test_wrong_prior_detected(self):
        a,_=self.g(p1=torch.zeros_like(self.p));self.assertTrue(bool(a.all()))
    def test_high_confidence_invalid(self):
        wrong=self.p.clone();wrong[:,:,:12,:12]=0.
        a,_=self.g(p1=wrong);self.assertTrue(bool(a.all()))
    def test_low_confidence_permits_mismatch(self):
        wrong=torch.zeros_like(self.p);a,_=self.g(p1=wrong,c1=self.c*0)
        self.assertFalse(bool(a.any()))
    def test_low_confidence_does_not_certify_validity(self):
        wrong=torch.zeros_like(self.p);a,report=self.g(p1=wrong,c1=self.c*0)
        self.assertFalse(report.deployment_authorized)
    def test_batch_independent(self):
        wrong=self.p.clone();wrong[0]=0; a,_=self.g(p1=wrong)
        self.assertTrue(bool(a[0]));self.assertFalse(bool(a[1]))
    def test_single_pixel_below_cutoff_accepted(self):
        wrong=self.p.clone();wrong[:,:,0,0]=0;a,_=self.g(p1=wrong)
        self.assertFalse(bool(a.any()))
    def test_many_pixels_cutoff_rejected(self):
        wrong=self.p.clone();wrong[:,:,:6,:6]=0;a,_=self.g(p1=wrong)
        self.assertTrue(bool(a.all()))
    def test_without_manual_refuses(self):
        a,_=self.g(opt=False);self.assertTrue(bool(a.all()))
    def test_wrong_permission_type(self):
        with self.assertRaises(TypeError):
            confidence_invariant_gate(self.cur,self.p,self.p,self.c,self.c,manual_research_opt_in=1)
    def test_bad_tolerance(self):
        with self.assertRaises(ValueError):
            confidence_invariant_gate(self.cur,self.p,self.p,self.c,self.c,tolerance=.1)
    def test_bad_cutoff(self):
        with self.assertRaises(ValueError):
            confidence_invariant_gate(self.cur,self.p,self.p,self.c,self.c,cutoff_fraction=.5)
    def test_nan(self):
        z=self.cur.clone();z[0,0,0,0]=float('nan')
        with self.assertRaises(ValueError):confidence_invariant_gate(z,self.p,self.p,self.c,self.c)
    def test_wrong_channels(self):
        with self.assertRaises(ValueError):confidence_invariant_gate(self.cur[:,0:1],self.p,self.p,self.c,self.c)
    def test_negative_trust(self):
        with self.assertRaises(ValueError):self.g(c1=-self.c)
    def test_wrong_dtype(self):
        with self.assertRaises(TypeError):self.g(p1=self.p.double())
    def test_bad_spatial_size(self):
        with self.assertRaises(ValueError):confidence_invariant_gate(self.cur[:,:,:12,:],self.p[:,:,:12,:],self.p[:,:,:12,:],self.c[:,:,:12,:],self.c[:,:,:12,:])
    def test_does_not_modify_original(self):
        before=self.p.clone();self.g(p1=self.p);self.assertTrue(torch.equal(self.p,before))
    def test_no_export(self):
        _,a=self.g();self.assertFalse(a.media_export_authorized)
    def test_production_not_authorized(self):
        _,a=self.g();self.assertFalse(a.deployment_authorized)
    def test_model_not_invoked_if_refused(self):
        class Broken:
            def __call__(self,*args):raise RuntimeError('Should never use neural')
        r,a=guarded_research_frame(Broken(),self.cur,self.p,self.p,self.c,self.c)
        self.assertTrue(torch.allclose(r,torch.ones_like(r)*.5))
    def test_accepted_model_used(self):
        r,a=guarded_research_frame(Dummy(),self.cur,self.p,self.p,self.c,self.c,manual_research_opt_in=True)
        self.assertAlmostEqual(float(r.mean()),.475,places=5)
    def test_rejected_model_falls_back(self):
        wrong=torch.zeros_like(self.p)
        r,a=guarded_research_frame(Dummy(),self.cur,wrong,self.p,self.c,self.c,manual_research_opt_in=True)
        self.assertAlmostEqual(float(r.mean()),.5,places=5)

if __name__=='__main__':unittest.main()
