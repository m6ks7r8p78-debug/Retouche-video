"""Only synthetic imagery; 22 tests, no user clips."""
import unittest,sys
import cv2,numpy as np
from unittest.mock import patch
from pathlib import Path
sys.path[:0]=[str(Path(__file__).resolve().parent),str(Path(__file__).resolve().parents[1])]
from outils.rne.rne14.illumination_census import audit_lighting,anonymous_summary,_correlation_14
from outils.rne.rne13.regional_motion_audit import audit_regions

def flow_of(c,p):
    return cv2.calcOpticalFlowFarneback(cv2.cvtColor(c,cv2.COLOR_BGR2GRAY),cv2.cvtColor(p,cv2.COLOR_BGR2GRAY),None,.5,3,15,3,5,1.2,0)


def pair(seed=49,dx=2,change=0):
    rng=np.random.default_rng(seed)
    prev=rng.integers(20,200,(192,192,3),dtype=np.uint8)
    prev=cv2.GaussianBlur(prev,(3,3),.65)
    cur=cv2.warpAffine(prev,np.float32([[1,0,dx],[0,1,0]]),(192,192),borderMode=cv2.BORDER_REFLECT101)
    if change:cur=np.clip(cur.astype(np.int16)+change,0,255).astype(np.uint8)
    flow=cv2.calcOpticalFlowFarneback(cv2.cvtColor(cur,cv2.COLOR_BGR2GRAY),cv2.cvtColor(prev,cv2.COLOR_BGR2GRAY),None,.5,3,15,3,5,1.2,0)
    return cur,prev,flow

class TestCensusAudit(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.c,cls.p,cls.f=pair()
 def test_disabled_by_default(self):
    self.assertEqual(audit_lighting(self.c,self.p,self.f).state,'disabled')
 def test_no_default_tile_data(self):
    self.assertEqual(audit_lighting(self.c,self.p,self.f).provisional_tiles,())
 def test_recompute_baseline_not_accept_external(self):
    with self.assertRaises(TypeError):audit_lighting(self.c,self.p,self.f,original='stale',manual_research_opt_in=True)
 def test_invalid_opt_in(self):
    with self.assertRaises(TypeError):audit_lighting(self.c,self.p,self.f,manual_research_opt_in=1)
 def test_tiles_cover_grid(self):
    x=audit_lighting(self.c,self.p,self.f,manual_research_opt_in=True)
    self.assertEqual(len(x.provisional_tiles),16)
 def test_baseline_supported_unchanged(self):
    b=audit_regions(self.c,self.p,self.f,manual_research_opt_in=True)
    o=audit_lighting(self.c,self.p,self.f,manual_research_opt_in=True)
    self.assertTrue(all(t.original==q.status and (q.status!='supported' or t.decision=='supported') for t,q in zip(o.provisional_tiles,b.tiles)))
 def test_no_photo_veto_no_override(self):
    x=audit_lighting(self.c,self.p,self.f,manual_research_opt_in=True)
    self.assertEqual(x.promoted_from_photometric_veto,0)
 def test_global_light_recovers_some(self):
    rng=np.random.default_rng(8701)
    g=rng.integers(15,240,(192,192),dtype=np.uint8)
    g=cv2.GaussianBlur(g,(3,3),.6)
    p=cv2.cvtColor(g,cv2.COLOR_GRAY2BGR)
    c=cv2.warpAffine(p,np.float32([[1,0,3],[0,1,0]]),(192,192),borderMode=cv2.BORDER_REFLECT101)
    c=np.clip(c.astype(np.int16)+52,0,255).astype(np.uint8)
    f=flow_of(c,p)
    x=audit_lighting(c,p,f,manual_research_opt_in=True)
    self.assertGreater(x.promoted_from_photometric_veto,0)
 def test_low_texture_not_lifted(self):
    x=np.full((192,192,3),90,np.uint8);y=np.full_like(x,145)
    f=np.zeros((192,192,2),np.float32)
    r=audit_lighting(y,x,f,manual_research_opt_in=True)
    self.assertEqual(r.promoted_from_photometric_veto,0)
 def test_periodic_corr(self):
    xy=np.indices((48,48)).sum(axis=0)
    tile=((xy//7)%2*180+30).astype(np.uint8)
    self.assertGreater(_correlation_14(tile),.9)
 def test_periodic_not_lifted(self):
    yy,xx=np.mgrid[:192,:192]
    tex=((xx//7+yy//7)%2*100+75).astype(np.uint8)
    p=cv2.cvtColor(tex,cv2.COLOR_GRAY2BGR)
    c=np.clip(p.astype(np.int16)+52,0,255).astype(np.uint8)
    f=np.zeros((192,192,2),np.float32)
    r=audit_lighting(c,p,f,manual_research_opt_in=True)
    self.assertEqual(r.promoted_from_photometric_veto,0)
 def test_wrong_type(self):
    with self.assertRaises(TypeError):audit_lighting(None,self.p,self.f,manual_research_opt_in=True)
 def test_wrong_image_dtype(self):
    with self.assertRaises(ValueError):audit_lighting(self.c.astype(np.float32),self.p,self.f,manual_research_opt_in=True)
 def test_mismatch(self):
    with self.assertRaises(ValueError):audit_lighting(self.c[:90],self.p,self.f,manual_research_opt_in=True)
 def test_nan_flow(self):
    f=self.f.copy();f[0,0,0]=np.nan
    with self.assertRaises(ValueError):audit_lighting(self.c,self.p,f,manual_research_opt_in=True)
 def test_flow_wrong_shape(self):
    with self.assertRaises(ValueError):audit_lighting(self.c,self.p,self.f[:40],manual_research_opt_in=True)
 def test_inputs_not_mutated(self):
    c,p,f=[x.copy() for x in (self.c,self.p,self.f)]
    audit_lighting(self.c,self.p,self.f,manual_research_opt_in=True)
    self.assertTrue(np.array_equal(c,self.c));self.assertTrue(np.array_equal(p,self.p));self.assertTrue(np.array_equal(f,self.f))
 def test_no_geometry_cert(self):
    self.assertFalse(audit_lighting(self.c,self.p,self.f,manual_research_opt_in=True).verifies_geometric_truth)
 def test_no_auto_deployment(self):
    self.assertFalse(audit_lighting(self.c,self.p,self.f,manual_research_opt_in=True).automatic_deployment)
 def test_no_media_export(self):
    self.assertFalse(audit_lighting(self.c,self.p,self.f,manual_research_opt_in=True).media_export_authorized)
 def test_anonymous_summary_no_filename(self):
    a=anonymous_summary(audit_lighting(self.c,self.p,self.f,manual_research_opt_in=True))
    self.assertEqual(len(a['provisional_tiles']),16);self.assertNotIn('filename',a)
 def test_wrong_summary_rejected(self):
    with self.assertRaises(TypeError):anonymous_summary('not audit')

if __name__=='__main__':unittest.main()